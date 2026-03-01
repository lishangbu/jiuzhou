/**
 * 装备/物品品质常量（服务端共享）
 *
 * 作用：
 * - 统一品质顺序、正反向映射、品质倍率
 * - 避免各服务重复维护同一组“黄玄地天”规则
 */
export const QUALITY_ORDER = ['黄', '玄', '地', '天'] as const;

export type QualityName = (typeof QUALITY_ORDER)[number];

export const QUALITY_RANK_MAP: Record<QualityName, number> = {
  黄: 1,
  玄: 2,
  地: 3,
  天: 4,
};

export const QUALITY_BY_RANK: Record<number, QualityName> = {
  1: '黄',
  2: '玄',
  3: '地',
  4: '天',
};

export const QUALITY_MULTIPLIER_BY_RANK: Record<number, number> = {
  1: 1,
  2: 1.1,
  3: 1.2,
  4: 1.3,
};

export const isQualityName = (value: unknown): value is QualityName => {
  return value === '黄' || value === '玄' || value === '地' || value === '天';
};

/**
 * 从品质中文名推导品质档位（黄/玄/地/天 -> 1/2/3/4）。
 * 当输入无效时返回 null，调用方可自行决定默认值。
 */
export const getQualityRankByName = (qualityRaw: unknown): number | null => {
  const quality = String(qualityRaw ?? '').trim();
  if (!quality) return null;
  const rank = (QUALITY_RANK_MAP as Record<string, number>)[quality];
  if (!Number.isInteger(rank)) return null;
  return rank;
};

/**
 * 品质档位解析器：
 * - 优先按品质名解析
 * - 解析失败时回退到调用方传入的默认值（默认 1）
 */
export const resolveQualityRankFromName = (qualityRaw: unknown, fallback: number = 1): number => {
  const rank = getQualityRankByName(qualityRaw);
  if (rank !== null) return rank;
  return Math.max(1, Math.floor(Number(fallback) || 1));
};
