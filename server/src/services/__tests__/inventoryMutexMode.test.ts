import test from 'node:test';
import assert from 'node:assert/strict';
import { lockCharacterInventoryMutexByClient } from '../inventoryMutex.js';

test('lockCharacterInventoryMutexByClient: 应使用阻塞式 advisory xact lock 而非轮询 try lock', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const client = {
    query: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      return { rows: [{ locked: true }] };
    },
  };

  await lockCharacterInventoryMutexByClient(client as never, 123);

  assert.equal(calls.length, 1);
  assert.match(calls[0]!.sql, /pg_advisory_xact_lock/);
  assert.doesNotMatch(calls[0]!.sql, /pg_try_advisory_xact_lock/);
  assert.deepEqual(calls[0]!.params, [3101, 123]);
});
