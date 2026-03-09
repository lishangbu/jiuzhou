/**
 * 功法被动属性白名单测试
 *
 * 作用（做什么 / 不做什么）：
 * 1) 做什么：验证新增的暴伤减免被动键已经进入功法白名单与类型推荐池，避免战斗层支持了但功法侧仍被拦截。
 * 2) 不做什么：不测试 AI 调用，不覆盖完整 prompt 文本，仅锁定共享约束常量。
 *
 * 输入/输出：
 * - 输入：功法被动白名单查询函数与武技默认被动池。
 * - 输出：布尔断言，确认 `jianbaoshang` 可被识别并可作为武技被动推荐项。
 *
 * 数据流/状态流：
 * - 战斗/角色属性新增 `jianbaoshang` -> techniqueGenerationConstraints 汇总支持集合 -> AI 生成功法与运行时校验共用。
 *
 * 关键边界条件与坑点：
 * 1) 只改 `TECHNIQUE_PASSIVE_KEY_MEANING_MAP` 而漏改推荐池时，生成结果会偏离设计方向，本测试会直接拦住。
 * 2) 只改推荐池而漏改白名单时，功法生成结果会在校验阶段被拒绝，本测试同样会覆盖。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TECHNIQUE_PASSIVE_KEY_POOL_BY_TYPE,
  isSupportedTechniquePassiveKey,
} from '../shared/techniqueGenerationConstraints.js';

test('暴伤减免应被识别为受支持的功法被动属性', () => {
  assert.equal(isSupportedTechniquePassiveKey('jianbaoshang'), true);
});

test('武技默认被动池应允许推荐暴伤减免属性', () => {
  const hasCritDamageReductionPassive = TECHNIQUE_PASSIVE_KEY_POOL_BY_TYPE.武技.some(
    (entry) => entry.key === 'jianbaoshang' && entry.mode === 'percent',
  );

  assert.equal(hasCritDamageReductionPassive, true);
});
