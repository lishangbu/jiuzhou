/**
 * 洞府研修模型请求失败归因
 *
 * 作用（做什么 / 不做什么）：
 * 1) 做什么：把模型请求阶段的超时中断与普通请求失败统一归因成稳定的日志字段。
 * 2) 做什么：为服务层提供可测试的纯函数，避免在 fetch catch 中重复散落 AbortError 判断。
 * 3) 不做什么：不发起网络请求、不管理重试次数，也不直接写日志。
 *
 * 输入/输出：
 * - 输入：原始异常对象、是否由本地超时触发中断、超时毫秒数。
 * - 输出：归一化后的失败 stage 与 reason。
 *
 * 数据流/状态流：
 * fetch/AbortController 异常 -> 本模块归因 -> techniqueGenerationService 记录尝试失败日志。
 *
 * 关键边界条件与坑点：
 * 1) Node fetch 的超时中断常见 message 是 `This operation was aborted`，如果不结合本地超时标记，会和手动 abort 混在一起。
 * 2) 这里只负责“请求层”归因，不推断上游业务是否应该重试，重试策略仍由 service 控制。
 */

export type TechniqueGenerationRequestFailureStage = 'request_timeout' | 'request_failed';

type ResolveTechniqueGenerationRequestFailureArgs = {
  error: unknown;
  didTimeout: boolean;
  timeoutMs: number;
};

const isAbortLikeError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  return error.name === 'AbortError' || error.message === 'This operation was aborted';
};

export const resolveTechniqueGenerationRequestFailure = (
  args: ResolveTechniqueGenerationRequestFailureArgs,
): {
  stage: TechniqueGenerationRequestFailureStage;
  reason: string;
} => {
  const { error, didTimeout, timeoutMs } = args;
  if (didTimeout && isAbortLikeError(error)) {
    return {
      stage: 'request_timeout',
      reason: `模型请求超时（${timeoutMs}ms）`,
    };
  }

  return {
    stage: 'request_failed',
    reason: error instanceof Error ? error.message : '未知异常',
  };
};
