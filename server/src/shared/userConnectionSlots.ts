/**
 * 用户入口并发槽位管理
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中维护“同一用户在不同入口当前占用的并发槽位”，供 HTTP 鉴权层与 Socket 认证层复用。
 * 2. 做什么：把“超限后进入等待队列”的行为收敛到单一模块，避免路由中间件、Socket 事件各自维护一套排队逻辑。
 * 3. 不做什么：不负责用户鉴权，不决定超限后的响应文案，也不做 Redis/数据库持久化。
 *
 * 输入/输出：
 * - 输入：`channel`、`userId`、`slotId`、`limit`、`waitMs`。
 * - 输出：成功占位时返回可释放的 lease；等待超时/被取消时返回 `null`。
 *
 * 数据流/状态流：
 * 调用方尝试 acquire -> 模块按 channel/userId 维护 active/queue 两类状态 -> 未超限则立即加入 active
 * -> 超限则进入 FIFO 队列等待 -> 前序请求 release 后唤醒队首 -> 空状态自动清理。
 *
 * 关键边界条件与坑点：
 * 1. 同一 `slotId` 的同步占位仍保持幂等，不会重复计数；排队等待请传入唯一 `slotId`，避免多次请求共享同一排队名额。
 * 2. 这里是进程内状态，目标是优先挡住“单实例被同一用户打爆”的问题；若未来扩成多实例，再统一升级为跨实例槽位实现。
 */

export type UserConnectionSlotChannel = 'http-request' | 'game-auth';

export type UserConnectionSlotLease = {
  release: () => void;
};

type AcquireUserConnectionSlotParams = {
  channel: UserConnectionSlotChannel;
  userId: number;
  slotId: string;
  limit: number;
};

type WaitForUserConnectionSlotParams = AcquireUserConnectionSlotParams & {
  waitMs: number;
  signal?: AbortSignal;
};

type PendingUserConnectionSlotRequest = {
  slotId: string;
  limit: number;
  settled: boolean;
  timeoutHandle: ReturnType<typeof setTimeout>;
  signal?: AbortSignal;
  abortHandler?: () => void;
  resolve: (lease: UserConnectionSlotLease | null) => void;
};

type UserConnectionSlotState = {
  activeSlots: Set<string>;
  pendingQueue: PendingUserConnectionSlotRequest[];
};

const userConnectionSlots = new Map<
  UserConnectionSlotChannel,
  Map<number, UserConnectionSlotState>
>();

