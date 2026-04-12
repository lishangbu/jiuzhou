/**
 * 坊市验证码购买共享状态
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中维护坊市购买验证码错误码与“待重试购买意图”类型，供物品坊市和伙伴坊市共用。
 * 2. 做什么：把“命中验证码后如何表达待重试购买动作”的规则收敛到单一模块，避免 `MarketModal` 多处分支各写一套结构。
 * 3. 不做什么：不发请求，不处理验证码 UI，也不执行实际购买刷新逻辑。
 *
 * 输入/输出：
 * - 输入：服务端错误码、待重试购买所需的最小参数。
 * - 输出：统一错误码常量、购买意图类型、错误码判断函数。
 *
 * 数据流/状态流：
 * - 购买请求失败 -> UI 读取统一错误码 -> 保存待重试购买意图 -> 验证成功后按意图重放请求。
 *
 * 关键边界条件与坑点：
 * 1. 待重试购买意图只保存重试所需的最小数据，避免把整条挂单对象塞进状态导致数据陈旧。
 * 2. 错误码判断必须集中，否则物品坊市和伙伴坊市后续改码时容易出现一处改了另一处漏改。
 */

export const MARKET_CAPTCHA_REQUIRED_ERROR_CODE = 'MARKET_CAPTCHA_REQUIRED';
export const MARKET_CAPTCHA_NOT_REQUIRED_ERROR_CODE = 'MARKET_CAPTCHA_NOT_REQUIRED';
export const MARKET_BUY_TICKET_INVALID_ERROR_CODE = 'MARKET_BUY_TICKET_INVALID';
export const PARTNER_MARKET_BUY_TICKET_INVALID_ERROR_CODE = 'PARTNER_MARKET_BUY_TICKET_INVALID';
export const MARKET_BUY_RATE_LIMITED_ERROR_CODE = 'MARKET_BUY_RATE_LIMITED';
export const MARKET_BUY_COOLDOWN_ACTIVE_ERROR_CODE = 'MARKET_BUY_COOLDOWN_ACTIVE';

export type MarketCaptchaPurchaseIntent =
  | {
      kind: 'item';
      listingId: number;
      qty: number;
      buyTicket: string;
    }
  | {
      kind: 'partner';
      listingId: number;
      buyTicket: string;
    };

export const isMarketCaptchaRequiredCode = (code: string | null): boolean => {
  return code === MARKET_CAPTCHA_REQUIRED_ERROR_CODE;
};

export const isMarketCaptchaNotRequiredCode = (code: string | null): boolean => {
  return code === MARKET_CAPTCHA_NOT_REQUIRED_ERROR_CODE;
};

export const isPartnerMarketBuyTicketInvalidCode = (code: string | null): boolean => {
  return code === PARTNER_MARKET_BUY_TICKET_INVALID_ERROR_CODE;
};

export const isMarketBuyTicketInvalidCode = (code: string | null): boolean => {
  return code === MARKET_BUY_TICKET_INVALID_ERROR_CODE
    || code === PARTNER_MARKET_BUY_TICKET_INVALID_ERROR_CODE;
};

export const isMarketBuyAttemptLimitedCode = (code: string | null): boolean => {
  return code === MARKET_BUY_RATE_LIMITED_ERROR_CODE
    || code === MARKET_BUY_COOLDOWN_ACTIVE_ERROR_CODE;
};
