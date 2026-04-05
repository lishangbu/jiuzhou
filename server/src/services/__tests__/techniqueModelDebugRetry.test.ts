/**
 * 功法联调共享生成重试测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定联调共享链路在模型返回非法 candidate 时，会把失败原因并入下一轮 retry guidance，而不是首轮失败后直接终止。
 * 2. 做什么：确保平衡复评修正规则与生成失败原因共用同一条重试入口，避免再次分叉出第二套 prompt 协议。
 * 3. 不做什么：不请求真实模型、不执行脚本，也不覆盖正式任务链路的重试实现。
 *
 * 输入 / 输出：
 * - 输入：底模 promptContext、平衡复评修正规则、上一轮失败原因。
 * - 输出：下一轮生成应携带的统一 promptContext。
 *
 * 数据流 / 状态流：
 * 调试共享链路失败原因 + 复评 guidance
 * -> buildTechniqueModelDebugGenerationPromptContext
 * -> 下一轮主模型生成请求。
 *
 * 关键边界条件与坑点：
 * 1. 失败原因必须进入 `previousFailureReason`，否则模型不知道自己为什么被重试。
 * 2. 复评 guidance 不能在生成失败时丢失，否则二次平衡调整会退化回普通重试。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTechniqueModelDebugGenerationPromptContext,
} from '../../scripts/shared/techniqueModelDebug.js';

test('buildTechniqueModelDebugGenerationPromptContext: 生成失败时应合并复评规则与失败原因', () => {
  const promptContext = buildTechniqueModelDebugGenerationPromptContext({
    basePromptContext: {
      techniqueBaseModel: '光环异变百分百',
      techniqueBaseModelScopeRules: ['底模不能突破数值预算'],
    },
    review: {
      needsAdjustment: true,
      reason: '双光环过于全能',
      riskTags: ['too_all_round'],
      adjustmentGuidance: ['下调友方光环增伤', '下调敌方压制幅度'],
    },
    previousFailureReason: 'AI结果层级被动为空',
  });
  const retryGuidance = (
    promptContext as {
      techniqueRetryGuidance?: {
        previousFailureReason?: string;
        correctionRules?: string[];
      };
    } | undefined
  )?.techniqueRetryGuidance;

  assert.equal(
    retryGuidance?.previousFailureReason,
    'AI结果层级被动为空',
  );
  assert.deepEqual(
    retryGuidance?.correctionRules,
    ['下调友方光环增伤', '下调敌方压制幅度', '必须先修正本轮失败原因：AI结果层级被动为空'],
  );
});
