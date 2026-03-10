/**
 * Game 页面功能解锁展示工具。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：把 `CharacterData.featureUnlocks` 与功能入口展示文案绑定到一个可复用工具里。
 * 2. 做什么：为 FunctionMenu 与主线奖励提示提供统一的功能名和未解锁提示，避免页面里散落硬编码。
 * 3. 不做什么：不处理后端字段兼容，也不负责发起功能解锁请求。
 *
 * 输入/输出：
 * - 输入：当前角色、功能编码。
 * - 输出：是否已解锁、功能展示名称、未解锁提示文案。
 *
 * 数据流/状态流：
 * gameSocket `CharacterData.featureUnlocks` -> 本文件工具 -> Game/PartnerModal 入口展示。
 *
 * 关键边界条件与坑点：
 * 1. 当前页面只消费已约定的 `featureUnlocks` 字段，不做 `features/unlocks` 多字段回退。
 * 2. 未登录或角色尚未同步时统一视为未解锁，保证菜单状态稳定。
 */

import type { CharacterData } from '../../../services/gameSocket';
import { PARTNER_FEATURE_CODE, getFeatureLabel, hasFeature } from '../../../services/feature';

export const PARTNER_FEATURE_UNLOCK_HINT = '完成第一章第二节主线后解锁伙伴功能';

export const hasCharacterFeature = (
  character: Pick<CharacterData, 'featureUnlocks'> | null,
  featureCode: typeof PARTNER_FEATURE_CODE,
): boolean => {
  if (!character) return false;
  return hasFeature(character.featureUnlocks, featureCode);
};

export const getCharacterFeatureLabel = (featureCode: typeof PARTNER_FEATURE_CODE): string => {
  return getFeatureLabel(featureCode);
};
