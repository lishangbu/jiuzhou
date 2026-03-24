/**
 * 慢操作日志工具测试。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定日志工具只在总耗时超过阈值时输出，避免正常请求把日志刷满。
 * 2. 做什么：锁定阶段耗时按相邻打点差值计算，后续业务接入时可以直接依赖统一口径。
 * 3. 不做什么：不覆盖具体 battle/dungeon 业务，只校验日志工具本身的阈值与分段行为。
 *
 * 输入/输出：
 * - 输入：可控时间源、阶段打点、输出收集器。
 * - 输出：是否产生日志，以及日志中的总耗时与阶段耗时。
 *
 * 数据流/状态流：
 * 测试构造 logger -> 推进虚拟时间 -> 调用 mark/flush
 * -> 收集输出 -> 断言是否按阈值过滤且阶段耗时正确。
 *
 * 关键边界条件与坑点：
 * 1. 正常请求不得产生日志，否则线上观察会被正常流量淹没。
 * 2. `flush` 后不应再重复输出，避免多 return 路径造成同一请求重复记录。
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSlowOperationLogger,
  type SlowOperationLogEntry,
} from '../../utils/slowOperationLogger.js';

test('createSlowOperationLogger: 总耗时未超过阈值时不应输出日志', () => {
  let nowValue = 0;
  const entries: SlowOperationLogEntry[] = [];
  const logger = createSlowOperationLogger({
    label: 'api/battle/action',
    thresholdMs: 100,
    now: () => nowValue,
    write: (entry) => {
      entries.push(entry);
    },
  });

  nowValue = 40;
  logger.mark('engine.playerAction');
  nowValue = 95;
  logger.flush({ success: true });

  assert.equal(entries.length, 0);
});

test('createSlowOperationLogger: 总耗时超过阈值时应输出分段慢日志', () => {
  let nowValue = 0;
  const entries: SlowOperationLogEntry[] = [];
  const logger = createSlowOperationLogger({
    label: 'api/battle-session/advance',
    thresholdMs: 100,
    fields: { sessionId: 'session-1' },
    now: () => nowValue,
    write: (entry) => {
      entries.push(entry);
    },
  });

  nowValue = 35;
  logger.mark('startPVEBattle');
  nowValue = 120;
  logger.mark('syncPveResumeIntentForSession');
  nowValue = 150;
  logger.flush({ success: true });
  logger.flush({ success: false });

  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.label, 'api/battle-session/advance');
  assert.equal(entries[0]?.sessionId, 'session-1');
  assert.equal(entries[0]?.success, true);
  assert.equal(entries[0]?.totalCostMs, 150);
  assert.deepEqual(entries[0]?.stages, [
    { name: 'startPVEBattle', costMs: 35 },
    { name: 'syncPveResumeIntentForSession', costMs: 85 },
    { name: 'tail', costMs: 30 },
  ]);
});
