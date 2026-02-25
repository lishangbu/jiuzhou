/**
 * AutoSkillPolicyCodec 属性测试
 *
 * 作用：
 *   验证 AutoSkillPolicyCodec 的三个核心属性：
 *   - 属性 14：序列化往返（serialize → parse → serialize 结果一致）
 *   - 属性 15：非法策略解析返回字段路径错误
 *   - 属性 2：技能槽位数量限制（最多 6 个）
 *
 * 输入/输出：
 *   - 使用 node:test + node:assert 实现，循环随机输入模拟属性测试
 *   - 不依赖 fast-check（项目未安装）
 *
 * 数据流：
 *   随机生成 AutoSkillPolicy → serializeAutoSkillPolicy → parseAutoSkillPolicy → 验证往返一致性
 *
 * 关键边界条件：
 *   1. slots 为空数组时往返属性仍应成立
 *   2. priority 为负数、小数、极大值时均应正常序列化/解析
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  serializeAutoSkillPolicy,
  parseAutoSkillPolicy,
  validateAutoSkillPolicy,
} from '../idle/autoSkillPolicyCodec.js';
import type { AutoSkillPolicy, AutoSkillSlot } from '../idle/types.js';

// ============================================
// 随机数据生成工具
// ============================================

/** 生成随机非空字符串（模拟 skillId） */
function randomSkillId(rng: () => number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789-_';
  const len = Math.floor(rng() * 20) + 1;
  let result = '';
  for (let i = 0; i < len; i++) {
    result += chars[Math.floor(rng() * chars.length)];
  }
  return result;
}

/** 生成随机有限数字（模拟 priority，含负数、小数、极大值） */
function randomPriority(rng: () => number): number {
  const variants = [
    () => Math.floor(rng() * 100),           // 正整数
    () => -Math.floor(rng() * 100),          // 负整数
    () => rng() * 200 - 100,                 // 小数
    () => Number.MAX_SAFE_INTEGER,           // 极大值
    () => Number.MIN_SAFE_INTEGER,           // 极小值
    () => 0,                                 // 零
  ];
  return variants[Math.floor(rng() * variants.length)]!();
}

/** 生成随机合法 AutoSkillPolicy（slots 数量 0~6） */
function randomValidPolicy(rng: () => number): AutoSkillPolicy {
  const slotCount = Math.floor(rng() * 7); // 0~6
  const slots: AutoSkillSlot[] = [];
  for (let i = 0; i < slotCount; i++) {
    slots.push({
      skillId: randomSkillId(rng),
      priority: randomPriority(rng),
    });
  }
  return { slots };
}

/**
 * 简单线性同余随机数生成器（可复现，便于调试失败用例）
 * 返回 [0, 1) 范围的伪随机数
 */
function makeLcgRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// ============================================
// 属性 14：AutoSkillPolicy 序列化往返
// Feature: offline-idle-battle, Property 14: AutoSkillPolicy 序列化往返
// ============================================

test('属性 14：AutoSkillPolicy 序列化往返（numRuns: 200）', () => {
  // Feature: offline-idle-battle, Property 14: AutoSkillPolicy 序列化往返
  // 验证：需求 8.1, 8.2, 8.3, 8.4
  // 属性：对任意合法 AutoSkillPolicy p，
  //   parseAutoSkillPolicy(serializeAutoSkillPolicy(p)) 必须成功，
  //   且 serializeAutoSkillPolicy(result.value) === serializeAutoSkillPolicy(p)

  const numRuns = 200;
  let failCount = 0;
  const failures: string[] = [];

  for (let run = 0; run < numRuns; run++) {
    const rng = makeLcgRng(run * 31337 + 42);
    const policy = randomValidPolicy(rng);

    const serialized = serializeAutoSkillPolicy(policy);
    const parsed = parseAutoSkillPolicy(serialized);

    if (!parsed.success) {
      failCount++;
      if (failures.length < 3) {
        failures.push(
          `run=${run}: parseAutoSkillPolicy 失败，policy=${JSON.stringify(policy)}, errors=${JSON.stringify(parsed.errors)}`
        );
      }
      continue;
    }

    // 往返一致性：再次序列化结果应与原始序列化相同
    const reSerialized = serializeAutoSkillPolicy(parsed.value);
    if (reSerialized !== serialized) {
      failCount++;
      if (failures.length < 3) {
        failures.push(
          `run=${run}: 往返不一致，original=${serialized}, re-serialized=${reSerialized}`
        );
      }
    }
  }

  assert.equal(
    failCount,
    0,
    `属性 14 失败 ${failCount}/${numRuns} 次。前几个失败用例：\n${failures.join('\n')}`
  );
});

