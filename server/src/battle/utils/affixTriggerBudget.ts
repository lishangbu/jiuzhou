/**
 * 多段技能特殊词条连击触发衰减工具
 *
 * 作用：
 * 1. 做什么：集中维护“单次技能施放内”的装备特殊词条触发次数，并根据已成功次数计算下一次触发概率。
 * 2. 做什么：把“每次成功触发后，下一次概率衰减为原来的 2/3”收敛到单一入口，避免技能执行层与词条执行层重复维护。
 * 3. 不做什么：不处理普通套装效果、不处理按回合限次，也不跨技能施放保留状态。
 *
 * 输入 / 输出：
 * - 输入：基础触发概率、已成功触发次数，或 `ownerId + affixGroupKey` 组成的运行时键。
 * - 输出：当前应参与概率判定的 `0 ~ 1` 概率，以及单次施法内可复用的词条触发状态容器。
 *
 * 数据流 / 状态流：
 * - `skill.ts` 在一次施法开始时创建运行时状态 -> `setBonus.ts` 每次词条判定前读取成功次数并换算当前概率 -> 判定成功且效果真正落地后回写成功次数。
 *
 * 复用设计说明：
 * - 连击触发衰减属于统一战斗平衡规则，放在 `battle/utils` 能避免 `skill.ts` 与 `setBonus.ts` 各自拼接概率公式和状态键。
 * - 当前由技能施法链路与词条触发链路共同复用；后续若策划调整衰减比例，只需改这一处常量。
 * - 高频变化点是“同一词条在一次施法内成功多次后的概率”，因此把读状态、算概率、记成功次数集中成单一入口，避免规则散落。
 *
 * 关键边界条件与坑点：
 * 1. 只有“概率判定成功且效果实际生效”才能算一次成功触发，不能把单纯掷骰成功但因上下文无效而未生效的情况也累计进去。
 * 2. 状态只在单次技能施放内有效，不能提升到单位级或回合级，否则不同技能、不同持有者之间会互相污染。
 */

export const AFFIX_TRIGGER_DECAY_RATIO = 2 / 3;

export type SkillAffixTriggerRuntimeState = {
  successCountByKey: Record<string, number>;
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function createSkillAffixTriggerRuntimeState(): SkillAffixTriggerRuntimeState {
  return {
    successCountByKey: {},
  };
}

export function buildSkillAffixTriggerRuntimeKey(ownerId: string, affixGroupKey: string): string {
  return `${ownerId}::${affixGroupKey}`;
}

export function readSkillAffixTriggerSuccessCount(
  state: SkillAffixTriggerRuntimeState | undefined,
  runtimeKey: string,
): number {
  if (!state) return 0;
  const rawCount = state.successCountByKey[runtimeKey] ?? 0;
  if (!Number.isFinite(rawCount) || rawCount <= 0) return 0;
  return Math.floor(rawCount);
}

export function consumeSkillAffixTriggerSuccess(
  state: SkillAffixTriggerRuntimeState | undefined,
  runtimeKey: string,
): void {
  if (!state) return;
  state.successCountByKey[runtimeKey] = readSkillAffixTriggerSuccessCount(state, runtimeKey) + 1;
}

export function resolveAffixTriggerChanceBySuccessCount(baseChance: number, successCount: number): number {
  const normalizedChance = clamp01(baseChance);
  if (normalizedChance <= 0) return 0;
  const normalizedSuccessCount = Math.max(0, Math.floor(successCount));
  if (normalizedSuccessCount === 0) return normalizedChance;
  return clamp01(normalizedChance * Math.pow(AFFIX_TRIGGER_DECAY_RATIO, normalizedSuccessCount));
}
