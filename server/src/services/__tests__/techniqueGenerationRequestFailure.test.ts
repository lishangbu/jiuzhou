/**
 * 洞府研修模型请求失败归因测试
 *
 * 作用（做什么 / 不做什么）：
 * 1) 做什么：验证模型请求超时与普通异常会被稳定映射成不同日志 stage，避免排查时把超时误读成通用请求失败。
 * 2) 不做什么：不触发真实网络请求、不依赖 AbortController，也不验证重试流程。
 *
 * 输入/输出：
 * - 输入：模拟的 AbortError / 普通 Error，以及超时标记。
 * - 输出：`resolveTechniqueGenerationRequestFailure` 的 stage / reason。
 *
 * 数据流/状态流：
 * 模拟请求异常 -> 共享归因函数 -> 断言日志归因稳定。
 *
 * 关键边界条件与坑点：
 * 1) Node fetch 超时常见 message 为 `This operation was aborted`，这里要锁定这条兼容规则，避免未来回退成模糊日志。
 * 2) 只有本地超时标记与 abort 异常同时成立时才归为超时，避免把其他手动取消误判成网络慢。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveTechniqueGenerationRequestFailure } from '../shared/techniqueGenerationRequestFailure.js';

test('本地超时触发的 AbortError 应归因为 request_timeout', () => {
  const failure = resolveTechniqueGenerationRequestFailure({
    error: new Error('This operation was aborted'),
    didTimeout: true,
    timeoutMs: 12_000,
  });

  assert.equal(failure.stage, 'request_timeout');
  assert.equal(failure.reason, '模型请求超时（12000ms）');
});

test('非超时异常应保留为 request_failed', () => {
  const failure = resolveTechniqueGenerationRequestFailure({
    error: new Error('socket hang up'),
    didTimeout: false,
    timeoutMs: 12_000,
  });

  assert.equal(failure.stage, 'request_failed');
  assert.equal(failure.reason, 'socket hang up');
});
