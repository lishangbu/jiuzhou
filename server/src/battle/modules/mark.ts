/**
 * 战斗印记模块（统一抽象）
 *
 * 作用（做什么 / 不做什么）：
 * - 做什么：统一处理印记配置解析、施加、消耗、来源隔离、回合衰减、增伤读取与日志文案。
 * - 不做什么：不直接改写技能/套装行为流程，不负责日志写入顺序与战斗行动编排。
 *
 * 输入/输出：
 * - 输入：BattleUnit、施加者ID、mark效果配置（技能或套装params）。
 * - 输出：施加/消耗结果（层数、最终值、是否触发上限）及可直接展示的文案字符串。
 *
 * 数据流/状态流：
 * - skill.ts / setBonus.ts 传入原始 mark 配置 -> 本模块解析为统一结构
 * - 本模块读写 target.marks（单一状态源）-> 返回结果给调用方用于伤害/护盾/治疗结算
 * - damage.ts 在最终伤害阶段读取来源隔离后的增伤倍率
 *
 * 关键边界条件与坑点：
 * 1) 每目标每施加者独立计数：同 markId 但不同 sourceUnitId 绝不合并。
 * 2) 消耗层数与回合衰减顺序分离：衰减统一在回合开始执行，技能/套装仅处理本次即时消耗。
 */

import type {
  ActiveMark,
  BattleUnit,
  DelayedBurstEffect,
  NextSkillBonusEffect,
} from "../types.js";

export const VOID_EROSION_MARK_ID = "void_erosion";
export const EMBER_BRAND_MARK_ID = "ember_brand";
export const SOUL_SHACKLE_MARK_ID = "soul_shackle";
export const MOON_ECHO_MARK_ID = "moon_echo";
export const MIRROR_CRACK_MARK_ID = "mirror_crack";
export const MARK_ID_LIST = [
  VOID_EROSION_MARK_ID,
  EMBER_BRAND_MARK_ID,
  SOUL_SHACKLE_MARK_ID,
  MOON_ECHO_MARK_ID,
  MIRROR_CRACK_MARK_ID,
] as const;
export const MARK_OPERATION_LIST = ["apply", "consume"] as const;
export const MARK_CONSUME_MODE_LIST = ["all", "fixed"] as const;
export const MARK_RESULT_TYPE_LIST = ["damage", "shield_self", "heal_self"] as const;

const VOID_EROSION_DAMAGE_PER_STACK = 0.02;
const VOID_EROSION_DAMAGE_BONUS_CAP = 0.1;
const SOUL_SHACKLE_RECOVERY_BLOCK_PER_STACK = 0.08;
const SOUL_SHACKLE_RECOVERY_BLOCK_CAP = 0.4;
const SOUL_SHACKLE_DRAIN_LINGQI_PER_STACK = 6;
const EMBER_BRAND_BURN_DAMAGE_RATE = 0.25;
const EMBER_BRAND_BURN_DURATION = 2;
const EMBER_BRAND_DELAYED_BURST_RATE = 0.35;
const EMBER_BRAND_DELAYED_BURST_ROUNDS = 1;
const MOON_ECHO_LINGQI_PER_STACK = 8;
const MOON_ECHO_NEXT_SKILL_BONUS_PER_STACK = 0.12;
const MOON_ECHO_NEXT_SKILL_BONUS_CAP = 0.36;
const MOON_ECHO_NEXT_SKILL_BONUS_TYPE: NextSkillBonusEffect["bonusType"] = "damage";
const DEFAULT_MARK_DURATION = 2;
const DEFAULT_MARK_MAX_STACKS = 5;
const DEFAULT_CONSUME_DAMAGE_CAP_RATE = 0.35;

const MARK_NAME_MAP: Record<string, string> = {
  [VOID_EROSION_MARK_ID]: "虚蚀印记",
  [EMBER_BRAND_MARK_ID]: "灼痕",
  [SOUL_SHACKLE_MARK_ID]: "蚀心锁",
  [MOON_ECHO_MARK_ID]: "月痕印记",
  [MIRROR_CRACK_MARK_ID]: "镜裂印",
};

