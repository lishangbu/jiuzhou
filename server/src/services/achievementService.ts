import type { PoolClient } from 'pg';
import { query } from '../config/database.js';
import {
  claimAchievement,
  claimAchievementPointsReward,
  getAchievementPointsRewards,
} from './achievement/claim.js';
import {
  asFiniteNonNegativeInt,
  asNonEmptyString,
  ensureCharacterAchievementPoints,
  normalizeAchievementStatus,
  normalizeRewards,
  parseAchievementDefRow,
  parseCharacterAchievementRow,
} from './achievement/shared.js';
import type {
  AchievementListItem,
  AchievementListResult,
  AchievementListStatusFilter,
  AchievementPointsInfo,
  AchievementRewardView,
  AchievementStatus,
  AchievementTrackType,
  ClaimAchievementResult,
  ClaimPointRewardResult,
  PointRewardListResult,
  ServiceResult,
  TitleListResult,
} from './achievement/types.js';
import { updateAchievementProgress } from './achievement/progress.js';
import { equipTitle, getTitleList } from './achievement/title.js';

const REALM_ORDER = [
  '凡人',
  '炼精化炁·养气期',
  '炼精化炁·通脉期',
  '炼精化炁·凝炁期',
  '炼炁化神·炼己期',
  '炼炁化神·采药期',
  '炼炁化神·结胎期',
  '炼神返虚·养神期',
  '炼神返虚·还虚期',
  '炼神返虚·合道期',
  '炼虚合道·证道期',
  '炼虚合道·历劫期',
  '炼虚合道·成圣期',
] as const;

const REALM_MAJOR_TO_FIRST: Record<string, string> = {
  凡人: '凡人',
  炼精化炁: '炼精化炁·养气期',
  炼炁化神: '炼炁化神·炼己期',
  炼神返虚: '炼神返虚·养神期',
  炼虚合道: '炼虚合道·证道期',
};

const REALM_SUB_TO_FULL: Record<string, string> = {
  养气期: '炼精化炁·养气期',
  通脉期: '炼精化炁·通脉期',
  凝炁期: '炼精化炁·凝炁期',
  炼己期: '炼炁化神·炼己期',
  采药期: '炼炁化神·采药期',
  结胎期: '炼炁化神·结胎期',
  养神期: '炼神返虚·养神期',
  还虚期: '炼神返虚·还虚期',
  合道期: '炼神返虚·合道期',
  证道期: '炼虚合道·证道期',
  历劫期: '炼虚合道·历劫期',
  成圣期: '炼虚合道·成圣期',
};

const normalizeRealm = (realmRaw: unknown, subRealmRaw?: unknown): string => {
  const realm = (asNonEmptyString(realmRaw) ?? '').trim();
  const subRealm = (asNonEmptyString(subRealmRaw) ?? '').trim();
  if (!realm && !subRealm) return '凡人';
  if (realm && REALM_ORDER.includes(realm as (typeof REALM_ORDER)[number])) return realm;
  if (realm && subRealm) {
    const full = `${realm}·${subRealm}`;
    if (REALM_ORDER.includes(full as (typeof REALM_ORDER)[number])) return full;
  }
  if (realm && REALM_MAJOR_TO_FIRST[realm]) return REALM_MAJOR_TO_FIRST[realm];
  if (realm && REALM_SUB_TO_FULL[realm]) return REALM_SUB_TO_FULL[realm];
  if (!realm && subRealm && REALM_SUB_TO_FULL[subRealm]) return REALM_SUB_TO_FULL[subRealm];
  return realm || '凡人';
};

const getRealmRank = (realmRaw: unknown, subRealmRaw?: unknown): number => {
  const normalized = normalizeRealm(realmRaw, subRealmRaw);
  return REALM_ORDER.indexOf(normalized as (typeof REALM_ORDER)[number]);
};

const parseLayerRequirement = (trackKey: string): number | null => {
  const prefix = 'skill:level:layer:';
  if (!trackKey.startsWith(prefix)) return null;
  const raw = trackKey.slice(prefix.length).trim();
  if (!raw) return null;
  const layer = Number(raw);
  if (!Number.isFinite(layer)) return null;
  const intLayer = Math.floor(layer);
  return intLayer > 0 ? intLayer : null;
};

