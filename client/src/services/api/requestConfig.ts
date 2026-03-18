import type { AxiosRequestConfig } from 'axios';

/**
 * 接口请求配置共享常量
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：统一收口“关闭自动错误 toast”的请求配置，避免页面和 API 模块各自复制同一份字面量。
 * 2. 做什么：同时提供 `meta` 与完整 `config` 两种粒度，兼容直接传请求配置和嵌入已有配置对象两种复用场景。
 * 3. 不做什么：不负责真正发请求，也不决定业务层何时改为静默请求。
 *
 * 输入/输出：
 * - 输入：无。
 * - 输出：`SILENT_API_REQUEST_META`、`SILENT_API_REQUEST_CONFIG`、`withRequestParams`。
 *
 * 数据流/状态流：
 * 业务模块导入共享常量 -> axios 拦截器读取 `meta.autoErrorToast` -> 决定是否自动提示错误。
 * 业务模块导入 `withRequestParams` -> 统一合并调用方透传配置与本次请求参数 -> 交给 axios 发起请求。
 *
 * 关键边界条件与坑点：
 * 1. 静默只关闭自动 toast，不会吞掉 Promise reject；调用方仍需自己决定是否 catch 和提示。
 * 2. 所有静默请求必须共用同一份配置来源，避免后续调整字段名时出现多处散落修改。
 * 3. `withRequestParams` 只负责合并扁平查询参数，不负责序列化复杂嵌套结构；复杂 `params` 仍应在调用侧明确构造。
 */

type RequestParamValue = string | number | boolean | null | undefined;
type RequestParams = Record<string, RequestParamValue>;

const isPlainRequestParams = (value: AxiosRequestConfig['params']): value is RequestParams => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

export const SILENT_API_REQUEST_META = {
  autoErrorToast: false,
} as const;

export const SILENT_API_REQUEST_CONFIG = {
  meta: SILENT_API_REQUEST_META,
} as const satisfies AxiosRequestConfig;

export const withRequestParams = <TParams extends RequestParams>(
  requestConfig: AxiosRequestConfig | undefined,
  params: TParams,
): AxiosRequestConfig => {
  const baseParams = isPlainRequestParams(requestConfig?.params) ? requestConfig.params : {};
  return {
    ...requestConfig,
    params: {
      ...baseParams,
      ...params,
    },
  };
};
