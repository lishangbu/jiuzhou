import assert from 'node:assert/strict';
import test from 'node:test';
import {
  IDLE_TERMINATION_FLUSH_RETRY_DELAY_MS,
  resolveIdleTerminationFlushDecision,
} from '../idle/idleFlushControl.js';

/**
 * 挂机 flush 终止控制回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定“最终 flush 失败时不得直接结束会话”的共享决策，避免普通执行器与 Worker 执行器再次分叉。
 * 2. 做什么：验证重试延迟由共享模块单一输出，避免两个执行器各写一套时间常量。
 * 3. 不做什么：不连接数据库、不驱动真实定时器，也不验证具体日志文本。
 *
 * 输入/输出：
 * - 输入：终止前 flush 是否成功、执行器标签、会话 ID。
 * - 输出：是否允许 finalize，以及失败时的统一 retryDelayMs。
 *
 * 数据流/状态流：
 * 执行器 finalizeTermination -> 共享决策函数 -> 测试断言 shouldFinalize / retryDelayMs。
 *
 * 关键边界条件与坑点：
 * 1. flush 成功时必须立即放行 finalize，不能误加额外等待，否则会拉长正常结束路径。
 * 2. flush 失败时必须返回 retryDelayMs，执行器才能保留内存缓冲区并安排下一次 finalize，而不是直接丢数据。
 */

test('resolveIdleTerminationFlushDecision: flush 成功时应允许立即结束会话', () => {
  const decision = resolveIdleTerminationFlushDecision({
    executorLabel: 'IdleBattleExecutor',
    sessionId: 'session-success',
    flushSucceeded: true,
  });

  assert.deepEqual(decision, { shouldFinalize: true });
});

test('resolveIdleTerminationFlushDecision: flush 失败时应阻止结束并返回统一重试延迟', () => {
  const decision = resolveIdleTerminationFlushDecision({
    executorLabel: 'IdleBattleExecutor',
    sessionId: 'session-retry',
    flushSucceeded: false,
  });

  assert.deepEqual(decision, {
    shouldFinalize: false,
    retryDelayMs: IDLE_TERMINATION_FLUSH_RETRY_DELAY_MS,
  });
});
