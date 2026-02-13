/**
 * 属性数值格式化工具
 * 作用：统一格式化百分比、带符号数值等展示文本，避免各模块各写一套。
 * 输出：用于 UI 展示的字符串（如 "10%"、"+5%"、"+120"）。
 * 注意：
 *   - 比率值（0~1）在传入 formatPercent / formatSignedPercent 前不需要 *100，函数内部会乘。
 *   - trimDecimals 内部正则仅去除小数点后的尾零，不会吞掉整数末尾的 0。
 */

// ────────── 内部工具 ──────────

/** 将浮点数格式化为整数或两位小数字符串（自动识别） */
const toFixedSmart = (value: number): string =>
  Math.abs(value - Math.round(value)) < 1e-9
    ? value.toFixed(0)
    : value.toFixed(2);

/** 去除小数点后的尾零，如 "10.50" → "10.5"、"10.00" → "10"；整数 "10" 不受影响 */
const trimDecimals = (s: string): string =>
  s.replace(/(\.\d*[1-9])0+$|\.0+$/, '$1') || '0';

// ────────── 导出函数 ──────────

/**
 * 格式化比率为百分比文本（无正号）
 * @example formatPercent(0.1) → "10%"
 * @example formatPercent(0.155) → "15.5%"
 */
export const formatPercent = (value: number): string => {
  const percent = value * 100;
  return `${trimDecimals(toFixedSmart(percent))}%`;
};

/**
 * 格式化比率为带正负号的百分比文本
 * @example formatSignedPercent(0.1) → "+10%"
 * @example formatSignedPercent(-0.05) → "-5%"
 */
export const formatSignedPercent = (value: number): string => {
  const percent = value * 100;
  const sign = value > 0 ? '+' : '';
  return `${sign}${trimDecimals(toFixedSmart(percent))}%`;
};

/**
 * 格式化带正负号的整数/小数文本
 * @example formatSignedNumber(120) → "+120"
 * @example formatSignedNumber(-3.5) → "-3.5"
 */
export const formatSignedNumber = (value: number): string => {
  const sign = value > 0 ? '+' : '';
  return `${sign}${trimDecimals(toFixedSmart(value))}`;
};

/**
 * 格式化恢复类数值（无百分号、无正号）
 * @example formatRecovery(10) → "10"
 * @example formatRecovery(3.5) → "3.5"
 */
export const formatRecovery = (value: number): string =>
  trimDecimals(toFixedSmart(value));
