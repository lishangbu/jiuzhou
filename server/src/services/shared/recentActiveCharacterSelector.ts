/**
 * 近期活跃角色筛选共享模块
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中定义“近期活跃角色”的统一筛选口径，复用 `users.last_login`、`characters.updated_at`、`characters.last_offline_at` 三个时间源。
 * 2. 做什么：给运行时服务与运维脚本提供同一份活跃角色查询入口，避免“活跃玩家”在不同模块维护两套 SQL。
 * 3. 不做什么：不决定业务如何消费活跃角色，不发送奖励，也不负责故事或战斗逻辑。
 *
 * 输入/输出：
 * - 输入：活跃窗口天数，以及可选的排除角色与结果数量上限。
 * - 输出：按最近活跃时间倒序排列的角色列表，包含 userId、characterId、昵称、称号、境界与活跃时间明细。
 *
 * 数据流/状态流：
 * 业务模块参数 -> 本模块按统一 SQL 读取近期活跃角色 -> 归一化输出 -> 上游模块做进一步筛选与消费。
 *
 * 复用设计说明：
 * 1. 运行时云游与运维脚本都需要“近期活跃角色”口径，收口后只维护一份 SQL 与归一化结构。
 * 2. 排除当前角色、限制候选数量等变化点放在这里，避免调用方各自再做一层重复过滤。
 *
 * 关键边界条件与坑点：
 * 1. 活跃口径必须和 `onlineBattleProjectionService` 预热逻辑保持一致，否则运行时与脚本对“活跃玩家”的理解会分裂。
 * 2. `excludeCharacterId` 与 `limit` 都必须是正整数；这里直接校验，避免把脏参数带进 SQL。
 */

import { query } from '../../config/database.js';

export const DEFAULT_RECENT_ACTIVE_CHARACTER_WINDOW_DAYS = 7;

export type LoadRecentActiveCharactersOptions = {
  excludeCharacterId?: number;
  limit?: number;
};

type RecentActiveCharacterRow = {
  user_id: number | string;
  character_id: number | string;
  character_nickname: string;
  character_title: string | null;
  character_realm: string | null;
  character_sub_realm: string | null;
  user_last_login_at: Date | string | null;
  character_updated_at: Date | string | null;
  character_last_offline_at: Date | string | null;
  last_active_at: Date | string;
};

export type RecentActiveCharacter = {
  userId: number;
  characterId: number;
  characterNickname: string;
  characterTitle: string | null;
  characterRealm: string | null;
  characterSubRealm: string | null;
  userLastLoginAt: string | null;
  characterUpdatedAt: string | null;
  characterLastOfflineAt: string | null;
  lastActiveAt: string;
};

const toIsoString = (value: Date | string): string => {
  return value instanceof Date ? value.toISOString() : String(value);
};

const toNullableIsoString = (value: Date | string | null): string | null => {
  if (value === null) {
    return null;
  }
  return toIsoString(value);
};

const validatePositiveInteger = (value: number, label: string): void => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label}必须为正整数`);
  }
};

export const loadRecentActiveCharacters = async (
  activeWindowDays: number,
  options: LoadRecentActiveCharactersOptions = {},
): Promise<RecentActiveCharacter[]> => {
  validatePositiveInteger(activeWindowDays, '活跃窗口天数');

  if (options.excludeCharacterId !== undefined) {
    validatePositiveInteger(options.excludeCharacterId, '排除角色 ID');
  }
  if (options.limit !== undefined) {
    validatePositiveInteger(options.limit, '活跃角色数量上限');
  }

  const params: Array<number> = [activeWindowDays];
  const filters = [
    `
      WHERE GREATEST(
        COALESCE(c.updated_at::timestamptz, c.created_at::timestamptz, to_timestamp(0)),
        COALESCE(c.last_offline_at, to_timestamp(0)),
        COALESCE(u.last_login::timestamptz, to_timestamp(0))
      ) >= NOW() - ($1::int * INTERVAL '1 day')
    `,
  ];

  if (options.excludeCharacterId !== undefined) {
    params.push(options.excludeCharacterId);
    filters.push(`AND c.id <> $${params.length}`);
  }

  let limitClause = '';
  if (options.limit !== undefined) {
    params.push(options.limit);
    limitClause = `LIMIT $${params.length}`;
  }

  const result = await query<RecentActiveCharacterRow>(
    `
      SELECT
        c.user_id,
        c.id AS character_id,
        c.nickname AS character_nickname,
        c.title AS character_title,
        c.realm AS character_realm,
        c.sub_realm AS character_sub_realm,
        u.last_login AS user_last_login_at,
        c.updated_at AS character_updated_at,
        c.last_offline_at AS character_last_offline_at,
        GREATEST(
          COALESCE(c.updated_at::timestamptz, c.created_at::timestamptz, to_timestamp(0)),
          COALESCE(c.last_offline_at, to_timestamp(0)),
          COALESCE(u.last_login::timestamptz, to_timestamp(0))
        ) AS last_active_at
      FROM characters c
      JOIN users u
        ON u.id = c.user_id
      ${filters.join('\n')}
      ORDER BY last_active_at DESC, c.id DESC
      ${limitClause}
    `,
    params,
  );

  const targets: RecentActiveCharacter[] = [];
  for (const row of result.rows) {
    const userId = Number(row.user_id);
    const characterId = Number(row.character_id);
    if (!Number.isInteger(userId) || userId <= 0) continue;
    if (!Number.isInteger(characterId) || characterId <= 0) continue;

    targets.push({
      userId,
      characterId,
      characterNickname: row.character_nickname,
      characterTitle: row.character_title,
      characterRealm: row.character_realm,
      characterSubRealm: row.character_sub_realm,
      userLastLoginAt: toNullableIsoString(row.user_last_login_at),
      characterUpdatedAt: toNullableIsoString(row.character_updated_at),
      characterLastOfflineAt: toNullableIsoString(row.character_last_offline_at),
      lastActiveAt: toIsoString(row.last_active_at),
    });
  }

  return targets;
};
