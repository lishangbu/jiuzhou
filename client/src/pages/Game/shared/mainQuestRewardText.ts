/**
 * 主线奖励文本格式化工具。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：统一把主线完成接口的奖励结果 DTO 转成聊天栏/消息提示可读文案，避免 Game 与 TaskModal 重复拼接。
 * 2. 做什么：集中处理新增的功能解锁、伙伴奖励类型，保证前后端字段一变只改一个地方。
 * 3. 不做什么：不负责请求主线接口，也不直接控制 UI 样式。
 *
 * 输入/输出：
 * - 输入：主线奖励结果数组。
 * - 输出：面向 UI 的奖励文本数组。
 *
 * 数据流/状态流：
 * `/main-quest/section/complete` -> MainQuestRewardResultDto[] -> 本文件 -> Game / TaskModal 系统提示。
 *
 * 关键边界条件与坑点：
 * 1. 只处理当前主线接口定义过的奖励类型，避免业务组件里再写一层“未知类型忽略”的重复逻辑。
 * 2. 功能奖励展示名称与菜单入口共用一套功能映射，避免“主线提示叫伙伴、菜单里叫灵宠”的命名漂移。
 */

import type { MainQuestRewardResultDto } from '../../../services/mainQuestApi';
import { getCharacterFeatureLabel } from './featureUnlocks';
import { PARTNER_FEATURE_CODE } from '../../../services/feature';

export const formatMainQuestRewardTexts = (
  rewards: MainQuestRewardResultDto[],
): string[] => {
  return rewards.flatMap((reward) => {
    if (reward.type === 'exp') return [`经验 +${reward.amount}`];
    if (reward.type === 'silver') return [`银两 +${reward.amount}`];
    if (reward.type === 'spirit_stones') return [`灵石 +${reward.amount}`];
    if (reward.type === 'chapter_exp') return [`章节经验 +${reward.amount}`];
    if (reward.type === 'chapter_silver') return [`章节银两 +${reward.amount}`];
    if (reward.type === 'chapter_spirit_stones') return [`章节灵石 +${reward.amount}`];
    if (reward.type === 'item') {
      const name = reward.itemName || reward.itemDefId;
      return [`物品「${name}」×${reward.quantity}`];
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
