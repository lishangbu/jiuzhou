/**
 * DashScope 同步生图协议共享封装
 *
 * 作用（做什么 / 不做什么）：
 * 1) 做什么：集中构造 DashScope 同步生图请求 payload，并统一解析不同返回结构中的图片 URL / Base64。
 * 2) 做什么：给伙伴头像、功法图标等多个生图链路复用，避免每个模块各写一套 `input.messages` 与响应解析。
 * 3) 不做什么：不负责发起网络请求、不负责下载图片、不读取环境变量或决定业务降级策略。
 *
 * 输入/输出：
 * - 输入：模型名、提示词、归一化后的尺寸，以及原始 JSON 响应体。
 * - 输出：可直接用于 HTTP 请求的 payload，或从响应体中提取出的图片资源 `{ url, b64 }`。
 *
 * 数据流/状态流：
 * 业务 prompt/size -> buildDashScopeImageGenerationPayload -> 第三方模型 -> readDashScopeImageGenerationResult -> 调用方下载/落盘。
 *
 * 关键边界条件与坑点：
 * 1) DashScope 历史/现行接口可能分别返回 `output.results` 或 `output.choices[].message.content`，解析必须兼容这两种正式返回结构。
 * 2) 请求体必须固定使用 `input.messages`，否则新接口会直接报 `Field required: input.messages`，不能再让调用方各自手写。
 */

export type DashScopeImageGenerationPayload = {
  model: string;
  input: {
    messages: [{
      role: 'user';
      content: [{
        text: string;
      }];
    }];
  };
  parameters: {
    size: string;
    n: number;
    prompt_extend: boolean;
    watermark: boolean;
  };
};

export type DashScopeImageGenerationResult = {
  url: string;
  b64: string;
};

const asString = (raw: unknown): string => (typeof raw === 'string' ? raw.trim() : '');

export const buildDashScopeImageGenerationPayload = (
  modelName: string,
  prompt: string,
  size: string,
): DashScopeImageGenerationPayload => {
  return {
    model: modelName,
    input: {
      messages: [{
        role: 'user',
        content: [{
          text: prompt,
        }],
      }],
    },
    parameters: {
      size,
      n: 1,
      prompt_extend: true,
      watermark: false,
    },
  };
};

export const readDashScopeImageGenerationResult = (
  body: Record<string, unknown>,
): DashScopeImageGenerationResult => {
  const output = body.output;
  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    return { url: '', b64: '' };
  }

  const outputRow = output as Record<string, unknown>;
  const results = Array.isArray(outputRow.results) ? outputRow.results : [];
  const firstResult = results[0];
  if (firstResult && typeof firstResult === 'object' && !Array.isArray(firstResult)) {
    const resultRow = firstResult as Record<string, unknown>;
    const b64 = asString(resultRow.b64_image);
    const url = asString(resultRow.url);
    if (b64 || url) {
      return { url, b64 };
    }
  }

  const choices = Array.isArray(outputRow.choices) ? outputRow.choices : [];
  const firstChoice = choices[0];
  if (!firstChoice || typeof firstChoice !== 'object' || Array.isArray(firstChoice)) {
    return { url: '', b64: '' };
  }

  const message = (firstChoice as Record<string, unknown>).message;
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return { url: '', b64: '' };
  }

  const contentList = Array.isArray((message as Record<string, unknown>).content)
    ? ((message as Record<string, unknown>).content as unknown[])
    : [];
  for (const content of contentList) {
    if (!content || typeof content !== 'object' || Array.isArray(content)) continue;
    const contentRow = content as Record<string, unknown>;
    const url = asString(contentRow.image) || asString(contentRow.url);
    const b64 = asString(contentRow.b64_image);
    if (url || b64) {
      return { url, b64 };
    }
  }

  return { url: '', b64: '' };
};
