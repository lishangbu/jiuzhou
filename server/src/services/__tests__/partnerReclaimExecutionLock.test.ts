/**
 * 伙伴回收执行锁语义测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定回收执行阶段复检伙伴时的 SQL 锁语义，避免 `LEFT JOIN LATERAL` 场景再次误用裸 `FOR UPDATE`。
 * 2. 做什么：让这类 PostgreSQL 行锁约束有一个静态回归测试入口，避免同样的问题在线上再次出现。
 * 3. 不做什么：不连接数据库、不执行脚本，也不验证伙伴删除或邮件返还流程。
 *
 * 输入/输出：
 * - 输入：回收脚本源码文本。
 * - 输出：对锁子句文本的静态断言结果。
 *
 * 数据流/状态流：
 * 测试读取脚本源码 -> 匹配 `recheckExecutablePartner` 查询锁子句 -> 断言必须限定到主表 `cp`。
 *
 * 关键边界条件与坑点：
 * 1. 这里要锁的是 `character_partner` 主表行，不是 `LEFT JOIN` 出来的可空侧；否则 PostgreSQL 会直接拒绝执行。
 * 2. 测试同时要避免再次退回裸 `FOR UPDATE`，否则指定伙伴 ID 的执行路径仍会在事务里报错。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

test('recheckExecutablePartner: 应只锁定主表 cp，避免外连接可空侧触发 FOR UPDATE 报错', () => {
    const scriptPath = path.resolve(process.cwd(), 'src/scripts/reclaimPartnersByBaseModel.ts');
    const source = fs.readFileSync(scriptPath, 'utf8');

    assert.match(source, /FOR UPDATE OF cp/u);
    assert.doesNotMatch(source, /WHERE cp\.id = \$1\s+FOR UPDATE\s/us);
});
