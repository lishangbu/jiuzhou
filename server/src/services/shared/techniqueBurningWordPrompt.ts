/**
 * 洞府研修一字焚诀共享模块
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中处理洞府研修“一字焚诀”提示词的规范化、格式校验、敏感词校验与 prompt 语境构造。
 * 2. 做什么：为路由、研修 service、后续脚本复用同一套文本规则，避免“最多 1 个字、只能中文、空白视为未填写”散落多处。
 * 3. 不做什么：不直接读取 HTTP 参数、不负责数据库落库，也不直接发起模型请求。
 *
 * 输入/输出：
 * - 输入：玩家提交的一字焚诀原始文本。
 * - 输出：规范化后的提示词、校验结果，以及可直接注入功法生成核心的 prompt extraContext。
 *
 * 数据流/状态流：
 * 原始输入 -> 本模块规范化/校验/敏感词检测 -> 研修任务创建与功法 prompt extraContext 共同消费。
 *
 * 关键边界条件与坑点：
 * 1. 空白输入必须统一回到“未填写”的语义，不能让前端留空和服务端未传参变成两种状态。
 * 2. 一字焚诀会直接进入模型提示词，因此格式校验之后仍必须经过敏感词检测，不能把违规字符带进任务记录和 prompt。
 */
import { guardSensitiveText } from '../sensitiveWordService.js';

const TECHNIQUE_BURNING_WORD_PROMPT_PATTERN = /^[\p{Script=Han}]+$/u;

export const TECHNIQUE_BURNING_WORD_PROMPT_MAX_LENGTH = 1;
export const TECHNIQUE_BURNING_WORD_PROMPT_SENSITIVE_MESSAGE = '一字焚诀包含敏感内容，请重新输入';
export const TECHNIQUE_BURNING_WORD_PROMPT_SENSITIVE_UNAVAILABLE_MESSAGE = '敏感词检测服务暂不可用，请稍后重试';

export type TechniqueBurningWordPromptValidationCode =
  | 'TECHNIQUE_BURNING_WORD_PROMPT_INVALID'
  | 'TECHNIQUE_BURNING_WORD_PROMPT_SENSITIVE'
  | 'TECHNIQUE_BURNING_WORD_PROMPT_SENSITIVE_SERVICE_UNAVAILABLE';

export type TechniqueBurningWordPromptValidationResult =
  | { success: true; value: string | null }
  | { success: false; message: string; code: TechniqueBurningWordPromptValidationCode };

export type TechniqueBurningWordPromptContext = {
  techniqueBurningWordPrompt: string;
};

const getTechniqueBurningWordPromptLength = (value: string): number => {
  return Array.from(value).length;
};

export const normalizeTechniqueBurningWordPrompt = (
  raw: string | null | undefined,
): string | null => {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  return value ? value : null;
};

export const validateTechniqueBurningWordPrompt = (
  raw: string | null | undefined,
): TechniqueBurningWordPromptValidationResult => {
  const value = normalizeTechniqueBurningWordPrompt(raw);
  if (!value) {
    return {
      success: true,
      value: null,
    };
  }

  if (getTechniqueBurningWordPromptLength(value) > TECHNIQUE_BURNING_WORD_PROMPT_MAX_LENGTH) {
    return {
      success: false,
      message: `一字焚诀最多 ${TECHNIQUE_BURNING_WORD_PROMPT_MAX_LENGTH} 个中文字符`,
      code: 'TECHNIQUE_BURNING_WORD_PROMPT_INVALID',
    };
  }

  if (!TECHNIQUE_BURNING_WORD_PROMPT_PATTERN.test(value)) {
    return {
      success: false,
      message: '一字焚诀只能包含中文字符',
      code: 'TECHNIQUE_BURNING_WORD_PROMPT_INVALID',
    };
  }

  return {
    success: true,
    value,
  };
};

export const guardTechniqueBurningWordPrompt = async (
  raw: string | null | undefined,
): Promise<TechniqueBurningWordPromptValidationResult> => {
  const validation = validateTechniqueBurningWordPrompt(raw);
  if (!validation.success || !validation.value) {
    return validation;
  }

  const sensitiveGuard = await guardSensitiveText(
    validation.value,
    TECHNIQUE_BURNING_WORD_PROMPT_SENSITIVE_MESSAGE,
    TECHNIQUE_BURNING_WORD_PROMPT_SENSITIVE_UNAVAILABLE_MESSAGE,
  );
  if (!sensitiveGuard.success) {
    return {
      success: false,
      message: sensitiveGuard.message,
      code: sensitiveGuard.code === 'CONTENT_SENSITIVE'
        ? 'TECHNIQUE_BURNING_WORD_PROMPT_SENSITIVE'
        : 'TECHNIQUE_BURNING_WORD_PROMPT_SENSITIVE_SERVICE_UNAVAILABLE',
    };
  }

  return validation;
};

export const buildTechniqueBurningWordPromptContext = (
  burningWordPrompt: string | null | undefined,
): TechniqueBurningWordPromptContext | undefined => {
  const value = normalizeTechniqueBurningWordPrompt(burningWordPrompt);
  if (!value) return undefined;
  return {
    techniqueBurningWordPrompt: value,
  };
};
