/**
 * 功法数值平衡复评共享模块
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中封装功法候选的第二模型复评 prompt、结构化返回 schema、结果校验与模型调用。
 * 2. 做什么：让联调脚本、批量检查脚本后续都能复用同一套“复评后再调整”的协议，避免各自内联 risk tag 与修正规则字段。
 * 3. 不做什么：不直接改写 candidate，不自己做数值兜底，也不负责技能图标生成或数据库落盘。
 *
 * 输入 / 输出：
 * - 输入：功法 candidate、请求品质、请求类型、最大层数、可选底模。
 * - 输出：结构化复评结果 `{ needsAdjustment, reason, riskTags, adjustmentGuidance }` 与复评模型信息。
 *
 * 数据流 / 状态流：
 * 已通过基础校验的 candidate
 * -> 本模块构造结构化复评请求
 * -> 第二模型判断是否失衡
 * -> 输出修正规则
 * -> 调用方决定是否再次请求主生成模型。
 *
 * 复用设计说明：
 * - 复评协议是高频变化点，集中在这里后，脚本层只做编排，不需要重复维护“哪些风险标签可用、哪些字段必填”。
 * - 该模块与功法生成主链解耦，只负责“判断与给出修正方向”，后续若正式任务链也接入复评，可以直接复用。
 *
 * 关键边界条件与坑点：
 * 1. 复评失败时必须直接报错，不能静默跳过；否则会回到“看起来加了步骤，实际上没生效”的假接入。
 * 2. `needsAdjustment=true` 时必须要求模型返回至少一条修正规则；否则调用方拿不到可执行指令，二次生成会退化成盲重试。
 */
import { callConfiguredTextModel } from '../ai/openAITextClient.js';
import type {
  TechniqueGenerationCandidate,
  TechniqueQuality,
} from '../techniqueGenerationService.js';
import type { GeneratedTechniqueType } from './techniqueGenerationConstraints.js';
import {
  buildTechniqueTextModelJsonSchemaResponseFormat,
  parseTechniqueTextModelJsonObject,
  type TechniqueModelJsonObject,
  type TechniqueTextModelJsonSchemaProperties,
  type TechniqueTextModelResponseFormat,
} from './techniqueTextModelShared.js';

export const TECHNIQUE_BALANCE_REVIEW_RISK_TAGS = [
  'damage_over_budget',
  'survival_over_budget',
  'control_over_budget',
  'resource_over_budget',
  'too_all_round',
  'too_weak',
] as const;

export type TechniqueBalanceReviewRiskTag =
  (typeof TECHNIQUE_BALANCE_REVIEW_RISK_TAGS)[number];

export type TechniqueBalanceReviewResult = {
  needsAdjustment: boolean;
  reason: string;
  riskTags: TechniqueBalanceReviewRiskTag[];
  adjustmentGuidance: string[];
};

export type TechniqueBalanceReviewResponse = {
  modelName: string;
  promptSnapshot: string;
  review: TechniqueBalanceReviewResult;
};

const TECHNIQUE_BALANCE_REVIEW_TIMEOUT_MS = 45_000;

const TECHNIQUE_BALANCE_REVIEW_SYSTEM_MESSAGE = [
  '你是《九州修仙录》的功法数值平衡复评器。',
  '你只负责判断当前功法候选是否存在强度失衡、过于全能、控制/生存/资源越界或明显偏弱的问题。',
  '你不能直接改写 candidate，只能输出是否需要调整以及精确修正规则。',
  '你必须返回严格 JSON，不得输出 markdown、解释、额外文本。',
].join('\n');

const normalizeText = (value: string | null | undefined): string => {
  return typeof value === 'string' ? value.trim() : '';
};

const isTechniqueBalanceReviewRiskTag = (
  value: string,
): value is TechniqueBalanceReviewRiskTag => {
  return TECHNIQUE_BALANCE_REVIEW_RISK_TAGS.includes(
    value as TechniqueBalanceReviewRiskTag,
  );
};

const buildTechniqueBalanceReviewResponseFormat = (): TechniqueTextModelResponseFormat => {
  const properties: TechniqueTextModelJsonSchemaProperties = {
    needsAdjustment: {
      type: 'boolean',
    },
    reason: {
      type: 'string',
      minLength: 1,
      maxLength: 60,
    },
    riskTags: {
      type: 'array',
      minItems: 0,
      maxItems: TECHNIQUE_BALANCE_REVIEW_RISK_TAGS.length,
      items: {
        type: 'string',
        enum: [...TECHNIQUE_BALANCE_REVIEW_RISK_TAGS],
      },
    },
    adjustmentGuidance: {
      type: 'array',
      minItems: 0,
      maxItems: 6,
      items: {
        type: 'string',
        minLength: 1,
        maxLength: 80,
      },
    },
  };

  return buildTechniqueTextModelJsonSchemaResponseFormat({
    name: 'technique_balance_review',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['needsAdjustment', 'reason', 'riskTags', 'adjustmentGuidance'],
      properties,
    },
  });
};

