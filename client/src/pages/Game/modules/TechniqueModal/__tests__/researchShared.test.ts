import { describe, expect, it } from 'vitest';
import type { TechniqueResearchStatusData } from '../researchShared';
import { resolveTechniqueResearchActionState } from '../researchShared';

const buildStatus = (
  overrides: Partial<TechniqueResearchStatusData> = {},
): TechniqueResearchStatusData => ({
  pointsBalance: 20,
  weeklyLimit: 199,
  weeklyUsed: 1,
  weeklyRemaining: 198,
  generationCostByQuality: {
    黄: 10,
    玄: 20,
    地: 30,
    天: 40,
  },
  currentDraft: null,
  draftExpireAt: null,
  nameRules: {
    minLength: 2,
    maxLength: 12,
    fixedPrefix: '',
    patternHint: '',
    immutableAfterPublish: true,
  },
  currentJob: null,
  hasUnreadResult: false,
  resultStatus: null,
  ...overrides,
});

describe('researchShared', () => {
  it('resolveTechniqueResearchActionState: pending 任务应暴露放弃入口并禁用开始领悟', () => {
    const actionState = resolveTechniqueResearchActionState(buildStatus({
      currentJob: {
        generationId: 'gen-1',
        status: 'pending',
        quality: '玄',
        draftTechniqueId: null,
        startedAt: '2026-03-08T10:00:00.000Z',
        finishedAt: null,
        draftExpireAt: null,
        preview: null,
        errorMessage: null,
      },
    }));

    expect(actionState.canGenerate).toBe(false);
    expect(actionState.pendingGenerationId).toBe('gen-1');
  });

  it('resolveTechniqueResearchActionState: 无 pending 且资源充足时应允许开始领悟', () => {
    const actionState = resolveTechniqueResearchActionState(buildStatus());

    expect(actionState.canGenerate).toBe(true);
    expect(actionState.pendingGenerationId).toBeNull();
  });
});
