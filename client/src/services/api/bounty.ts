import type { AxiosRequestConfig } from 'axios';
import api from './core';

type RequestConfig = AxiosRequestConfig;

export type BountyClaimPolicyDto = 'unique' | 'limited' | 'unlimited';
export type BountySourceTypeDto = 'daily' | 'player';

export type BountyBoardRowDto = {
  id: number;
  sourceType: BountySourceTypeDto;
  taskId: string;
  title: string;
  description: string;
  claimPolicy: BountyClaimPolicyDto;
  maxClaims: number;
  claimedCount: number;
  refreshDate: string | null;
  expiresAt: string | null;
  publishedByCharacterId: number | null;
  spiritStonesReward: number;
  silverReward: number;
  spiritStonesFee: number;
  silverFee: number;
  requiredItems: Array<{ itemDefId: string; name: string; qty: number }>;
  claimedByMe: boolean;
  myClaimStatus: string | null;
  myTaskStatus: string | null;
};

export interface BountyBoardResponse {
  success: boolean;
  message?: string;
  data?: { bounties: BountyBoardRowDto[]; today: string };
}

export const getBountyBoard = (
  pool: 'daily' | 'player' | 'all' = 'daily',
  requestConfig?: RequestConfig,
): Promise<BountyBoardResponse> => {
  return api.get('/bounty/board', {
    ...requestConfig,
    params: { ...(requestConfig?.params ?? {}), pool },
  });
};

export const claimBounty = (
  bountyInstanceId: number
): Promise<{ success: boolean; message?: string; data?: { bountyInstanceId: number; taskId: string } }> => {
  return api.post('/bounty/claim', { bountyInstanceId });
};

export const publishBounty = (body: {
  taskId?: string;
  title: string;
  description?: string;
  claimPolicy: BountyClaimPolicyDto;
  maxClaims?: number;
  expiresAt?: string;
  spiritStonesReward: number;
  silverReward: number;
  requiredItems: Array<{ itemDefId: string; qty: number }>;
}): Promise<{ success: boolean; message?: string; data?: { bountyInstanceId: number } }> => {
  return api.post('/bounty/publish', body);
};

export type BountyItemDefSearchRowDto = { id: string; name: string; icon: string | null; category: string | null };

export const searchBountyItemDefs = (
  keyword: string,
  limit: number = 20,
  requestConfig?: RequestConfig,
): Promise<{ success: boolean; message?: string; data?: { items: BountyItemDefSearchRowDto[] } }> => {
  return api.get('/bounty/items/search', {
    ...requestConfig,
    params: { ...(requestConfig?.params ?? {}), keyword, limit },
  });
};

export const submitBountyMaterials = (
  taskId: string
): Promise<{ success: boolean; message?: string; data?: { taskId: string } }> => {
  return api.post('/bounty/submit-materials', { taskId });
};
