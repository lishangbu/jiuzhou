import { query } from '../config/database.js';
import {
  getCharacterComputedBatchByCharacterIds,
  getCharacterComputedByCharacterId,
} from './characterComputedService.js';

const MAX_DAILY_CHALLENGES = 20;
const DEFAULT_RATING = 1000;

const computePower = (row: {
  wugong?: number;
  fagong?: number;
  wufang?: number;
  fafang?: number;
  max_qixue?: number;
  max_lingqi?: number;
  sudu?: number;
}): number => {
  const wugong = Number(row.wugong ?? 0) || 0;
  const fagong = Number(row.fagong ?? 0) || 0;
  const wufang = Number(row.wufang ?? 0) || 0;
  const fafang = Number(row.fafang ?? 0) || 0;
  const maxQixue = Number(row.max_qixue ?? 0) || 0;
  const maxLingqi = Number(row.max_lingqi ?? 0) || 0;
  const sudu = Number(row.sudu ?? 0) || 0;
  return wugong + fagong + wufang + fafang + maxQixue + maxLingqi + sudu;
};

const ensureRatingRow = async (characterId: number): Promise<void> => {
  const id = Number(characterId);
  if (!Number.isFinite(id) || id <= 0) return;
  await query(
    `INSERT INTO arena_rating(character_id, rating)
     VALUES ($1, $2)
     ON CONFLICT (character_id) DO NOTHING`,
    [id, DEFAULT_RATING]
  );
};

const getTodayChallengeCount = async (characterId: number): Promise<number> => {
  const id = Number(characterId);
  if (!Number.isFinite(id) || id <= 0) return 0;
  const res = await query(
    `
      SELECT COUNT(*)::int AS cnt
      FROM arena_battle
      WHERE challenger_character_id = $1
        AND created_at >= date_trunc('day', NOW())
    `,
    [id]
  );
  return Number(res.rows?.[0]?.cnt ?? 0) || 0;
};

export type ArenaStatus = {
  score: number;
  winCount: number;
  loseCount: number;
  todayUsed: number;
  todayLimit: number;
  todayRemaining: number;
};

export const getArenaStatus = async (
  characterId: number
): Promise<{ success: boolean; message: string; data?: ArenaStatus }> => {
  try {
    const id = Number(characterId);
    if (!Number.isFinite(id) || id <= 0) return { success: false, message: '无效的角色ID' };

    await ensureRatingRow(id);
    const ratingRes = await query(
      `SELECT rating, win_count, lose_count FROM arena_rating WHERE character_id = $1`,
      [id]
    );
    if (ratingRes.rows.length === 0) return { success: false, message: '竞技场数据异常' };

    const row = ratingRes.rows[0] as any;
    const score = Number(row.rating ?? DEFAULT_RATING) || DEFAULT_RATING;
    const winCount = Number(row.win_count ?? 0) || 0;
    const loseCount = Number(row.lose_count ?? 0) || 0;

    const used = await getTodayChallengeCount(id);
    const remaining = Math.max(0, MAX_DAILY_CHALLENGES - used);

    return {
      success: true,
      message: 'ok',
      data: {
        score,
        winCount,
        loseCount,
        todayUsed: used,
        todayLimit: MAX_DAILY_CHALLENGES,
        todayRemaining: remaining,
      },
    };
  } catch (error) {
    console.error('获取竞技场状态失败:', error);
    return { success: false, message: '获取竞技场状态失败' };
  }
};

export type ArenaOpponent = {
  id: number;
  name: string;
  realm: string;
  power: number;
  score: number;
};

