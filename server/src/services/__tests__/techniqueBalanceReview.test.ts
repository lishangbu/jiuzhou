/**
 * 功法平衡复评共享模块测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定功法平衡复评请求骨架、结构化返回校验，以及联调链路在技能图标生成前先做复评的顺序。
 * 2. 做什么：确保“第二模型只给修正规则，不直接改 candidate”的协议固定在共享层，避免脚本层再次拼 review JSON。
 * 3. 不做什么：不请求真实模型、不执行脚本，也不覆盖功法主生成链路的数值合法性校验。
 *
 * 输入 / 输出：
 * - 输入：功法 candidate、复评模型原始结果、联调共享模块源码文本。
 * - 输出：结构化复评请求、复评结果是否合法、复评与技能图标的调用顺序断言。
 *
 * 数据流 / 状态流：
 * candidate -> buildTechniqueBalanceReviewRequest -> 复评模型；
 * 模型 JSON -> validateTechniqueBalanceReviewResult；
 * 源码文本 -> 断言复评发生在技能图标生成前。
 *
 * 复用设计说明：
 * - 通过共享测试锁住复评协议字段，后续无论脚本入口如何扩展，都只能继续复用这一套单一出口。
 * - 把“先复评再生图”的性能约束写成测试，避免未来重构把高成本图片生成放回无效候选之前。
 *
 * 关键边界条件与坑点：
 * 1. `needsAdjustment=true` 时必须要求至少一条修正规则，否则二次生成没有可执行输入。
 * 2. 顺序断言必须锁到源码级别，否则有人把复评放到技能图标后面时，编译不会报错但会平白增加一次生图开销。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { TechniqueGenerationCandidate } from '../techniqueGenerationService.js';
import {
  buildTechniqueBalanceReviewRequest,
  validateTechniqueBalanceReviewResult,
} from '../shared/techniqueBalanceReview.js';

const buildCandidate = (): TechniqueGenerationCandidate => ({
  technique: {
    name: '玄霜引雷诀',
    type: '法诀',
    quality: '地',
    maxLayer: 7,
    requiredRealm: '凡人',
    attributeType: 'magic',
    attributeElement: 'shui',
    tags: ['雷霜', '爆发'],
    description: '以寒雷凝符，先束后爆。',
    longDesc: '霜意封脉，雷意灌窍，连段时威势骤增。',
  },
  skills: [{
    id: 'skill-1',
    name: '霜引雷坠',
    description: '先施霜锁，再降雷坠。',
    icon: null,
    sourceType: 'technique',
    costLingqi: 20,
    costLingqiRate: 0,
    costQixue: 0,
    costQixueRate: 0,
    cooldown: 2,
    targetType: 'single_enemy',
    targetCount: 1,
    damageType: 'magic',
    element: 'shui',
    triggerType: 'active',
    aiPriority: 60,
    effects: [{
      type: 'damage',
      valueType: 'scale',
      scaleAttr: 'fagong',
      scaleRate: 1.8,
      damageType: 'magic',
      hit_count: 2,
    }],
    upgrades: [],
  }],
  layers: Array.from({ length: 7 }, (_, index) => ({
    layer: index + 1,
    costSpiritStones: (index + 1) * 100,
    costExp: (index + 1) * 50,
    costMaterials: [],
    passives: [{ key: 'fagong', value: 10 + index }],
    unlockSkillIds: index === 0 ? ['skill-1'] : [],
    upgradeSkillIds: [],
    layerDesc: `第${index + 1}层`,
  })),
});

test('buildTechniqueBalanceReviewRequest: 应构造结构化功法复评请求', () => {
  const request = buildTechniqueBalanceReviewRequest({
    candidate: buildCandidate(),
    quality: '地',
    techniqueType: '法诀',
    maxLayer: 7,
    baseModel: '雷霜术修',
  });
  const prompt = JSON.parse(request.userMessage) as {
    task?: string;
    requestedQuality?: string;
    requestedTechniqueType?: string;
    requestedMaxLayer?: number;
    baseModel?: string | null;
    reviewFocus?: string[];
    constraints?: string[];
    candidate?: { technique?: { name?: string } };
  };

  assert.equal(prompt.task, 'review_technique_balance');
  assert.equal(prompt.requestedQuality, '地');
  assert.equal(prompt.requestedTechniqueType, '法诀');
  assert.equal(prompt.requestedMaxLayer, 7);
  assert.equal(prompt.baseModel, '雷霜术修');
  assert.equal(prompt.candidate?.technique?.name, '玄霜引雷诀');
  assert.equal(
    prompt.reviewFocus?.includes('是否存在明显超预算的伤害倍率、多段伤害、控制时长、回复或护盾'),
    true,
  );
  assert.equal(
    prompt.constraints?.includes('若 needsAdjustment=true，则 adjustmentGuidance 至少包含 1 条规则，优先指出最影响平衡的问题'),
    true,
  );
});

test('validateTechniqueBalanceReviewResult: 需要调整时应保留风险标签与修正规则', () => {
  assert.deepEqual(
    validateTechniqueBalanceReviewResult({
      needsAdjustment: true,
      reason: '爆发与资源循环同时过高',
      riskTags: ['damage_over_budget', 'too_all_round'],
      adjustmentGuidance: ['下调主伤技能总倍率，避免高段数叠满后超预算', '移除额外回灵效果，保留单一输出主轴'],
    }),
    {
      needsAdjustment: true,
      reason: '爆发与资源循环同时过高',
      riskTags: ['damage_over_budget', 'too_all_round'],
      adjustmentGuidance: ['下调主伤技能总倍率，避免高段数叠满后超预算', '移除额外回灵效果，保留单一输出主轴'],
    },
  );
});

test('validateTechniqueBalanceReviewResult: 不需要调整时不得夹带修正规则', () => {
  assert.equal(
    validateTechniqueBalanceReviewResult({
      needsAdjustment: false,
      reason: '强度分布基本合理',
      riskTags: [],
      adjustmentGuidance: ['不应存在'],
    }),
    null,
  );
});

test('validateTechniqueBalanceReviewResult: 需要调整时缺少修正规则应拒绝', () => {
  assert.equal(
    validateTechniqueBalanceReviewResult({
      needsAdjustment: true,
      reason: '控制过强',
      riskTags: ['control_over_budget'],
      adjustmentGuidance: [],
    }),
    null,
  );
});

test('techniqueModelDebug: 应先执行平衡复评，再决定是否生成技能图标', () => {
  const source = readFileSync(
    new URL('../../scripts/shared/techniqueModelDebug.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /reviewTechniqueBalanceCandidate\(/u);
  assert.match(
    source,
    /reviewTechniqueBalanceCandidate\([\s\S]*attachGeneratedSkillIcons\(/u,
  );
});

test('test-technique-model: 应输出阶段化联调日志', () => {
  const source = readFileSync(
    new URL('../../../scripts/test-technique-model.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /=== 参数解析 ===/u);
  assert.match(source, /=== 生成阶段 ===/u);
  assert.match(source, /=== 复评阶段 ===/u);
  assert.match(source, /=== 最终结果 ===/u);
});
