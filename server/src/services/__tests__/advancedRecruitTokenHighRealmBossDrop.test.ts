/**
 * 结胎期及以上秘境最终 BOSS 高级招募令掉落测试
 *
 * 作用（做什么 / 不做什么）：
 * - 做什么：锁定“高级招募令”从结胎期开始接入秘境最终 BOSS 掉落，避免只改部分高境界掉落池。
 * - 做什么：验证这次改动通过单一公共池复用，避免把相同条目散写进多个 BOSS 专属池。
 * - 不做什么：不执行真实战斗掉落结算，也不改动结胎期之前的秘境 BOSS 掉落范围。
 *
 * 输入/输出：
 * - 输入：drop_pool / drop_pool_common 两类种子数据。
 * - 输出：结胎期及以上最终 BOSS 的合并掉落断言、结胎前边界断言，以及公共池中高级招募令概率断言。
 *
 * 数据流/状态流：
 * - 先从公共掉落池读取“高级招募令”专用复用池；
 * - 再把结胎期及以上的最终 BOSS 掉落池与公共池合并；
 * - 最后同时校验目标范围已接入、结胎前范围未接入，并锁定千分之一概率。
 *
 * 关键边界条件与坑点：
 * 1) 这次需求限定的是“结胎期开始的最终 BOSS”，不能直接把条目塞进所有秘境 BOSS 公共池，否则会误伤结胎前内容。
 * 2) 高级招募令来自公共池复用链路，断言必须验证“合并后可掉落”和“公共池概率值”两层，否则容易只修一半。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  asArray,
  asObject,
  asText,
  buildObjectMap,
  collectMergedPoolEntries,
  loadSeed,
  type JsonObject,
  type JsonValue,
} from './seedTestUtils.js';

const ADVANCED_RECRUIT_TOKEN_ITEM_DEF_ID = 'token-004';
const ADVANCED_RECRUIT_TOKEN_DROP_CHANCE = 0.001;
const HIGH_REALM_RECRUIT_TOKEN_POOL_ID = 'dp-common-dungeon-boss-advanced-recruit-token';
const PRE_JIETAI_FINAL_BOSS_DROP_POOL_ID = 'dp-caiyao-boss-fetus-beast-high';
const HIGH_REALM_FINAL_BOSS_DROP_POOL_IDS = [
  'dp-jietai-boss-shentai-avatar',
  'dp-yangshen-boss-xuling-lord',
  'dp-huanxu-boss-guixu-lord',
  'dp-hedao-boss-xuanjian-zhenjun',
] as const;

const toNumber = (value: JsonValue | undefined): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return Number.NaN;
};

const createDropPoolContext = (): {
  commonPoolById: Map<string, JsonObject>;
  dropPoolById: Map<string, JsonObject>;
} => {
  const dropPoolSeed = loadSeed('drop_pool.json');
  const commonDropPoolSeed = loadSeed('drop_pool_common.json');

  return {
    dropPoolById: buildObjectMap(asArray(dropPoolSeed.pools), 'id'),
    commonPoolById: buildObjectMap(asArray(commonDropPoolSeed.pools), 'id'),
  };
};

const assertPoolContainsAdvancedRecruitToken = (
  poolId: string,
  expected: boolean,
): void => {
  const { commonPoolById, dropPoolById } = createDropPoolContext();
  const mergedEntries = collectMergedPoolEntries(poolId, dropPoolById, commonPoolById);
  const hasAdvancedRecruitToken = mergedEntries.some((entry) => {
    return asText(asObject(entry)?.item_def_id) === ADVANCED_RECRUIT_TOKEN_ITEM_DEF_ID;
  });

  assert.equal(
    hasAdvancedRecruitToken,
    expected,
    `${poolId} ${expected ? '缺少' : '不应包含'}高级招募令掉落 ${ADVANCED_RECRUIT_TOKEN_ITEM_DEF_ID}`,
  );
};

test('结胎期及以上最终 BOSS 掉落池合并后应包含高级招募令', () => {
  for (const poolId of HIGH_REALM_FINAL_BOSS_DROP_POOL_IDS) {
    assertPoolContainsAdvancedRecruitToken(poolId, true);
  }
});

test('结胎期之前的最终 BOSS 掉落池不应包含高级招募令', () => {
  assertPoolContainsAdvancedRecruitToken(PRE_JIETAI_FINAL_BOSS_DROP_POOL_ID, false);
});

test('结胎期及以上秘境最终 BOSS 高级招募令公共池概率应为千分之一', () => {
  const commonDropPoolSeed = loadSeed('drop_pool_common.json');
  const commonPoolById = buildObjectMap(asArray(commonDropPoolSeed.pools), 'id');
  const recruitTokenPool = commonPoolById.get(HIGH_REALM_RECRUIT_TOKEN_POOL_ID);

  assert.ok(recruitTokenPool, `drop_pool_common.json 缺少公共池定义: ${HIGH_REALM_RECRUIT_TOKEN_POOL_ID}`);

  const recruitTokenEntry = asArray(recruitTokenPool?.entries).find((entry) => {
    return asText(asObject(entry)?.item_def_id) === ADVANCED_RECRUIT_TOKEN_ITEM_DEF_ID;
  });
  const recruitTokenEntryObject = asObject(recruitTokenEntry);

  assert.ok(
    recruitTokenEntryObject,
    `${HIGH_REALM_RECRUIT_TOKEN_POOL_ID} 缺少高级招募令条目 ${ADVANCED_RECRUIT_TOKEN_ITEM_DEF_ID}`,
  );
  assert.equal(toNumber(recruitTokenEntryObject?.chance), ADVANCED_RECRUIT_TOKEN_DROP_CHANCE);
  assert.equal(toNumber(recruitTokenEntryObject?.qty_min), 1);
  assert.equal(toNumber(recruitTokenEntryObject?.qty_max), 1);
});
