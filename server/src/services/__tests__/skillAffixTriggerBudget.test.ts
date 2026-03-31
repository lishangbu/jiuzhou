import test from 'node:test';
import assert from 'node:assert/strict';
import { triggerSetBonusEffects } from '../../battle/modules/setBonus.js';
import {
  AFFIX_TRIGGER_DECAY_RATIO,
  buildSkillAffixTriggerRuntimeKey,
  createSkillAffixTriggerRuntimeState,
  readSkillAffixTriggerSuccessCount,
  resolveAffixTriggerChanceBySuccessCount,
} from '../../battle/utils/affixTriggerBudget.js';
import type { BattleSetBonusEffect } from '../../battle/types.js';
import { createState, createUnit } from './battleTestUtils.js';

const createAffixEffect = (): BattleSetBonusEffect => ({
  setId: 'affix-1001-proc_zhuihun',
  setName: '赤焰枪·追魂斩',
  pieceCount: 1,
  trigger: 'on_hit',
  target: 'enemy',
  effectType: 'damage',
  params: {
    affix_key: 'proc_zhuihun',
    chance: 1,
    value: 120,
    damage_type: 'true',
  },
});

const createSetEffect = (): BattleSetBonusEffect => ({
  setId: 'set-taixu-4',
  setName: '太虚套装',
  pieceCount: 4,
  trigger: 'on_hit',
  target: 'enemy',
  effectType: 'damage',
  params: {
    chance: 1,
    value: 120,
    damage_type: 'true',
  },
});

test('词缀连击触发概率应按成功次数递减到上一档的三分之二', () => {
  assert.equal(resolveAffixTriggerChanceBySuccessCount(0.3, 0), 0.3);
  assert.equal(resolveAffixTriggerChanceBySuccessCount(0.3, 1), 0.3 * AFFIX_TRIGGER_DECAY_RATIO);
  assert.equal(resolveAffixTriggerChanceBySuccessCount(0.3, 2), 0.3 * AFFIX_TRIGGER_DECAY_RATIO * AFFIX_TRIGGER_DECAY_RATIO);
  assert.equal(resolveAffixTriggerChanceBySuccessCount(1, 0), 1);
});

test('同一次施法内同一持有者的 affix 会按成功次数连续衰减', () => {
  const owner = createUnit({ id: 'player-701', name: '赤焰枪修', setBonusEffects: [createAffixEffect()] });
  const target = createUnit({ id: 'monster-701', name: '木桩妖', type: 'monster' });
  const state = createState({ attacker: [owner], defender: [target] });
  const runtimeState = createSkillAffixTriggerRuntimeState();
  state.randomSeed = 6;

  const logsPerHit = [
    triggerSetBonusEffects(state, 'on_hit', owner, { target, damage: 120, affixTriggerRuntimeState: runtimeState }).length,
    triggerSetBonusEffects(state, 'on_hit', owner, { target, damage: 120, affixTriggerRuntimeState: runtimeState }).length,
    triggerSetBonusEffects(state, 'on_hit', owner, { target, damage: 120, affixTriggerRuntimeState: runtimeState }).length,
    triggerSetBonusEffects(state, 'on_hit', owner, { target, damage: 120, affixTriggerRuntimeState: runtimeState }).length,
    triggerSetBonusEffects(state, 'on_hit', owner, { target, damage: 120, affixTriggerRuntimeState: runtimeState }).length,
  ];

  assert.deepEqual(logsPerHit, [1, 1, 1, 1, 0]);
  assert.equal(
    readSkillAffixTriggerSuccessCount(runtimeState, buildSkillAffixTriggerRuntimeKey(owner.id, 'affix:proc_zhuihun')),
    4,
  );
});

test('普通套装效果不受 affix 连击衰减状态影响', () => {
  const owner = createUnit({ id: 'player-801', name: '太虚剑修', setBonusEffects: [createSetEffect()] });
  const target = createUnit({ id: 'monster-801', name: '木桩妖', type: 'monster' });
  const state = createState({ attacker: [owner], defender: [target] });
  const runtimeState = createSkillAffixTriggerRuntimeState();

  const firstLogs = triggerSetBonusEffects(state, 'on_hit', owner, {
    target,
    damage: 120,
    affixTriggerRuntimeState: runtimeState,
  });
  const secondLogs = triggerSetBonusEffects(state, 'on_hit', owner, {
    target,
    damage: 120,
    affixTriggerRuntimeState: runtimeState,
  });

  assert.equal(firstLogs.length, 1);
  assert.equal(secondLogs.length, 1);
  assert.equal(
    readSkillAffixTriggerSuccessCount(runtimeState, buildSkillAffixTriggerRuntimeKey(owner.id, 'affix:proc_zhuihun')),
    0,
  );
});
