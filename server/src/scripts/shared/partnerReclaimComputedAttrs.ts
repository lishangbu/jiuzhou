import {
    CHARACTER_ATTR_DEFINITION_LIST,
    CHARACTER_ATTR_LABEL_MAP,
    CHARACTER_RATIO_ATTR_KEY_SET,
} from '../../services/shared/characterAttrRegistry.js';
import type { PartnerComputedAttrsDto } from '../../services/shared/partnerView.js';

/**
 * 伙伴回收脚本属性展示共享模块
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：统一把伙伴 `computedAttrs` 按固定顺序格式化成可读文本，供回收脚本控制台摘要与报告复用。
 * 2. 做什么：复用属性注册表中的字段顺序、中文名和百分比口径，避免脚本里再维护一份属性名单与标签映射。
 * 3. 不做什么：不负责伙伴属性计算、不查询数据库，也不决定哪些伙伴会进入回收流程。
 *
 * 输入/输出：
 * - 输入：伙伴完整计算属性 `PartnerComputedAttrsDto`。
 * - 输出：按固定分组切片后的属性文本行数组；每行内部使用 `，` 连接。
 *
 * 数据流/状态流：
 * 回收脚本拿到 `computedAttrs` -> 本模块按属性注册表顺序格式化 -> 控制台摘要/JSON 报告消费。
 *
 * 关键边界条件与坑点：
 * 1. 比率属性必须统一按小数转百分比展示，例如 `0.125` 应显示为 `12.5%`；不能在脚本里把同一个字段有时打原值、有时打百分比。
 * 2. 属性顺序必须跟随 `characterAttrRegistry`，这样后续如果新增伙伴可见属性，只需要改注册表而不是到处补名单。
 */

const PARTNER_RECLAIM_COMPUTED_ATTRS_LINE_SIZE = 6;

const trimTrailingZero = (value: string): string => {
    return value.includes('.') ? value.replace(/\.?0+$/, '') || '0' : value;
};

const formatPercent = (value: number): string => {
    const percent = value * 100;
    const fixed = Math.abs(percent - Math.round(percent)) < 1e-9 ? percent.toFixed(0) : percent.toFixed(2);
    return `${trimTrailingZero(fixed)}%`;
};

const formatFlatValue = (value: number): string => {
    const fixed = Math.abs(value - Math.round(value)) < 1e-9 ? value.toFixed(0) : value.toFixed(2);
    return trimTrailingZero(fixed);
};

export const formatPartnerReclaimComputedAttrs = (attrs: PartnerComputedAttrsDto): string[] => {
    const entries = CHARACTER_ATTR_DEFINITION_LIST.map((definition) => {
        const rawValue = attrs[definition.key as keyof PartnerComputedAttrsDto];
        const numericValue = typeof rawValue === 'number' ? rawValue : Number(rawValue);
        const formattedValue = CHARACTER_RATIO_ATTR_KEY_SET.has(definition.key)
            ? formatPercent(Number.isFinite(numericValue) ? numericValue : 0)
            : formatFlatValue(Number.isFinite(numericValue) ? numericValue : 0);
        return `${CHARACTER_ATTR_LABEL_MAP[definition.key]} ${formattedValue}`;
    });

    const lines: string[] = [];
    for (let index = 0; index < entries.length; index += PARTNER_RECLAIM_COMPUTED_ATTRS_LINE_SIZE) {
        lines.push(entries.slice(index, index + PARTNER_RECLAIM_COMPUTED_ATTRS_LINE_SIZE).join('，'));
    }
    return lines;
};
