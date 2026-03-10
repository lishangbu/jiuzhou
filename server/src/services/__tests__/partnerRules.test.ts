import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calcPartnerUpgradeExpByTargetLevel,
  resolvePartnerInjectPlan,
} from '../shared/partnerRules.js';
import type { PartnerGrowthConfig } from '../staticConfigLoader.js';

const mockConfig: PartnerGrowthConfig = {
  exp_base_exp: 1000,
  exp_growth_rate: 1.15,
};

test('calcPartnerUpgradeExpByTargetLevel: 伙伴升级经验随目标等级递增', () => {
  assert.equal(calcPartnerUpgradeExpByTargetLevel(2, mockConfig), 1000);
  assert.equal(calcPartnerUpgradeExpByTargetLevel(3, mockConfig), 1150);
  assert.equal(calcPartnerUpgradeExpByTargetLevel(4, mockConfig), 1322);
  assert.equal(calcPartnerUpgradeExpByTargetLevel(10, mockConfig), 3059);
});

test('resolvePartnerInjectPlan: 单次灌注可跨多级并保留剩余进度', () => {
  const plan = resolvePartnerInjectPlan({
    beforeLevel: 1,
    beforeProgressExp: 0,
    characterExp: 200,
    injectExpBudget: 200,
    config: mockConfig,
  });

  assert.equal(plan.spentExp, 200);
  assert.equal(plan.afterLevel, 4);
  assert.equal(plan.afterProgressExp, 51);
  assert.equal(plan.gainedLevels, 3);
  assert.equal(plan.remainingCharacterExp, 0);
});

test('resolvePartnerInjectPlan: 经验不足时仅累加当前级进度', () => {
  const plan = resolvePartnerInjectPlan({
    beforeLevel: 5,
    beforeProgressExp: 10,
    characterExp: 20,
    injectExpBudget: 20,
    config: mockConfig,
  });

  assert.equal(plan.afterLevel, 5);
  assert.equal(plan.afterProgressExp, 30);
  assert.equal(plan.gainedLevels, 0);
  assert.equal(plan.remainingCharacterExp, 0);
});
