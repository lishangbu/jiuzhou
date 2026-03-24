import assert from 'node:assert/strict';
import test from 'node:test';
import {
  acquireUserConnectionSlot,
  getActiveUserConnectionSlotCount,
  resetUserConnectionSlotsForTest,
  waitForUserConnectionSlot,
} from '../../shared/userConnectionSlots.js';

/**
 * 用户入口并发槽位测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁住“同一用户并发占位上限”的核心语义，避免 HTTP 与 Socket 入口以后各自改坏。
 * 2. 做什么：验证重复占位幂等、释放后可重入、不同入口互不串扰这三类最容易回归的边界。
 * 3. 不做什么：不连接 Redis/数据库，不验证 Express 或 Socket.io 框架集成。
 *
 * 输入/输出：
 * - 输入：用户 ID、入口 channel、slotId、并发上限。
 * - 输出：是否成功占位，以及当前 channel 下的占位数量。
 *
 * 数据流/状态流：
 * 测试构造占位请求 -> 调用 acquire/release -> 断言模块内部计数变化是否符合预期。
 *
 * 关键边界条件与坑点：
 * 1. 同一个 slotId 重复 acquire 不能重复计数，否则同一请求重入会把自己误判成攻击流量。
 * 2. 超限请求必须按 FIFO 进入等待队列，前序释放后才能被唤醒，避免后来的请求插队。
 * 3. 不同 channel 必须完全隔离，否则 HTTP 高并发会误伤 Socket 认证。
 */

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

test('acquireUserConnectionSlot: 同一用户超过上限时应拒绝新的占位', () => {
  resetUserConnectionSlotsForTest();

  const firstLease = acquireUserConnectionSlot({
    channel: 'http-request',
    userId: 1001,
    slotId: 'req-1',
    limit: 2,
  });
  const secondLease = acquireUserConnectionSlot({
    channel: 'http-request',
    userId: 1001,
    slotId: 'req-2',
    limit: 2,
  });
  const rejectedLease = acquireUserConnectionSlot({
    channel: 'http-request',
    userId: 1001,
    slotId: 'req-3',
    limit: 2,
  });

  assert.notEqual(firstLease, null);
  assert.notEqual(secondLease, null);
  assert.equal(rejectedLease, null);
  assert.equal(getActiveUserConnectionSlotCount('http-request', 1001), 2);
});

test('acquireUserConnectionSlot: 同一 slotId 重复占位应保持幂等', () => {
  resetUserConnectionSlotsForTest();

  const firstLease = acquireUserConnectionSlot({
    channel: 'game-auth',
    userId: 2002,
    slotId: 'socket-1',
    limit: 1,
  });
  const repeatedLease = acquireUserConnectionSlot({
    channel: 'game-auth',
    userId: 2002,
    slotId: 'socket-1',
    limit: 1,
  });

  assert.notEqual(firstLease, null);
  assert.notEqual(repeatedLease, null);
  assert.equal(getActiveUserConnectionSlotCount('game-auth', 2002), 1);
});

test('acquireUserConnectionSlot: 释放后应允许新的占位进入', () => {
  resetUserConnectionSlotsForTest();

  const firstLease = acquireUserConnectionSlot({
    channel: 'http-request',
    userId: 3003,
    slotId: 'req-1',
    limit: 1,
  });
  assert.ok(firstLease);

  firstLease.release();

  const secondLease = acquireUserConnectionSlot({
    channel: 'http-request',
    userId: 3003,
    slotId: 'req-2',
    limit: 1,
  });

  assert.notEqual(secondLease, null);
  assert.equal(getActiveUserConnectionSlotCount('http-request', 3003), 1);
});

test('acquireUserConnectionSlot: 不同 channel 的占位应彼此隔离', () => {
  resetUserConnectionSlotsForTest();

  const httpLease = acquireUserConnectionSlot({
    channel: 'http-request',
    userId: 4004,
    slotId: 'req-1',
    limit: 1,
  });
  const socketLease = acquireUserConnectionSlot({
    channel: 'game-auth',
    userId: 4004,
    slotId: 'socket-1',
    limit: 1,
  });

  assert.notEqual(httpLease, null);
  assert.notEqual(socketLease, null);
  assert.equal(getActiveUserConnectionSlotCount('http-request', 4004), 1);
  assert.equal(getActiveUserConnectionSlotCount('game-auth', 4004), 1);
});

test('waitForUserConnectionSlot: 前序释放后应按顺序唤醒队首请求', async () => {
  resetUserConnectionSlotsForTest();

  const firstLease = acquireUserConnectionSlot({
    channel: 'http-request',
    userId: 5005,
    slotId: 'req-1',
    limit: 1,
  });
  assert.ok(firstLease);

  let secondGranted = false;
  const secondLeasePromise = waitForUserConnectionSlot({
    channel: 'http-request',
    userId: 5005,
    slotId: 'req-2',
    limit: 1,
    waitMs: 100,
  }).then((lease) => {
    assert.ok(lease);
    secondGranted = true;
    lease.release();
  });

  await sleep(20);
  assert.equal(secondGranted, false);

  firstLease.release();
  await secondLeasePromise;
  assert.equal(getActiveUserConnectionSlotCount('http-request', 5005), 0);
});

test('waitForUserConnectionSlot: 超过等待时间后应返回 null', async () => {
  resetUserConnectionSlotsForTest();

  const firstLease = acquireUserConnectionSlot({
    channel: 'game-auth',
    userId: 6006,
    slotId: 'socket-1',
    limit: 1,
  });
  assert.ok(firstLease);

  const waitedLease = await waitForUserConnectionSlot({
    channel: 'game-auth',
    userId: 6006,
    slotId: 'socket-2',
    limit: 1,
    waitMs: 20,
  });

  assert.equal(waitedLease, null);
  firstLease.release();
});

test('waitForUserConnectionSlot: 进入排队时应记录统一日志', async () => {
  resetUserConnectionSlotsForTest();

  const firstLease = acquireUserConnectionSlot({
    channel: 'http-request',
    userId: 7007,
    slotId: 'req-1',
    limit: 1,
  });
  assert.ok(firstLease);

  const loggedMessages: unknown[][] = [];
  const originalConsoleInfo = console.info;
  console.info = (...args: unknown[]): void => {
    loggedMessages.push(args);
  };

  try {
    const waitingLeasePromise = waitForUserConnectionSlot({
      channel: 'http-request',
      userId: 7007,
      slotId: 'req-2',
      limit: 1,
      waitMs: 100,
    });

    assert.equal(loggedMessages.length, 1);
    assert.equal(loggedMessages[0]?.[0], '[UserConnectionSlots] 用户进入排队');
    assert.deepEqual(loggedMessages[0]?.[1], {
      channel: 'http-request',
      userId: 7007,
      activeCount: 1,
      queuedCount: 1,
      limit: 1,
      waitMs: 100,
      slotId: 'req-2',
    });

    firstLease.release();
    const waitingLease = await waitingLeasePromise;
    assert.ok(waitingLease);
    waitingLease.release();
  } finally {
    console.info = originalConsoleInfo;
  }
});
