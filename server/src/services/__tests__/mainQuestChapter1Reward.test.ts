/**
 * 第一章第七节主线奖励测试
 *
 * 作用（做什么 / 不做什么）：
 * - 做什么：验证第一章第 7 节「狼王之战」完成后会发放《清风剑法》功法书，锁定新手阶段这条主线奖励配置。
 * - 不做什么：不执行真实任务提交流程，也不验证经验、银两等其他奖励平衡。
 *
 * 输入/输出：
 * - 输入：第一章主线种子与物品定义种子。
 * - 输出：断言 `main-1-007` 的 `rewards.items` 中存在 `book-qingfeng-jian`，且数量为 1。
 *
 * 数据流/状态流：
 * - 先从主线章节种子中按 section id 找到第一章第 7 节；
 * - 再从奖励配置里抽取物品奖励列表；
 * - 最后结合物品定义确认目标奖励确实对应《清风剑法》。
 *
 * 关键边界条件与坑点：
 * 1) 主线奖励发放链路读取的是 `rewards.items[].item_def_id + quantity`，测试必须直接锁定这组字段，避免改到无效字段名仍误以为生效。
 * 2) 这里只校验新增的功法书奖励，不重复断言已有箱子和材料，避免测试和其他奖励调优过度耦合。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  asArray,
  asObject,
  asText,
  buildObjectMap,
  loadSeed,
} from './seedTestUtils.js';

const TARGET_SECTION_ID = 'main-1-007';
const TARGET_ITEM_ID = 'book-qingfeng-jian';
const TARGET_ITEM_NAME = '《清风剑法》';

test('第一章第7节主线奖励应包含清风剑法功法书', () => {
  const mainQuestSeed = loadSeed('main_quest_chapter1.json');
  const itemSeed = loadSeed('item_def.json');

  const sectionById = buildObjectMap(asArray(mainQuestSeed.sections), 'id');
  const itemById = buildObjectMap(asArray(itemSeed.items), 'id');

  const section = sectionById.get(TARGET_SECTION_ID);
  assert.ok(section, `缺少主线任务节定义: ${TARGET_SECTION_ID}`);

  const rewardEntries = asArray(asObject(section.rewards)?.items);
  const rewardEntry = rewardEntries.find((entry) => asText(asObject(entry)?.item_def_id) === TARGET_ITEM_ID);
  assert.ok(rewardEntry, `${TARGET_SECTION_ID} 未配置奖励物品: ${TARGET_ITEM_ID}`);

  const rewardObject = asObject(rewardEntry);
  assert.ok(rewardObject, `${TARGET_SECTION_ID} 奖励物品结构异常: ${TARGET_ITEM_ID}`);
  assert.equal(Number(rewardObject.quantity), 1, `${TARGET_SECTION_ID} 的 ${TARGET_ITEM_ID} 奖励数量应为 1`);

  const itemDef = itemById.get(TARGET_ITEM_ID);
  assert.ok(itemDef, `缺少物品定义: ${TARGET_ITEM_ID}`);
  assert.equal(asText(itemDef.name), TARGET_ITEM_NAME, `${TARGET_ITEM_ID} 物品名称与预期不一致`);
});