// ============================================
// 属性 15：非法策略解析返回字段路径错误
// Feature: offline-idle-battle, Property 15: 非法策略解析返回字段路径错误
// ============================================

test('属性 15：非法策略解析返回字段路径错误（numRuns: 100）', () => {
  // Feature: offline-idle-battle, Property 15: 非法策略解析返回字段路径错误
  // 验证：需求 8.5
  // 属性：对任意非法输入，validateAutoSkillPolicy 必须返回 success=false，
  //   且每个 FieldError.path 必须是非空字符串（字段路径级别）

  const numRuns = 100;
  let failCount = 0;
  const failures: string[] = [];

  // 非法输入生成器列表
  const invalidInputGenerators: Array<(rng: () => number) => unknown> = [
    // 非对象类型
    () => null,
    () => undefined,
    () => 42,
    () => 'string',
    () => true,
    () => [],
    // slots 不是数组
    () => ({ slots: null }),
    () => ({ slots: 'not-array' }),
    () => ({ slots: 42 }),
    // slots 超出 6 个
    (rng) => ({
      slots: Array.from({ length: Math.floor(rng() * 10) + 7 }, (_, i) => ({
        skillId: `skill-${i}`,
        priority: i,
      })),
    }),
    // 槽位 skillId 非法
    () => ({ slots: [{ skillId: '', priority: 1 }] }),
    () => ({ slots: [{ skillId: 123, priority: 1 }] }),
    () => ({ slots: [{ skillId: null, priority: 1 }] }),
    // 槽位 priority 非法
    () => ({ slots: [{ skillId: 'skill-1', priority: NaN }] }),
    () => ({ slots: [{ skillId: 'skill-1', priority: Infinity }] }),
    () => ({ slots: [{ skillId: 'skill-1', priority: 'high' }] }),
    // 槽位本身不是对象
    () => ({ slots: [null] }),
    () => ({ slots: [42] }),
    () => ({ slots: ['string'] }),
    // 混合非法
    (rng) => ({
      slots: [
        { skillId: '', priority: rng() * 10 },
        { skillId: 'valid', priority: NaN },
      ],
    }),
  ];

  for (let run = 0; run < numRuns; run++) {
    const rng = makeLcgRng(run * 7919 + 13);
    const genIdx = run % invalidInputGenerators.length;
    const input = invalidInputGenerators[genIdx]!(rng);

    const result = validateAutoSkillPolicy(input);

    if (result.success) {
      failCount++;
      if (failures.length < 3) {
        failures.push(
          `run=${run}: 非法输入应返回 success=false，但返回了 success=true，input=${JSON.stringify(input)}`
        );
      }
      continue;
    }

    // 每个 FieldError.path 必须是非空字符串
    const emptyPathErrors = result.errors.filter((e) => typeof e.path !== 'string' || e.path === '');
    // 注意：JSON 解析失败时 path="" 是合法的（区分字段路径错误与 JSON 格式错误）
    // 这里测试的是 validateAutoSkillPolicy（非 parseAutoSkillPolicy），所以 path 不应为空
    if (emptyPathErrors.length > 0) {
      failCount++;
      if (failures.length < 3) {
        failures.push(
          `run=${run}: FieldError.path 不应为空字符串，errors=${JSON.stringify(result.errors)}, input=${JSON.stringify(input)}`
        );
      }
    }

    // errors 列表不应为空
    if (result.errors.length === 0) {
      failCount++;
      if (failures.length < 3) {
        failures.push(
          `run=${run}: success=false 时 errors 不应为空，input=${JSON.stringify(input)}`
        );
      }
    }
  }

  assert.equal(
    failCount,
    0,
    `属性 15 失败 ${failCount}/${numRuns} 次。前几个失败用例：\n${failures.join('\n')}`
  );
});