const syncStaticAchievementProgress = async (characterId: number): Promise<void> => {
  const cid = asFiniteNonNegativeInt(characterId, 0);
  if (!cid) return;

  const characterRes = await query(`SELECT realm, sub_realm FROM characters WHERE id = $1 LIMIT 1`, [cid]);
  const character = (characterRes.rows?.[0] ?? {}) as Record<string, unknown>;
  const currentRealmRank = getRealmRank(character.realm, character.sub_realm);

  const sectMemberRes = await query(`SELECT 1 FROM sect_member WHERE character_id = $1 LIMIT 1`, [cid]);
  const isSectMember = (sectMemberRes.rows?.length ?? 0) > 0;

  const maxLayerRes = await query(
    `SELECT COALESCE(MAX(current_layer), 0)::int AS max_layer FROM character_technique WHERE character_id = $1`,
    [cid],
  );
  const maxTechniqueLayer = asFiniteNonNegativeInt((maxLayerRes.rows?.[0] as Record<string, unknown> | undefined)?.max_layer, 0);

  const pendingRes = await query(
    `
      SELECT d.track_key, d.track_type
      FROM achievement_def d
      JOIN character_achievement ca
        ON ca.character_id = $1
       AND ca.achievement_id = d.id
      WHERE d.enabled = true
        AND COALESCE(ca.status, 'in_progress') = 'in_progress'
        AND (
          d.track_key LIKE 'realm:reach:%'
          OR d.track_key LIKE 'skill:level:layer:%'
          OR d.track_key = 'sect:join'
        )
    `,
    [cid],
  );

  const keysToSync = new Set<string>();
  for (const row of pendingRes.rows as Array<Record<string, unknown>>) {
    const trackKey = asNonEmptyString(row.track_key);
    const trackType = asNonEmptyString(row.track_type) ?? 'counter';
    if (!trackKey) continue;
    if (trackType !== 'flag') continue;

    if (trackKey === 'sect:join') {
      if (isSectMember) keysToSync.add(trackKey);
      continue;
    }

    if (trackKey.startsWith('realm:reach:')) {
      const requiredRealm = trackKey.slice('realm:reach:'.length).trim();
      if (!requiredRealm) continue;
      const requiredRealmRank = getRealmRank(requiredRealm);
      if (requiredRealmRank >= 0 && currentRealmRank >= requiredRealmRank) {
        keysToSync.add(trackKey);
      }
      continue;
    }

    const requiredLayer = parseLayerRequirement(trackKey);
    if (requiredLayer !== null && maxTechniqueLayer >= requiredLayer) {
      keysToSync.add(trackKey);
    }
  }

  for (const key of keysToSync) {
    await updateAchievementProgress(cid, key, 1);
  }
};

const extractMultiTargets = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const out = new Set<string>();
  for (const item of value) {
    if (typeof item === 'string') {
      const key = item.trim();
      if (key) out.add(key);
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const key = asNonEmptyString(row.key) ?? asNonEmptyString(row.track_key) ?? asNonEmptyString(row.trackKey);
    if (key) out.add(key);
  }
  return Array.from(out);
};

const normalizeStatusFilter = (value: unknown): AchievementListStatusFilter => {
  const raw = asNonEmptyString(value) ?? 'all';
  if (raw === 'in_progress') return 'in_progress';
  if (raw === 'completed') return 'completed';
  if (raw === 'claimed') return 'claimed';
  if (raw === 'claimable') return 'claimable';
  return 'all';
};

const buildStatusWhereClause = (status: AchievementListStatusFilter): string => {
  if (status === 'in_progress') return ` AND COALESCE(ca.status, 'in_progress') = 'in_progress'`;
  if (status === 'completed' || status === 'claimable') return ` AND COALESCE(ca.status, 'in_progress') = 'completed'`;
  if (status === 'claimed') return ` AND COALESCE(ca.status, 'in_progress') = 'claimed'`;
  return '';
};

const loadRewardItemMeta = async (
  itemIds: string[],
  client?: PoolClient,
): Promise<Map<string, { name: string; icon: string | null }>> => {
  const ids = Array.from(new Set(itemIds.map((id) => id.trim()).filter(Boolean)));
  const out = new Map<string, { name: string; icon: string | null }>();
  if (ids.length === 0) return out;
  const runner = client ?? { query };
  const res = await runner.query(`SELECT id, name, icon FROM item_def WHERE id = ANY($1::varchar[])`, [ids]);
  for (const row of res.rows as Array<Record<string, unknown>>) {
    const id = asNonEmptyString(row.id);
    if (!id) continue;
    out.set(id, {
      name: asNonEmptyString(row.name) ?? id,
      icon: asNonEmptyString(row.icon),
    });
  }
  return out;
};

