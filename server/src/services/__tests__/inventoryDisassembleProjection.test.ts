import assert from 'node:assert/strict';
import test from 'node:test';

import { buildBatchDisassembleExecutionPlan } from '../inventory/disassemble.js';
import type { ItemDefConfig } from '../staticConfigLoader.js';

test('批量分解执行计划应接受 projected 视图中的实例并生成正确消费结果', () => {
  const qtyById = new Map<number, number>([[9001, 1]]);
  const staticDefMap = new Map<string, ItemDefConfig | null>([
    ['equip-001', {
      id: 'equip-001',
      name: '青锋剑',
      category: 'equipment',
      sub_category: 'weapon',
      effect_defs: [],
      quality: 'common',
      disassemblable: true,
    }],
    ['mat-001', {
      id: 'mat-001',
      name: '玄铁碎片',
      category: 'material',
      sub_category: 'ore',
      effect_defs: [],
      quality: 'common',
      disassemblable: true,
    }],
  ]);

  const result = buildBatchDisassembleExecutionPlan([
    {
      id: 9001,
      item_def_id: 'equip-001',
      qty: 1,
      location: 'bag',
      locked: false,
      instance_quality_rank: 1,
      strengthen_level: 0,
      refine_level: 0,
      affixes: [],
    },
  ], qtyById, staticDefMap);

  assert.equal(result.success, true);
  if (!result.success) {
    return;
  }
  assert.deepEqual(result.plan.consumeOperations, [
    { id: 9001, rowQty: 1, consumeQty: 1 },
  ]);
  assert.equal(result.plan.disassembledQtyTotal, 1);
});
