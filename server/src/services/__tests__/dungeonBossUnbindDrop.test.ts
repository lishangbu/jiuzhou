/**
 * 秘境 BOSS 公共掉落池回归测试
 *
 * 作用（做什么 / 不做什么）：
 * - 做什么：验证所有秘境 BOSS 对应掉落池在合并公共池后都包含额外公共掉落，避免新增秘境时只改一部分配置。
 * - 做什么：锁定公共池里易名符与功法残页的关键数值，确保功能道具与养成功能材料共用单一入口。
 * - 不做什么：不执行真实战斗掉落结算，也不校验背包分发链路。
 *
 * 输入/输出：
 * - 输入：dungeon / monster / drop_pool / drop_pool_common 四类种子数据。
 * - 输出：所有秘境 BOSS 的合并掉落条目断言，以及公共池关键条目的概率与数量区间断言。
 *
 * 数据流/状态流：
 * - 先从秘境种子提取所有 BOSS monster_def_id；
 * - 再读取 monster_def.json 找到各自 drop_pool_id；
 * - 然后通过共享工具合并专属池与公共池；
 * - 最后断言解绑符、易名符、功法残页都能进入最终掉落结果，并校验公共池配置值。
 *
 * 关键边界条件与坑点：
 * - 1) 只检查秘境内 BOSS，不把世界 BOSS、精英或小怪混入断言范围。
 * - 2) 功法残页本次复用的是公共池，测试必须同时验证“合并后可掉落”和“公共池数值”，避免只改一半。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  asArray,
  asObject,
  asText,
  buildObjectMap,
  collectDungeonBossMonsterIds,
  collectMergedPoolEntries,
  loadSeed,
  type JsonObject,
} from './seedTestUtils.js';

const DUNGEON_BOSS_FUNCTION_ITEM_POOL_ID = 'dp-common-dungeon-boss-unbind';
const EQUIPMENT_UNBIND_ITEM_DEF_ID = 'scroll-jie-fu-fu';
const CHARACTER_RENAME_CARD_ITEM_DEF_ID = 'cons-rename-001';
const CHARACTER_RENAME_CARD_DROP_CHANCE = 0.001;
const TECHNIQUE_FRAGMENT_ITEM_DEF_ID = 'mat-gongfa-canye';
const TECHNIQUE_FRAGMENT_DROP_CHANCE = 1;
const TECHNIQUE_FRAGMENT_DROP_QTY_MIN = 15;
const TECHNIQUE_FRAGMENT_DROP_QTY_MAX = 30;

const toNumber = (value: unknown): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return Number.NaN;
};

const createDungeonBossDropContext = (): {
  commonPoolById: Map<string, JsonObject>;
  dropPoolById: Map<string, JsonObject>;
  monsterById: Map<string, JsonObject>;
} => {
  const monsterSeed = loadSeed('monster_def.json');
  const dropPoolSeed = loadSeed('drop_pool.json');
  const commonDropPoolSeed = loadSeed('drop_pool_common.json');

  return {
    monsterById: buildObjectMap(asArray(monsterSeed.monsters), 'id'),
    dropPoolById: buildObjectMap(asArray(dropPoolSeed.pools), 'id'),
    commonPoolById: buildObjectMap(asArray(commonDropPoolSeed.pools), 'id'),
  };
};

const findRequiredCommonPoolEntry = (
  pool: JsonObject | undefined,
  itemDefId: string,
): JsonObject => {
  const entry = asArray(pool?.entries).find((candidate) => {
    return asText(asObject(candidate)?.item_def_id) === itemDefId;
  });
  const entryObject = asObject(entry);
  assert.ok(entryObject, `${DUNGEON_BOSS_FUNCTION_ITEM_POOL_ID} 缺少条目 ${itemDefId}`);
  return entryObject;
};

const assertAllDungeonBossDropPoolsContainItem = (
  itemDefId: string,
  itemLabel: string,
): void => {
  const { commonPoolById, dropPoolById, monsterById } = createDungeonBossDropContext();
  const bossMonsterIds = collectDungeonBossMonsterIds();

  assert.ok(bossMonsterIds.length > 0, '秘境种子中未找到 BOSS monster_def_id');

  for (const monsterId of bossMonsterIds) {
    const monster = monsterById.get(monsterId);
    assert.ok(monster, `monster_def.json 缺少怪物定义: ${monsterId}`);

    const dropPoolId = asText(monster?.drop_pool_id);
    assert.ok(dropPoolId, `${monsterId} 缺少 drop_pool_id`);

    const mergedEntries = collectMergedPoolEntries(dropPoolId, dropPoolById, commonPoolById);
    const hasTargetItem = mergedEntries.some((entry) => asText(asObject(entry)?.item_def_id) === itemDefId);
    assert.equal(hasTargetItem, true, `${monsterId} 的掉落池 ${dropPoolId} 缺少${itemLabel} ${itemDefId}`);
  }
};

test('所有秘境 BOSS 掉落池都应包含解绑道具', () => {
  assertAllDungeonBossDropPoolsContainItem(EQUIPMENT_UNBIND_ITEM_DEF_ID, '解绑道具');
});

test('所有秘境 BOSS 掉落池都应包含易名符', () => {
  assertAllDungeonBossDropPoolsContainItem(CHARACTER_RENAME_CARD_ITEM_DEF_ID, '易名符');
});

test('所有秘境 BOSS 掉落池都应包含功法残页', () => {
  assertAllDungeonBossDropPoolsContainItem(TECHNIQUE_FRAGMENT_ITEM_DEF_ID, '功法残页');
});

test('秘境 BOSS 功能道具通用池中的易名符概率应为千分之一', () => {
  const commonDropPoolSeed = loadSeed('drop_pool_common.json');
  const commonPoolById = buildObjectMap(asArray(commonDropPoolSeed.pools), 'id');
  const functionItemPool = commonPoolById.get(DUNGEON_BOSS_FUNCTION_ITEM_POOL_ID);

  assert.ok(
    functionItemPool,
    `drop_pool_common.json 缺少通用池定义: ${DUNGEON_BOSS_FUNCTION_ITEM_POOL_ID}`,
  );

  const renameCardEntryObject = findRequiredCommonPoolEntry(
    functionItemPool,
    CHARACTER_RENAME_CARD_ITEM_DEF_ID,
  );
  assert.equal(toNumber(renameCardEntryObject?.chance), CHARACTER_RENAME_CARD_DROP_CHANCE);
  assert.equal(toNumber(renameCardEntryObject?.qty_min), 1);
  assert.equal(toNumber(renameCardEntryObject?.qty_max), 1);
});

test('秘境 BOSS 公共池中的功法残页应固定掉落 15~30 个且不配置境界数量倍率', () => {
  const commonDropPoolSeed = loadSeed('drop_pool_common.json');
  const commonPoolById = buildObjectMap(asArray(commonDropPoolSeed.pools), 'id');
  const functionItemPool = commonPoolById.get(DUNGEON_BOSS_FUNCTION_ITEM_POOL_ID);

  assert.ok(
    functionItemPool,
    `drop_pool_common.json 缺少通用池定义: ${DUNGEON_BOSS_FUNCTION_ITEM_POOL_ID}`,
  );

  const techniqueFragmentEntryObject = findRequiredCommonPoolEntry(
    functionItemPool,
    TECHNIQUE_FRAGMENT_ITEM_DEF_ID,
  );
  assert.equal(toNumber(techniqueFragmentEntryObject?.chance), TECHNIQUE_FRAGMENT_DROP_CHANCE);
  assert.equal(toNumber(techniqueFragmentEntryObject?.qty_min), TECHNIQUE_FRAGMENT_DROP_QTY_MIN);
  assert.equal(toNumber(techniqueFragmentEntryObject?.qty_max), TECHNIQUE_FRAGMENT_DROP_QTY_MAX);
  assert.equal(
    Object.prototype.hasOwnProperty.call(techniqueFragmentEntryObject, 'qty_multiply_by_monster_realm'),
    false,
  );
});
