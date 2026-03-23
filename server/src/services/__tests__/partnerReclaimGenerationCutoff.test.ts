/**
 * 伙伴回收脚本生成时间截止线测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定伙伴回收脚本使用的固定中国时区截止线，避免后续改动时把 UTC 时间点或边界文案改错。
 * 2. 做什么：让 SQL 过滤与控制台摘要依赖的共享常量拥有单一验证入口，避免脚本里再次散落硬编码。
 * 3. 不做什么：不连接数据库、不执行脚本，也不验证伙伴回收流程本身。
 *
 * 输入/输出：
 * - 输入：共享截止线常量与展示文案。
 * - 输出：固定时间点与展示口径的断言结果。
 *
 * 数据流/状态流：
 * 测试 -> 读取共享截止线模块 -> 断言 UTC 对应时间点与文案保持稳定。
 *
 * 关键边界条件与坑点：
 * 1. 中国时区 2026-03-23 18:00:00 必须稳定映射到 UTC 2026-03-23 10:00:00；一旦这里漂移，SQL 过滤就会错人。
 * 2. 文案里的“前”代表严格小于边界时间，测试要把这个口径固定住，避免后续被误改成“含 18:00:00”。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PARTNER_RECLAIM_GENERATION_CUTOFF_AT,
  PARTNER_RECLAIM_GENERATION_CUTOFF_LABEL,
} from '../../scripts/shared/partnerReclaimGenerationCutoff.js';

test('伙伴回收生成时间截止线应固定为中国时区 2026-03-23 18:00:00 前', () => {
  assert.equal(PARTNER_RECLAIM_GENERATION_CUTOFF_AT.toISOString(), '2026-03-23T10:00:00.000Z');
  assert.equal(PARTNER_RECLAIM_GENERATION_CUTOFF_LABEL, '中国时区 2026-03-23 18:00:00 前');
});
