/**
 * PVE 战斗开启策略测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定普通 PVE 与秘境内部推进在冷却范围上的服务端单一策略，避免再次回退成“客户端/调用方可决定”的口径。
 * 2. 做什么：锁定组队战斗只判断发起者冷却，不因队员冷却拦截整队。
 * 3. 不做什么：不创建真实战斗、不访问数据库，也不验证前端自动推进。
 *
 * 输入/输出：
 * - 输入：普通玩家发起策略、秘境内部推进策略。
 * - 输出：发起者冷却与队员冷却的布尔判定结果。
 *
 * 数据流/状态流：
 * - 策略常量 -> 冷却判定辅助函数 -> 测试断言。
 *
 * 关键边界条件与坑点：
 * 1. “秘境推进可绕过冷却”只代表服务端内部策略允许跳过发起者冷却，不代表恢复公共可传参数。
 * 2. 队员冷却当前两种策略都不参与判定，未来若业务变化，应先改策略常量，再评估调用链影响。
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DUNGEON_FLOW_PVE_BATTLE_START_POLICY,
  PLAYER_DRIVEN_PVE_BATTLE_START_POLICY,
  shouldValidateBattleStarterCooldown,
  shouldValidateTeamMemberCooldown,
} from '../battle/shared/startPolicy.js';

test('普通玩家发起 PVE 时，应校验发起者冷却但不校验队员冷却', () => {
  assert.equal(
    shouldValidateBattleStarterCooldown(PLAYER_DRIVEN_PVE_BATTLE_START_POLICY),
    true,
  );
  assert.equal(
    shouldValidateTeamMemberCooldown(PLAYER_DRIVEN_PVE_BATTLE_START_POLICY),
    false,
  );
});

test('秘境内部推进时，应跳过发起者冷却且不校验队员冷却', () => {
  assert.equal(
    shouldValidateBattleStarterCooldown(DUNGEON_FLOW_PVE_BATTLE_START_POLICY),
    false,
  );
  assert.equal(
    shouldValidateTeamMemberCooldown(DUNGEON_FLOW_PVE_BATTLE_START_POLICY),
    false,
  );
});