export const MARK_TRAIT_GUIDE_BY_ID: Record<string, string> = {
  [VOID_EROSION_MARK_ID]: "同源层数会额外提升伤害，适合持续压制与稳定输出。",
  [EMBER_BRAND_MARK_ID]: "被消耗后会额外附加灼烧与余烬潜爆，适合延后爆发与追击。",
  [SOUL_SHACKLE_MARK_ID]: "存在期间会压低目标受疗与回灵效率，消耗时还会抽取灵气，适合封锁续航。",
  [MOON_ECHO_MARK_ID]: "被消耗后会返还施法者灵气，并强化下一次技能，适合身法连段与续转。",
  [MIRROR_CRACK_MARK_ID]: "存在期间会放大后续镜律追击，适合稳定叠层后集中消耗。",
};

export type MarkOperation = typeof MARK_OPERATION_LIST[number];
export type MarkConsumeMode = typeof MARK_CONSUME_MODE_LIST[number];
export type MarkResultType = typeof MARK_RESULT_TYPE_LIST[number];

export interface ResolvedMarkEffect {
  markId: string;
  operation: MarkOperation;
  duration: number;
  maxStacks: number;
  applyStacks: number;
  consumeMode: MarkConsumeMode;
  consumeStacks: number;
  perStackRate: number;
  resultType: MarkResultType;
}

export interface MarkApplyResult {
  applied: boolean;
  markId: string;
  appliedStacks: number;
  totalStacks: number;
  text: string;
}

export interface MarkConsumeResult {
  consumed: boolean;
  markId: string;
  consumedStacks: number;
  remainingStacks: number;
  finalValue: number;
  wasCapped: boolean;
  resultType: MarkResultType;
  text: string;
}

export interface MarkConsumeAddon {
  burnDot?: {
    damage: number;
    duration: number;
    damageType: 'magic';
    element: 'huo';
  };
  delayedBurst?: DelayedBurstEffect;
  restoreLingqi?: number;
  drainLingqi?: number;
  nextSkillBonus?: NextSkillBonusEffect;
}

const toFiniteNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const toText = (value: unknown): string => {
  return typeof value === "string" ? value.trim() : "";
};

const normalizePositiveInt = (value: unknown, fallback: number): number => {
  const n = Math.floor(toFiniteNumber(value, fallback));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
};

const normalizeMarkOperation = (value: unknown): MarkOperation | null => {
  const op = toText(value).toLowerCase();
  if (op === "apply" || op === "consume") return op;
  return null;
};

const normalizeConsumeMode = (value: unknown): MarkConsumeMode => {
  const mode = toText(value).toLowerCase();
  return mode === "fixed" ? "fixed" : "all";
};

const normalizeResultType = (value: unknown): MarkResultType => {
  const type = toText(value).toLowerCase();
  if (type === "shield_self") return "shield_self";
  if (type === "heal_self") return "heal_self";
  return "damage";
};

export const getMarkName = (markId: string): string => {
  const key = String(markId || "").trim();
  return MARK_NAME_MAP[key] ?? key;
};

export const getMarkTraitGuide = (markId: string): string => {
  const key = String(markId || "").trim();
  return MARK_TRAIT_GUIDE_BY_ID[key] ?? '';
};

export const ensureUnitMarks = (unit: BattleUnit): ActiveMark[] => {
  if (!Array.isArray(unit.marks)) {
    unit.marks = [];
  }
  return unit.marks;
};

const findMarkIndex = (marks: ActiveMark[], markId: string, sourceUnitId: string): number => {
  return marks.findIndex(
    (mark) =>
      mark.id === markId &&
      mark.sourceUnitId === sourceUnitId &&
      mark.stacks > 0 &&
      mark.remainingDuration > 0,
  );
};

const readField = (
  raw: Record<string, unknown>,
  camel: string,
  snake: string,
): unknown => {
  if (raw[camel] !== undefined) return raw[camel];
  return raw[snake];
};

export const resolveMarkEffectConfig = (
  raw: Record<string, unknown>,
): ResolvedMarkEffect | null => {
  const operationRaw = readField(raw, "operation", "operation");
  const operation = normalizeMarkOperation(operationRaw);
  if (!operation) return null;

  const markIdRaw = readField(raw, "markId", "mark_id");
  const markId = toText(markIdRaw) || VOID_EROSION_MARK_ID;
  const duration = normalizePositiveInt(
    readField(raw, "duration", "duration_round"),
    DEFAULT_MARK_DURATION,
  );
  const maxStacks = normalizePositiveInt(
    readField(raw, "maxStacks", "max_stacks"),
    DEFAULT_MARK_MAX_STACKS,
  );
  const applyStacks = normalizePositiveInt(
    readField(raw, "applyStacks", "apply_stacks") ?? readField(raw, "stacks", "stacks"),
    1,
  );
  const consumeMode = normalizeConsumeMode(readField(raw, "consumeMode", "consume_mode"));
  const consumeStacks = normalizePositiveInt(
    readField(raw, "consumeStacks", "consume_stacks"),
    1,
  );
  const perStackRate = Math.max(
    0,
    toFiniteNumber(readField(raw, "perStackRate", "per_stack_rate"), 0),
  );
  const resultType = normalizeResultType(readField(raw, "resultType", "result_type"));

  return {
    markId,
    operation,
    duration,
    maxStacks,
    applyStacks,
    consumeMode,
    consumeStacks,
    perStackRate,
    resultType,
  };
};

