/**
 * 功法散功共享文案与状态模块
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中维护角色功法“散功”按钮状态、确认标题与确认提示文案，供功法面板复用。
 * 2. 做什么：把“仅未装配功法可散功”与“不返还资源或功法书”的业务表达收敛到单一入口，避免 JSX 与提示弹窗各写一套。
 * 3. 不做什么：不发起请求、不判断角色权限，也不处理散功成功后的刷新链路。
 *
 * 输入 / 输出：
 * - 输入：当前功法是否已装配，以及功法名称。
 * - 输出：散功按钮展示状态、确认标题与确认文案数组。
 *
 * 数据流 / 状态流：
 * TechniqueModal 已学功法列表 -> 本模块生成按钮态与确认文案 -> 列表按钮 / 确认弹窗消费。
 *
 * 复用设计说明：
 * - 散功属于高频变化的交互文案点，单独抽出后，后续若扩到角色信息面板或其它功法入口，可直接复用同一规则。
 * - 当前列表按钮态与确认弹窗都依赖“是否已装配”这一条业务规则，集中维护可避免两处口径漂移。
 *
 * 关键边界条件与坑点：
 * 1. 已装配功法必须明确表现为不可散功，不能仍显示可点的危险操作按钮，否则会让用户误以为可直接删当前运功中的功法。
 * 2. 风险提示必须显式声明“不返还任何资源或功法书”，不能只写在成功提示里，否则用户在确认前无法判断代价。
 */

export type TechniqueDissipateActionState = {
  label: string;
  disabled: boolean;
  disabledReason: string | null;
};

export const resolveTechniqueDissipateActionState = (
  equippedSlotLabel: string | null,
): TechniqueDissipateActionState => {
  if (equippedSlotLabel) {
    return {
      label: '已运功',
      disabled: true,
      disabledReason: `该功法正在${equippedSlotLabel}运转，请先取消运功`,
    };
  }

  return {
    label: '散功',
    disabled: false,
    disabledReason: null,
  };
};

export const buildTechniqueDissipateConfirmTitle = (techniqueName: string): string => {
  return `确认散去「${techniqueName}」？`;
};

export const buildTechniqueDissipateConfirmLines = (techniqueName: string): string[] => {
  return [
    `散功后，「${techniqueName}」会从已学功法中移除。`,
    '本次散功不会返还任何修炼资源或功法书。',
  ];
};
