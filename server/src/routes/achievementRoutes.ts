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

const router = Router();


router.get('/list', requireCharacter, asyncHandler(async (req, res) => {
  const userId = req.userId!;
  const characterId = req.characterId!;

  const category = typeof req.query.category === 'string' ? req.query.category : undefined;
  const status = typeof req.query.status === 'string' ? (req.query.status as AchievementListStatusFilter) : undefined;
  const page = typeof req.query.page === 'string' ? Number(req.query.page) : undefined;
  const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;

  const data = await getAchievementList(characterId, { category, status, page, limit });
  return sendSuccess(res, data);
}));

router.get('/:achievementId', requireCharacter, asyncHandler(async (req, res) => {
  const userId = req.userId!;
  const characterId = req.characterId!;

  const achievementId = typeof req.params.achievementId === 'string' ? req.params.achievementId : '';
  const achievement = await getAchievementDetail(characterId, achievementId);
  if (!achievement) throw new BusinessError('成就不存在', 404);

  return sendSuccess(res, { achievement, progress: achievement.progress });
}));

router.post('/claim', requireCharacter, asyncHandler(async (req, res) => {
  const userId = req.userId!;
  const characterId = req.characterId!;

  const body = req.body as { achievementId?: unknown; achievement_id?: unknown };
  const achievementId =
    typeof body?.achievementId === 'string'
      ? body.achievementId
      : typeof body?.achievement_id === 'string'
        ? body.achievement_id
        : '';

  const result = await claimAchievement(userId, characterId, achievementId);
  if (!result.success) return sendResult(res, result);

  await safePushCharacterUpdate(userId);
  await notifyAchievementUpdate(characterId, userId);

  return sendResult(res, result);
}));

router.get('/points/rewards', requireCharacter, asyncHandler(async (req, res) => {
  const userId = req.userId!;
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
