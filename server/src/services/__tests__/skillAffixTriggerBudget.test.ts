import test from 'node:test';
import assert from 'node:assert/strict';
import { executeSkill } from '../../battle/modules/skill.js';
import { triggerSetBonusEffects } from '../../battle/modules/setBonus.js';
import { resolveSkillAffixTriggerChanceScale } from '../../battle/utils/affixTriggerBudget.js';
import type { BattleSetBonusEffect, BattleSkill } from '../../battle/types.js';
import { asActionLog, consumeBattleLogs, createState, createUnit } from './battleTestUtils.js';

const createDamageSkill = (hitCount: number): BattleSkill => ({
  id: `skill-hit-${hitCount}`,
  name: `连击${hitCount}`,
  source: 'innate',
  cost: {},
  cooldown: 0,
  targetType: 'single_enemy',
  targetCount: 1,
  damageType: 'physical',
  element: 'none',
  effects: [{
    type: 'damage',
    value: 60,
    valueType: 'flat',
    hit_count: hitCount,
  }],
  triggerType: 'active',
  aiPriority: 50,
});

test('多段伤害技能应把特殊词条总触发系数收敛到 1.2 上限', () => {
  assert.equal(resolveSkillAffixTriggerChanceScale(createDamageSkill(1)), 1);
  assert.equal(resolveSkillAffixTriggerChanceScale(createDamageSkill(6)), 0.2);
});

test('多段技能执行时应限制 on_hit 特殊词条触发次数，不再按段数线性放大', () => {
  const affixEffect: BattleSetBonusEffect = {
    setId: 'affix-501-proc_zhuihun',
    setName: '赤焰枪·追魂斩',
    pieceCount: 1,
    trigger: 'on_hit',
    target: 'enemy',
    effectType: 'damage',
    params: {
      affix_key: 'proc_zhuihun',
      chance: 1,
      value: 80,
      damage_type: 'true',
    },
  };
  const attacker = createUnit({
    id: 'player-501',
    name: '连击剑修',
    setBonusEffects: [affixEffect],
  });
  const defender = createUnit({
    id: 'monster-501',
    name: '木桩妖',
    type: 'monster',
  });
  const state = createState({ attacker: [attacker], defender: [defender] });

  const result = executeSkill(state, attacker, createDamageSkill(6), [defender.id]);
  assert.equal(result.success, true);

  const procLogs = consumeBattleLogs(state)
    .filter((entry) => entry.type === 'action')
    .map((entry) => asActionLog(entry))
    .filter((entry) => entry.skillId.startsWith('proc-'));

  assert.ok(procLogs.length <= 2, `6段连击在 1.2 系数上限下最多只应触发 2 次，实际 ${procLogs.length} 次`);
});

test('多段技能缩放只作用于装备特殊词条，不影响套装效果触发', () => {
  const setEffect: BattleSetBonusEffect = {
    setId: 'set-taixu',
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
  };
  const owner = createUnit({ id: 'player-601', name: '太虚剑修', setBonusEffects: [setEffect] });
  const target = createUnit({ id: 'monster-601', name: '木桩妖', type: 'monster' });
  const state = createState({ attacker: [owner], defender: [target] });

  const logs = triggerSetBonusEffects(state, 'on_hit', owner, {
    target,
    damage: 120,
    affixTriggerChanceScale: 0.2,
  });

  assert.equal(logs.length, 1);
});
