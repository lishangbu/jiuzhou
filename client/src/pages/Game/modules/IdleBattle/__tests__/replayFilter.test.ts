// Feature: offline-idle-battle, Property 16: 回放筛选正确性
// 验证：需求 5.4 — BatchList 筛选逻辑的正确性不变量

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { IdleBatchDto } from '../types';

// ============================================
// 从 ReplayViewer 提取的纯筛选逻辑（与组件内 useMemo 保持一致）
// 此处直接内联，避免引入 React 组件依赖（测试只验证纯逻辑）
// ============================================

type BatchFilter = 'all' | 'win' | 'lose';

const filterBatches = (batches: IdleBatchDto[], filter: BatchFilter): IdleBatchDto[] => {
  if (filter === 'all') return batches;
  if (filter === 'win') return batches.filter((b) => b.result === 'attacker_win');
  return batches.filter((b) => b.result === 'defender_win');
};

// ============================================
// Arbitraries
// ============================================

const batchResultArb = fc.constantFrom<IdleBatchDto['result']>(
  'attacker_win',
  'defender_win',
  'draw',
);

const batchArb: fc.Arbitrary<IdleBatchDto> = fc.record({
  id: fc.uuid(),
  sessionId: fc.uuid(),
  batchIndex: fc.nat({ max: 999 }),
  result: batchResultArb,
  roundCount: fc.integer({ min: 1, max: 50 }),
  randomSeed: fc.integer({ min: 0, max: 2 ** 31 - 1 }),
  expGained: fc.nat({ max: 100_000 }),
  silverGained: fc.nat({ max: 100_000 }),
  itemsGained: fc.array(
    fc.record({
      itemDefId: fc.string({ minLength: 1, maxLength: 20 }),
      itemName: fc.string({ minLength: 1, maxLength: 20 }),
      quantity: fc.integer({ min: 1, max: 99 }),
    }),
    { maxLength: 5 },
  ),
  battleLog: fc.constant([]),
  monsterIds: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 3 }),
  executedAt: fc.date().map((d) => d.toISOString()),
});

const batchesArb = fc.array(batchArb, { minLength: 0, maxLength: 50 });

// ============================================
// 属性 16：回放筛选正确性
// ============================================

describe('Property 16: 回放筛选正确性', () => {
  it('filter=all 时返回全部批次，不丢失任何记录', () => {
    fc.assert(
      fc.property(batchesArb, (batches) => {
        const result = filterBatches(batches, 'all');
        expect(result).toHaveLength(batches.length);
        // 顺序不变
        result.forEach((b, i) => expect(b.id).toBe(batches[i].id));
      }),
      { numRuns: 100 },
    );
  });

  it('filter=win 时结果集中每条记录的 result 均为 attacker_win', () => {
    fc.assert(
      fc.property(batchesArb, (batches) => {
        const result = filterBatches(batches, 'win');
        result.forEach((b) => expect(b.result).toBe('attacker_win'));
      }),
      { numRuns: 100 },
    );
  });

  it('filter=lose 时结果集中每条记录的 result 均为 defender_win', () => {
    fc.assert(
      fc.property(batchesArb, (batches) => {
        const result = filterBatches(batches, 'lose');
        result.forEach((b) => expect(b.result).toBe('defender_win'));
      }),
      { numRuns: 100 },
    );
  });

  it('filter=win 的结果数量等于原始数组中 attacker_win 的数量', () => {
    fc.assert(
      fc.property(batchesArb, (batches) => {
        const expected = batches.filter((b) => b.result === 'attacker_win').length;
        const result = filterBatches(batches, 'win');
        expect(result).toHaveLength(expected);
      }),
      { numRuns: 100 },
    );
  });

  it('filter=lose 的结果数量等于原始数组中 defender_win 的数量', () => {
    fc.assert(
      fc.property(batchesArb, (batches) => {
        const expected = batches.filter((b) => b.result === 'defender_win').length;
        const result = filterBatches(batches, 'lose');
        expect(result).toHaveLength(expected);
      }),
      { numRuns: 100 },
    );
  });

  it('win + lose + draw 的数量之和等于 all 的数量', () => {
    fc.assert(
      fc.property(batchesArb, (batches) => {
        const all = filterBatches(batches, 'all').length;
        const wins = filterBatches(batches, 'win').length;
        const loses = filterBatches(batches, 'lose').length;
        const draws = batches.filter((b) => b.result === 'draw').length;
        expect(wins + loses + draws).toBe(all);
      }),
      { numRuns: 100 },
    );
  });

  it('筛选不改变批次的相对顺序（batchIndex 单调递增性保持）', () => {
    fc.assert(
      fc.property(
        // 生成 batchIndex 严格递增的批次列表
        fc.array(batchArb, { minLength: 2, maxLength: 30 }).map((batches) =>
          batches
            .sort((a, b) => a.batchIndex - b.batchIndex)
            .map((b, i) => ({ ...b, batchIndex: i })),
        ),
        (batches) => {
          for (const filter of ['all', 'win', 'lose'] as BatchFilter[]) {
            const result = filterBatches(batches, filter);
            for (let i = 1; i < result.length; i++) {
              expect(result[i].batchIndex).toBeGreaterThan(result[i - 1].batchIndex);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
