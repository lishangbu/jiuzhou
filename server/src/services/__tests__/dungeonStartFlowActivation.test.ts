/**
 * dungeonStartFlow 激活时序回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定秘境启动流程必须先完成投影提交，再激活 `battle_started` 推送与 ticker，避免首个即时 tick 抢跑结算。
 * 2. 做什么：验证提交失败时不会误激活战斗运行时，保证“未提交成功的 battle”不会提前进入自动推进。
 * 3. 不做什么：不验证真实战斗引擎、Redis 或秘境奖励内容；这里只关心流程编排顺序。
 *
 * 输入/输出：
 * - 输入：可注入的 startBattle / commitOnBattleStarted 回调，以及 mocked 的 activateRegisteredBattleRuntime。
 * - 输出：激活调用顺序与调用次数断言。
 *
 * 数据流/状态流：
 * startBattle 返回 battleId
 * -> runDungeonStartFlow 执行 commitOnBattleStarted
 * -> 仅当 commit 成功后才调用 activateRegisteredBattleRuntime。
 *
 * 关键边界条件与坑点：
 * 1. 断言必须发生在 commit 回调内部，才能证明激活没有抢在提交前执行。
 * 2. 提交失败时不能只看返回值；还要验证激活调用次数为 0，避免留下隐性竞态。
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import * as battleRuntimeState from '../battle/runtime/state.js';

test('runDungeonStartFlow: 提交成功后才激活已注册战斗运行时', async (t) => {
  const activatedBattleIds: string[] = [];
  t.mock.method(
    battleRuntimeState,
    'activateRegisteredBattleRuntime',
    (battleId: string) => {
      activatedBattleIds.push(battleId);
    },
  );

  const { runDungeonStartFlow } = await import('../dungeon/shared/startFlow.js');

  const result = await runDungeonStartFlow({
    startBattle: async () => ({
      success: true,
      data: {
        battleId: 'dungeon-battle-activation-order',
        state: { phase: 'action' },
      },
    }),
    commitOnBattleStarted: async ({ battleId, state }) => {
      assert.equal(battleId, 'dungeon-battle-activation-order');
      assert.deepEqual(state, { phase: 'action' });
      assert.deepEqual(activatedBattleIds, []);
      return {
        success: true,
        data: {
          committed: true,
        },
      };
    },
  });

  assert.equal(result.success, true);
  assert.deepEqual(activatedBattleIds, ['dungeon-battle-activation-order']);
});

test('runDungeonStartFlow: 提交失败时不应激活已注册战斗运行时', async (t) => {
  const activatedBattleIds: string[] = [];
  t.mock.method(
    battleRuntimeState,
    'activateRegisteredBattleRuntime',
    (battleId: string) => {
      activatedBattleIds.push(battleId);
    },
  );

  const { runDungeonStartFlow } = await import('../dungeon/shared/startFlow.js');

  const result = await runDungeonStartFlow({
    startBattle: async () => ({
      success: true,
      data: {
        battleId: 'dungeon-battle-activation-failed',
        state: { phase: 'action' },
      },
    }),
    commitOnBattleStarted: async () => ({
      success: false,
      message: '提交失败',
    }),
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.message, '提交失败');
  }
  assert.deepEqual(activatedBattleIds, []);
});
