/**
 * 成就领奖锁顺序回归测试
 *
 * 作用（做什么 / 不做什么）：
 * - 做什么：验证成就领取与成就点数奖励领取都会先走统一的奖励目标加锁入口，再去锁 `character_achievement*` 记录。
 * - 做什么：把“先背包互斥锁，再锁 characters，再锁成就记录”的协议集中回归，避免同类锁顺序在多个领取入口各写一遍。
 * - 不做什么：不连接真实数据库，不校验奖励内容展示，也不覆盖背包发奖的完整落库流程。
 *
 * 输入/输出：
 * - 输入：对 `withTransaction`、`query`、静态配置加载器与奖励目标锁工具的 mock。
 * - 输出：领取结果，以及关键调用顺序日志。
 *
 * 数据流/状态流：
 * - 测试先把事务包装器改成直通；
 * - 再记录奖励目标锁与 `FOR UPDATE character_achievement*` 查询的先后顺序；
 * - 最后断言领取成功，且统一锁入口始终先执行。
 *
 * 关键边界条件与坑点：
 * 1) 这里故意把奖励配置收敛为“空奖励”，只验证锁顺序根因，避免把无关的物品/货币发放实现耦合进来。
 * 2) `@Transactional` 装饰器会走 `withTransaction`，若不先 mock 成直通，测试会误触真实连接池。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import * as database from '../../config/database.js';
import * as staticConfigLoader from '../staticConfigLoader.js';
import { claimAchievement, claimAchievementPointsReward } from '../achievement/claim.js';
import * as rewardTargetLock from '../shared/characterRewardTargetLock.js';

test('成就奖励领取应先锁奖励目标再锁成就记录', async (t) => {
  const events: string[] = [];

  t.mock.method(database, 'withTransaction', async <T>(callback: () => Promise<T>) => {
    return await callback();
  });
  const rewardLockMock = t.mock.method(
    rewardTargetLock,
    'lockCharacterRewardSettlementTargets',
    async (characterIds: number[]) => {
      events.push(`reward-lock:${characterIds.join(',')}`);
      return characterIds;
    },
  );
  t.mock.method(staticConfigLoader, 'getAchievementDefinitions', () => [
    {
      id: 'ach-lock-order',
      enabled: true,
      rewards: [],
      title_id: null,
    },
  ]);
  t.mock.method(database, 'query', async (sql: string) => {
    if (sql.includes('FROM character_achievement') && sql.includes('FOR UPDATE')) {
      events.push('achievement-row-lock');
      return { rows: [{ status: 'completed' }] };
    }
    if (sql.includes('UPDATE character_achievement')) {
      events.push('achievement-row-update');
      return { rows: [] };
    }
    return { rows: [] };
  });

  const result = await claimAchievement(1001, 2712, 'ach-lock-order');

  assert.equal(result.success, true);
  assert.equal(rewardLockMock.mock.callCount(), 1);
  assert.deepEqual(rewardLockMock.mock.calls[0]?.arguments, [[2712]]);
  assert.ok(events.indexOf('reward-lock:2712') >= 0);
  assert.ok(events.indexOf('achievement-row-lock') >= 0);
  assert.ok(
    events.indexOf('reward-lock:2712') < events.indexOf('achievement-row-lock'),
    `奖励目标锁应先于成就行锁执行，实际顺序: ${events.join(' -> ')}`,
  );
});

test('成就点数奖励领取应先锁奖励目标再锁点数记录', async (t) => {
  const events: string[] = [];

  t.mock.method(database, 'withTransaction', async <T>(callback: () => Promise<T>) => {
    return await callback();
  });
  const rewardLockMock = t.mock.method(
    rewardTargetLock,
    'lockCharacterRewardSettlementTargets',
    async (characterIds: number[]) => {
      events.push(`reward-lock:${characterIds.join(',')}`);
      return characterIds;
    },
  );
  t.mock.method(staticConfigLoader, 'getAchievementPointsRewardDefinitions', () => [
    {
      id: 'apr-lock-order',
      enabled: true,
      points_threshold: 300,
      rewards: [],
      title_id: null,
    },
  ]);
  t.mock.method(database, 'query', async (sql: string) => {
    if (sql.includes('INSERT INTO character_achievement_points')) {
      events.push('achievement-points-ensure');
      return { rows: [] };
    }
    if (sql.includes('FROM character_achievement_points') && sql.includes('FOR UPDATE')) {
      events.push('achievement-points-lock');
      return { rows: [{ total_points: 300, claimed_thresholds: [] }] };
    }
    if (sql.includes('UPDATE character_achievement_points')) {
      events.push('achievement-points-update');
      return { rows: [] };
    }
    return { rows: [] };
  });

  const result = await claimAchievementPointsReward(1001, 2712, 300);

  assert.equal(result.success, true);
  assert.equal(rewardLockMock.mock.callCount(), 1);
  assert.deepEqual(rewardLockMock.mock.calls[0]?.arguments, [[2712]]);
  assert.ok(events.indexOf('reward-lock:2712') >= 0);
  assert.ok(events.indexOf('achievement-points-lock') >= 0);
  assert.ok(
    events.indexOf('reward-lock:2712') < events.indexOf('achievement-points-lock'),
    `奖励目标锁应先于点数行锁执行，实际顺序: ${events.join(' -> ')}`,
  );
});
