/**
 * 离线挂机奖励汇总正确性 — 属性测试（属性 11）
 *
 * 作用：
 *   验证 idle_sessions 的汇总字段（total_exp、total_silver）等于
 *   所有胜利 batch 的 expGained / silverGained 之和。
 *
 * 输入/输出：
 *   - 不依赖数据库，全部使用内存对象构造测试数据
 *   - 每个属性独立测试，互不干扰
 *
 * 数据流：
 *   随机生成 batch 列表 → 计算期望汇总 → 与模拟汇总函数结果对比
 *
 * 关键边界条件：
 *   1. 只有 result='attacker_win' 的 batch 才计入 exp/silver 汇总
 */

import test from 'node:test';
import assert from 'node:assert/strict';
// ============================================
// 随机数生成工具
// ============================================

function makeLcgRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// ============================================
// 测试数据类型
// ============================================

interface BatchSummary {
  result: 'attacker_win' | 'defender_win' | 'draw';
  expGained: number;
  silverGained: number;
}

/**
 * 模拟 updateSessionSummary 的汇总逻辑（纯函数部分）
 * 复用点：与 idleSessionService.updateSessionSummary 保持一致
 */
function computeSessionSummary(batches: BatchSummary[]): {
  totalExp: number;
  totalSilver: number;
  winCount: number;
  loseCount: number;
  totalBattles: number;
} {
  let totalExp = 0;
  let totalSilver = 0;
  let winCount = 0;
  let loseCount = 0;

  for (const batch of batches) {
    // 只有胜利时才累加 exp/silver（与 executeSingleBatch 保证一致）
    if (batch.result === 'attacker_win') {
      totalExp += batch.expGained;
      totalSilver += batch.silverGained;
      winCount++;
    } else {
      loseCount++;
    }
  }

  return {
    totalExp,
    totalSilver,
    winCount,
    loseCount,
    totalBattles: batches.length,
  };
}

// ============================================
// 属性 11：奖励汇总正确性
// Feature: offline-idle-battle, Property 11: 奖励汇总正确性
// ============================================

test('属性 11：奖励汇总正确性 — total_exp/total_silver 等于所有胜利 batch 之和（numRuns: 100）', () => {
  // Feature: offline-idle-battle, Property 11: 奖励汇总正确性
  // 验证：需求 4.1, 4.5
  // 属性：
  //   1. total_exp = sum(batch.expGained for batch where result='attacker_win')
  //   2. total_silver = sum(batch.silverGained for batch where result='attacker_win')
  //   3. winCount = count(batch where result='attacker_win')
  //   4. loseCount = count(batch where result != 'attacker_win')
  //   5. totalBattles = winCount + loseCount

  const numRuns = 100;
  let failCount = 0;
  const failures: string[] = [];

  const rng = makeLcgRng(99991);

  for (let run = 0; run < numRuns; run++) {
    // 随机生成 1~20 场 batch
    const batchCount = Math.floor(rng() * 20) + 1;
    const batches: BatchSummary[] = [];

    let expectedTotalExp = 0;
    let expectedTotalSilver = 0;
    let expectedWinCount = 0;
    let expectedLoseCount = 0;

    for (let i = 0; i < batchCount; i++) {
      const roll = rng();
      const result: BatchSummary['result'] =
        roll < 0.6 ? 'attacker_win' : roll < 0.9 ? 'defender_win' : 'draw';

      // 战败/平局时 exp/silver 为 0（由 executeSingleBatch 保证）
      const expGained = result === 'attacker_win' ? Math.floor(rng() * 500) + 1 : 0;
      const silverGained = result === 'attacker_win' ? Math.floor(rng() * 200) + 1 : 0;

      batches.push({ result, expGained, silverGained });

      if (result === 'attacker_win') {
        expectedTotalExp += expGained;
        expectedTotalSilver += silverGained;
        expectedWinCount++;
      } else {
        expectedLoseCount++;
      }
    }

    const summary = computeSessionSummary(batches);

    if (summary.totalExp !== expectedTotalExp) {
      failCount++;
      if (failures.length < 3) {
        failures.push(
          `run=${run}: totalExp 期望=${expectedTotalExp}，实际=${summary.totalExp}`
        );
      }
    }

    if (summary.totalSilver !== expectedTotalSilver) {
      failCount++;
      if (failures.length < 3) {
        failures.push(
          `run=${run}: totalSilver 期望=${expectedTotalSilver}，实际=${summary.totalSilver}`
        );
      }
    }

    if (summary.winCount !== expectedWinCount) {
      failCount++;
      if (failures.length < 3) {
        failures.push(
          `run=${run}: winCount 期望=${expectedWinCount}，实际=${summary.winCount}`
        );
      }
    }

    if (summary.loseCount !== expectedLoseCount) {
      failCount++;
      if (failures.length < 3) {
        failures.push(
          `run=${run}: loseCount 期望=${expectedLoseCount}，实际=${summary.loseCount}`
        );
      }
    }

    if (summary.totalBattles !== batchCount) {
      failCount++;
      if (failures.length < 3) {
        failures.push(
          `run=${run}: totalBattles 期望=${batchCount}，实际=${summary.totalBattles}`
        );
      }
    }
  }

  assert.equal(
    failCount,
    0,
    `属性 11 失败 ${failCount}/${numRuns} 次。前几个失败用例：\n${failures.join('\n')}`
  );
});

test('属性 11 边界：空 batch 列表时汇总全为零', () => {
  const summary = computeSessionSummary([]);
  assert.equal(summary.totalExp, 0, '空 batch 列表时 totalExp 应为 0');
  assert.equal(summary.totalSilver, 0, '空 batch 列表时 totalSilver 应为 0');
  assert.equal(summary.winCount, 0, '空 batch 列表时 winCount 应为 0');
  assert.equal(summary.totalBattles, 0, '空 batch 列表时 totalBattles 应为 0');
});

test('属性 11 边界：全部战败时 exp/silver 为零', () => {
  const batches: BatchSummary[] = [
    { result: 'defender_win', expGained: 0, silverGained: 0 },
    { result: 'defender_win', expGained: 0, silverGained: 0 },
    { result: 'draw', expGained: 0, silverGained: 0 },
  ];
  const summary = computeSessionSummary(batches);
  assert.equal(summary.totalExp, 0, '全部战败时 totalExp 应为 0');
  assert.equal(summary.totalSilver, 0, '全部战败时 totalSilver 应为 0');
  assert.equal(summary.winCount, 0, '全部战败时 winCount 应为 0');
  assert.equal(summary.loseCount, 3, '全部战败时 loseCount 应为 3');
});
