import { useEffect, useState } from 'react';

/**
 * 共享防抖值 Hook
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：把频繁变化的输入值延迟为稳定值，供搜索、筛选等高频交互复用。
 * 2. 做什么：集中管理 `setTimeout/clearTimeout`，避免坊市、队伍等模块各自复制一套防抖副作用。
 * 3. 不做什么：不发起请求，不裁剪业务参数，也不决定请求成功后的状态更新。
 *
 * 输入/输出：
 * - 输入：原始值 `value` 与防抖时长 `delayMs`。
 * - 输出：延迟 `delayMs` 后才会更新的稳定值；当 `delayMs <= 0` 时立即返回最新值。
 *
 * 数据流/状态流：
 * - 上游组件状态变化 -> Hook 重置定时器 -> 延迟结束后写入稳定值 -> 下游 effect / 请求逻辑读取稳定值。
 *
 * 关键边界条件与坑点：
 * 1. `delayMs <= 0` 时必须同步透传，否则调用方显式传 0 会意外产生额外等待。
 * 2. 连续输入时必须清理旧定时器，否则过期输入会晚到覆盖，导致搜索结果和输入框节奏错位。
 */
export const useDebouncedValue = <T,>(value: T, delayMs: number): T => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    if (delayMs <= 0) {
      setDebouncedValue(value);
      return;
    }

    const timer = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [delayMs, value]);

  return debouncedValue;
};
