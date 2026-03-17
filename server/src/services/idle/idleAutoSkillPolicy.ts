/**
 * 挂机自动技能策略归一化模块
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：统一按“角色当前可用技能集合”清理挂机自动技能策略中的失效 skillId，并重排 priority。
 * 2. 做什么：提供“当前请求内直接归一化”和“清理已持久化挂机配置”两类复用入口，避免路由与功法服务各写一套。
 * 3. 不做什么：不负责挂机地图/房间校验，不负责启动挂机会话，也不替调用方决定默认技能。
 *
 * 输入/输出：
 * - 输入：角色 ID、待归一化的 AutoSkillPolicy，或数据库中的 idle_configs.auto_skill_policy。
 * - 输出：清理后的 AutoSkillPolicy；若命中持久化清理则同步写回数据库。
 *
 * 数据流/状态流：
 * 当前可用技能集合 -> 过滤挂机策略 slots 中的失效 skillId -> 重新按保留顺序编号 priority
 * -> idleRoutes / characterTechniqueService 复用同一份结果。
 *
 * 关键边界条件与坑点：
 * 1. 这里只清理“当前已不可用”的技能，不额外补默认技能，避免篡改玩家原本的释放顺序意图。
 * 2. priority 必须和过滤后的数组顺序保持一致，不能保留旧编号，否则前端和战斗执行口径会漂移。
 */

import { query } from '../../config/database.js';
import { validateAutoSkillPolicy } from './autoSkillPolicyCodec.js';
import type { AutoSkillPolicy, AutoSkillSlot } from './types.js';
import { listCharacterAvailableSkillIdSet } from '../shared/characterAvailableSkills.js';

export const normalizeIdleAutoSkillPolicySlots = (
  slots: AutoSkillSlot[],
  availableSkillIds: Set<string>,
): AutoSkillSlot[] => {
  return slots
    .filter((slot) => availableSkillIds.has(slot.skillId))
    .map((slot, index) => ({
      skillId: slot.skillId,
      priority: index + 1,
    }));
};

const isSameAutoSkillPolicy = (left: AutoSkillPolicy, right: AutoSkillPolicy): boolean => {
  if (left.slots.length !== right.slots.length) return false;
  return left.slots.every((slot, index) => {
    const rightSlot = right.slots[index];
    return rightSlot !== undefined && slot.skillId === rightSlot.skillId && slot.priority === rightSlot.priority;
  });
};

export const reconcileIdleAutoSkillPolicyForCharacter = async (
  characterId: number,
  policy: AutoSkillPolicy,
): Promise<AutoSkillPolicy> => {
  const availableSkillIds = await listCharacterAvailableSkillIdSet(characterId);
  return {
    slots: normalizeIdleAutoSkillPolicySlots(policy.slots, availableSkillIds),
  };
};

export const cleanupPersistedIdleConfigAutoSkillPolicy = async (characterId: number): Promise<void> => {
  const result = await query(
    `
      SELECT auto_skill_policy
      FROM idle_configs
      WHERE character_id = $1
    `,
    [characterId],
  );

  if (result.rows.length === 0) {
    return;
  }

  const row = result.rows[0] as { auto_skill_policy: AutoSkillPolicy | null };
  const validation = validateAutoSkillPolicy(row.auto_skill_policy);
  if (!validation.success) {
    throw new Error('idle_configs.auto_skill_policy 数据非法');
  }

  const normalizedPolicy = await reconcileIdleAutoSkillPolicyForCharacter(characterId, validation.value);
  if (isSameAutoSkillPolicy(validation.value, normalizedPolicy)) {
    return;
  }

  await query(
    `
      UPDATE idle_configs
      SET auto_skill_policy = $2::jsonb,
          updated_at = NOW()
      WHERE character_id = $1
    `,
    [characterId, JSON.stringify(normalizedPolicy)],
  );
};
