/**
 * IdleBattleRewardResolver — 挂机奖励的“先计算、后兑现”统一入口
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：把挂机奖励拆成“单场奖励计划”与“真实结算结果”两个阶段，供 30 秒窗口复用。
 * 2. 做什么：保留兼容入口 `resolveIdleBattleRewards`，供旧执行链路按“即时结算”语义继续工作。
 * 3. 不做什么：不承载战斗模拟，不做窗口 flush 时机控制。
 *
 * 输入/输出：
 * - buildIdleBattleRewardSettlementPlan(monsterIds, participant, battleResult)
 *   输入怪物列表、单角色参与者与胜负，输出单场奖励计划（预览收益 + 后续兑现计划）。
 * - settleIdleBattleRewardSettlementPlan(plan, participant)
 *   输入奖励计划与参与者，输出真实入包后的最终收益结果。
 * - resolveIdleBattleRewards(monsterIds, session, userId, battleResult)
 *   兼容旧行为：内部等价于“先 build，再 settle”。
 *
 * 数据流/状态流：
 * 战斗结果 -> 奖励计划 -> 30 秒窗口缓存 -> flush 时真实兑现
 * 兼容路径：战斗结果 -> 奖励计划 -> 立即兑现 -> 直接返回最终收益
 *
 * 关键边界条件与坑点：
 * 1. 非 attacker_win 或无 monsterIds 时直接返回空计划/空收益，避免无效事务。
 * 2. 预览收益中的物品是“已算出的掉落预览”，最终真实入包结果可能因自动分解/邮件补发发生变化。
 */

import {
  battleDropService,
  type BattleParticipant,
  type SinglePlayerRewardSettlementResult,
} from '../battleDropService.js';
import type {
  IdleBattleRewardSettlementPlan,
  IdleSessionRow,
} from './types.js';

const EMPTY_PLAN: IdleBattleRewardSettlementPlan = {
  expGained: 0,
  silverGained: 0,
  previewItems: [],
  dropPlans: [],
};

const buildIdleRewardParticipant = (
  session: Pick<IdleSessionRow, 'id' | 'characterId' | 'sessionSnapshot'>,
  userId: number,
): BattleParticipant => ({
  userId,
  characterId: session.characterId,
  nickname: String(session.characterId),
  realm: session.sessionSnapshot.realm,
  idleSessionId: session.id,
});

export async function buildIdleBattleRewardSettlementPlan(
  monsterIds: string[],
  participant: BattleParticipant,
  battleResult: 'attacker_win' | 'defender_win' | 'draw',
): Promise<IdleBattleRewardSettlementPlan> {
  if (battleResult !== 'attacker_win' || monsterIds.length === 0) {
    return EMPTY_PLAN;
  }

  return battleDropService.planSinglePlayerBattleRewards(
    monsterIds,
    participant,
    true,
  );
}

export async function settleIdleBattleRewardSettlementPlan(
  participant: BattleParticipant,
  plan: IdleBattleRewardSettlementPlan,
): Promise<SinglePlayerRewardSettlementResult> {
  if (
    plan.expGained <= 0 &&
    plan.silverGained <= 0 &&
    plan.previewItems.length === 0 &&
    plan.dropPlans.length === 0
  ) {
    return {
      expGained: 0,
      silverGained: 0,
      itemsGained: [],
      bagFullFlag: false,
    };
  }

  return battleDropService.settleSinglePlayerBattleRewardPlan(participant, plan);
}

/**
 * 兼容旧执行器的即时结算入口。
 */
export async function resolveIdleBattleRewards(
  monsterIds: string[],
  session: IdleSessionRow,
  userId: number,
  battleResult: 'attacker_win' | 'defender_win' | 'draw',
): Promise<SinglePlayerRewardSettlementResult> {
  const participant = buildIdleRewardParticipant(session, userId);
  const plan = await buildIdleBattleRewardSettlementPlan(
    monsterIds,
    participant,
    battleResult,
  );
  return settleIdleBattleRewardSettlementPlan(participant, plan);
}

export { buildIdleRewardParticipant };
