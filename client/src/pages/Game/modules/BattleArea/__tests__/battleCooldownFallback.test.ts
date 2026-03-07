import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATTLE_COOLDOWN_FALLBACK_GRACE_MS,
  createBattleCooldownFallbackController,
  resolveBattleCooldownFallbackDelay,
} from '../battleCooldownFallback';

test('resolveBattleCooldownFallbackDelay: 冷却结束时间已过时，立即返回 0', () => {
  const now = 10_000;

  assert.equal(resolveBattleCooldownFallbackDelay(9_999, now), 0);
  assert.equal(resolveBattleCooldownFallbackDelay(10_000, now), 0);
});

test('resolveBattleCooldownFallbackDelay: 冷却未结束时，返回剩余毫秒数', () => {
  const now = 10_000;

  assert.equal(
    resolveBattleCooldownFallbackDelay(10_350, now),
    350 + BATTLE_COOLDOWN_FALLBACK_GRACE_MS,
  );
});

test('createBattleCooldownFallbackController: 会按最近一次 nextBattleAvailableAt 重新调度', async () => {
  const scheduled: Array<{ delayMs: number; fn: () => void }> = [];
  const cleared: number[] = [];
  let nextTimerId = 1;
  let fireCount = 0;

  const controller = createBattleCooldownFallbackController({
    now: () => 10_000,
    setTimer: (fn, delayMs) => {
      scheduled.push({ fn, delayMs });
      return nextTimerId++;
    },
    clearTimer: (timerId) => {
      cleared.push(timerId);
    },
    onReady: () => {
      fireCount += 1;
    },
  });

  controller.schedule(10_500);
  controller.schedule(10_100);

  assert.deepEqual(
    scheduled.map((entry) => entry.delayMs),
    [
      500 + BATTLE_COOLDOWN_FALLBACK_GRACE_MS,
      100 + BATTLE_COOLDOWN_FALLBACK_GRACE_MS,
    ],
    '应按最新冷却时间重排定时器',
  );
  assert.deepEqual(cleared, [1], '重新调度前应先清理旧定时器');

  scheduled[1]?.fn();
  assert.equal(fireCount, 1, '最新定时器触发后应执行一次 onReady');

  controller.clear();
  assert.deepEqual(cleared, [1], '最新定时器已触发时，clear 不应重复清理');
});

test('createBattleCooldownFallbackController: clear 可取消尚未触发的本地兜底定时器', () => {
  const cleared: number[] = [];

  const controller = createBattleCooldownFallbackController({
    now: () => 20_000,
    setTimer: () => 7,
    clearTimer: (timerId) => {
      cleared.push(timerId);
    },
    onReady: () => {
      throw new Error('clear 后不应触发 onReady');
    },
  });

  controller.schedule(21_000);
  controller.clear();
  controller.clear();

  assert.deepEqual(cleared, [7], '重复 clear 应保持幂等');
});
