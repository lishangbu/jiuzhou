/**
 * 爱发电 OpenAPI 服务
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中处理爱发电 OpenAPI 的签名、请求发送、响应校验，为私信发送等能力提供单一入口。
 * 2. 做什么：把 `user_id/token/base_url` 的配置读取统一收口，避免多个业务模块重复拼请求。
 * 3. 不做什么：不做业务幂等、不做数据库重试记录，也不决定失败后的调度策略。
 *
 * 输入/输出：
 * - 输入：接口路径与已类型化的 params 对象。
 * - 输出：爱发电 OpenAPI 的成功响应数据；失败时抛出明确错误。
 *
 * 数据流/状态流：
 * 私信投递服务 -> 本模块构造 `params/ts/sign` -> fetch 爱发电 OpenAPI -> 返回统一成功结果。
 *
 * 关键边界条件与坑点：
 * 1. `params` 既用于请求体也用于签名，因此必须先序列化一次并复用同一份 JSON 字符串。
 * 2. 爱发电返回 `ec !== 200` 也属于业务失败，不能只看 HTTP 200。
 */
import {
  buildAfdianOpenApiSign,
  getAfdianOpenApiBaseUrl,
  type AfdianOpenApiEnvelope,
} from './afdian/shared.js';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

type AfdianOpenApiParams = Record<string, JsonValue>;

type AfdianSendMessageResponseData = {
  [key: string]: JsonValue;
};

const getAfdianOpenApiCredentials = (): { userId: string; token: string; baseUrl: string } => {
  const userId = String(process.env.AFDIAN_OPEN_USER_ID ?? '').trim();
  const token = String(process.env.AFDIAN_OPEN_TOKEN ?? '').trim();
  if (!userId || !token) {
    throw new Error('爱发电 OpenAPI 配置缺失：请设置 AFDIAN_OPEN_USER_ID 与 AFDIAN_OPEN_TOKEN');
  }

  return {
    userId,
    token,
    baseUrl: getAfdianOpenApiBaseUrl(),
  };
};

const callAfdianOpenApi = async <TData extends { [key: string]: JsonValue }>(
  path: string,
  params: AfdianOpenApiParams,
): Promise<AfdianOpenApiEnvelope<TData>> => {
  const config = getAfdianOpenApiCredentials();
  const ts = Math.floor(Date.now() / 1000);
  const paramsText = JSON.stringify(params);
  const sign = buildAfdianOpenApiSign({
    token: config.token,
    userId: config.userId,
    paramsText,
    ts,
  });

  const response = await fetch(`${config.baseUrl}${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      user_id: config.userId,
      params: paramsText,
      ts,
      sign,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`爱发电接口请求失败：HTTP ${String(response.status)} ${errorText.slice(0, 200)}`.trim());
  }

  const body = await response.json() as AfdianOpenApiEnvelope<TData>;
  if (body.ec !== 200) {
    throw new Error(body.em?.trim() || `爱发电接口请求失败：ec=${String(body.ec)}`);
  }

  return body;
};

export const sendAfdianPrivateMessage = async (input: {
  recipient: string;
  content: string;
}): Promise<AfdianOpenApiEnvelope<AfdianSendMessageResponseData>> => {
  return callAfdianOpenApi<AfdianSendMessageResponseData>('/api/open/send-msg', {
    recipient: input.recipient,
    content: input.content,
  });
};
