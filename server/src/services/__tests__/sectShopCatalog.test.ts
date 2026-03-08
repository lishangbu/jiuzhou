import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SECT_SHOP_ITEMS,
  TECHNIQUE_FRAGMENT_DAILY_LIMIT,
  TECHNIQUE_FRAGMENT_SHOP_ITEM_ID,
} from '../sect/shopCatalog.js';

test('功法残页在宗门商店应为单张兑换且每日最多兑换500次', () => {
  const techniqueFragmentShopItem = SECT_SHOP_ITEMS.find((item) => item.id === TECHNIQUE_FRAGMENT_SHOP_ITEM_ID);

  assert.ok(techniqueFragmentShopItem);
  assert.equal(techniqueFragmentShopItem.limitDaily, TECHNIQUE_FRAGMENT_DAILY_LIMIT);
  assert.equal(techniqueFragmentShopItem.limitDaily, 500);
  assert.equal(techniqueFragmentShopItem.costContribution, 50);
  assert.equal(techniqueFragmentShopItem.qty, 1);
});