const toRewardViews = (
  rewards: unknown,
  itemMeta: Map<string, { name: string; icon: string | null }>,
): AchievementRewardView[] => {
  const entries = normalizeRewards(rewards);
  const out: AchievementRewardView[] = [];
  for (const reward of entries) {
    if (!reward || typeof reward !== 'object') continue;
    const row = reward as Record<string, unknown>;
    const type = asNonEmptyString(row.type);
    if (type === 'item') {
      const itemDefId = asNonEmptyString(row.item_def_id);
      if (!itemDefId) continue;
      const qty = Math.max(1, asFiniteNonNegativeInt(row.qty, 1));
      const meta = itemMeta.get(itemDefId);
      out.push({
        type: 'item',
        itemDefId,
        qty,
        itemName: meta?.name ?? itemDefId,
        itemIcon: meta?.icon ?? null,
      });
      continue;
    }

    if (type === 'silver' || type === 'spirit_stones' || type === 'exp') {
      const amount = asFiniteNonNegativeInt(row.amount, 0);
      if (amount <= 0) continue;
      out.push({ type, amount });
    }
  }
  return out;
};

const getAchievementPointsInfo = async (characterId: number): Promise<AchievementPointsInfo> => {
  await ensureCharacterAchievementPoints(characterId);
  const res = await query(
    `
      SELECT total_points, combat_points, cultivation_points, exploration_points, social_points, collection_points
      FROM character_achievement_points
      WHERE character_id = $1
      LIMIT 1
    `,
    [characterId],
  );

  const row = (res.rows?.[0] ?? {}) as Record<string, unknown>;
  return {
    total: asFiniteNonNegativeInt(row.total_points, 0),
    byCategory: {
      combat: asFiniteNonNegativeInt(row.combat_points, 0),
      cultivation: asFiniteNonNegativeInt(row.cultivation_points, 0),
      exploration: asFiniteNonNegativeInt(row.exploration_points, 0),
      social: asFiniteNonNegativeInt(row.social_points, 0),
      collection: asFiniteNonNegativeInt(row.collection_points, 0),
    },
  };
};

const syncCharacterAchievements = async (characterId: number, client?: PoolClient): Promise<void> => {
  const runner = client ?? { query };
  await runner.query(
    `
      INSERT INTO character_achievement (character_id, achievement_id, status, progress, progress_data)
      SELECT $1, id, 'in_progress', 0, '{}'::jsonb
      FROM achievement_def
      WHERE enabled = true
      ON CONFLICT (character_id, achievement_id) DO NOTHING
    `,
    [characterId],
  );
};

const toAchievementListItem = (
  row: Record<string, unknown>,
  itemMeta: Map<string, { name: string; icon: string | null }>,
): AchievementListItem | null => {
  const def = parseAchievementDefRow(row);
  if (!def) return null;

  const progress = parseCharacterAchievementRow({
    id: row.progress_id ?? 0,
    character_id: row.character_id,
    achievement_id: row.achievement_id ?? def.id,
    status: row.progress_status,
    progress: row.progress,
    progress_data: row.progress_data,
    completed_at: row.completed_at,
    claimed_at: row.claimed_at,
    updated_at: row.progress_updated_at,
  });

  const status: AchievementStatus = progress?.status ?? normalizeAchievementStatus(row.progress_status);
  const trackType: AchievementTrackType = def.track_type;

  const target = trackType === 'multi'
    ? (() => {
        const targets = extractMultiTargets(def.target_list);
        return targets.length > 0 ? targets.length : Math.max(1, def.target_value);
      })()
    : Math.max(1, def.target_value);

  const current = Math.max(0, progress?.progress ?? 0);
  const done = status === 'completed' || status === 'claimed' || current >= target;
  const currentValue = Math.min(target, current);
  const percent = target > 0 ? Math.max(0, Math.min(100, (currentValue / target) * 100)) : 0;

  const hiddenUnfinished = def.hidden && status === 'in_progress';

  return {
    id: def.id,
    name: hiddenUnfinished ? '？？？' : def.name,
    description: hiddenUnfinished ? '隐藏成就，完成后解锁描述' : def.description,
    category: def.category,
    rarity: def.rarity,
    points: def.points,
    icon: def.icon,
    hidden: def.hidden,
    status,
    claimable: status === 'completed',
    trackType,
    trackKey: def.track_key,
    progress: {
      current: currentValue,
      target,
      percent,
      done,
      status,
      ...(trackType === 'multi' ? { progressData: progress?.progress_data ?? {} } : {}),
    },
    rewards: toRewardViews(def.rewards, itemMeta),
    titleId: def.title_id,
    sortWeight: def.sort_weight,
  };
};

const collectRewardItemIds = (rows: Array<Record<string, unknown>>): string[] => {
  const out: string[] = [];
  for (const row of rows) {
    const rewards = normalizeRewards(row.rewards);
    for (const reward of rewards) {
      if (!reward || typeof reward !== 'object') continue;
      const entry = reward as Record<string, unknown>;
      if (asNonEmptyString(entry.type) !== 'item') continue;
      const itemDefId = asNonEmptyString(entry.item_def_id);
      if (itemDefId) out.push(itemDefId);
    }
  }
  return out;
};

