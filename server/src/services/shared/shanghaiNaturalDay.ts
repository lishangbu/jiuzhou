/**
 * 上海时区自然日共享工具
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中生成 `Asia/Shanghai` 口径的自然日键与可比较整数 token，避免各服务散落手写日期格式化。
 * 2. 做什么：让“每日限制 / 每日扣费 / 每日奖励”统一消费同一份现实自然日定义，保证跨天时机一致。
 * 3. 不做什么：不负责数据库读写，不处理小时窗口，也不替代带时分秒的完整时间格式化。
 *
 * 输入/输出：
 * - 输入：`Date`。
 * - 输出：`dayKey`（`YYYY-MM-DD`）与 `dayToken`（`YYYYMMDD`）。
 *
 * 数据流/状态流：
 * - 调用方传入当前时间 -> 本模块按 `Asia/Shanghai` 提取年月日 -> 返回字符串键与整数 token。
 *
 * 复用设计说明：
 * 1. “北京时间自然日”是多个玩法都会复用的高频规则，收口后不必让宗门、祈福、月卡等模块各自维护一份格式化器。
 * 2. 同时提供 `dayKey` 和 `dayToken`，让展示文案与数据库比较都复用同一份来源，避免字符串比较和整数比较口径漂移。
 *
 * 关键边界条件与坑点：
 * 1. 必须显式固定 `Asia/Shanghai`，不能退回服务器本地时区，否则跨天时机会随部署环境漂移。
 * 2. `dayToken` 只用于相等/先后比较，不能被误当成真实时间戳或持续时长。
 */

const SHANGHAI_TIME_ZONE = 'Asia/Shanghai';

const shanghaiDayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: SHANGHAI_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const extractShanghaiDayParts = (now: Date): { year: string; month: string; day: string } => {
  const formattedParts = shanghaiDayFormatter.formatToParts(now);
  const year = formattedParts.find((part) => part.type === 'year')?.value;
  const month = formattedParts.find((part) => part.type === 'month')?.value;
  const day = formattedParts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    throw new Error('无法生成上海时区自然日');
  }

  return { year, month, day };
};

export const buildShanghaiDayKey = (now: Date): string => {
  const parts = extractShanghaiDayParts(now);
  return `${parts.year}-${parts.month}-${parts.day}`;
};

export const buildShanghaiDayToken = (now: Date): number => {
  const parts = extractShanghaiDayParts(now);
  return Number(`${parts.year}${parts.month}${parts.day}`);
};
