/**
 * 伙伴坊市购买凭证守卫
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：校验伙伴坊市列表返回的一次性短时 buyTicket，确保下单用户和浏览列表的用户一致。
 * 2. 做什么：把 `listingId + buyTicket` 的校验集中到单一中间件，避免路由层重复判断和重复错误返回。
 * 3. 不做什么：不签发 ticket，不消费 ticket，也不处理验证码与真实购买事务。
 *
 * 输入 / 输出：
 * - 输入：已注入 `req.userId` 的请求，以及 body 中的 `listingId`、`buyTicket`。
 * - 输出：校验通过时继续执行；失败时返回标准错误响应。
 *
 * 数据流 / 状态流：
 * - partner-listings route 签发短时 buyTicket -> 本中间件校验 ticket 与 userId/listingId 是否匹配 ->
 *   成功后把 ticket 挂到请求上下文，供购买成功后消费。
 *
 * 复用设计说明：
 * - 守卫只负责协议绑定，不侵入 `partnerMarketService` 的交易逻辑，保持伙伴坊市交易服务职责单一。
 * - request 上仅透传最小字段 `partnerBuyTicket`，避免把完整 ticket 状态散落到多个层级。
 * - 后续如果物品坊市也接入同类机制，可以复用同样的“route 签发 + middleware 校验 + success 消费”结构。
 *
 * 关键边界条件与坑点：
 * 1. 必须放在 `requireCharacter` 之后，确保 `req.userId` 已可用。
 * 2. 不能在这里提前消费 ticket，否则验证码通过后的同一笔重试会被错误拦截。
 */
import type { RequestHandler } from 'express';

import { validateMarketBuyTicket } from '../services/marketRiskService.js';
import { resolveRequestIp } from '../shared/requestIp.js';
import { logMarketBuyTicketInvalid } from '../services/shared/marketRiskObservability.js';

export const PARTNER_MARKET_BUY_TICKET_INVALID_ERROR_CODE = 'PARTNER_MARKET_BUY_TICKET_INVALID';
export const PARTNER_MARKET_BUY_TICKET_INVALID_MESSAGE =
  '伙伴坊市购买凭证已失效，请刷新列表后重试';

export const requirePartnerMarketBuyTicket: RequestHandler = async (
  req,
  res,
  next,
) => {
  const userId = req.userId!;
  const body = (req.body ?? {}) as {
    listingId?: unknown;
    buyTicket?: unknown;
  };
  const listingId = Number(body.listingId);
  const buyTicket = typeof body.buyTicket === 'string' ? body.buyTicket.trim() : '';

  if (!Number.isInteger(listingId) || listingId <= 0 || !buyTicket) {
    logMarketBuyTicketInvalid({
      event: 'buy_ticket_invalid',
      scene: 'partner',
      route: '/market/partner/buy',
      userId,
      ip: resolveRequestIp(req),
      listingId: Number.isInteger(listingId) && listingId > 0 ? listingId : undefined,
      ticketPresent: Boolean(buyTicket),
      listingIdValid: Number.isInteger(listingId) && listingId > 0,
      reason: 'missing_input',
    });
    res.status(403).json({
      success: false,
      code: PARTNER_MARKET_BUY_TICKET_INVALID_ERROR_CODE,
      message: PARTNER_MARKET_BUY_TICKET_INVALID_MESSAGE,
    });
    return;
  }

  const buyTicketValidation = await validateMarketBuyTicket({
    scene: 'partner',
    userId,
    listingId,
    buyTicket,
  });
  if (!buyTicketValidation.valid) {
    logMarketBuyTicketInvalid({
      event: 'buy_ticket_invalid',
      scene: 'partner',
      route: '/market/partner/buy',
      userId,
      ip: resolveRequestIp(req),
      listingId,
      ticketPresent: true,
      listingIdValid: true,
      reason: buyTicketValidation.reason,
    });
    res.status(403).json({
      success: false,
      code: PARTNER_MARKET_BUY_TICKET_INVALID_ERROR_CODE,
      message: PARTNER_MARKET_BUY_TICKET_INVALID_MESSAGE,
    });
    return;
  }

  req.marketRiskContext = {
    ...(req.marketRiskContext ?? { allowedByCaptchaPass: false }),
    buyScene: 'partner',
    buyTicket,
    partnerBuyTicket: buyTicket,
  };
  next();
};
