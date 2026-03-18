import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import { bountyService } from '../services/bountyService.js';
import type { BountyClaimPolicy } from '../services/bountyService.js';
import { safePushCharacterUpdate } from '../middleware/pushUpdate.js';
import { sendSuccess, sendResult } from '../middleware/response.js';
import { getSingleQueryValue, parseFiniteNumber, parseNonEmptyText, parsePositiveInt } from '../services/shared/httpParam.js';
import { notifyTaskOverviewUpdate } from '../services/taskOverviewPush.js';

const router = Router();


router.get('/board', requireCharacter, asyncHandler(async (req, res) => {
    const characterId = req.characterId!;

    const pool = parseNonEmptyText(getSingleQueryValue(req.query.pool)) ?? 'daily';
    const resolvedPool = pool === 'all' || pool === 'player' || pool === 'daily' ? pool : 'daily';
    const result = await bountyService.getBountyBoard(characterId, resolvedPool);
    if (!result.success) return sendResult(res, result);
    return sendSuccess(res, result.data);
}));

router.post('/claim', requireCharacter, asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const characterId = req.characterId!;

    const body = req.body as { bountyInstanceId?: unknown };
    const bountyInstanceId = parsePositiveInt(body?.bountyInstanceId);
    if (!bountyInstanceId) {
      return sendResult(res, { success: false, message: '悬赏不存在' });
    }
    const result = await bountyService.claimBounty(characterId, bountyInstanceId);
    if (!result.success) return sendResult(res, result);
    await safePushCharacterUpdate(userId);
    await notifyTaskOverviewUpdate(characterId, ['bounty']);
    return sendResult(res, result);
}));

router.post('/publish', requireCharacter, asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const characterId = req.characterId!;

    const body = req.body as {
      taskId?: unknown;
      title?: unknown;
      description?: unknown;
      claimPolicy?: unknown;
      maxClaims?: unknown;
      expiresAt?: unknown;
      spiritStonesReward?: unknown;
      silverReward?: unknown;
      requiredItems?: unknown;
    };
    const taskId = parseNonEmptyText(typeof body?.taskId === 'string' ? body.taskId : undefined) ?? undefined;
    const title = parseNonEmptyText(typeof body?.title === 'string' ? body.title : undefined) ?? '';
    const description = parseNonEmptyText(typeof body?.description === 'string' ? body.description : undefined) ?? undefined;
    const claimPolicyRaw = parseNonEmptyText(typeof body?.claimPolicy === 'string' ? body.claimPolicy : undefined);
    const claimPolicy: BountyClaimPolicy | undefined =
      claimPolicyRaw === 'unique' || claimPolicyRaw === 'limited' || claimPolicyRaw === 'unlimited'
        ? claimPolicyRaw
        : undefined;
    const maxClaims = parseFiniteNumber(body?.maxClaims);
    const expiresAt = parseNonEmptyText(typeof body?.expiresAt === 'string' ? body.expiresAt : undefined) ?? undefined;
    const spiritStonesReward = parseFiniteNumber(body?.spiritStonesReward);
    const silverReward = parseFiniteNumber(body?.silverReward);
    const requiredItems = Array.isArray(body?.requiredItems) ? body.requiredItems : undefined;

    const result = await bountyService.publishBounty(characterId, {
      taskId,
      title,
      description,
      claimPolicy,
      maxClaims,
      expiresAt,
      spiritStonesReward,
      silverReward,
      requiredItems,
    });
    if (!result.success) return sendResult(res, result);
    return sendResult(res, result);
}));

router.get('/items/search', requireAuth, asyncHandler(async (req, res) => {
    const keyword = parseNonEmptyText(getSingleQueryValue(req.query.keyword)) ?? '';
    const limit = parsePositiveInt(getSingleQueryValue(req.query.limit)) ?? 20;
    const result = await bountyService.searchItemDefsForBounty(keyword, limit);
    if (!result.success) return sendResult(res, result);
    return sendSuccess(res, result.data);
}));

router.post('/submit-materials', requireCharacter, asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const characterId = req.characterId!;

    const body = req.body as { taskId?: unknown };
    const taskId = parseNonEmptyText(typeof body?.taskId === 'string' ? body.taskId : undefined) ?? '';
    const result = await bountyService.submitBountyMaterials(characterId, taskId);
    if (!result.success) return sendResult(res, result);
    await safePushCharacterUpdate(userId);
    await notifyTaskOverviewUpdate(characterId, ['bounty']);
    return sendResult(res, result);
}));

export default router;
