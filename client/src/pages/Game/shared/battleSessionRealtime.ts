import type { BattleSessionSnapshotDto } from '../../../services/api';
import type { BattleRealtimeKind } from '../../../services/battleRealtime';

/**
 * 战斗 realtime 驱动的会话归一化规则。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：统一收口 websocket realtime 到达后，前端应该保留哪一份 battle session 快照，避免 Game 与 BattleArea 各自决定终态 session 的保留方式。
 * 2. 做什么：明确 `battle_abandoned` 到达后必须清空当前会话，防止旧 session 被重新写回状态，影响后续新战斗流程。
 * 3. 不做什么：不负责切换视图、不发请求，也不决定是否自动推进下一场。
 *
 * 输入/输出：
 * - 输入：realtime kind 与服务端附带的 session 快照。
 * - 输出：应该写入前端状态的 session；若返回 `null` 表示必须清空会话。
 *
 * 数据流/状态流：
 * - socket battle:update -> 本模块归一化 session -> Game/BattleArea 写入 React state。
 *
 * 关键边界条件与坑点：
 * 1. `battle_abandoned` 虽然服务端会附带一份 `abandoned` session 快照，但前端不能把它继续当作“当前活跃会话”保存，否则旧异步请求会重新对上已失效 session。
 * 2. 其他 realtime 类型仍应原样透传服务端 session，避免 running / waiting_transition / completed 口径被前端擅自改写。
 */
export const normalizeBattleSessionFromRealtime = (params: {
  kind: BattleRealtimeKind;
  session?: BattleSessionSnapshotDto | null;
}): BattleSessionSnapshotDto | null => {
  if (params.kind === 'battle_abandoned') {
    return null;
  }
  return params.session ?? null;
};
