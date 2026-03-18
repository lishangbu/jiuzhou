import { Router } from 'express';
/**
 * 九州修仙录 - 战斗路由
 */

import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { battleService } from '../domains/battle/index.js';
import { sendResult } from '../middleware/response.js';
import { BusinessError } from '../middleware/BusinessError.js';
import { getSingleParam, parseNonEmptyText } from '../services/shared/httpParam.js';

const router = Router();

/**
 * POST /api/battle/start
 * 发起PVE战斗
 */
router.post('/start', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.userId!;
  const { monsterIds } = req.body;

  if (!monsterIds || !Array.isArray(monsterIds) || monsterIds.length === 0) {
    throw new BusinessError('请指定战斗目标');
  }

  if (monsterIds.length > 5) {
    throw new BusinessError('战斗目标数量超限');
  }

  const result = await battleService.startPVEBattle(userId, monsterIds);

  return sendResult(res, result);
}));

/**
 * POST /api/battle/action
 * 玩家行动
 */
router.post('/action', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.userId!;
  const { battleId, skillId, targetIds } = req.body;

  if (!battleId) {
    throw new BusinessError('缺少战斗ID');
  }

  if (!skillId) {
    throw new BusinessError('缺少技能ID');
  }

  const result = await battleService.playerAction(
    userId,
    battleId,
    skillId,
    targetIds || []
  );

  return sendResult(res, result);
}));

/**
 * GET /api/battle/state/:battleId
 * 获取战斗状态
 */
router.get('/state/:battleId', requireAuth, asyncHandler(async (req, res) => {
  const battleId = parseNonEmptyText(getSingleParam(req.params.battleId));

  if (!battleId) {
    throw new BusinessError('缺少战斗ID');
  }

  const result = await battleService.getBattleState(battleId);

  return sendResult(res, result);
}));

/**
 * POST /api/battle/abandon
 * 放弃战斗
 */
router.post('/abandon', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.userId!;
  const { battleId } = req.body;

  if (!battleId) {
    throw new BusinessError('缺少战斗ID');
  }

  const result = await battleService.abandonBattle(userId, battleId);

  return sendResult(res, result);
}));

export default router;
