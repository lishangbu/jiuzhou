import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireCharacter } from '../middleware/auth.js';
import {
  claimAchievement,
  claimAchievementPointsReward,
  getAchievementDetail,
  getAchievementList,
  getAchievementPointsRewards,
  type AchievementListStatusFilter,
} from '../services/achievementService.js';
import { notifyAchievementUpdate } from '../services/achievementPush.js';
import { safePushCharacterUpdate } from '../middleware/pushUpdate.js';
import { sendSuccess, sendResult } from '../middleware/response.js';
import { BusinessError } from '../middleware/BusinessError.js';
import { getSingleParam, getSingleQueryValue, parseNonEmptyText, parsePositiveInt } from '../services/shared/httpParam.js';

const router = Router();


router.get('/list', requireCharacter, asyncHandler(async (req, res) => {
  const characterId = req.characterId!;

  const category = parseNonEmptyText(getSingleQueryValue(req.query.category)) ?? undefined;
  const statusRaw = getSingleQueryValue(req.query.status);
  const status = statusRaw ? (statusRaw as AchievementListStatusFilter) : undefined;
  const page = parsePositiveInt(getSingleQueryValue(req.query.page)) ?? undefined;
  const limit = parsePositiveInt(getSingleQueryValue(req.query.limit)) ?? undefined;

  const data = await getAchievementList(characterId, { category, status, page, limit });
  return sendSuccess(res, data);
}));

router.get('/:achievementId', requireCharacter, asyncHandler(async (req, res) => {
  const characterId = req.characterId!;

  const achievementId = parseNonEmptyText(getSingleParam(req.params.achievementId));
  if (!achievementId) throw new BusinessError('成就ID无效');
  const achievement = await getAchievementDetail(characterId, achievementId);
  if (!achievement) throw new BusinessError('成就不存在', 404);

  return sendSuccess(res, { achievement, progress: achievement.progress });
}));

router.post('/claim', requireCharacter, asyncHandler(async (req, res) => {
  const userId = req.userId!;
  const characterId = req.characterId!;

  const body = req.body as { achievementId?: unknown; achievement_id?: unknown };
  const achievementId = parseNonEmptyText(
    typeof body?.achievementId === 'string'
      ? body.achievementId
      : typeof body?.achievement_id === 'string'
        ? body.achievement_id
        : undefined,
  );
  if (!achievementId) throw new BusinessError('成就ID无效');

  const result = await claimAchievement(userId, characterId, achievementId);
  if (!result.success) return sendResult(res, result);

  await safePushCharacterUpdate(userId);
  await notifyAchievementUpdate(characterId, userId);

  return sendResult(res, result);
}));

router.get('/points/rewards', requireCharacter, asyncHandler(async (req, res) => {
  const characterId = req.characterId!;

  const data = await getAchievementPointsRewards(characterId);
  return sendSuccess(res, data);
}));

router.post('/points/claim', requireCharacter, asyncHandler(async (req, res) => {
  const userId = req.userId!;
  const characterId = req.characterId!;

  const body = req.body as { threshold?: unknown; points_threshold?: unknown };
  const threshold =
    typeof body?.threshold === 'number'
      ? body.threshold
      : typeof body?.points_threshold === 'number'
        ? body.points_threshold
        : typeof body?.threshold === 'string'
          ? Number(body.threshold)
          : typeof body?.points_threshold === 'string'
            ? Number(body.points_threshold)
            : NaN;

  const result = await claimAchievementPointsReward(userId, characterId, threshold);
  if (!result.success) return sendResult(res, result);

  await safePushCharacterUpdate(userId);
  await notifyAchievementUpdate(characterId, userId);

  return sendResult(res, result);
}));

export default router;
