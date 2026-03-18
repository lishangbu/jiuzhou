import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { battlePassService } from '../services/battlePassService.js';
import { safePushCharacterUpdate } from '../middleware/pushUpdate.js';
import { sendSuccess, sendResult } from '../middleware/response.js';
import { BusinessError } from '../middleware/BusinessError.js';
import { getSingleParam, getSingleQueryValue, parseNonEmptyText } from '../services/shared/httpParam.js';

const router = Router();


router.get('/tasks', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.userId!;
  const seasonId = parseNonEmptyText(getSingleQueryValue(req.query.seasonId)) ?? undefined;
  const data = await battlePassService.getBattlePassTasksOverview(userId, seasonId);
  return sendSuccess(res, data);
}));

router.post('/tasks/:taskId/complete', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.userId!;
  const taskId = parseNonEmptyText(getSingleParam(req.params.taskId));
  if (!taskId) {
    throw new BusinessError('任务ID无效');
  }
  const result = await battlePassService.completeBattlePassTask(userId, taskId);
  return sendResult(res, result);
}));

router.get('/status', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.userId!;
  const data = await battlePassService.getBattlePassStatus(userId);
  if (!data) throw new BusinessError('战令数据不存在', 404);
  return sendSuccess(res, data);
}));

router.get('/rewards', requireAuth, asyncHandler(async (req, res) => {
  const seasonId = parseNonEmptyText(getSingleQueryValue(req.query.seasonId)) ?? undefined;
  const data = await battlePassService.getBattlePassRewards(seasonId);
  return sendSuccess(res, data);
}));

router.post('/claim', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.userId!;
  const { level, track } = req.body as { level?: number; track?: 'free' | 'premium' };
  if (typeof level !== 'number' || !Number.isInteger(level) || level < 1) {
    throw new BusinessError('等级参数无效');
  }
  if (track !== 'free' && track !== 'premium') {
    throw new BusinessError('奖励轨道参数无效');
  }
  const result = await battlePassService.claimBattlePassReward(userId, level, track);
  if (result.success) {
    await safePushCharacterUpdate(userId);
  }
  return sendResult(res, result);
}));

export default router;
