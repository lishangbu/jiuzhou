/**
 * 伙伴招募功能开关
 *
 * 作用（做什么 / 不做什么）：
 * 1) 做什么：集中定义 AI 伙伴招募在当前运行环境是否开放，避免启动、路由与业务层各写一套环境判断。
 * 2) 做什么：为服务端提供统一错误结果构造，确保关闭时提示文案一致。
 * 3) 不做什么：不处理前端展示，不负责数据库迁移或 worker 调度。
 *
 * 输入/输出：
 * - 输入：可选 `NODE_ENV`。
 * - 输出：功能是否开放，以及标准化的关闭提示结果。
 *
 * 数据流/状态流：
 * startup/routes/services -> partnerRecruitAvailability -> 决定是否初始化 worker / 暴露接口能力。
 *
 * 关键边界条件与坑点：
 * 1) 这里是“生产环境暂时关闭”，所以判断必须单点集中，后续恢复时只改这一处。
 * 2) 关闭状态下仍允许保留表结构与历史数据，避免为了关功能再改动迁移链路。
 */

export type PartnerRecruitDisabledResult = {
  success: false;
  message: string;
  code: 'PARTNER_RECRUIT_DISABLED';
};

export const isPartnerRecruitEnabled = (
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean => {
  return nodeEnv !== 'production';
};

export const buildPartnerRecruitDisabledResult = (): PartnerRecruitDisabledResult => ({
  success: false,
  message: '伙伴招募功能暂未开放',
  code: 'PARTNER_RECRUIT_DISABLED',
});
