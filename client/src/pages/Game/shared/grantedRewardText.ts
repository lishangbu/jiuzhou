/**
 * 通用奖励文本格式化工具。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：统一把“已发放奖励 / 待领取邮件附件”转换成可读文案，供兑换码、邮件、主线等多处复用。
 * 2. 做什么：把功能解锁、伙伴、称号等高频变化奖励类型集中在一个文件维护，减少页面内重复分支。
 * 3. 不做什么：不负责请求接口，也不处理章节奖励等主线专属扩展类型。
 *
 * 输入/输出：
 * - 输入：通用奖励结果数组。
 * - 输出：适合直接展示的奖励文本数组。
 *
 * 数据流/状态流：
 * 服务端奖励 DTO -> 本文件 -> 邮件附件区 / 系统提示 / 兑换反馈。
 *
 * 关键边界条件与坑点：
 * 1. 这里只处理通用奖励类型，章节奖励等扩展类型必须在上层先转换，避免职责混淆。
 * 2. 功能奖励名称必须走统一映射，不能在不同面板里各自硬编码。
 */

import type { GrantedRewardResultDto } from '../../../services/reward';
import { PARTNER_FEATURE_CODE } from '../../../services/feature';
import { getCharacterFeatureLabel } from './featureUnlocks';

export const formatGrantedRewardTexts = (
  rewards: GrantedRewardResultDto[] | null | undefined,
): string[] => {
  const list = Array.isArray(rewards) ? rewards : [];
  return list.flatMap((reward) => {
    if (reward.type === 'exp') return [`经验 +${reward.amount}`];
    if (reward.type === 'silver') return [`银两 +${reward.amount}`];
    if (reward.type === 'spirit_stones') return [`灵石 +${reward.amount}`];
    if (reward.type === 'item') {
      return [`物品「${reward.itemName || reward.itemDefId}」×${reward.quantity}`];
    }
    if (reward.type === 'technique') {
      return [`功法「${reward.techniqueName || reward.techniqueId}」`];
    }
    if (reward.type === 'title') {
      return [`称号「${reward.title}」`];
    }
    if (reward.type === 'feature_unlock') {
      if (reward.featureCode === PARTNER_FEATURE_CODE) {
        return [`解锁功能「${getCharacterFeatureLabel(reward.featureCode)}」`];
      }
      return [];
    }
    if (reward.type === 'partner') {
      return [`伙伴「${reward.partnerName}」加入队伍`];
    }
    return [];
  });
};