const assertPositiveInteger = (value: number, fieldName: string): number => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} 必须是正整数`);
  }
  return value;
};

const getChannelSlots = (
  channel: UserConnectionSlotChannel,
): Map<number, UserConnectionSlotState> => {
  const existing = userConnectionSlots.get(channel);
  if (existing) {
    return existing;
  }

  const created = new Map<number, UserConnectionSlotState>();
  userConnectionSlots.set(channel, created);
  return created;
};

const getOrCreateUserSlots = (
  channelSlots: Map<number, UserConnectionSlotState>,
  userId: number,
): UserConnectionSlotState => {
  const existing = channelSlots.get(userId);
  if (existing) {
    return existing;
  }

  const created: UserConnectionSlotState = {
    activeSlots: new Set<string>(),
    pendingQueue: [],
  };
  channelSlots.set(userId, created);
  return created;
};

const cleanupUserSlots = (
  channel: UserConnectionSlotChannel,
  userId: number,
): void => {
  const channelSlots = userConnectionSlots.get(channel);
  if (!channelSlots) {
    return;
  }

  const userSlots = channelSlots.get(userId);
  if (userSlots && userSlots.activeSlots.size === 0 && userSlots.pendingQueue.length === 0) {
    channelSlots.delete(userId);
  }

  if (channelSlots.size === 0) {
    userConnectionSlots.delete(channel);
  }
};

export const getActiveUserConnectionSlotCount = (
  channel: UserConnectionSlotChannel,
  userId: number,
): number => {
  const normalizedUserId = assertPositiveInteger(userId, 'userId');
  return userConnectionSlots.get(channel)?.get(normalizedUserId)?.activeSlots.size ?? 0;
};

const logUserConnectionSlotQueued = (params: {
  channel: UserConnectionSlotChannel;
  userId: number;
  activeCount: number;
  queuedCount: number;
  limit: number;
  waitMs: number;
  slotId: string;
}): void => {
  console.info('[UserConnectionSlots] 用户进入排队', params);
};

const clearPendingRequestSideEffects = (
  pendingRequest: PendingUserConnectionSlotRequest,
): void => {
  clearTimeout(pendingRequest.timeoutHandle);
  const abortHandler = pendingRequest.abortHandler;
  if (pendingRequest.signal && abortHandler) {
    pendingRequest.signal.removeEventListener('abort', abortHandler);
  }
  pendingRequest.abortHandler = undefined;
  pendingRequest.signal = undefined;
};

const createUserConnectionSlotLease = (
  channel: UserConnectionSlotChannel,
  userId: number,
  userSlotState: UserConnectionSlotState,
  slotId: string,
): UserConnectionSlotLease => {
  userSlotState.activeSlots.add(slotId);
  let released = false;

  return {
    release: () => {
      if (released) {
        return;
      }
      released = true;
      userSlotState.activeSlots.delete(slotId);
      promoteQueuedUserConnectionSlots(channel, userId);
      cleanupUserSlots(channel, userId);
    },
  };
};

const promoteQueuedUserConnectionSlots = (
  channel: UserConnectionSlotChannel,
  userId: number,
): void => {
  const userSlotState = userConnectionSlots.get(channel)?.get(userId);
  if (!userSlotState) {
    return;
  }

  while (userSlotState.pendingQueue.length > 0) {
    const nextPending = userSlotState.pendingQueue[0];
    if (nextPending.settled) {
      userSlotState.pendingQueue.shift();
      continue;
    }
    if (userSlotState.activeSlots.size >= nextPending.limit) {
      break;
    }

    userSlotState.pendingQueue.shift();
    nextPending.settled = true;
    clearPendingRequestSideEffects(nextPending);
    nextPending.resolve(
      createUserConnectionSlotLease(channel, userId, userSlotState, nextPending.slotId),
    );
  }
};

const normalizeAcquireParams = (
  params: AcquireUserConnectionSlotParams,
): {
  normalizedUserId: number;
  normalizedLimit: number;
  normalizedSlotId: string;
} => {
  const normalizedUserId = assertPositiveInteger(params.userId, 'userId');
  const normalizedLimit = assertPositiveInteger(params.limit, 'limit');
  const normalizedSlotId = params.slotId.trim();
  if (!normalizedSlotId) {
    throw new Error('slotId 不能为空');
  }
  return { normalizedUserId, normalizedLimit, normalizedSlotId };
};

export const acquireUserConnectionSlot = (
  params: AcquireUserConnectionSlotParams,
): UserConnectionSlotLease | null => {
  const { normalizedUserId, normalizedLimit, normalizedSlotId } = normalizeAcquireParams(params);
  const channelSlots = getChannelSlots(params.channel);
  const userSlotState = getOrCreateUserSlots(channelSlots, normalizedUserId);

  if (
    !userSlotState.activeSlots.has(normalizedSlotId) &&
    userSlotState.activeSlots.size >= normalizedLimit
  ) {
    cleanupUserSlots(params.channel, normalizedUserId);
    return null;
  }

  return createUserConnectionSlotLease(
    params.channel,
    normalizedUserId,
    userSlotState,
    normalizedSlotId,
  );
};

export const waitForUserConnectionSlot = async (
  params: WaitForUserConnectionSlotParams,
): Promise<UserConnectionSlotLease | null> => {
  const { normalizedUserId, normalizedLimit, normalizedSlotId } = normalizeAcquireParams(params);
  const normalizedWaitMs = assertPositiveInteger(params.waitMs, 'waitMs');
  const immediateLease = acquireUserConnectionSlot({
    channel: params.channel,
    userId: normalizedUserId,
    slotId: normalizedSlotId,
    limit: normalizedLimit,
  });
  if (immediateLease) {
    return immediateLease;
  }

  return new Promise<UserConnectionSlotLease | null>((resolve) => {
    const channelSlots = getChannelSlots(params.channel);
    const userSlotState = getOrCreateUserSlots(channelSlots, normalizedUserId);

    const pendingRequest: PendingUserConnectionSlotRequest = {
      slotId: normalizedSlotId,
      limit: normalizedLimit,
      settled: false,
      timeoutHandle: setTimeout(() => {
        if (pendingRequest.settled) {
          return;
        }
        pendingRequest.settled = true;
        const queueIndex = userSlotState.pendingQueue.indexOf(pendingRequest);
        if (queueIndex >= 0) {
          userSlotState.pendingQueue.splice(queueIndex, 1);
        }
        clearPendingRequestSideEffects(pendingRequest);
        cleanupUserSlots(params.channel, normalizedUserId);
        resolve(null);
      }, normalizedWaitMs),
      resolve,
    };

    if (params.signal) {
      const abortHandler = (): void => {
        if (pendingRequest.settled) {
          return;
        }
        pendingRequest.settled = true;
        const queueIndex = userSlotState.pendingQueue.indexOf(pendingRequest);
        if (queueIndex >= 0) {
          userSlotState.pendingQueue.splice(queueIndex, 1);
        }
        clearPendingRequestSideEffects(pendingRequest);
        cleanupUserSlots(params.channel, normalizedUserId);
        resolve(null);
      };
      pendingRequest.abortHandler = abortHandler;
      pendingRequest.signal = params.signal;

      if (params.signal.aborted) {
        abortHandler();
        return;
      }
      params.signal.addEventListener('abort', abortHandler, { once: true });
    }

    userSlotState.pendingQueue.push(pendingRequest);
    logUserConnectionSlotQueued({
      channel: params.channel,
      userId: normalizedUserId,
      activeCount: userSlotState.activeSlots.size,
      queuedCount: userSlotState.pendingQueue.length,
      limit: normalizedLimit,
      waitMs: normalizedWaitMs,
      slotId: normalizedSlotId,
    });
  });
};

/**
 * 仅供测试重置模块内状态。
 * 生产代码禁止调用，避免打破并发计数语义。
 */
export const resetUserConnectionSlotsForTest = (): void => {
  userConnectionSlots.clear();
};
