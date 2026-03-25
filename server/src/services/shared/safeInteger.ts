/**
 * 安全整数归一化工具。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：把数据库/Redis 中可能出现的 `string | number | bigint` 数值统一压成 JS 安全整数。
 * 2. 做什么：在货币、经验、属性点等核心整数字段进入运行时前主动校验，避免字符串拼接或超出安全整数范围后静默污染状态。
 * 3. 不做什么：不做向后兼容兜底；非法值会直接抛错，而不是悄悄替换成默认值。
 *
 * 输入/输出：
 * - 输入：`number | string | bigint | null | undefined` 数值，以及字段标签。
 * - 输出：已校验的 JS `number`。
 *
 * 数据流/状态流：
 * - DB/Redis 原始值 -> 本模块 -> 角色计算/在线战斗投影 -> 后续业务运算。
 *
 * 关键边界条件与坑点：
 * 1. 超出 `Number.MAX_SAFE_INTEGER` 会直接报错；该类字段若静默转成 number，会产生不可接受的精度丢失。
 * 2. 这里只处理整数语义字段；命中率、闪避等比例字段不应走这里。
 */

export type SafeIntegerInput = number | string | bigint | null | undefined;

const assertSafeIntegerRange = (value: bigint | number, fieldLabel: string): void => {
  const maxSafeInteger = BigInt(Number.MAX_SAFE_INTEGER);
  if (typeof value === 'bigint') {
    if (value > maxSafeInteger || value < -maxSafeInteger) {
      throw new Error(`${fieldLabel} 超出 JS 安全整数范围: ${String(value)}`);
    }
    return;
  }

  if (!Number.isSafeInteger(value)) {
    throw new Error(`${fieldLabel} 不是 JS 安全整数: ${String(value)}`);
  }
};

export const toSafeNonNegativeIntegerStrict = (
  value: SafeIntegerInput,
  fieldLabel: string,
): number => {
  if (typeof value === 'bigint') {
    if (value < 0n) {
      throw new Error(`${fieldLabel} 不能为负数: ${String(value)}`);
    }
    assertSafeIntegerRange(value, fieldLabel);
    return Number(value);
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${fieldLabel} 不是有限数字: ${String(value)}`);
  }
  if (!Number.isInteger(parsed)) {
    throw new Error(`${fieldLabel} 不是整数: ${String(value)}`);
  }
  if (parsed < 0) {
    throw new Error(`${fieldLabel} 不能为负数: ${String(value)}`);
  }
  assertSafeIntegerRange(parsed, fieldLabel);
  return parsed;
};
