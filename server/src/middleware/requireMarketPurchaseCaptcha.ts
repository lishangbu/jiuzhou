/**
 * 坊市购买前验证码守卫
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：在坊市购买路由统一执行行为风控判定；命中高风险且未完成坊市验证码时，直接拒绝购买。
 * 2. 做什么：把“风险评分 + 放行凭证校验”的流程收敛到单一中间件，避免物品坊市和伙伴坊市各自复制判断。
 * 3. 不做什么：不记录列表访问，不生成验证码，也不实际执行购买逻辑。
 *
 * 输入/输出：
 * - 输入：已由上游鉴权中间件注入 `req.userId`、`req.characterId` 的请求。
 * - 输出：放行时调用 `next()`；需要验证码时返回标准失败响应。
 *
 * 数据流/状态流：
 * - 购买路由 -> 本中间件读取 Redis 风控指标 -> 风险评分 -> 检查购买放行凭证 -> next()/拒绝。
 *
 * 关键边界条件与坑点：
 * 1. 本中间件必须放在 `requireCharacter` 之后，否则无法按角色维度校验短时放行凭证。
 * 2. 放行凭证只在“当前仍命中风险”时才参与校验；如果风险已恢复正常，则直接放行，避免多余验证码阻塞。
 */
import type { RequestHandler } from 'express';

import {
  getMarketPurchaseRiskAssessment,
  hasValidMarketPurchaseCaptchaPass,
} from '../services/marketRiskService.js';
import { logMarketCaptchaRequired } from '../services/shared/marketRiskObservability.js';
import { resolveRequestIp } from '../shared/requestIp.js';
import { resolveMarketBuyRoute } from '../services/shared/marketRiskObservability.js';

export const MARKET_CAPTCHA_REQUIRED_ERROR_CODE = 'MARKET_CAPTCHA_REQUIRED';
export const MARKET_CAPTCHA_NOT_REQUIRED_ERROR_CODE = 'MARKET_CAPTCHA_NOT_REQUIRED';
export const MARKET_CAPTCHA_REQUIRED_MESSAGE =
  '坊市访问行为异常，请先完成图片验证码验证后再购买';
export const MARKET_CAPTCHA_NOT_REQUIRED_MESSAGE =
  '当前购买无需验证码，请直接重试购买';

export const requireMarketPurchaseCaptcha: RequestHandler = async (
  req,
  res,
  next,
) => {
  const userId = req.userId!;
  const characterId = req.characterId!;
  const listingId = Number((req.body as { listingId?: unknown } | undefined)?.listingId);
  const assessment = await getMarketPurchaseRiskAssessment({ userId, characterId });

  if (!assessment.requiresCaptcha) {
    req.marketRiskContext = {
      ...(req.marketRiskContext ?? {}),
      allowedByCaptchaPass: false,
    };
    next();
    return;
  }

  const hasPass = await hasValidMarketPurchaseCaptchaPass({
    userId,
    characterId,
  });
  if (hasPass) {
    req.marketRiskContext = {
      ...(req.marketRiskContext ?? {}),
      allowedByCaptchaPass: true,
    };
    next();
    return;
  }

  req.marketRiskContext = {
    ...(req.marketRiskContext ?? {}),
    allowedByCaptchaPass: false,
  };

  logMarketCaptchaRequired({
    event: 'captcha_required',
    scene: req.marketRiskContext?.buyScene ?? 'unknown',
    route: resolveMarketBuyRoute(req.marketRiskContext?.buyScene ?? 'unknown'),
    userId,
    characterId,
    listingId: Number.isInteger(listingId) && listingId > 0 ? listingId : undefined,
    ip: resolveRequestIp(req),
    riskScore: assessment.score,
    reasons: assessment.reasons,
    queryCount60s: assessment.inputs.queryCount60s,
    queryCount5m: assessment.inputs.queryCount5m,
    latestSignatureCount60s: assessment.inputs.latestSignatureCount60s,
    recentPurchaseSuccessCount60s: assessment.inputs.recentPurchaseSuccessCount60s,
    averageIntervalMs: assessment.intervalStats ? Math.round(assessment.intervalStats.averageIntervalMs) : null,
    coefficientOfVariation: assessment.intervalStats ? Number(assessment.intervalStats.coefficientOfVariation.toFixed(4)) : null,
  });

  res.status(403).json({
    success: false,
    code: MARKET_CAPTCHA_REQUIRED_ERROR_CODE,
    message: MARKET_CAPTCHA_REQUIRED_MESSAGE,
    data: {
      riskScore: assessment.score,
      reasons: assessment.reasons,
    },
  });
};
