/**
 * 伙伴招募前端开关
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中定义招募面板在当前前端构建环境是否展示，避免组件内散落 `import.meta.env.PROD`。
 * 2. 做什么：让菜单过滤、状态轮询与招募面板渲染共享同一判断入口。
 * 3. 不做什么：不发请求、不决定后端接口可用性。
 *
 * 输入/输出：
 * - 输入：无。
 * - 输出：当前前端是否显示 AI 伙伴招募入口。
 *
 * 数据流/状态流：
 * PartnerModal / partnerShared -> partnerRecruitAvailability -> 决定是否展示招募入口。
 *
 * 关键边界条件与坑点：
 * 1. 前端隐藏只是用户体验层处理，真正拦截仍由服务端完成。
 * 2. 这里和服务端一样按生产环境关闭，后续恢复时要保持两边口径一致。
 */

export const isPartnerRecruitEnabled = (): boolean => {
  return !import.meta.env.PROD;
};
