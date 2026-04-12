/**
 * 货币消耗公共模块回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：验证 number 版资源增减已切到“DB 基线 + pending Delta”模型，而不是直接 `UPDATE characters`。
 * 2. 做什么：验证 exact bigint 版本暂时仍保留直接条件更新，避免在超大数值路径上引入额外精度风险。
 * 3. 不做什么：不连接真实数据库，不覆盖装备/镶嵌等上层业务流程。
 *
 * 输入/输出：
 * - 输入：模拟数据库 `query` 响应、Redis `pipeline/multi` 行为，以及资源增减参数。
 * - 输出：服务返回值、执行过的 SQL 列表，以及关键 SQL / Redis 协议是否符合缓存账本模型。
 *
 * 数据流/状态流：
 * 调用公共货币模块 -> 读取角色资源基线
 * -> 叠加或写入 Redis Delta
 * -> 返回即时剩余值或成功结果。
 *
 * 关键边界条件与坑点：
 * 1. number 版扣减必须读取 `FOR UPDATE` 基线，否则无法和 pending Delta 做一致口径的余额校验。
 * 2. Redis Delta mock 需要同时覆盖 `pipeline` 与 `multi`，否则测试会误连真实 Redis。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { TestContext } from 'node:test';

import * as database from '../../config/database.js';
import { redis } from '../../config/redis.js';
import {
  addCharacterCurrencies,
  addCharacterCurrenciesExact,
  consumeCharacterCurrencies,
  consumeCharacterCurrenciesExact,
  consumeCharacterStoredResources,
} from '../inventory/shared/consume.js';

const mockEmptyResourceDeltaReads = (t: TestContext): void => {
  t.mock.method(redis, 'pipeline', () => {
    const commands: Array<{ key: string }> = [];
    return {
      hgetall(key: string) {
        commands.push({ key });
        return this;
      },
      async exec() {
        return commands.map(() => [null, {}] as const);
      },
    };
  });
};

const mockResourceDeltaReads = (
  t: TestContext,
  mainHash: Record<string, string>,
  inflightHash: Record<string, string> = {},
): void => {
  t.mock.method(redis, 'pipeline', () => {
    const commands: Array<{ key: string }> = [];
    return {
      hgetall(key: string) {
        commands.push({ key });
        return this;
      },
      async exec() {
        return commands.map((command) =>
          command.key.includes(':inflight:')
            ? [null, inflightHash] as const
            : [null, mainHash] as const,
        );
      },
    };
  });
};

const mockDeltaBufferWrites = (t: TestContext): void => {
  t.mock.method(redis, 'multi', () => ({
    hincrby() {
      return this;
    },
    sadd() {
      return this;
    },
    async exec() {
      return [];
    },
  }));
};

test('consumeCharacterCurrencies: 应读取带 FOR UPDATE 的基线并写入负向 Delta', async (t) => {
  const sqlCalls: string[] = [];
  mockEmptyResourceDeltaReads(t);
  mockDeltaBufferWrites(t);

  t.mock.method(database, 'query', async (sql: string) => {
    sqlCalls.push(sql);
    if (sql.includes('SELECT exp, silver, spirit_stones') && sql.includes('FOR UPDATE')) {
      return { rows: [{ silver: 5, spirit_stones: 99, exp: 0 }] };
    }

    throw new Error(`未处理的 SQL: ${sql}`);
  });

  const result = await consumeCharacterCurrencies(101, {
    silver: 10,
    spiritStones: 3,
  });

  assert.deepEqual(result, {
    success: false,
    message: '银两不足，需要10',
  });
  assert.equal(sqlCalls.length, 1);
  assert.match(sqlCalls[0] ?? '', /SELECT exp, silver, spirit_stones/u);
  assert.match(sqlCalls[0] ?? '', /FOR UPDATE/u);
});

test('consumeCharacterCurrencies: 应返回叠加 pending Delta 后的即时剩余值', async (t) => {
  const sqlCalls: string[] = [];
  mockResourceDeltaReads(t, { silver: '7', spiritStones: '2', exp: '0' });
  mockDeltaBufferWrites(t);

  t.mock.method(database, 'query', async (sql: string) => {
    sqlCalls.push(sql);
    if (sql.includes('SELECT exp, silver, spirit_stones') && sql.includes('FOR UPDATE')) {
      return { rows: [{ silver: 10, spirit_stones: 5, exp: 0 }] };
    }

    throw new Error(`未处理的 SQL: ${sql}`);
  });

  const result = await consumeCharacterCurrencies(707, {
    silver: 12,
    spiritStones: 3,
  });

  assert.deepEqual(result, {
    success: true,
    message: '扣除成功',
    remaining: {
      silver: 5,
      spiritStones: 4,
      exp: 0,
    },
  });
  assert.equal(sqlCalls.length, 1);
  assert.match(sqlCalls[0] ?? '', /FOR UPDATE/u);
});

test('addCharacterCurrencies: 应写入正向 Delta 而不是直接 UPDATE characters', async (t) => {
  const sqlCalls: string[] = [];
  mockEmptyResourceDeltaReads(t);
  mockDeltaBufferWrites(t);

  t.mock.method(database, 'query', async (sql: string) => {
    sqlCalls.push(sql);
    if (sql.includes('SELECT exp, silver, spirit_stones') && sql.includes('LIMIT 1')) {
      return { rows: [{ silver: 8, spirit_stones: 3, exp: 0 }] };
    }

    throw new Error(`未处理的 SQL: ${sql}`);
  });

  const result = await addCharacterCurrencies(202, {
    silver: 18,
    spiritStones: 6,
  });

  assert.deepEqual(result, {
    success: true,
    message: '增加成功',
  });
  assert.equal(sqlCalls.length, 1);
  assert.match(sqlCalls[0] ?? '', /SELECT exp, silver, spirit_stones/u);
  assert.doesNotMatch(sqlCalls[0] ?? '', /FOR UPDATE/u);
  assert.doesNotMatch(sqlCalls[0] ?? '', /UPDATE characters/u);
});

test('consumeCharacterStoredResources: 应支持经验并基于 pending Delta 校验剩余值', async (t) => {
  const sqlCalls: string[] = [];
  mockEmptyResourceDeltaReads(t);
  mockDeltaBufferWrites(t);

  t.mock.method(database, 'query', async (sql: string) => {
    sqlCalls.push(sql);
    if (sql.includes('SELECT exp, silver, spirit_stones') && sql.includes('FOR UPDATE')) {
      return { rows: [{ silver: 30, spirit_stones: 20, exp: 5 }] };
    }

    throw new Error(`未处理的 SQL: ${sql}`);
  });

  const result = await consumeCharacterStoredResources(303, {
    silver: 10,
    spiritStones: 3,
    exp: 8,
  });

  assert.deepEqual(result, {
    success: false,
    message: '经验不足，需要8',
  });
  assert.equal(sqlCalls.length, 1);
  assert.match(sqlCalls[0] ?? '', /SELECT exp, silver, spirit_stones/u);
  assert.match(sqlCalls[0] ?? '', /FOR UPDATE/u);
});

test('consumeCharacterCurrenciesExact: 应读取 bigint 基线并写入精确 Delta', async (t) => {
  const sqlCalls: string[] = [];
  mockEmptyResourceDeltaReads(t);
  t.mock.method(redis, 'multi', () => ({
    hincrby() {
      return this;
    },
    sadd() {
      return this;
    },
    async exec() {
      return [];
    },
  }));

  t.mock.method(database, 'query', async (sql: string) => {
    sqlCalls.push(sql);
    if (sql.includes('SELECT silver, spirit_stones') && sql.includes('FOR UPDATE')) {
      return { rows: [{ silver: '8', spirit_stones: '99' }] };
    }

    throw new Error(`未处理的 SQL: ${sql}`);
  });

  const result = await consumeCharacterCurrenciesExact(404, {
    silver: 10n,
    spiritStones: 3n,
  });

  assert.deepEqual(result, {
    success: false,
    message: '银两不足，需要10',
  });
  assert.equal(sqlCalls.length, 1);
  assert.match(sqlCalls[0] ?? '', /SELECT silver, spirit_stones/u);
  assert.match(sqlCalls[0] ?? '', /FOR UPDATE/u);
});

test('addCharacterCurrenciesExact: 应写入精确 Delta 并返回叠加后的剩余值', async (t) => {
  const sqlCalls: string[] = [];
  mockEmptyResourceDeltaReads(t);
  t.mock.method(redis, 'multi', () => ({
    hincrby() {
      return this;
    },
    sadd() {
      return this;
    },
    async exec() {
      return [];
    },
  }));

  t.mock.method(database, 'query', async (sql: string) => {
    sqlCalls.push(sql);
    if (sql.includes('SELECT silver, spirit_stones') && sql.includes('LIMIT 1')) {
      return { rows: [{ silver: '20', spirit_stones: '30' }] };
    }

    throw new Error(`未处理的 SQL: ${sql}`);
  });

  const result = await addCharacterCurrenciesExact(505, {
    silver: 18n,
    spiritStones: 6n,
  }, {
    includeRemaining: true,
  });

  assert.deepEqual(result, {
    success: true,
    message: '增加成功',
    remaining: {
      silver: 38n,
      spiritStones: 36n,
    },
  });
  assert.equal(sqlCalls.length, 1);
  assert.match(sqlCalls[0] ?? '', /SELECT silver, spirit_stones/u);
  assert.doesNotMatch(sqlCalls[0] ?? '', /FOR UPDATE/u);
  assert.doesNotMatch(sqlCalls[0] ?? '', /UPDATE characters/u);
});
