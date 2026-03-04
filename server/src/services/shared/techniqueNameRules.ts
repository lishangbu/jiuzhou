import { getTechniqueNameSensitiveWords } from '../techniqueNameSensitiveWords.js';

const TECHNIQUE_NAME_ALLOWED_PATTERN = /^[\u4e00-\u9fa5A-Za-z0-9·\-_ ]+$/;
const TECHNIQUE_NAME_MIN_LENGTH = 2;
const TECHNIQUE_NAME_MAX_LENGTH = 14;

export type TechniqueNameValidationErrorCode = 'NAME_INVALID' | 'NAME_SENSITIVE';

export type TechniqueNameValidationResult =
  | { success: true; normalizedName: string; displayName: string }
  | { success: false; code: TechniqueNameValidationErrorCode; message: string };

export type TechniqueNameRulesView = {
  minLength: number;
  maxLength: number;
  patternHint: string;
  immutableAfterPublish: boolean;
};

export const getTechniqueNameRulesView = (): TechniqueNameRulesView => {
  return {
    minLength: TECHNIQUE_NAME_MIN_LENGTH,
    maxLength: TECHNIQUE_NAME_MAX_LENGTH,
    patternHint: '仅支持中文、英文、数字、空格、·、-、_',
    immutableAfterPublish: true,
  };
};

const toHalfWidthSpace = (value: string): string => {
  return value.replace(/\u3000/g, ' ');
};

const collapseSpaces = (value: string): string => {
  return value.replace(/\s+/g, ' ').trim();
};

export const normalizeTechniqueName = (rawName: string): string => {
  const withHalfWidthSpace = toHalfWidthSpace(String(rawName || ''));
  return collapseSpaces(withHalfWidthSpace).toLowerCase();
};

const normalizeDisplayName = (rawName: string): string => {
  const withHalfWidthSpace = toHalfWidthSpace(String(rawName || ''));
  return collapseSpaces(withHalfWidthSpace);
};

const containsSensitiveWord = (normalizedLowerName: string): boolean => {
  const words = getTechniqueNameSensitiveWords();
  if (words.size === 0) return false;
  for (const word of words.values()) {
    if (!word) continue;
    if (normalizedLowerName.includes(word)) return true;
  }
  return false;
};

export const validateTechniqueCustomName = (rawName: string): TechniqueNameValidationResult => {
  const displayName = normalizeDisplayName(rawName);
  if (!displayName) {
    return { success: false, code: 'NAME_INVALID', message: '名称不能为空' };
  }

  const charLength = Array.from(displayName).length;
  if (charLength < TECHNIQUE_NAME_MIN_LENGTH || charLength > TECHNIQUE_NAME_MAX_LENGTH) {
    return {
      success: false,
      code: 'NAME_INVALID',
      message: `名称长度需在${TECHNIQUE_NAME_MIN_LENGTH}~${TECHNIQUE_NAME_MAX_LENGTH}之间`,
    };
  }

  if (!TECHNIQUE_NAME_ALLOWED_PATTERN.test(displayName)) {
    return {
      success: false,
      code: 'NAME_INVALID',
      message: '名称包含非法字符，仅支持中文、英文、数字、空格、·、-、_',
    };
  }

  const normalizedName = normalizeTechniqueName(displayName);
  if (containsSensitiveWord(normalizedName)) {
    return { success: false, code: 'NAME_SENSITIVE', message: '名称包含敏感词，请重填' };
  }

  return { success: true, normalizedName, displayName };
};
