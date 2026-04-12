/**
 * 坊市购买灰度限速守卫
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：在物品坊市和伙伴坊市购买前统一执行 userId / userId+IP / IP 三层灰度限速，并对同 IP 活跃账号簇收紧阈值。
 * 2. 做什么：把短冷却与过频购买提示收敛到单一中间件，避免两条购买路由各自重复读写 Redis。
 * 3. 不做什么：不替代现有 QPS 中间件，不签发 buyTicket，也不处理验证码与购买事务。
 *
 * 输入 / 输出：
 * - 输入：已注入 `req.userId` 的请求与规范化后的请求 IP。
 * - 输出：允许时进入后续验证码/购买链；拒绝时返回标准错误响应。
 *
 * 数据流 / 状态流：
 * - buy route -> 读取 req.userId / req.ip -> marketRiskService 记录并评估购买尝试 -> next()/429。
 *
 * 复用设计说明：
 * - 物品坊市与伙伴坊市共用同一中间件，确保“同 IP 切号抢购”会落进同一套限速窗口。
 * - QPS 负责秒级硬限流，这里负责更长一点窗口的灰度短冷却，两层职责清晰分离。
 * - 所有阈值和 Redis key 都集中在 `marketRiskService`，路由层只保留编排职责。
 *
 * 关键边界条件与坑点：
 * 1. 必须在鉴权中间件之后执行，否则无法按 userId 记账。
 * 2. 请求 IP 不能为空；若 IP 丢失，直接抛错而不是降级放行。
 */
import type { RequestHandler } from 'express';

import { evaluateMarketPurchaseAttempt } from '../services/marketRiskService.js';
import { logMarketBuyAttemptBlocked } from '../services/shared/marketRiskObservability.js';
import { resolveRequestIp } from '../shared/requestIp.js';
import { resolveMarketBuyRoute } from '../services/shared/marketRiskObservability.js';

export const MARKET_BUY_RATE_LIMITED_ERROR_CODE = 'MARKET_BUY_RATE_LIMITED';
export const MARKET_BUY_RATE_LIMITED_MESSAGE = '坊市购买过于频繁，请稍后再试';
export const MARKET_BUY_COOLDOWN_ACTIVE_ERROR_CODE = 'MARKET_BUY_COOLDOWN_ACTIVE';
export const MARKET_BUY_COOLDOWN_ACTIVE_MESSAGE = '当前网络购买过快，请稍候几秒再试';

export const requireMarketPurchaseAttemptGuard: RequestHandler = async (
  req,
  res,
  next,
) => {
  const userId = req.userId!;
  const requestIp = resolveRequestIp(req);
  const listingId = Number((req.body as { listingId?: unknown } | undefined)?.listingId);
  const result = await evaluateMarketPurchaseAttempt({
    userId,
    requestIp,
  });

  if (result.allowed) {
    next();
    return;
  }

  logMarketBuyAttemptBlocked({
    event: result.code === 'MARKET_BUY_COOLDOWN_ACTIVE' ? 'buy_cooldown_active' : 'buy_rate_limited',
    scene: req.marketRiskContext?.buyScene ?? 'unknown',
    route: resolveMarketBuyRoute(req.marketRiskContext?.buyScene ?? 'unknown'),
    userId,
    characterId: req.characterId,
    listingId: Number.isInteger(listingId) && listingId > 0 ? listingId : undefined,
    ip: requestIp,
    activeClusterUserCount: result.activeClusterUserCount,
    isClustered: result.isClustered,
    userIpAttemptCount: result.userIpAttemptCount,
    userAttemptCount: result.userAttemptCount,
    ipAttemptCount: result.ipAttemptCount,
    userIpLimit: result.userIpLimit,
    userLimit: result.userLimit,
    ipLimit: result.ipLimit,
    cooldownUserIpHit: result.cooldownUserIpHit,
    cooldownUserHit: result.cooldownUserHit,
    cooldownIpHit: result.cooldownIpHit,
  });

  res.status(429).json({
    success: false,
    code: result.code,
    message: result.message,
    data: {
      activeClusterUserCount: result.activeClusterUserCount,
    },
  });
};
