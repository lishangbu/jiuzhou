/**
 * 坊市伙伴详情共享展示工具。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：统一生成坊市伙伴“属性值 + 成长值”行数据，供桌面弹窗与移动端抽屉复用。
 * 2. 做什么：把成长值读取口径固定为服务端下发的真实 `levelAttrGains`，避免不同视图各自拼接时误用 `growth` 字段。
 * 3. 不做什么：不渲染 UI，不处理弹窗开关，也不参与伙伴属性结算。
 *
 * 输入/输出：
 * - 输入：`PartnerDisplayDto`。
 * - 输出：可直接渲染的属性行数组，包含属性名、当前值和可选成长值字符串。
 *
 * 数据流/状态流：
 * - 伙伴坊市接口 DTO -> 本模块统一整理属性行 -> `MarketPartnerBuyModal` / `MarketPartnerPreviewSheet`。
 *
 * 关键边界条件与坑点：
 * 1. 坊市伙伴当前属性由服务端 `computedAttrs` 结算，成长值必须与其使用同一模板来源 `levelAttrGains`，否则 UI 会展示出不参与结算的假成长。
 * 2. 只展示非 0 当前属性；成长值为 0 时不追加 `+` 片段，避免移动端和桌面端出现视觉噪音。
 */
import type { PartnerDisplayDto } from '../../../../services/api';
import {
  formatPartnerAttrValue,
  getPartnerAttrLabel,
  getPartnerVisibleCombatAttrs,
} from '../../shared/partnerDisplay';

export type PartnerMarketAttrRow = {
  key: string;
  label: string;
  valueText: string;
  growthText: string | null;
};

export const buildPartnerMarketAttrRows = (
  partner: PartnerDisplayDto,
): PartnerMarketAttrRow[] => {
  return getPartnerVisibleCombatAttrs(partner.computedAttrs).map((entry) => {
    const growthValue = Number(partner.levelAttrGains[entry.key]) || 0;
    return {
      key: entry.key,
      label: getPartnerAttrLabel(entry.key),
      valueText: formatPartnerAttrValue(entry.key, entry.value),
      growthText: growthValue > 0
        ? formatPartnerAttrValue(entry.key, growthValue)
        : null,
    };
  });
};
