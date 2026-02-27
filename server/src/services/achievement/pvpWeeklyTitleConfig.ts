/**
 * PVP 周结算称号配置
 *
 * 作用：
 * 1. 统一维护“周结算名次 -> 限时称号ID”映射；
 * 2. 给周结算服务与过期清理逻辑提供同一份常量，避免多处硬编码。
 *
 * 输入：
 * - 名次（1/2/3）。
 *
 * 输出：
 * - 对应称号ID，或当名次不在 1~3 时返回 null。
 *
 * 数据流：
 * - arenaWeeklySettlementService 读取名次映射发放称号；
 * - titleOwnership 使用称号ID列表清理过期限时称号。
 *
 * 关键边界条件与坑点：
 * 1. 仅支持前三名，名次超出范围必须返回 null，不能隐式降级。
 * 2. 列表顺序与名次顺序强绑定，变更称号ID时需保持 1/2/3 对应关系不变。
 */

export const PVP_WEEKLY_TITLE_BY_RANK = {
  1: 'title-pvp-weekly-champion',
  2: 'title-pvp-weekly-runnerup',
  3: 'title-pvp-weekly-third',
} as const;

export type PvpWeeklyRank = keyof typeof PVP_WEEKLY_TITLE_BY_RANK;

export const PVP_WEEKLY_TITLE_IDS = Object.freeze([
  PVP_WEEKLY_TITLE_BY_RANK[1],
  PVP_WEEKLY_TITLE_BY_RANK[2],
  PVP_WEEKLY_TITLE_BY_RANK[3],
]);

export const getPvpWeeklyTitleIdByRank = (rank: number): string | null => {
  if (rank === 1) return PVP_WEEKLY_TITLE_BY_RANK[1];
  if (rank === 2) return PVP_WEEKLY_TITLE_BY_RANK[2];
  if (rank === 3) return PVP_WEEKLY_TITLE_BY_RANK[3];
  return null;
};
