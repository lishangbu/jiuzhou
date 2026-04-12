import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMoveItemInstanceToBagMutations } from '../inventory/bag.js';

const buildItem = (overrides: Partial<Parameters<typeof buildMoveItemInstanceToBagMutations>[0][number]> & { id: number; item_def_id: string; owner_user_id: number; owner_character_id: number; qty: number; location: string; }) => ({
  quality: null,
  quality_rank: null,
  metadata: null,
  location_slot: null,
  equipped_slot: null,
  strengthen_level: 0,
  refine_level: 0,
  socketed_gems: [],
  affixes: [],
  identified: true,
  locked: false,
  bind_type: 'none',
  bind_owner_user_id: null,
  bind_owner_character_id: null,
  random_seed: null,
  affix_gen_version: 0,
  affix_roll_meta: null,
  custom_name: null,
  expire_at: null,
  obtained_from: 'mail',
  obtained_ref_id: null,
  created_at: new Date('2026-04-08T09:00:00.000Z'),
  ...overrides,
});

test('多件邮件实例附件应共享递进投影视图避免重复覆盖同一承载堆数量', async () => {
  const projectedItems = [
    buildItem({
      id: 100,
      owner_user_id: 1,
      owner_character_id: 1,
      item_def_id: 'mat-001',
      qty: 9997,
      location: 'bag',
      location_slot: 0,
    }),
    buildItem({
      id: 101,
      owner_user_id: 1,
      owner_character_id: 1,
      item_def_id: 'mat-001',
      qty: 1,
      location: 'mail',
    }),
    buildItem({
      id: 102,
      owner_user_id: 1,
      owner_character_id: 1,
      item_def_id: 'mat-001',
      qty: 1,
      location: 'mail',
    }),
  ];

  const first = await buildMoveItemInstanceToBagMutations(projectedItems, 1, 101, {
    expectedSourceLocation: 'mail',
    expectedOwnerUserId: 1,
  });

  assert.equal(first.success, true);
  if (!first.success || !first.projectedItems) {
    return;
  }

  const second = await buildMoveItemInstanceToBagMutations(first.projectedItems, 1, 102, {
    expectedSourceLocation: 'mail',
    expectedOwnerUserId: 1,
  });

  assert.equal(second.success, true);
  if (!second.success || !second.projectedItems) {
    return;
  }

  const bagItems = second.projectedItems
    .filter((item) => item.location === 'bag')
    .sort((left, right) => left.id - right.id);

  assert.deepEqual(
    bagItems.map((item) => ({ id: item.id, qty: item.qty, slot: item.location_slot })),
    [
      { id: 100, qty: 9999, slot: 0 },
    ],
  );
});
