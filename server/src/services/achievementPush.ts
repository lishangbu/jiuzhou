/**
 * 成就状态 Socket 推送模块
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：把“重新读取可领取成就数量并推送给在线用户”收敛为单一入口，避免首页、成就弹窗、奖励领取路由分别维护同一份红点同步逻辑。
 * 2. 做什么：在服务端对同一角色的连续推送做轻量合并，减少一个事务链路里多次 `updateAchievementProgress` 导致的重复回源。
 * 3. 不做什么：不直接推送成就列表/称号列表快照，也不替代 HTTP 查询接口的完整数据职责。
 *
 * 输入/输出：
 * - 输入：`characterId`，以及可选 `userId`。
 * - 输出：无返回值；副作用是向在线用户发送 `achievement:update`。
 *
 * 数据流/状态流：
 * 业务写入成功 -> 本模块按角色合并短时间内的重复请求 -> 读取最新可领取数量 -> emit `achievement:update`
 *
 * 关键边界条件与坑点：
 * 1. 成就进度更新可能在一个动作里连续触发多次，这里必须按角色合并；否则前端会收到多次相同脏通知并重复回源。
 * 2. 推送只承担同步职责，用户离线或推送失败时不能影响已经提交成功的业务写入。
 */
import { getGameServer } from '../game/gameServer.js';
import { getAchievementClaimableCount } from './achievementService.js';
import { getCharacterUserId } from './sect/db.js';

const ACHIEVEMENT_PUSH_DEBOUNCE_MS = 80;

export interface AchievementUpdatePayload {
  characterId: number;
  claimableCount: number;
}

const achievementPushTimers = new Map<number, ReturnType<typeof setTimeout>>();
const achievementPushInFlight = new Set<number>();
const achievementPushQueued = new Set<number>();
const achievementPushUserHints = new Map<number, number>();

const clearAchievementPushTimer = (characterId: number): void => {
  const timer = achievementPushTimers.get(characterId);
  if (!timer) return;
  clearTimeout(timer);
  achievementPushTimers.delete(characterId);
};

const flushAchievementUpdate = async (characterId: number): Promise<void> => {
  const userHint = achievementPushUserHints.get(characterId);
  const resolvedUserId = userHint ?? await getCharacterUserId(characterId);
  achievementPushUserHints.delete(characterId);
  if (!resolvedUserId) return;

  const claimableCount = await getAchievementClaimableCount(characterId);
  const payload: AchievementUpdatePayload = {
    characterId,
    claimableCount,
  };
  getGameServer().emitToUser(resolvedUserId, 'achievement:update', payload);
};

const runAchievementUpdate = async (characterId: number): Promise<void> => {
  if (achievementPushInFlight.has(characterId)) {
    achievementPushQueued.add(characterId);
    return;
  }

  achievementPushInFlight.add(characterId);
  try {
    await flushAchievementUpdate(characterId);
  } finally {
    achievementPushInFlight.delete(characterId);
    if (achievementPushQueued.delete(characterId)) {
      scheduleAchievementUpdate(characterId);
    }
  }
};

const scheduleAchievementUpdate = (characterId: number): void => {
  clearAchievementPushTimer(characterId);
  const timer = setTimeout(() => {
    achievementPushTimers.delete(characterId);
    void runAchievementUpdate(characterId).catch((error) => {
      console.error(`[achievement:update] 推送失败: characterId=${characterId}`, error);
    });
  }, ACHIEVEMENT_PUSH_DEBOUNCE_MS);
  achievementPushTimers.set(characterId, timer);
};

export const notifyAchievementUpdate = async (
  characterId: number,
  userId?: number,
): Promise<void> => {
  const resolvedCharacterId = Math.trunc(Number(characterId));
  if (!Number.isFinite(resolvedCharacterId) || resolvedCharacterId <= 0) return;
  if (userId && Number.isFinite(userId) && userId > 0) {
    achievementPushUserHints.set(resolvedCharacterId, Math.trunc(userId));
  }
  scheduleAchievementUpdate(resolvedCharacterId);
};
