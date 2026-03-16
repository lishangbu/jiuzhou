import type { CharacterFeatureCode } from './feature';

/**
 * 客户端通用奖励结果类型
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中定义服务端“已发放奖励结果”的通用 DTO，供主线、兑换码等多个入口复用，避免每个接口各写一份近似 union。
 * 2. 做什么：把高频变化的奖励类型收口到单一文件，后续新增奖励时只改一处类型定义。
 * 3. 不做什么：不负责奖励文本格式化，也不负责接口请求封装。
 *
 * 输入/输出：
 * - 输入：无，作为类型模块被其他 API 文件引用。
 * - 输出：通用奖励结果类型与主线章节奖励扩展类型。
 *
 * 数据流/状态流：
 * 服务端奖励结果 -> API DTO 类型 -> 页面文案拼接 / 弹窗展示。
 *
 * 关键边界条件与坑点：
 * 1. 这里只定义当前前端已经识别并展示过的奖励类型，不为未落地能力预留宽泛字符串兜底。
 * 2. 主线章节奖励是对通用奖励的补充，不应反向混入兑换码等普通发奖场景。
 */

export type GrantedRewardResultDto =
  | { type: 'exp'; amount: number }
  | { type: 'silver'; amount: number }
  | { type: 'spirit_stones'; amount: number }
  | { type: 'item'; itemDefId: string; quantity: number; itemName?: string; itemIcon?: string | null }
  | { type: 'technique'; techniqueId: string; techniqueName?: string; techniqueIcon?: string | null }
  | { type: 'feature_unlock'; featureCode: CharacterFeatureCode }
  | { type: 'partner'; partnerId: number; partnerDefId: string; partnerName: string; partnerAvatar?: string | null }
  | { type: 'title'; title: string };

export type ChapterGrantedRewardResultDto =
  | { type: 'chapter_exp'; amount: number }
  | { type: 'chapter_silver'; amount: number }
  | { type: 'chapter_spirit_stones'; amount: number };