export const buildMarkAppliedText = (
  markId: string,
  appliedStacks: number,
  totalStacks: number,
): string => {
  return `${getMarkName(markId)}+${appliedStacks}（当前${totalStacks}层）`;
};

export const buildMarkConsumedText = (
  markId: string,
  consumedStacks: number,
  remainingStacks: number,
  resultType: MarkResultType,
): string => {
  const suffix =
    resultType === "shield_self"
      ? "转化护盾"
      : resultType === "heal_self"
        ? "转化治疗"
        : "引爆";
  return `${getMarkName(markId)}消耗${consumedStacks}层（剩余${remainingStacks}层，${suffix}）`;
};

export const applyMarkStacks = (
  target: BattleUnit,
  sourceUnitId: string,
  config: ResolvedMarkEffect,
): MarkApplyResult => {
  const marks = ensureUnitMarks(target);
  const maxStacks = Math.max(1, config.maxStacks);
  const applyStacks = Math.max(1, config.applyStacks);
  const duration = Math.max(1, config.duration);
  const index = findMarkIndex(marks, config.markId, sourceUnitId);

  if (index < 0) {
    const stacked = Math.min(maxStacks, applyStacks);
    marks.push({
      id: config.markId,
      sourceUnitId,
      stacks: stacked,
      maxStacks,
      remainingDuration: duration,
    });
    return {
      applied: stacked > 0,
      markId: config.markId,
      appliedStacks: stacked,
      totalStacks: stacked,
      text: buildMarkAppliedText(config.markId, stacked, stacked),
    };
  }

  const current = marks[index];
  const nextStacks = Math.min(maxStacks, current.stacks + applyStacks);
  const delta = Math.max(0, nextStacks - current.stacks);
  current.stacks = nextStacks;
  current.maxStacks = maxStacks;
  current.remainingDuration = duration;

  return {
    applied: delta > 0 || duration > 0,
    markId: config.markId,
    appliedStacks: delta,
    totalStacks: current.stacks,
    text: buildMarkAppliedText(config.markId, delta, current.stacks),
  };
};

export const consumeMarkStacks = (
  target: BattleUnit,
  sourceUnitId: string,
  config: ResolvedMarkEffect,
  baseValue: number,
  targetMaxQixue: number,
  damageCapRate: number = DEFAULT_CONSUME_DAMAGE_CAP_RATE,
): MarkConsumeResult => {
  const marks = ensureUnitMarks(target);
  const index = findMarkIndex(marks, config.markId, sourceUnitId);
  if (index < 0) {
    return {
      consumed: false,
      markId: config.markId,
      consumedStacks: 0,
      remainingStacks: 0,
      finalValue: 0,
      wasCapped: false,
      resultType: config.resultType,
      text: `${getMarkName(config.markId)}未命中可消耗层数`,
    };
  }

  const current = marks[index];
  const available = Math.max(0, Math.floor(current.stacks));
  if (available <= 0) {
    return {
      consumed: false,
      markId: config.markId,
      consumedStacks: 0,
      remainingStacks: 0,
      finalValue: 0,
      wasCapped: false,
      resultType: config.resultType,
      text: `${getMarkName(config.markId)}未命中可消耗层数`,
    };
  }

  const consumeWanted =
    config.consumeMode === "all" ? available : Math.max(1, config.consumeStacks);
  const consumedStacks = Math.min(available, consumeWanted);
  current.stacks = Math.max(0, available - consumedStacks);
  const remainingStacks = current.stacks;
  if (current.stacks <= 0) {
    marks.splice(index, 1);
  }

  const rawFinal = Math.max(0, baseValue) * consumedStacks * Math.max(0, config.perStackRate);
  const capValue = Math.max(0, targetMaxQixue) * Math.max(0, damageCapRate);
  const cappedFinal = Math.min(rawFinal, capValue);
  const finalValue = Math.max(0, Math.floor(cappedFinal));

  return {
    consumed: consumedStacks > 0,
    markId: config.markId,
    consumedStacks,
    remainingStacks,
    finalValue,
    wasCapped: rawFinal > cappedFinal,
    resultType: config.resultType,
    text: buildMarkConsumedText(config.markId, consumedStacks, remainingStacks, config.resultType),
  };
};

