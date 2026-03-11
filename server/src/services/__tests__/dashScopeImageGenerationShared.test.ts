/**
 * DashScope 生图协议共享封装测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：验证共享 payload 使用 `input.messages`，并覆盖新旧两种 DashScope 响应结构的图片提取。
 * 2. 不做什么：不发真实网络请求，不覆盖上层头像/图标落盘逻辑。
 *
 * 输入/输出：
 * - 输入：模型名、提示词、尺寸，以及模拟的 DashScope JSON 响应。
 * - 输出：标准化 payload 与 `{ url, b64 }` 图片结果。
 *
 * 数据流/状态流：
 * 业务 prompt -> 共享协议封装 -> 第三方响应 -> 共享解析函数。
 *
 * 关键边界条件与坑点：
 * 1. 请求体若退回旧的 `input.prompt` 结构，会直接触发线上 400，因此测试必须锁定 `input.messages`。
 * 2. 不同接口版本返回 `results` 或 `choices` 时都要能提取图片，否则不同调用链会出现一边可用、一边失败。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDashScopeImageGenerationPayload,
  readDashScopeImageGenerationResult,
} from '../shared/dashScopeImageGenerationShared.js';

test('buildDashScopeImageGenerationPayload: 应使用 input.messages 协议', () => {
  const payload = buildDashScopeImageGenerationPayload('qwen-image-2.0', '生成角色头像', '512*512');

  assert.deepEqual(payload, {
    model: 'qwen-image-2.0',
    input: {
      messages: [{
        role: 'user',
        content: [{
          text: '生成角色头像',
        }],
      }],
    },
    parameters: {
      size: '512*512',
      n: 1,
      prompt_extend: true,
      watermark: false,
    },
  });
});

test('readDashScopeImageGenerationResult: 应兼容 output.results 结构', () => {
  const result = readDashScopeImageGenerationResult({
    output: {
      results: [{
        url: 'https://example.com/avatar.png',
        b64_image: '',
      }],
    },
  });

  assert.deepEqual(result, {
    url: 'https://example.com/avatar.png',
    b64: '',
  });
});

test('readDashScopeImageGenerationResult: 应兼容 output.choices.message.content 结构', () => {
  const result = readDashScopeImageGenerationResult({
    output: {
      choices: [{
        message: {
          content: [{
            image: 'https://example.com/icon.png',
          }],
        },
      }],
    },
  });

  assert.deepEqual(result, {
    url: 'https://example.com/icon.png',
    b64: '',
  });
});
