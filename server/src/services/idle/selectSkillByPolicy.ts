/**
 * selectSkillByPolicy — 按自动技能策略选择技能
 *
 * 作用：
 *   根据 AutoSkillPolicy 从角色当前可释放技能中选出优先级最高的技能。
 *   若所有策略技能均不可释放，回退到普通攻击。
 *   不包含任何副作用，不修改 BattleUnit 状态。
 *
 * 输入/输出：
 *   - unit: BattleUnit — 当前行动单位（含技能列表、冷却、灵气等状态）
 *   - policy: AutoSkillPolicy — 自动技能策略（slots 已按 priority 升序排列）
 *   返回：BattleSkill — 选中的技能（策略命中或普通攻击）
 *
 * 数据流：
 *   AutoSkillPolicy.slots（按 priority 升序）→ 逐一检查 unit.skills 中对应技能是否可释放
 *   → 命中第一个可释放技能 → 返回该技能
 *   → 全部不可释放 → 返回 getNormalAttack(unit)
 *
 * 关键边界条件：
 *   1. policy.slots 为空时直接回退普通攻击，不做无效遍历
 *   2. 策略中引用的 skillId 在 unit.skills 中不存在时，跳过该槽位（不报错）
 *   3. 可释放判断完全复用 getAvailableSkills 的过滤逻辑，不重复实现冷却/资源检查
 *   4. 调用方保证 policy.slots 已按 priority 升序排列（由 AutoSkillPolicyCodec 保证）
 */

import type { BattleUnit, BattleSkill } from '../../battle/types.js';
import { getAvailableSkills, getNormalAttack } from '../../battle/modules/skill.js';
import type { AutoSkillPolicy } from './types.js';

/**
 * 按策略选择技能
 *
 * 遍历 policy.slots（已按 priority 升序），找到第一个满足以下条件的槽位：
 *   1. unit.skills 中存在对应 skillId 的技能
 *   2. 该技能当前可释放（不在冷却、资源足够、triggerType === 'active'）
 *
 * 若无命中，返回普通攻击。
 */
export function selectSkillByPolicy(unit: BattleUnit, policy: AutoSkillPolicy): BattleSkill {
  // 空策略直接回退
  if (policy.slots.length === 0) {
    return getNormalAttack(unit);
  }

  // 一次性计算可释放技能集合（复用 getAvailableSkills，不重复实现冷却/资源判断）
  const availableSkills = getAvailableSkills(unit);
  const availableSkillIds = new Set(availableSkills.map((s) => s.id));

  // 按 priority 升序遍历（调用方保证 slots 已排序）
  for (const slot of policy.slots) {
    if (!availableSkillIds.has(slot.skillId)) continue;

    // 从 unit.skills 中取出完整技能对象（getAvailableSkills 返回的是过滤后的引用，可直接用）
    const skill = availableSkills.find((s) => s.id === slot.skillId);
    if (skill) return skill;
  }

  // 所有策略技能均不可释放，回退普通攻击
  return getNormalAttack(unit);
}
