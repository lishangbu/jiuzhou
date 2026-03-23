import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import type { RewardItemEntry } from '../idle/types.js';
import {
  buildIdleBattleRewardSettlementPlan,
} from '../idle/idleBattleRewardResolver.js';
import { battleDropService, type BattleParticipant } from '../battleDropService.js';
import { closeRedis } from '../../config/redis.js';

after(async () => {
  await closeRedis();
});

const participant: BattleParticipant = {
  userId: 1001,
  characterId: 2002,
  nickname: '测试角色',
  realm: '炼气期',
};

const previewItems: RewardItemEntry[] = [
  { itemDefId: 'mat-a', itemName: '灵草', quantity: 2 },
];

test('buildIdleBattleRewardSettlementPlan: 胜利时应返回可延迟兑现的奖励计划', async (t) => {
  t.mock.method(
    battleDropService,
    'planSinglePlayerBattleRewards',
    async () => ({
      expGained: 120,
      silverGained: 45,
      previewItems,
      dropPlans: [
        {
          itemDefId: 'mat-a',
          quantity: 2,
          bindType: 'none',
        },
      ],
    }),
  );

  const plan = await buildIdleBattleRewardSettlementPlan(
    ['monster-a'],
    participant,
    'attacker_win',
  );

  assert.equal(plan.expGained, 120);
  assert.equal(plan.silverGained, 45);
  assert.deepEqual(plan.previewItems, previewItems);
  assert.equal(plan.dropPlans.length, 1);
  assert.equal(plan.dropPlans[0]?.itemDefId, 'mat-a');
  assert.equal(plan.dropPlans[0]?.quantity, 2);
});

test('buildIdleBattleRewardSettlementPlan: 战败时不应生成奖励计划', async () => {
  const plan = await buildIdleBattleRewardSettlementPlan(
    ['monster-a'],
    participant,
    'defender_win',
  );

  assert.equal(plan.expGained, 0);
  assert.equal(plan.silverGained, 0);
  assert.deepEqual(plan.previewItems, []);
  assert.deepEqual(plan.dropPlans, []);
});
