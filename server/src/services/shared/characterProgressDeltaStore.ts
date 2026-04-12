import { afterTransactionCommit } from '../../config/database.js';
import { redis } from '../../config/redis.js';

/**
 * 角色软进度 Delta Redis 存储
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：为任务 / 主线 / 成就这类软进度提供按角色聚合的 Redis Hash 存储，把高频事件先合并在缓存层。
 * 2. 做什么：提供 `main -> inflight` 的原子 claim/finalize/restore 能力，供后台 flush 复用。
 * 3. 不做什么：不解析业务语义，不直接写数据库，也不决定 flush 时如何把 field 解释成任务事件。
 *
 * 输入 / 输出：
 * - 输入：角色 ID、field 名、增量。
 * - 输出：无；副作用是更新 Redis hash 与 dirty index。
 *
 * 数据流 / 状态流：
 * 业务事务提交 -> buffer -> dirty index 标记
 * -> flush worker claim(rename) -> DB apply
 * -> finalize 成功删除 inflight / restore 失败回滚合并。
 *
 * 关键边界条件与坑点：
 * 1. 同一角色 flush 时只允许存在一个 inflight key，否则恢复和 finalize 会相互覆盖。
 * 2. 所有 buffer 操作都必须挂在 `afterTransactionCommit` 后面，避免事务回滚把假进度写进 Redis。
 */

export type CharacterProgressDeltaField = {
  characterId: number;
  field: string;
  increment: number;
};

const PROGRESS_DELTA_DIRTY_INDEX_KEY = 'character:progress-delta:index';
const PROGRESS_DELTA_KEY_PREFIX = 'character:progress-delta:';
const PROGRESS_DELTA_INFLIGHT_KEY_PREFIX = 'character:progress-delta:inflight:';

const claimProgressDeltaLua = `
local dirtyIndexKey = KEYS[1]
local mainKey = KEYS[2]
local inflightKey = KEYS[3]
local characterId = ARGV[1]

if redis.call('EXISTS', inflightKey) == 1 then
  return 0
end

if redis.call('EXISTS', mainKey) == 0 then
  redis.call('SREM', dirtyIndexKey, characterId)
  return 0
end

redis.call('RENAME', mainKey, inflightKey)
return 1
`;

const finalizeClaimedProgressDeltaLua = `
local dirtyIndexKey = KEYS[1]
local mainKey = KEYS[2]
local inflightKey = KEYS[3]
local characterId = ARGV[1]

redis.call('DEL', inflightKey)
if redis.call('EXISTS', mainKey) == 1 then
  redis.call('SADD', dirtyIndexKey, characterId)
else
  redis.call('SREM', dirtyIndexKey, characterId)
end
return 1
`;

const restoreClaimedProgressDeltaLua = `
local dirtyIndexKey = KEYS[1]
local mainKey = KEYS[2]
local inflightKey = KEYS[3]
local characterId = ARGV[1]

local inflightValues = redis.call('HGETALL', inflightKey)
if next(inflightValues) == nil then
  if redis.call('EXISTS', mainKey) == 1 then
    redis.call('SADD', dirtyIndexKey, characterId)
  else
    redis.call('SREM', dirtyIndexKey, characterId)
  end
  return 0
end

for i = 1, #inflightValues, 2 do
  redis.call('HINCRBY', mainKey, inflightValues[i], tonumber(inflightValues[i + 1]))
end
redis.call('DEL', inflightKey)
redis.call('SADD', dirtyIndexKey, characterId)
return 1
`;

const buildProgressDeltaKey = (characterId: number): string =>
  `${PROGRESS_DELTA_KEY_PREFIX}${characterId}`;

const buildInflightProgressDeltaKey = (characterId: number): string =>
  `${PROGRESS_DELTA_INFLIGHT_KEY_PREFIX}${characterId}`;

const normalizeIncrement = (value: number): number => {
  const normalized = Math.floor(Number(value));
  if (!Number.isFinite(normalized) || normalized <= 0) return 0;
  return normalized;
};

export const bufferCharacterProgressDeltaFields = async (
  fields: CharacterProgressDeltaField[],
): Promise<void> => {
  const normalizedFields = fields
    .map((field) => ({
      characterId: Math.floor(Number(field.characterId)),
      field: field.field.trim(),
      increment: normalizeIncrement(field.increment),
    }))
    .filter((field) =>
      Number.isFinite(field.characterId)
      && field.characterId > 0
      && field.field.length > 0
      && field.increment > 0,
    );
  if (normalizedFields.length <= 0) return;

  await afterTransactionCommit(async () => {
    const multi = redis.multi();
    for (const field of normalizedFields) {
      multi.hincrby(buildProgressDeltaKey(field.characterId), field.field, field.increment);
      multi.sadd(PROGRESS_DELTA_DIRTY_INDEX_KEY, String(field.characterId));
    }
    await multi.exec();
  });
};

export const listDirtyCharacterIdsForProgressDelta = async (
  limit: number,
): Promise<number[]> => {
  const normalizedLimit = Math.max(1, Math.floor(limit));
  return (await redis.srandmember(PROGRESS_DELTA_DIRTY_INDEX_KEY, normalizedLimit))
    .map((characterId) => Math.floor(Number(characterId)))
    .filter((characterId) => Number.isFinite(characterId) && characterId > 0)
    .sort((left, right) => left - right);
};

export const claimCharacterProgressDelta = async (
  characterId: number,
): Promise<boolean> => {
  const result = await redis.eval(
    claimProgressDeltaLua,
    3,
    PROGRESS_DELTA_DIRTY_INDEX_KEY,
    buildProgressDeltaKey(characterId),
    buildInflightProgressDeltaKey(characterId),
    String(characterId),
  );
  return Number(result) === 1;
};

export const loadClaimedCharacterProgressDeltaHash = async (
  characterId: number,
): Promise<Record<string, string>> => {
  const hash = await redis.hgetall(buildInflightProgressDeltaKey(characterId));
  return hash ?? {};
};

export const finalizeClaimedCharacterProgressDelta = async (
  characterId: number,
): Promise<void> => {
  await redis.eval(
    finalizeClaimedProgressDeltaLua,
    3,
    PROGRESS_DELTA_DIRTY_INDEX_KEY,
    buildProgressDeltaKey(characterId),
    buildInflightProgressDeltaKey(characterId),
    String(characterId),
  );
};

export const restoreClaimedCharacterProgressDelta = async (
  characterId: number,
): Promise<void> => {
  await redis.eval(
    restoreClaimedProgressDeltaLua,
    3,
    PROGRESS_DELTA_DIRTY_INDEX_KEY,
    buildProgressDeltaKey(characterId),
    buildInflightProgressDeltaKey(characterId),
    String(characterId),
  );
};
