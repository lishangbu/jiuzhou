import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireCharacter } from '../middleware/auth.js';
import { sendSuccess } from '../middleware/response.js';
import { getGameHomeOverview } from '../services/gameHomeOverviewService.js';

/**
 * 首页聚合路由
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：提供首页首屏所需的聚合概览接口，减少前端初始化阶段的碎片化请求。
 * 2. 做什么：只负责鉴权、调用聚合 service、返回统一成功响应。
 * 3. 不做什么：不重复实现各领域业务规则，不做 DTO 二次改写。
 *
 * 输入/输出：
 * - 输入：登录态请求。
 * - 输出：首页概览 DTO。
 *
 * 数据流/状态流：
 * 前端首页 -> `GET /api/game/home-overview` -> `gameHomeOverviewService` -> 返回聚合数据。
 *
 * 关键边界条件与坑点：
 * 1. 该路由依赖 `requireCharacter`，因此只能在“已登录且已创建角色”场景下调用。
 * 2. 首页概览只聚合当前首页真正消费的数据，后续弹窗详情仍应继续走各自领域接口，避免把详情接口也塞进首页首屏。
 */

const router = Router();

router.get('/home-overview', requireCharacter, asyncHandler(async (req, res) => {
  const userId = req.userId!;
  const characterId = req.characterId!;
  const data = await getGameHomeOverview(userId, characterId);
  return sendSuccess(res, data);
}));

export default router;
