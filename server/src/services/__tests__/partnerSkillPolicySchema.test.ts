import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

/**
 * 伙伴技能策略 Prisma schema 回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁住伙伴技能策略表的 Prisma 模型声明，避免后续重构时漏掉持久化结构。
 * 2. 做什么：集中校验唯一约束与关键字段，避免多个测试文件重复读取 schema 文本。
 * 3. 不做什么：不连接数据库、不执行迁移，也不验证真实库是否已补表。
 *
 * 输入/输出：
 * - 输入：`server/prisma/schema.prisma` 文件内容。
 * - 输出：断言 `character_partner_skill_policy` 模型与关键字段存在。
 *
 * 数据流/状态流：
 * 读取 schema 文本 -> 按模型名截取块 -> 断言字段与约束。
 *
 * 关键边界条件与坑点：
 * 1. 这里只验证 schema 文本，不验证数据库现状；真实补表仍需后续同步数据库。
 * 2. 如果未来拆分 Prisma schema 文件，必须同步更新 `schemaPath`，否则测试会误报。
 */

const schemaPath = path.resolve(process.cwd(), 'prisma/schema.prisma');

const getModelBlock = (modelName: string): string => {
  const schema = fs.readFileSync(schemaPath, 'utf8');
  const modelPattern = new RegExp(`model ${modelName} \\{[\\s\\S]*?\\n\\}`);
  const match = schema.match(modelPattern);
  return match?.[0] ?? '';
};

test('character_partner_skill_policy: Prisma schema 应声明关键字段与唯一约束', () => {
  const block = getModelBlock('character_partner_skill_policy');
  assert.match(block, /\bpartner_id\s+Int\b/, '缺少 partner_id Int 字段');
  assert.match(block, /\bskill_id\s+String\b/, '缺少 skill_id String 字段');
  assert.match(block, /\bpriority\s+Int\b/, '缺少 priority Int 字段');
  assert.match(block, /\benabled\s+Boolean\s+@default\(true\)/, '缺少 enabled Boolean @default(true) 字段');
  assert.match(block, /@@unique\(\[partner_id, skill_id\]\)/, '缺少 partner_id + skill_id 唯一约束');
});
