import { afterTransactionCommit } from '../../config/database.js';
import { bufferCharacterSettlementResourceDeltas } from './characterSettlementResourceDeltaService.js';

/**
 * Character Reward Settlement - 角色奖励资源延后结算工具
 *
 * 作用（做什么 / 不做什么）：
 * - 做什么：统一累加角色资源中的经验/银两/灵石正负增量，并在事务提交后先合并进 Redis Delta 缓冲区，再由后台批量落库。
 * - 不做什么：不处理背包互斥锁获取，不负责奖励来源解析。
 *
 * 输入/输出：
 * - createCharacterRewardDelta()：返回空的奖励增量对象。
 * - mergeCharacterRewardDelta(target, delta)：把单次奖励增量合并到目标对象。
 * - addCharacterRewardDelta(map, characterId, delta)：把指定角色的奖励增量合并到 Map。
 * - applyCharacterRewardDeltas(map)：把累计奖励提交到 Redis Delta 缓冲区。
 *
 * 数据流/状态流：
 * - 业务服务先在事务内完成物品创建、自动分解、邮件补发等背包相关操作；
 * - 过程中把经验/银两/灵石累计到本模块的增量对象；
 * - 事务提交后统一合并进 Redis Delta，由后台 flush 批量写回 `characters`，把多场战斗的频繁小写入收敛成更少的批量落库。
 *
 * 关键边界条件与坑点：
 * 1. 本模块允许负数增量；调用方必须自行保证不会把角色资源扣成非法值。
 * 2. Delta 只在事务提交后进入缓冲区；事务回滚时绝不能提前进 Redis，否则会把失败结算写成脏增量。
 */
export type CharacterRewardDelta = {
  exp: number;
  silver: number;
  spiritStones: number;
};

type CharacterRewardDeltaInput = {
  exp?: number;
  silver?: number;
  spiritStones?: number;
};

const normalizeRewardDeltaValue = (value: number | undefined): number => {
  if (value === undefined) return 0;
  const normalized = Math.floor(Number(value));
  if (!Number.isFinite(normalized)) return 0;
  return normalized;
};

const hasRewardDelta = (delta: CharacterRewardDelta): boolean => {
  return delta.exp !== 0 || delta.silver !== 0 || delta.spiritStones !== 0;
};

export const createCharacterRewardDelta = (): CharacterRewardDelta => ({
  exp: 0,
  silver: 0,
  spiritStones: 0,
});

export const mergeCharacterRewardDelta = (
  target: CharacterRewardDelta,
  delta: CharacterRewardDeltaInput,
): void => {
  target.exp += normalizeRewardDeltaValue(delta.exp);
  target.silver += normalizeRewardDeltaValue(delta.silver);
  target.spiritStones += normalizeRewardDeltaValue(delta.spiritStones);
};

export const addCharacterRewardDelta = (
  rewardMap: Map<number, CharacterRewardDelta>,
  characterId: number,
  delta: CharacterRewardDeltaInput,
): void => {
  if (!Number.isInteger(characterId) || characterId <= 0) return;

  const existing = rewardMap.get(characterId) ?? createCharacterRewardDelta();
  mergeCharacterRewardDelta(existing, delta);
  rewardMap.set(characterId, existing);
};

export const applyCharacterRewardDeltas = async (
  rewardMap: Map<number, CharacterRewardDelta>,
): Promise<void> => {
  const normalizedRewardMap = new Map<number, CharacterRewardDelta>();
  for (const [characterId, delta] of rewardMap.entries()) {
    if (!Number.isInteger(characterId) || characterId <= 0) continue;
    if (!delta || !hasRewardDelta(delta)) continue;
    normalizedRewardMap.set(characterId, {
      exp: normalizeRewardDeltaValue(delta.exp),
      silver: normalizeRewardDeltaValue(delta.silver),
      spiritStones: normalizeRewardDeltaValue(delta.spiritStones),
    });
  }
  if (normalizedRewardMap.size <= 0) return;

  await afterTransactionCommit(async () => {
    await bufferCharacterSettlementResourceDeltas(normalizedRewardMap);
  });
};
