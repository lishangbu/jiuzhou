import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildItemInstanceMutationFlushPlan,
  collapseBufferedCharacterItemInstanceMutations,
  type BufferedCharacterItemInstanceMutation,
} from '../shared/characterItemInstanceMutationService.js';

const buildMutation = (overrides: Partial<BufferedCharacterItemInstanceMutation> & Pick<BufferedCharacterItemInstanceMutation, 'itemId' | 'characterId' | 'opId' | 'createdAt' | 'kind'>): BufferedCharacterItemInstanceMutation => ({
  snapshot: null,
  ...overrides,
});

test('flush plan 应先释放将被其他实例占用的旧槽位', () => {
  const plan = buildItemInstanceMutationFlushPlan(
    [
      { id: 10, owner_character_id: 1, location: 'bag', location_slot: 1 },
      { id: 11, owner_character_id: 1, location: 'mail', location_slot: null },
    ],
    [
      buildMutation({ itemId: 11, characterId: 1, opId: 'm1', createdAt: 1, kind: 'upsert', snapshot: {
        id: 11,
        owner_user_id: 1,
        owner_character_id: 1,
        item_def_id: 'equip-weapon-001',
        qty: 1,
        quality: null,
        quality_rank: null,
        metadata: null,
        location: 'bag',
        location_slot: 1,
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
      } }),
      buildMutation({ itemId: 10, characterId: 1, opId: 'm2', createdAt: 2, kind: 'delete' }),
    ],
  );

  assert.deepEqual(plan.slotReleaseItemIds, [10]);
  assert.deepEqual(plan.duplicateTargetKeys, []);
});

test('flush plan 应识别两个不同实例最终写入同一槽位的冲突', () => {
  const plan = buildItemInstanceMutationFlushPlan(
    [],
    [
      buildMutation({ itemId: 21, characterId: 1, opId: 'a', createdAt: 1, kind: 'upsert', snapshot: {
        id: 21,
        owner_user_id: 1,
        owner_character_id: 1,
        item_def_id: 'equip-weapon-001',
        qty: 1,
        quality: null,
        quality_rank: null,
        metadata: null,
        location: 'bag',
        location_slot: 1,
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
      } }),
      buildMutation({ itemId: 22, characterId: 1, opId: 'b', createdAt: 2, kind: 'upsert', snapshot: {
        id: 22,
        owner_user_id: 1,
        owner_character_id: 1,
        item_def_id: 'equip-weapon-002',
        qty: 1,
        quality: null,
        quality_rank: null,
        metadata: null,
        location: 'bag',
        location_slot: 1,
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
      } }),
    ],
  );

  assert.deepEqual(plan.slotReleaseItemIds, []);
  assert.deepEqual(plan.duplicateTargetKeys, ['1:bag:1']);
});

test('flush 应只保留同一实例的最终 mutation，避免执行过期槽位状态', () => {
  const collapsed = collapseBufferedCharacterItemInstanceMutations([
    buildMutation({ itemId: 31, characterId: 1, opId: 'old', createdAt: 1, kind: 'upsert', snapshot: {
      id: 31,
      owner_user_id: 1,
      owner_character_id: 1,
      item_def_id: 'equip-weapon-001',
      qty: 1,
      quality: null,
      quality_rank: null,
      metadata: null,
      location: 'bag',
      location_slot: 1,
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
    } }),
    buildMutation({ itemId: 31, characterId: 1, opId: 'new', createdAt: 2, kind: 'upsert', snapshot: {
      id: 31,
      owner_user_id: 1,
      owner_character_id: 1,
      item_def_id: 'equip-weapon-001',
      qty: 1,
      quality: null,
      quality_rank: null,
      metadata: null,
      location: 'bag',
      location_slot: 2,
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
    } }),
  ]);

  assert.equal(collapsed.length, 1);
  assert.equal(collapsed[0]?.snapshot?.location_slot, 2);
});

test('flush plan 应识别目标槽位与未改动旧实例的直接冲突', () => {
  const plan = buildItemInstanceMutationFlushPlan(
    [
      { id: 40, owner_character_id: 1, location: 'bag', location_slot: 1 },
    ],
    [
      buildMutation({ itemId: 41, characterId: 1, opId: 'm1', createdAt: 1, kind: 'upsert', snapshot: {
        id: 41,
        owner_user_id: 1,
        owner_character_id: 1,
        item_def_id: 'equip-weapon-001',
        qty: 1,
        quality: null,
        quality_rank: null,
        metadata: null,
        location: 'bag',
        location_slot: 1,
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
      } }),
    ],
  );

  assert.deepEqual(plan.duplicateTargetKeys, ['1:bag:1']);
});
