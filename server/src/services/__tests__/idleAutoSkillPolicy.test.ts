import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * 挂机自动技能策略归一化测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁住“功法变更后失效 skillId 会被移除且 priority 连续重排”的核心行为。
 * 2. 做什么：把可用技能集合过滤逻辑固定在纯函数层，避免未来路由/服务重构时重新引入英文 skillId 残留。
 * 3. 不做什么：不连接数据库、不调用路由，也不验证角色可用技能集合的来源查询。
 *
 * 输入/输出：
 * - 输入：旧的挂机技能策略 slots，与当前可用技能 ID 集合。
 * - 输出：清理后的 slots 列表。
 *
 * 数据流/状态流：
 * 持久化 slots -> normalizeIdleAutoSkillPolicySlots -> 过滤失效技能 -> 重排 priority。
 *
 * 关键边界条件与坑点：
 * 1. 过滤后 priority 必须从 1 开始连续编号，不能保留旧优先级空洞。
 * 2. 仅剔除当前不可用技能，保留技能的相对顺序必须稳定，避免玩家配置顺序被打乱。
 */

import { normalizeIdleAutoSkillPolicySlots } from '../idle/idleAutoSkillPolicy.js';

test('normalizeIdleAutoSkillPolicySlots: 应移除失效技能并连续重排 priority', () => {
  const result = normalizeIdleAutoSkillPolicySlots(
    [
      { skillId: 'skill-old', priority: 1 },
      { skillId: 'skill-keep-b', priority: 2 },
      { skillId: 'skill-keep-a', priority: 3 },
    ],
    new Set(['skill-keep-b', 'skill-keep-a']),
  );

  assert.deepEqual(result, [
    { skillId: 'skill-keep-b', priority: 1 },
    { skillId: 'skill-keep-a', priority: 2 },
  ]);
});

test('normalizeIdleAutoSkillPolicySlots: 当前无可用技能时应清空全部 slots', () => {
  const result = normalizeIdleAutoSkillPolicySlots(
    [
      { skillId: 'skill-a', priority: 1 },
      { skillId: 'skill-b', priority: 2 },
    ],
    new Set(),
  );

  assert.deepEqual(result, []);
});
