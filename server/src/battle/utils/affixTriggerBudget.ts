/**
 * 多段技能特殊词条触发预算工具
 *
 * 作用：
 * 1. 做什么：集中统计技能总伤害段数，并将装备特殊词条的总触发能力收敛到固定上限 1.2。
 * 2. 做什么：为技能执行层提供“每段命中应乘的触发概率缩放系数”，避免多段技能按 hit_count 线性放大词条收益。
 * 3. 不做什么：不处理套装效果、不处理实际伤害结算，也不改写技能原始效果配置。
 *
 * 输入 / 输出：
 * - 输入：`BattleSkill`
 * - 输出：`0 ~ 1` 的概率缩放系数；单段技能返回 `1`
 *
 * 数据流 / 状态流：
 * - `BattleSkill.effects` -> 统计 damage effect 的 `hit_count` 总和 -> 按固定上限换算缩放系数 -> `skill.ts` 在施法开始时计算一次 -> `setBonus.ts` 统一消费
 *
 * 复用设计说明：
 * - 多段技能的词条预算属于全局平衡规则，放在 `battle/utils` 能避免 `skill.ts` 和 `setBonus.ts` 各自重复统计 `hit_count`。
 * - 当前由技能执行入口复用；后续若策划继续调总上限，只需改这一处常量，不需要再翻多个战斗模块。
 * - 高频变化点是“多段技能对装备特殊词条的放大倍率”，因此收敛为单一入口，避免规则散落后维护成本上涨。
 *
 * 关键边界条件与坑点：
 * 1. 只统计 `damage` 类型 effect，不能把 buff / control / heal 等非命中效果误算进触发预算。
 * 2. 单段技能必须保持原始触发能力，不能因为统一公式把所有技能一并削弱。
 */

import type { BattleSkill } from '../types.js';

export const MULTI_HIT_AFFIX_TRIGGER_COEFFICIENT_CAP = 1.5;

export function resolveSkillAffixTriggerChanceScale(skill: BattleSkill): number {
  let totalDamageHitCount = 0;

  for (const effect of skill.effects) {
    if (effect.type !== 'damage') continue;
    const hitCount = typeof effect.hit_count === 'number' && Number.isFinite(effect.hit_count)
      ? Math.max(1, Math.floor(effect.hit_count))
      : 1;
    totalDamageHitCount += hitCount;
  }

  if (totalDamageHitCount <= 1) return 1;
  return Math.min(1, MULTI_HIT_AFFIX_TRIGGER_COEFFICIENT_CAP / totalDamageHitCount);
}
