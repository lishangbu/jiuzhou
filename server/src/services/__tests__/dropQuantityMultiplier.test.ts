/**
 * 掉落数量区间境界步进规则测试
 *
 * 作用（做什么 / 不做什么）：
 * - 做什么：验证掉落条目上的最小/最大数量境界步进配置，会被共享数量规则稳定解释。
 * - 做什么：验证最终数量区间在叠加步进后仍保持 `qty_min <= qty_max`，避免预览与结算拿到非法区间。
 * - 不做什么：不执行真实战斗掉落随机，也不覆盖概率倍率、福缘倍率等其他链路。
 *
 * 输入/输出：
 * - 输入：基础数量区间、境界步进配置、怪物境界。
 * - 输出：共享纯函数返回的基础区间与最终展示区间。
 *
 * 数据流/状态流：
 * - `getMonsterRealmAdjustedBaseQuantityRange` 先解释“每阶增加多少”；
 * - `getAdjustedDropQuantityRange` 再把这个区间交给掉落倍率链路；
 * - 战斗结算、怪物详情预览、秘境预览都会复用这两层规则。
 *
 * 关键边界条件与坑点：
 * 1) 凡人必须保持原始区间，不能无意中把基础值也当作一次追加。
 * 2) 若最大值步进配置小于最小值步进配置，结果仍必须是合法区间，不能出现 `min > max`。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getAdjustedDropQuantityRange,
  getMonsterRealmAdjustedBaseQuantityRange,
} from '../shared/dropQuantityMultiplier.js';

test('凡人境界应保持原始数量区间', () => {
  assert.deepEqual(
    getMonsterRealmAdjustedBaseQuantityRange({
      qtyMin: 1,
      qtyMax: 2,
      qtyMinAddByMonsterRealm: 1,
      qtyMaxAddByMonsterRealm: 2,
      monsterRealm: '凡人',
    }),
    {
      qtyMin: 1,
      qtyMax: 2,
    },
  );
});

test('更高境界应按阶数分别增加最小值与最大值', () => {
  assert.deepEqual(
    getMonsterRealmAdjustedBaseQuantityRange({
      qtyMin: 1,
      qtyMax: 2,
      qtyMinAddByMonsterRealm: 1,
      qtyMaxAddByMonsterRealm: 2,
      monsterRealm: '炼精化炁·通脉期',
    }),
    {
      qtyMin: 3,
      qtyMax: 6,
    },
  );
});

test('最终掉落数量区间应复用境界步进结果', () => {
  assert.deepEqual(
    getAdjustedDropQuantityRange({
      itemDefId: 'box-001',
      qtyMin: 1,
      qtyMax: 1,
      qtyMinAddByMonsterRealm: 0,
      qtyMaxAddByMonsterRealm: 1,
      sourceType: 'exclusive',
      sourcePoolId: 'dp-test',
      monsterRealm: '炼精化炁·养气期',
    }),
    {
      qtyMin: 1,
      qtyMax: 2,
    },
  );
});

test('最大值步进小于最小值步进时也应保持合法区间', () => {
  assert.deepEqual(
    getMonsterRealmAdjustedBaseQuantityRange({
      qtyMin: 1,
      qtyMax: 1,
      qtyMinAddByMonsterRealm: 2,
      qtyMaxAddByMonsterRealm: 0,
      monsterRealm: '炼精化炁·养气期',
    }),
    {
      qtyMin: 3,
      qtyMax: 3,
    },
  );
});
