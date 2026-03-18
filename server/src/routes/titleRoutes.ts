import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireCharacter } from '../middleware/auth.js';
import { equipTitle, getTitleList } from '../services/achievementService.js';
import { notifyAchievementUpdate } from '../services/achievementPush.js';
import { safePushCharacterUpdate } from '../middleware/pushUpdate.js';
import { sendSuccess, sendResult } from '../middleware/response.js';

const router = Router();


router.get('/list', requireCharacter, asyncHandler(async (req, res) => {
  const userId = req.userId!;
  const characterId = req.characterId!;

  const data = await getTitleList(characterId);
  return sendSuccess(res, data);
}));

router.post('/equip', requireCharacter, asyncHandler(async (req, res) => {
  const userId = req.userId!;
  const characterId = req.characterId!;

  const body = req.body as { titleId?: unknown; title_id?: unknown };
  const titleId =
    typeof body?.titleId === 'string'
      ? body.titleId
      : typeof body?.title_id === 'string'
        ? body.title_id
        : '';

  const result = await equipTitle(characterId, titleId);
  if (!result.success) return sendResult(res, result);

  await safePushCharacterUpdate(userId);
  await notifyAchievementUpdate(characterId, userId);

  return sendResult(res, result);
}));

export default router;