export const getArenaOpponents = async (
  characterId: number,
  limit: number = 10
): Promise<{ success: boolean; message: string; data?: ArenaOpponent[] }> => {
  try {
    const id = Number(characterId);
    if (!Number.isFinite(id) || id <= 0) return { success: false, message: '无效的角色ID' };

    const l = Math.max(1, Math.min(50, Math.floor(Number(limit) || 10)));
    const me = await getCharacterComputedByCharacterId(id);
    if (!me) return { success: false, message: '角色不存在' };
    const myPower = Math.max(1, computePower(me));
    const ranges = [
      { min: 0.8, max: 1.2 },
      { min: 0.6, max: 1.4 },
      { min: 0.4, max: 1.6 },
      { min: 0.2, max: 2.0 },
      { min: 0.0, max: 2147483647 },
    ];

    const rawOppRes = await query(
      `
        SELECT c.id, COALESCE(ar.rating, $2)::int AS score
        FROM characters c
        LEFT JOIN arena_rating ar ON ar.character_id = c.id
        WHERE c.id <> $1
      `,
      [id, DEFAULT_RATING],
    );
    const opponentIds = rawOppRes.rows
      .map((row) => Number((row as { id?: unknown }).id))
      .filter((x) => Number.isFinite(x) && x > 0);
    if (opponentIds.length === 0) return { success: true, message: 'ok', data: [] };

    const scoreMap = new Map<number, number>();
    for (const row of rawOppRes.rows as Array<{ id?: unknown; score?: unknown }>) {
      const cid = Number(row.id);
      if (!Number.isFinite(cid) || cid <= 0) continue;
      scoreMap.set(cid, Number(row.score ?? DEFAULT_RATING) || DEFAULT_RATING);
    }

    const computedMap = await getCharacterComputedBatchByCharacterIds(opponentIds);
    const candidateList: ArenaOpponent[] = [];
    for (const opponentId of opponentIds) {
      const snapshot = computedMap.get(opponentId);
      if (!snapshot) continue;
      candidateList.push({
        id: snapshot.id,
        name: String(snapshot.nickname || `修士${snapshot.id}`),
        realm: String(snapshot.realm || '凡人'),
        power: Math.max(0, computePower(snapshot)),
        score: scoreMap.get(snapshot.id) || DEFAULT_RATING,
      });
    }

    let data: ArenaOpponent[] = [];
    for (const r of ranges) {
      const minPower = Math.max(0, Math.floor(myPower * r.min));
      const maxPower = Math.max(minPower, Math.min(2147483647, Math.ceil(myPower * r.max)));
      data = candidateList
        .filter((x) => x.power >= minPower && x.power <= maxPower)
        .sort((a, b) => {
          const distA = Math.abs(a.power - myPower);
          const distB = Math.abs(b.power - myPower);
          if (distA !== distB) return distA - distB;
          if (a.score !== b.score) return b.score - a.score;
          return a.id - b.id;
        })
        .slice(0, l);
      if (data.length > 0) break;
    }

    return { success: true, message: 'ok', data };
  } catch (error) {
    console.error('获取竞技场对手列表失败:', error);
    return { success: false, message: '获取竞技场对手列表失败' };
  }
};

export type ArenaRecord = {
  id: string;
  ts: number;
  opponentName: string;
  opponentRealm: string;
  opponentPower: number;
  result: 'win' | 'lose' | 'draw';
  deltaScore: number;
  scoreAfter: number;
};

export const getArenaRecords = async (
  characterId: number,
  limit: number = 50
): Promise<{ success: boolean; message: string; data?: ArenaRecord[] }> => {
  try {
    const id = Number(characterId);
    if (!Number.isFinite(id) || id <= 0) return { success: false, message: '无效的角色ID' };

    const l = Math.max(1, Math.min(200, Math.floor(Number(limit) || 50)));
    const res = await query(
      `
        SELECT
          ab.battle_id,
          ab.created_at,
          ab.result,
          ab.delta_score,
          ab.score_after,
          c.id AS opponent_id,
          c.nickname AS opponent_name,
          c.realm AS opponent_realm
        FROM arena_battle ab
        JOIN characters c ON c.id = ab.opponent_character_id
        WHERE ab.challenger_character_id = $1
          AND ab.status = 'finished'
        ORDER BY ab.created_at DESC
        LIMIT $2
      `,
      [id, l]
    );

    const opponentIds = (res.rows as Array<{ opponent_id?: unknown }>)
      .map((r) => Number(r.opponent_id))
      .filter((x) => Number.isFinite(x) && x > 0);
    const computedMap = await getCharacterComputedBatchByCharacterIds(opponentIds);

    const data: ArenaRecord[] = res.rows.map((r: any) => ({
      id: String(r.battle_id),
      ts: new Date(r.created_at).getTime(),
      opponentName: String(r.opponent_name ?? ''),
      opponentRealm: String(r.opponent_realm ?? '凡人'),
      opponentPower: (() => {
        const cid = Number(r.opponent_id);
        if (!Number.isFinite(cid) || cid <= 0) return 0;
        const computed = computedMap.get(cid);
        if (!computed) return 0;
        return Math.max(0, computePower(computed));
      })(),
      result: (r.result === 'win' || r.result === 'lose' || r.result === 'draw' ? r.result : 'draw') as any,
      deltaScore: Number(r.delta_score ?? 0) || 0,
      scoreAfter: Number(r.score_after ?? DEFAULT_RATING) || DEFAULT_RATING,
    }));

    return { success: true, message: 'ok', data };
  } catch (error) {
    console.error('获取竞技场战报失败:', error);
    return { success: false, message: '获取竞技场战报失败' };
  }
};

export const canChallengeToday = async (
  characterId: number
): Promise<{ allowed: boolean; remaining: number }> => {
  const used = await getTodayChallengeCount(characterId);
  const remaining = Math.max(0, MAX_DAILY_CHALLENGES - used);
  return { allowed: remaining > 0, remaining };
};
