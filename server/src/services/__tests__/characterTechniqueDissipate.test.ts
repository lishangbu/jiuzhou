/**
 * 角色功法散功服务测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定“仅未装配功法可散功”的核心规则，避免后续在路由或前端层误放开。
 * 2. 做什么：验证散功成功时只删除目标功法记录，不附带返还资源或其它副作用。
 * 3. 不做什么：不连接真实数据库、不覆盖前端按钮渲染，也不验证功法列表刷新展示。
 *
 * 输入 / 输出：
 * - 输入：角色 ID、功法 ID，以及按 SQL 语义模拟的数据库结果。
 * - 输出：散功服务返回结果与删除 SQL 参数。
 *
 * 数据流 / 状态流：
 * dissipateTechnique -> 锁定目标功法行 -> 判断是否已装配 -> 删除未装配记录 -> 返回服务结果。
 *
 * 复用设计说明：
 * - 通过直接调用 `characterTechniqueService` 锁定服务层单一规则入口，避免把同一业务判断拆到路由测试和服务测试里重复维护。
 * - SQL mock 只覆盖本功能实际触达的语句，后续若规则扩展，测试会显式暴露查询链路变化。
 *
 * 关键边界条件与坑点：
 * 1. 已装配功法必须被拒绝，不能依赖前端按钮禁用作为唯一防线。
 * 2. 服务成功文案应带出目标功法名，避免前端成功提示退化成无上下文的通用字符串。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';

import * as database from '../../config/database.js';
import { characterTechniqueService } from '../characterTechniqueService.js';

type SqlValue = boolean | Date | number | string | null;
type MockTransactionState = {
  clientId: number;
  depth: number;
  released: boolean;
  rollbackCause: null;
  rollbackOnly: boolean;
};

const createQueryResult = <TRow extends QueryResultRow>(rows: TRow[]): QueryResult<TRow> => {
  return {
    command: 'SELECT',
    rowCount: rows.length,
    oid: 0,
    rows,
    fields: [],
  };
};

const createMockPoolClient = (
  handler: (sql: string, params?: readonly SqlValue[]) => Promise<QueryResult<QueryResultRow>>,
): PoolClient => {
  const txState: MockTransactionState = {
    clientId: 1,
    depth: 0,
    released: false,
    rollbackCause: null,
    rollbackOnly: false,
  };

  const client: Partial<PoolClient> & { __txState: MockTransactionState } = {
    __txState: txState,
    query: (async (...queryArgs: Array<string | readonly SqlValue[] | { text: string }>) => {
      const firstArg = queryArgs[0];
      const sql =
        typeof firstArg === 'string'
          ? firstArg
          : typeof firstArg === 'object' && firstArg !== null && 'text' in firstArg
            ? String(firstArg.text)
            : '';
      const secondArg = queryArgs[1];
      const params = Array.isArray(secondArg) ? (secondArg as readonly SqlValue[]) : undefined;

      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return createQueryResult([]);
      }

      return await handler(sql, params);
    }) as PoolClient['query'],
    release: () => undefined,
  };

  return client as PoolClient;
};

test('dissipateTechnique: 未装配功法应删除学习记录', async (t) => {
  const deleteCalls: Array<readonly SqlValue[] | undefined> = [];

  t.mock.method(database.pool, 'connect', async () =>
    createMockPoolClient(async (sql, params) => {
      if (
        sql.includes('SELECT id, technique_id, slot_type, slot_index')
        && sql.includes('FROM character_technique')
        && sql.includes('FOR UPDATE')
      ) {
        return createQueryResult([
          {
            id: 11,
            technique_id: 'tech-taixu',
            slot_type: null,
            slot_index: null,
          },
        ]);
      }

      if (
        sql.includes('DELETE FROM character_technique')
        && sql.includes('WHERE id = $1')
      ) {
        deleteCalls.push(params);
        return createQueryResult([
          {
            id: 11,
          },
        ]);
      }

      throw new Error(`未覆盖的 SQL: ${sql}`);
    }),
  );

  const result = await characterTechniqueService.dissipateTechnique(1001, 'tech-taixu');

  assert.equal(result.success, true);
  assert.equal(result.message, '散功成功');
  assert.deepEqual(deleteCalls, [[11]]);
});

test('dissipateTechnique: 已装配功法应拒绝散功', async (t) => {
  t.mock.method(database.pool, 'connect', async () =>
    createMockPoolClient(async (sql) => {
      if (
        sql.includes('SELECT id, technique_id, slot_type, slot_index')
        && sql.includes('FROM character_technique')
        && sql.includes('FOR UPDATE')
      ) {
        return createQueryResult([
          {
            id: 12,
            technique_id: 'tech-qingmu',
            slot_type: 'sub',
            slot_index: 1,
          },
        ]);
      }

      throw new Error(`未覆盖的 SQL: ${sql}`);
    }),
  );

  const result = await characterTechniqueService.dissipateTechnique(1002, 'tech-qingmu');

  assert.equal(result.success, false);
  assert.equal(result.message, '已运功的功法不可散功，请先取消运功');
});

test('dissipateTechnique: 未学习目标功法时应返回失败', async (t) => {
  t.mock.method(database.pool, 'connect', async () =>
    createMockPoolClient(async (sql) => {
      if (
        sql.includes('SELECT id, technique_id, slot_type, slot_index')
        && sql.includes('FROM character_technique')
        && sql.includes('FOR UPDATE')
      ) {
        return createQueryResult([]);
      }

      throw new Error(`未覆盖的 SQL: ${sql}`);
    }),
  );

  const result = await characterTechniqueService.dissipateTechnique(1003, 'tech-missing');

  assert.equal(result.success, false);
  assert.equal(result.message, '未学习该功法');
});
