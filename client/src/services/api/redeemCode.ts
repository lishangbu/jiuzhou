/**
 * 兑换码 API
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中封装真实服务端兑换码接口，供设置页等入口复用。
 * 2. 做什么：输出稳定的响应类型，避免页面侧重复定义奖励返回结构。
 * 3. 不做什么：不处理 UI 提示，也不做本地去重缓存。
 *
 * 输入/输出：
 * - 输入：兑换码字符串。
 * - 输出：标准兑换结果与奖励明细。
 *
 * 数据流/状态流：
 * 页面事件 -> redeemGiftCode -> `/redeem-code/redeem` -> 业务响应。
 *
 * 关键边界条件与坑点：
 * 1. 页面不能再假设“本地记录过就算兑换成功”，必须以后端真实结果为准。
 * 2. 奖励明细用于后续复用，因此类型定义收口在 API 层而不是页面组件里。
 */
import api from './core';
import type { GrantedRewardResultDto } from '../reward';

export type RedeemCodeRewardDto = GrantedRewardResultDto;

export interface RedeemCodeResponse {
  success: boolean;
  message: string;
  data?: {
    code: string;
    rewards: RedeemCodeRewardDto[];
  };
}

export const redeemGiftCode = (code: string): Promise<RedeemCodeResponse> => {
  return api.post('/redeem-code/redeem', { code });
};
