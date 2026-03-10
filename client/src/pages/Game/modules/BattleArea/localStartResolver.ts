/**
 * 普通地图本地开战目标解析与触发判定
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：统一从普通地图敌方展示列表中解析可提交给 `/battle/start` 的 monsterIds，并集中判定 BattleArea 此刻是否应该自动发起本地战斗。
 * 2. 不做什么：不调用接口、不管理冷却定时器、不处理秘境/竞技场/重连战斗状态拉取。
 *
 * 输入/输出：
 * - 输入：敌方单位列表、BattleArea 当前的本地开战上下文。
 * - 输出：`resolveLocalBattleMonsterIds` 返回规范化 monsterIds；`shouldAutoStartLocalBattle` 返回是否允许立刻触发本地开战。
 *
 * 数据流/状态流：
 * - Game 页怪物点击 -> BattleArea `enemies`
 * - `enemies` -> `resolveLocalBattleMonsterIds`
 * - 解析结果 + BattleArea 当前 battle refs -> `shouldAutoStartLocalBattle`
 * - 判定通过后才进入 `startBattle`
 *
 * 关键边界条件与坑点：
 * 1. 普通地图战斗页在目标数据短暂为空时，不应把“尚未拿到目标”误判成“战斗取消”，否则会导致频繁闪退。
 * 2. 已有 battleId、已有未结束状态、或正在发起中的场景必须禁止再次自动开战，避免重复请求把当前战斗视图重置。
 */

type LocalBattleEnemyUnit = {
  id: string;
};

type LocalBattleAutoStartContext = {
  allowLocalStart: boolean;
  externalBattleId: string | null;
  monsterIds: string[];
  currentBattleId: string | null;
  currentBattlePhase: 'roundStart' | 'action' | 'roundEnd' | 'finished' | null;
  isStartingBattle: boolean;
};

const normalizeMonsterIdFromEnemyUnitId = (unitId: string): string => {
  const rawId = String(unitId || '').trim();
  if (!rawId.startsWith('monster-')) return '';
  const withoutPrefix = rawId.slice('monster-'.length).trim();
  if (!withoutPrefix) return '';
  const normalized = withoutPrefix.split('-敌')[0]?.trim() ?? '';
  return normalized;
};

export const resolveLocalBattleMonsterIds = (
  enemies: LocalBattleEnemyUnit[],
): string[] => {
  const firstMonsterId = (enemies ?? []).find((unit) => normalizeMonsterIdFromEnemyUnitId(unit.id))?.id ?? '';
  const normalizedMonsterId = normalizeMonsterIdFromEnemyUnitId(firstMonsterId);
  return normalizedMonsterId ? [normalizedMonsterId] : [];
};

export const shouldAutoStartLocalBattle = (
  context: LocalBattleAutoStartContext,
): boolean => {
  if (!context.allowLocalStart) return false;
  if (context.externalBattleId) return false;
  if (context.monsterIds.length === 0) return false;
  if (context.isStartingBattle) return false;
  if (context.currentBattleId) return false;
  if (context.currentBattlePhase && context.currentBattlePhase !== 'finished') return false;
  return true;
};
