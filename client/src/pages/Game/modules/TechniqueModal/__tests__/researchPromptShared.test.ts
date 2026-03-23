import { describe, expect, it } from 'vitest';
import {
  buildTechniqueResearchBurningWordHelperText,
  buildTechniqueResearchBurningWordTagText,
  getTechniqueResearchBurningWordInputLength,
  normalizeTechniqueResearchBurningWordInput,
  resolveTechniqueResearchBurningWordRequestValue,
} from '../researchPromptShared';

describe('researchPromptShared', () => {
  it('normalizeTechniqueResearchBurningWordInput: 应只保留首个中文字符', () => {
    expect(normalizeTechniqueResearchBurningWordInput(' 焰火 ', 1)).toBe('焰');
    expect(normalizeTechniqueResearchBurningWordInput('a焰b', 1)).toBe('焰');
  });

  it('normalizeTechniqueResearchBurningWordInput: 非中文输入应被清空', () => {
    expect(normalizeTechniqueResearchBurningWordInput('abc', 1)).toBe('');
  });

  it('resolveTechniqueResearchBurningWordRequestValue: 留空应返回 undefined', () => {
    expect(resolveTechniqueResearchBurningWordRequestValue('')).toBeUndefined();
    expect(resolveTechniqueResearchBurningWordRequestValue('焰')).toBe('焰');
  });

  it('getTechniqueResearchBurningWordInputLength: 应按字符数统计', () => {
    expect(getTechniqueResearchBurningWordInputLength('焰')).toBe(1);
  });

  it('应输出统一的帮助文案与回显标签', () => {
    expect(buildTechniqueResearchBurningWordHelperText(1)).toContain('留空则随机');
    expect(buildTechniqueResearchBurningWordTagText('焰')).toBe('一字焚诀 焰');
  });
});
