/**
 * 挂机 flush 失败控制工具
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中定义挂机 flush 失败的日志口径，避免普通执行器与 Worker 执行器各写一套连接异常分类。
 * 2. 做什么：集中定义“终止前最终 flush 失败时必须延迟重试”的决策，确保未落库批次不会因为提前清理运行态而丢失。
 * 3. 不做什么：不直接执行数据库重试、不管理定时器、不持有会话状态，调度仍由执行器本身负责。
 *
 * 输入/输出：
 * - 输入：执行器标签、会话 ID、flush 是否成功、数据库异常对象。
 * - 输出：flush 日志副作用；终止阶段返回“继续终止/延迟重试”的纯决策对象。
 *
 * 数据流/状态流：
 * flush 抛错 -> 本模块统一归类日志 -> 执行器保留缓冲区；
 * 终止前 flush 失败 -> 本模块返回 retryDelayMs -> 执行器保留运行态并调度下一次 finalize。
 *
 * 关键边界条件与坑点：
 * 1. `Connection terminated unexpectedly` 属于可恢复数据库异常，必须与普通 SQL/业务错误分开记录，否则会误导排查方向。
 * 2. 最终 flush 失败时不能继续 `completeIdleSession + clearLoopRuntimeState`，否则内存缓冲区会在未落库前被释放。
 */

import { isTransientPgError } from '../../config/databaseRuntimeError.js';

export const IDLE_TERMINATION_FLUSH_RETRY_DELAY_MS = 1_000;

type IdleTerminationFlushDecision =
  | { shouldFinalize: true }
  | { shouldFinalize: false; retryDelayMs: number };

export function logIdleFlushFailure(executorLabel: string, error: Error): void {
  if (isTransientPgError(error)) {
    console.warn(`[${executorLabel}] flush 遇到可恢复数据库异常，已保留缓冲区等待后续重试:`, error);
    return;
  }

  console.error(`[${executorLabel}] flush 失败:`, error);
}

export function resolveIdleTerminationFlushDecision(params: {
  executorLabel: string;
  sessionId: string;
  flushSucceeded: boolean;
}): IdleTerminationFlushDecision {
  if (params.flushSucceeded) {
    return { shouldFinalize: true };
  }

  console.warn(
    `[${params.executorLabel}] 会话 ${params.sessionId} 终止前最终 flush 未成功，已保留运行态并将在 ${IDLE_TERMINATION_FLUSH_RETRY_DELAY_MS}ms 后重试，避免未落库批次丢失`,
  );
  return {
    shouldFinalize: false,
    retryDelayMs: IDLE_TERMINATION_FLUSH_RETRY_DELAY_MS,
  };
}