// ============================================
// 属性 2：技能槽位数量限制
// Feature: offline-idle-battle, Property 2: 技能槽位数量限制
// ============================================

test('属性 2：技能槽位数量限制（numRuns: 100）', () => {
  // Feature: offline-idle-battle, Property 2: 技能槽位数量限制
  // 验证：需求 1.3
  // 属性：slots.length > 6 时 validateAutoSkillPolicy 必须返回 success=false，
  //   且 errors 中包含 path="slots" 的错误；
  //   slots.length <= 6 时（其他字段合法）必须返回 success=true

  const numRuns = 100;
  let failCount = 0;
  const failures: string[] = [];

  for (let run = 0; run < numRuns; run++) {
    const rng = makeLcgRng(run * 2654435761 + 1);

    // 测试超出限制的情况（7~20 个槽位）
    const overCount = Math.floor(rng() * 14) + 7;
    const overSlots = Array.from({ length: overCount }, (_, i) => ({
      skillId: `skill-${i}`,
      priority: i,
    }));
    const overResult = validateAutoSkillPolicy({ slots: overSlots });

    if (overResult.success) {
      failCount++;
      if (failures.length < 3) {
        failures.push(
          `run=${run}: slots.length=${overCount} 应返回 success=false，但返回了 success=true`
        );
      }
    } else {
      const hasSlotsError = overResult.errors.some((e) => e.path === 'slots');
      if (!hasSlotsError) {
        failCount++;
        if (failures.length < 3) {
          failures.push(
            `run=${run}: slots 超出限制时应有 path="slots" 的错误，实际 errors=${JSON.stringify(overResult.errors)}`
          );
        }
      }
    }

    // 测试合法数量（0~6 个槽位，所有字段合法）
    const validCount = Math.floor(rng() * 7); // 0~6
    const validSlots = Array.from({ length: validCount }, (_, i) => ({
      skillId: `skill-${i}`,
      priority: i,
    }));
    const validResult = validateAutoSkillPolicy({ slots: validSlots });

    if (!validResult.success) {
      failCount++;
      if (failures.length < 3) {
        failures.push(
          `run=${run}: slots.length=${validCount} 应返回 success=true，但返回了 success=false，errors=${JSON.stringify(validResult.errors)}`
        );
      }
    }
  }

  assert.equal(
    failCount,
    0,
    `属性 2 失败 ${failCount}/${numRuns} 次。前几个失败用例：\n${failures.join('\n')}`
  );
});

// ============================================
// 边界条件：parseAutoSkillPolicy JSON 格式错误
// ============================================

test('parseAutoSkillPolicy：JSON 格式错误时返回 path="" 的错误', () => {
  const invalidJsonInputs = [
    '',
    '{',
    'not json',
    '{"slots": [}',
    'undefined',
  ];

  for (const input of invalidJsonInputs) {
    const result = parseAutoSkillPolicy(input);
    assert.equal(result.success, false, `输入 "${input}" 应返回 success=false`);
    if (!result.success) {
      const hasEmptyPathError = result.errors.some((e) => e.path === '');
      assert.ok(
        hasEmptyPathError,
        `JSON 格式错误时应有 path="" 的错误，实际 errors=${JSON.stringify(result.errors)}`
      );
    }
  }
});

// ============================================
// 边界条件：空 slots 数组
// ============================================

test('空 slots 数组的往返属性', () => {
  const policy: AutoSkillPolicy = { slots: [] };
  const serialized = serializeAutoSkillPolicy(policy);
  const parsed = parseAutoSkillPolicy(serialized);

  assert.ok(parsed.success, `空 slots 应解析成功，errors=${JSON.stringify(!parsed.success ? parsed.errors : [])}`);
  if (parsed.success) {
    assert.deepEqual(parsed.value.slots, []);
    assert.equal(serializeAutoSkillPolicy(parsed.value), serialized);
  }
});
