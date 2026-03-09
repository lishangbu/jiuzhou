/**
 * 角色三维派生工具
 *
 * 作用（做什么 / 不做什么）：
 * - 做什么：统一维护精/气/神的有效值计算，以及三维到角色战斗面板的派生换算。
 * - 不做什么：不解析装备/词条来源，不处理缓存、数据库与战斗运行时状态。
 *
 * 输入/输出：
 * - 输入：原始三维、三维百分比修正、可被派生属性累加的 stats 对象。
 * - 输出：有效三维对象；以及已原地叠加完派生属性的 stats 对象。
 *
 * 数据流/状态流：
 * - characterComputedService 汇总装备词条中的 jing/qi/shen 百分比 -> 本模块计算有效三维。
 * - 再由本模块把有效三维一次性折算到 max_qixue/max_lingqi/wugong/fagong/wufang/fafang/mingzhong/baoji。
 *
 * 关键边界条件与坑点：
 * 1) 三维是整数资源，百分比修正后统一向下取整，避免角色面板与战斗快照口径漂移。
 * 2) 神目前只影响命中与暴击两项基础成长，不直接扩散到其他属性，后续新增规则必须集中改这里。
 */

export const CHARACTER_PRIMARY_ATTR_KEY_LIST = ['jing', 'qi', 'shen'] as const;

export type CharacterPrimaryAttrKey = typeof CHARACTER_PRIMARY_ATTR_KEY_LIST[number];

export interface CharacterPrimaryAttrs {
  jing: number;
  qi: number;
  shen: number;
}

export interface CharacterPrimaryDerivedStatsTarget {
  max_qixue: number;
  max_lingqi: number;
  wugong: number;
  fagong: number;
  wufang: number;
  fafang: number;
  mingzhong: number;
  baoji: number;
}

const roundRatio = (value: number): number => {
  return Math.round(value * 1_000_000) / 1_000_000;
};

const toNonNegativeInt = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
};

export const isCharacterPrimaryAttrKey = (value: unknown): value is CharacterPrimaryAttrKey => {
  return typeof value === 'string' && (CHARACTER_PRIMARY_ATTR_KEY_LIST as readonly string[]).includes(value);
};

export const createCharacterPrimaryAttrs = (params: {
  jing: unknown;
  qi: unknown;
  shen: unknown;
}): CharacterPrimaryAttrs => {
  return {
    jing: toNonNegativeInt(params.jing),
    qi: toNonNegativeInt(params.qi),
    shen: toNonNegativeInt(params.shen),
  };
};

export const resolveCharacterPrimaryAttrs = (
  baseAttrs: CharacterPrimaryAttrs,
  pctModifiers: Partial<Record<CharacterPrimaryAttrKey, number>>,
): CharacterPrimaryAttrs => {
  const next = createCharacterPrimaryAttrs(baseAttrs);
  for (const key of CHARACTER_PRIMARY_ATTR_KEY_LIST) {
    const baseValue = next[key];
    const pct = Number(pctModifiers[key] ?? 0);
    if (!Number.isFinite(pct) || pct === 0 || baseValue <= 0) continue;
    next[key] = Math.max(0, Math.floor(baseValue * (1 + pct)));
  }
  return next;
};

export const applyCharacterPrimaryAttrsToStats = (
  stats: CharacterPrimaryDerivedStatsTarget,
  primaryAttrs: CharacterPrimaryAttrs,
): void => {
  stats.max_qixue += primaryAttrs.jing * 5;
  stats.wufang += primaryAttrs.jing * 2;
  stats.fafang += primaryAttrs.jing * 2;

  stats.max_lingqi += primaryAttrs.qi * 5;
  stats.wugong += primaryAttrs.qi * 2;
  stats.fagong += primaryAttrs.qi * 2;

  stats.mingzhong = roundRatio(stats.mingzhong + primaryAttrs.shen * 0.002);
  stats.baoji = roundRatio(stats.baoji + primaryAttrs.shen * 0.001);
};