export const getAchievementList = async (
  characterId: number,
  options?: {
    category?: string;
    status?: AchievementListStatusFilter;
    page?: number;
    limit?: number;
  },
): Promise<AchievementListResult> => {
  const cid = asFiniteNonNegativeInt(characterId, 0);
  if (!cid) {
    return {
      achievements: [],
      total: 0,
      page: 1,
      limit: 20,
      points: {
        total: 0,
        byCategory: { combat: 0, cultivation: 0, exploration: 0, social: 0, collection: 0 },
      },
    };
  }

  await ensureCharacterAchievementPoints(cid);
  await syncCharacterAchievements(cid);
  await syncStaticAchievementProgress(cid);

  const page = Math.max(1, asFiniteNonNegativeInt(options?.page, 1));
  const limit = Math.max(1, Math.min(100, asFiniteNonNegativeInt(options?.limit, 20)));
  const offset = (page - 1) * limit;

  const category = asNonEmptyString(options?.category);
  const statusFilter = normalizeStatusFilter(options?.status);

  const params: unknown[] = [cid];
  let where = `WHERE d.enabled = true`;
  if (category) {
    params.push(category);
    where += ` AND d.category = $${params.length}`;
  }

  where += buildStatusWhereClause(statusFilter);

  const countRes = await query(
    `
      SELECT COUNT(1)::int AS total
      FROM achievement_def d
      LEFT JOIN character_achievement ca
        ON ca.character_id = $1
       AND ca.achievement_id = d.id
      ${where}
    `,
    params,
  );

  params.push(limit);
  params.push(offset);

  const listRes = await query(
    `
      SELECT
        d.*,
        ca.id AS progress_id,
        ca.character_id,
        ca.achievement_id,
        ca.status AS progress_status,
        ca.progress,
        ca.progress_data,
        ca.completed_at,
        ca.claimed_at,
        ca.updated_at AS progress_updated_at
      FROM achievement_def d
      LEFT JOIN character_achievement ca
        ON ca.character_id = $1
       AND ca.achievement_id = d.id
      ${where}
      ORDER BY d.category ASC, d.sort_weight DESC, d.id ASC
      LIMIT $${params.length - 1}
      OFFSET $${params.length}
    `,
    params,
  );

  const rows = listRes.rows as Array<Record<string, unknown>>;
  const itemMeta = await loadRewardItemMeta(collectRewardItemIds(rows));
  const achievements = rows
    .map((row) => toAchievementListItem(row, itemMeta))
    .filter((row): row is AchievementListItem => row !== null);

  const total = asFiniteNonNegativeInt((countRes.rows?.[0] as Record<string, unknown> | undefined)?.total, 0);
  const points = await getAchievementPointsInfo(cid);

  return {
    achievements,
    total,
    page,
    limit,
    points,
  };
};

export const getAchievementDetail = async (
  characterId: number,
  achievementId: string,
): Promise<AchievementListItem | null> => {
  const cid = asFiniteNonNegativeInt(characterId, 0);
  const aid = asNonEmptyString(achievementId);
  if (!cid || !aid) return null;

  await ensureCharacterAchievementPoints(cid);
  await syncCharacterAchievements(cid);
  await syncStaticAchievementProgress(cid);

  const res = await query(
    `
      SELECT
        d.*,
        ca.id AS progress_id,
        ca.character_id,
        ca.achievement_id,
        ca.status AS progress_status,
        ca.progress,
        ca.progress_data,
        ca.completed_at,
        ca.claimed_at,
        ca.updated_at AS progress_updated_at
      FROM achievement_def d
      LEFT JOIN character_achievement ca
        ON ca.character_id = $1
       AND ca.achievement_id = d.id
      WHERE d.enabled = true
        AND d.id = $2
      LIMIT 1
    `,
    [cid, aid],
  );

  const row = (res.rows?.[0] ?? null) as Record<string, unknown> | null;
  if (!row) return null;

  const itemMeta = await loadRewardItemMeta(collectRewardItemIds([row]));
  return toAchievementListItem(row, itemMeta);
};

export const initCharacterAchievements = async (characterId: number): Promise<void> => {
  const cid = asFiniteNonNegativeInt(characterId, 0);
  if (!cid) return;
  await ensureCharacterAchievementPoints(cid);
  await syncCharacterAchievements(cid);
  await syncStaticAchievementProgress(cid);
};

export {
  claimAchievement,
  claimAchievementPointsReward,
  equipTitle,
  getAchievementPointsRewards,
  getTitleList,
  updateAchievementProgress,
};

export type {
  AchievementListItem,
  AchievementListResult,
  AchievementListStatusFilter,
  AchievementPointsInfo,
  ClaimAchievementResult,
  ClaimPointRewardResult,
  PointRewardListResult,
  ServiceResult,
  TitleListResult,
};
