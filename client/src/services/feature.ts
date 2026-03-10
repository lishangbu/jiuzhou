/**
 * 游戏功能解锁共享定义。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中维护客户端识别到的功能编码与展示文案，避免菜单、主线奖励提示、角色同步类型各写一份字符串。
 * 2. 做什么：提供无副作用的功能判断工具，让 Game 页面与后续功能入口都走同一套判断。
 * 3. 不做什么：不负责请求后端，也不负责兜底兼容旧字段。
 *
 * 输入/输出：
 * - 输入：角色已解锁功能编码数组、目标功能编码。
 * - 输出：布尔值或固定展示文案。
 *
 * 数据流/状态流：
 * 后端角色同步 `featureUnlocks` -> 本文件工具函数 -> FunctionMenu / 主线奖励提示 / 业务弹窗。
 *
 * 关键边界条件与坑点：
 * 1. 当前只声明本期真正落地的 `partner_system`，不提前为未实现功能扩展宽泛字符串集合。
 * 2. 功能编码判断统一走精确匹配，避免页面内出现散落的硬编码字符串。
 */

export const PARTNER_FEATURE_CODE = 'partner_system' as const;

export type CharacterFeatureCode = typeof PARTNER_FEATURE_CODE;

const FEATURE_LABELS: Record<CharacterFeatureCode, string> = {
  [PARTNER_FEATURE_CODE]: '伙伴',
};

export const getFeatureLabel = (featureCode: CharacterFeatureCode): string => {
  return FEATURE_LABELS[featureCode];
};

export const hasFeature = (
  featureCodes: CharacterFeatureCode[],
  featureCode: CharacterFeatureCode,
): boolean => {
  return featureCodes.includes(featureCode);
};
