import { query } from '../config/database.js';

export const PARTNER_SYSTEM_FEATURE_CODE = 'partner_system';

export interface FeatureUnlockGrantResult {
  featureCode: string;
  newlyUnlocked: boolean;
}

export type CharacterRowWithId = {
  id: number;
} & Record<string, unknown>;

interface FeatureUnlockRow {
  feature_code: string;
}

/**
 * 功能解锁服务
 *
 * 作用（做什么 / 不做什么）：
 * 1) 做什么：集中读写角色功能解锁状态，避免主线、活动、角色读取各自重复操作同一张表。
 * 2) 不做什么：不负责解锁后的附带奖励，不负责前端展示文案。
 *
 * 输入/输出：
 * - 输入：characterId、功能编码列表、来源信息。
 * - 输出：已解锁功能列表或逐项解锁结果。
 *
 * 数据流/状态流：
 * 业务入口 -> grantFeatureUnlocks / getUnlockedFeatureCodes -> character_feature_unlocks。
 *
 * 关键边界条件与坑点：
 * 1) 这里的“新解锁”只看本次插入结果，不能把已存在记录误报成新解锁。
 * 2) 调用方若已处于事务内，本服务必须复用当前事务连接，不能自行拆事务。
 */

const normalizeFeatureCode = (featureCode: string): string => {
  return String(featureCode || '').trim();
};

export const getUnlockedFeatureCodes = async (
  characterId: number,
): Promise<string[]> => {
  const cid = Math.floor(Number(characterId));
  if (!Number.isFinite(cid) || cid <= 0) return [];

  const result = await query(
    `
      SELECT feature_code
      FROM character_feature_unlocks
      WHERE character_id = $1
      ORDER BY unlocked_at ASC, id ASC
    `,
    [cid],
  );

  return (result.rows as FeatureUnlockRow[])
    .map((row) => normalizeFeatureCode(row.feature_code))
    .filter((featureCode) => featureCode.length > 0);
};

export const isFeatureUnlocked = async (
  characterId: number,
  featureCode: string,
): Promise<boolean> => {
  const normalizedFeatureCode = normalizeFeatureCode(featureCode);
  const cid = Math.floor(Number(characterId));
  if (!Number.isFinite(cid) || cid <= 0 || !normalizedFeatureCode) return false;

  const result = await query(
    `
      SELECT 1
      FROM character_feature_unlocks
      WHERE character_id = $1 AND feature_code = $2
      LIMIT 1
    `,
    [cid, normalizedFeatureCode],
  );
  return result.rows.length > 0;
};

export const grantFeatureUnlocks = async (
  characterId: number,
  featureCodes: string[],
  obtainedFrom: string,
  obtainedRefId?: string,
): Promise<FeatureUnlockGrantResult[]> => {
  const cid = Math.floor(Number(characterId));
  const normalizedFeatureCodes = [
    ...new Set(featureCodes.map((featureCode) => normalizeFeatureCode(featureCode)).filter(Boolean)),
  ];
  if (!Number.isFinite(cid) || cid <= 0 || normalizedFeatureCodes.length === 0) {
    return [];
  }

  const results: FeatureUnlockGrantResult[] = [];
  for (const featureCode of normalizedFeatureCodes) {
    const insertResult = await query(
      `
        INSERT INTO character_feature_unlocks (
          character_id,
          feature_code,
          obtained_from,
          obtained_ref_id,
          unlocked_at
        )
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (character_id, feature_code) DO NOTHING
        RETURNING feature_code
      `,
      [cid, featureCode, obtainedFrom, obtainedRefId ?? null],
    );

    results.push({
      featureCode,
      newlyUnlocked: insertResult.rows.length > 0,
    });
  }

  return results;
};

export const withUnlockedFeatures = async <TRow extends CharacterRowWithId>(
  row: TRow,
): Promise<TRow & { feature_unlocks: string[] }> => {
  return {
    ...row,
    feature_unlocks: await getUnlockedFeatureCodes(row.id),
  };
};
