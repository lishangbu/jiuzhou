/**
 * Game 页 socket 战斗视图接管规则。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：统一判定某个 socket `battle:update` 是否应该接管为“队友战斗视图 / 重连战斗视图”，还是应继续保留 BattleArea 已持有的普通地图本地战斗。
 * 2. 做什么：把普通地图本地连战与外部 `reconnectBattleId` 的边界收口，避免多个 socket 分支各自拼条件，反复把普通地图战斗误判成重连战斗。
 * 3. 不做什么：不直接修改 React state、不请求接口，也不决定 BattleArea 的自动下一场策略。
 *
 * 输入/输出：
 * - 输入：当前 socket battleId、队伍身份、Game 当前视图，以及是否已存在竞技场/秘境/重连/本地普通地图战斗上下文。
 * - 输出：`RealtimeBattleViewSyncMode`，供 Game 页决定接管 teamBattleId / reconnectBattleId，或保持本地战斗不变。
 *
 * 数据流/状态流：
 * - socket battle:update -> 本模块判定接管模式 -> Game 页决定是否写入 teamBattleId / reconnectBattleId -> BattleArea 再依据 externalBattleId 决定是否走外部驱动。
 *
 * 关键边界条件与坑点：
 * 1. 普通地图本地战斗在 BattleArea 已经持有时，不能再额外写入 reconnectBattleId；否则 BattleArea 会把“本地连战”误判成“外部战斗等待 onNext”，自动下一场会被掐断。
 * 2. 真正的重连场景仍要允许接管同样的 `battle-*` 战斗，因此只有“已在 battle 视图、已有本地怪物目标、且当前没有任何外部战斗上下文”时，才允许保留本地战斗。
 */

export type RealtimeBattleViewSyncMode =
  | 'keep_local_battle'
  | 'sync_team_battle'
  | 'sync_reconnect_battle';

type BattleViewMode = 'map' | 'battle';

const PLAIN_MAP_BATTLE_ID_PREFIX = 'battle-';

const isPlainMapBattleId = (battleId: string): boolean => {
  return battleId.startsWith(PLAIN_MAP_BATTLE_ID_PREFIX);
};

export const resolveRealtimeBattleViewSyncMode = (params: {
  battleId: string;
  inTeam: boolean;
  isTeamLeader: boolean;
  viewMode: BattleViewMode;
  hasLocalBattleTargets: boolean;
  currentArenaBattleId: string | null;
  currentDungeonBattleId: string | null;
  currentReconnectBattleId: string | null;
}): RealtimeBattleViewSyncMode => {
  if (params.inTeam && !params.isTeamLeader) {
    return 'sync_team_battle';
  }

  const hasExternalBattleContext = Boolean(
    params.currentArenaBattleId || params.currentDungeonBattleId || params.currentReconnectBattleId,
  );
  const isHoldingLocalPlainMapBattle =
    params.viewMode === 'battle'
    && params.hasLocalBattleTargets
    && isPlainMapBattleId(params.battleId)
    && !hasExternalBattleContext;

  if (isHoldingLocalPlainMapBattle) {
    return 'keep_local_battle';
  }

  return 'sync_reconnect_battle';
};