export const buildTechniqueBalanceReviewRequest = (params: {
  candidate: TechniqueGenerationCandidate;
  quality: TechniqueQuality;
  techniqueType: GeneratedTechniqueType;
  maxLayer: number;
  baseModel: string | null;
}): {
  responseFormat: TechniqueTextModelResponseFormat;
  systemMessage: string;
  userMessage: string;
  timeoutMs: number;
} => {
  return {
    responseFormat: buildTechniqueBalanceReviewResponseFormat(),
    systemMessage: TECHNIQUE_BALANCE_REVIEW_SYSTEM_MESSAGE,
    userMessage: JSON.stringify({
      worldview: '中国仙侠世界《九州修仙录》',
      task: 'review_technique_balance',
      requestedQuality: params.quality,
      requestedTechniqueType: params.techniqueType,
      requestedMaxLayer: params.maxLayer,
      baseModel: params.baseModel,
      allowedRiskTags: [...TECHNIQUE_BALANCE_REVIEW_RISK_TAGS],
      reviewFocus: [
        '是否存在明显超预算的伤害倍率、多段伤害、控制时长、回复或护盾',
        '是否同时兼顾输出、生存、控制、资源循环而导致过于全能',
        '被动、层级成长与技能 upgrades 是否叠加出失衡峰值',
        '若偏弱，是否缺少支撑该品质的核心强度或机制闭环',
      ],
      constraints: [
        '必须返回严格 JSON 对象，禁止额外解释文本',
        'reason 必须是简短中文结论，不能复述整份 candidate',
        'riskTags 只能从 allowedRiskTags 中选择，且不得重复',
        'adjustmentGuidance 只写可直接执行的修正规则，不要输出模糊建议',
        '若 needsAdjustment=false，则 adjustmentGuidance 必须为空数组',
        '若 needsAdjustment=true，则 adjustmentGuidance 至少包含 1 条规则，优先指出最影响平衡的问题',
        '修正规则必须聚焦数值平衡与机制收束，不能要求新增 JSON 字段或改协议结构',
      ],
      candidate: params.candidate,
    }),
    timeoutMs: TECHNIQUE_BALANCE_REVIEW_TIMEOUT_MS,
  };
};

export const validateTechniqueBalanceReviewResult = (
  raw: TechniqueModelJsonObject | null | undefined,
): TechniqueBalanceReviewResult | null => {
  if (!raw) return null;

  const needsAdjustment = raw.needsAdjustment;
  const reason = normalizeText(typeof raw.reason === 'string' ? raw.reason : null);
  const riskTagsRaw = Array.isArray(raw.riskTags) ? raw.riskTags : null;
  const guidanceRaw = Array.isArray(raw.adjustmentGuidance)
    ? raw.adjustmentGuidance
    : null;
  if (
    typeof needsAdjustment !== 'boolean' ||
    reason.length <= 0 ||
    !riskTagsRaw ||
    !guidanceRaw
  ) {
    return null;
  }

  const riskTags: TechniqueBalanceReviewRiskTag[] = [];
  for (const entry of riskTagsRaw) {
    if (typeof entry !== 'string') {
      return null;
    }
    const tag = normalizeText(entry);
    if (!isTechniqueBalanceReviewRiskTag(tag)) {
      return null;
    }
    if (!riskTags.includes(tag)) {
      riskTags.push(tag);
    }
  }

  const adjustmentGuidance = guidanceRaw.flatMap((entry) => {
    if (typeof entry !== 'string') {
      return [];
    }
    const normalized = normalizeText(entry);
    return normalized ? [normalized] : [];
  });
  if (needsAdjustment && adjustmentGuidance.length <= 0) {
    return null;
  }
  if (!needsAdjustment && adjustmentGuidance.length > 0) {
    return null;
  }

  return {
    needsAdjustment,
    reason,
    riskTags,
    adjustmentGuidance,
  };
};

export const reviewTechniqueBalanceCandidate = async (params: {
  candidate: TechniqueGenerationCandidate;
  quality: TechniqueQuality;
  techniqueType: GeneratedTechniqueType;
  maxLayer: number;
  baseModel: string | null;
}): Promise<TechniqueBalanceReviewResponse> => {
  const request = buildTechniqueBalanceReviewRequest(params);
  const external = await callConfiguredTextModel({
    modelScope: 'partner',
    responseFormat: request.responseFormat,
    systemMessage: request.systemMessage,
    userMessage: request.userMessage,
    temperature: 0,
    timeoutMs: request.timeoutMs,
  });
  if (!external) {
    throw new Error('缺少功法平衡复评模型配置，请检查 AI_PARTNER_MODEL_PROVIDER/URL/KEY/NAME');
  }

  const parsed = parseTechniqueTextModelJsonObject(external.content, {
    preferredTopLevelKeys: ['needsAdjustment', 'reason', 'riskTags', 'adjustmentGuidance'],
  });
  if (!parsed.success) {
    if (parsed.reason === 'empty_content') {
      throw new Error('功法平衡复评模型返回内容为空');
    }
    throw new Error('功法平衡复评模型返回不是合法 JSON 对象');
  }

  const review = validateTechniqueBalanceReviewResult(parsed.data);
  if (!review) {
    throw new Error('功法平衡复评模型返回结构非法');
  }

  return {
    modelName: external.modelName,
    promptSnapshot: external.promptSnapshot,
    review,
  };
};