export const decayUnitMarksAtRoundStart = (unit: BattleUnit): void => {
  const marks = ensureUnitMarks(unit);
  if (marks.length === 0) return;
  const next: ActiveMark[] = [];
  for (const mark of marks) {
    const nextDuration = mark.remainingDuration - 1;
    if (nextDuration <= 0 || mark.stacks <= 0) continue;
    next.push({
      ...mark,
      remainingDuration: nextDuration,
    });
  }
  unit.marks = next;
};

export const getSoulShackleRecoveryBlockRate = (target: BattleUnit): number => {
  if (!Array.isArray(target.marks) || target.marks.length === 0) return 0;
  let stacks = 0;
  for (const mark of target.marks) {
    if (mark.id !== SOUL_SHACKLE_MARK_ID) continue;
    if (mark.remainingDuration <= 0) continue;
    stacks += Math.max(0, mark.stacks);
  }
  if (stacks <= 0) return 0;
  return Math.min(stacks * SOUL_SHACKLE_RECOVERY_BLOCK_PER_STACK, SOUL_SHACKLE_RECOVERY_BLOCK_CAP);
};

export const applySoulShackleRecoveryReduction = (
  value: number,
  target: BattleUnit,
): number => {
  if (!Number.isFinite(value) || value <= 0) return value;
  const rate = getSoulShackleRecoveryBlockRate(target);
  if (rate <= 0) return Math.floor(value);
  return Math.floor(value * (1 - rate));
};

export const buildMarkConsumeAddon = (
  config: ResolvedMarkEffect,
  consumed: MarkConsumeResult,
): MarkConsumeAddon => {
  if (!consumed.consumed || consumed.consumedStacks <= 0) return {};

  if (config.markId === EMBER_BRAND_MARK_ID) {
    const burnDamage = Math.max(0, Math.floor(consumed.finalValue * EMBER_BRAND_BURN_DAMAGE_RATE));
    if (burnDamage <= 0) return {};
    return {
      burnDot: {
        damage: burnDamage,
        duration: EMBER_BRAND_BURN_DURATION,
        damageType: 'magic',
        element: 'huo',
      },
      delayedBurst: {
        damage: Math.max(1, Math.floor(consumed.finalValue * EMBER_BRAND_DELAYED_BURST_RATE)),
        damageType: 'magic',
        element: 'huo',
        remainingRounds: EMBER_BRAND_DELAYED_BURST_ROUNDS,
      },
    };
  }

  if (config.markId === SOUL_SHACKLE_MARK_ID) {
    return {
      drainLingqi: consumed.consumedStacks * SOUL_SHACKLE_DRAIN_LINGQI_PER_STACK,
    };
  }

  if (config.markId === MOON_ECHO_MARK_ID) {
    return {
      restoreLingqi: consumed.consumedStacks * MOON_ECHO_LINGQI_PER_STACK,
      nextSkillBonus: {
        rate: Math.min(
          consumed.consumedStacks * MOON_ECHO_NEXT_SKILL_BONUS_PER_STACK,
          MOON_ECHO_NEXT_SKILL_BONUS_CAP,
        ),
        bonusType: MOON_ECHO_NEXT_SKILL_BONUS_TYPE,
      },
    };
  }

  return {};
};

export const getVoidErosionDamageBonusRate = (
  attacker: BattleUnit,
  defender: BattleUnit,
): number => {
  if (!Array.isArray(defender.marks) || defender.marks.length === 0) return 0;
  let stacks = 0;
  for (const mark of defender.marks) {
    if (mark.id !== VOID_EROSION_MARK_ID) continue;
    if (mark.sourceUnitId !== attacker.id) continue;
    if (mark.remainingDuration <= 0) continue;
    stacks += Math.max(0, mark.stacks);
  }
  if (stacks <= 0) return 0;
  return Math.min(stacks * VOID_EROSION_DAMAGE_PER_STACK, VOID_EROSION_DAMAGE_BONUS_CAP);
};
