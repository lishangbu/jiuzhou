import { query } from "../config/database.js";
import { runDbMigrationOnce } from "./migrationHistoryTable.js";
import {
  PVP_WEEKLY_TITLE_BY_RANK,
  PVP_WEEKLY_TITLE_VALID_DAYS,
} from "../services/achievement/pvpWeeklyTitleConfig.js";

const characterAchievementTableSQL = `
CREATE TABLE IF NOT EXISTS character_achievement (
  id BIGSERIAL PRIMARY KEY,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  achievement_id VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'in_progress',
  progress INTEGER NOT NULL DEFAULT 0,
  progress_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(character_id, achievement_id)
);

COMMENT ON TABLE character_achievement IS '角色成就进度表';
COMMENT ON COLUMN character_achievement.status IS '状态：in_progress/completed/claimed';
COMMENT ON COLUMN character_achievement.progress IS '数值进度';
COMMENT ON COLUMN character_achievement.progress_data IS '扩展进度（multi）';

CREATE INDEX IF NOT EXISTS idx_character_achievement_character
  ON character_achievement(character_id, achievement_id);
CREATE INDEX IF NOT EXISTS idx_character_achievement_status
  ON character_achievement(character_id, status, updated_at DESC);
`;

const characterAchievementPointsTableSQL = `
CREATE TABLE IF NOT EXISTS character_achievement_points (
  character_id INTEGER PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  total_points INTEGER NOT NULL DEFAULT 0,
  combat_points INTEGER NOT NULL DEFAULT 0,
  cultivation_points INTEGER NOT NULL DEFAULT 0,
  exploration_points INTEGER NOT NULL DEFAULT 0,
  social_points INTEGER NOT NULL DEFAULT 0,
  collection_points INTEGER NOT NULL DEFAULT 0,
  claimed_thresholds JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE character_achievement_points IS '角色成就点数统计表';
COMMENT ON COLUMN character_achievement_points.claimed_thresholds IS '已领取点数阈值';
`;

const characterTitleTableSQL = `
CREATE TABLE IF NOT EXISTS character_title (
  id BIGSERIAL PRIMARY KEY,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  title_id VARCHAR(64) NOT NULL,
  is_equipped BOOLEAN NOT NULL DEFAULT FALSE,
  obtained_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(character_id, title_id)
);

COMMENT ON TABLE character_title IS '角色称号拥有与装备状态';

CREATE INDEX IF NOT EXISTS idx_character_title_character
  ON character_title(character_id, obtained_at DESC);
CREATE INDEX IF NOT EXISTS idx_character_title_equipped
  ON character_title(character_id, is_equipped);
`;

/**
 * 一次性迁移：为已有库补齐限时称号过期字段与索引。
 *
 * 作用：
 * 1. 为旧版本 character_title 表追加 expires_at 字段；
 * 2. 增加“有效称号读取”与“过期清理”所需索引，降低周结算与称号列表查询开销。
 *
 * 输入：
 * - 无（直接对当前数据库结构执行 DDL）
 *
 * 输出：
 * - 结构迁移完成后，character_title 具备限时称号所需字段与索引。
 *
 * 数据流：
 * - initAchievementTables -> runDbMigrationOnce -> 执行本函数。
 *
 * 关键边界条件与坑点：
 * 1. 旧库可能已手动创建列或索引，因此所有 DDL 都必须使用 IF NOT EXISTS。
 * 2. COMMENT 语句需要在列存在后执行，否则会直接失败中断初始化。
 */
const migrateCharacterTitleExpiresAt = async (): Promise<void> => {
  await query(
    "ALTER TABLE character_title ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ",
  );
  await query(
    `COMMENT ON COLUMN character_title.expires_at IS '称号过期时间；NULL表示永久有效'`,
  );
  await query(
    "CREATE INDEX IF NOT EXISTS idx_character_title_active_validity ON character_title(character_id, is_equipped, expires_at)",
  );
  await query(
    "CREATE INDEX IF NOT EXISTS idx_character_title_expires_at ON character_title(expires_at) WHERE expires_at IS NOT NULL",
  );
};

/**
 * 一次性迁移：修复 PVP 周结算称号历史过期时间并向受影响玩家补发说明邮件。
 *
 * 作用：
 * 1. 将旧逻辑误写为“结算周结束日 00:00 过期”的周称号修正为“结束日 + 7 天 00:00（上海时区）”；
 * 2. 仅对本次命中修复的数据发送补发邮件，避免全量群发造成噪音。
 *
 * 输入：
 * - 无（基于 arena_weekly_settlement 与 character_title 现有数据推导受影响记录）。
 *
 * 输出：
 * - 更新命中记录的 character_title.expires_at；
 * - 向对应角色插入一封系统说明邮件（mail 表）。
 *
 * 数据流：
 * - initAchievementTables -> runDbMigrationOnce -> 执行本函数；
 * - weekly_awards 推导“角色-名次称号-周结束日期”；
 * - fixed_titles 返回被修复记录，再聚合为每角色一封邮件写入 mail。
 *
 * 关键边界条件与坑点：
 * 1. 仅修复 `expires_at` 精确等于“该周 week_end_local_date 00:00（上海时区）”的记录，避免误改已正确数据。
 * 2. 同角色可能命中多个周称号，邮件按角色聚合为 1 封，避免重复通知刷屏。
 */
const migratePvpWeeklyTitleExpireFixAndCompensationMailV1 =
  async (): Promise<void> => {
    const timezone = "Asia/Shanghai";
    const championTitleId = PVP_WEEKLY_TITLE_BY_RANK[1];
    const runnerupTitleId = PVP_WEEKLY_TITLE_BY_RANK[2];
    const thirdTitleId = PVP_WEEKLY_TITLE_BY_RANK[3];
    const mailSource = "migration-pvp-weekly-title-expire-fix-v1";
    const mailTitle = "竞技场周称号有效期修复通知";
    const mailContent =
      "因竞技场周结算称号有效期配置异常，系统已为你修复相关称号有效期。" +
      "请前往“成就-称号”面板查看并手动装备。给你带来的困扰，敬请谅解。";

    await query(
      `
      WITH weekly_awards AS (
        SELECT aws.champion_character_id AS character_id, $1::varchar AS title_id, aws.week_end_local_date
        FROM arena_weekly_settlement aws
        WHERE aws.champion_character_id IS NOT NULL
        UNION ALL
        SELECT aws.runnerup_character_id AS character_id, $2::varchar AS title_id, aws.week_end_local_date
        FROM arena_weekly_settlement aws
        WHERE aws.runnerup_character_id IS NOT NULL
        UNION ALL
        SELECT aws.third_character_id AS character_id, $3::varchar AS title_id, aws.week_end_local_date
        FROM arena_weekly_settlement aws
        WHERE aws.third_character_id IS NOT NULL
      ),
      fixed_titles AS (
        UPDATE character_title ct
        SET expires_at = ((wa.week_end_local_date + $4::int)::timestamp AT TIME ZONE $5),
            updated_at = NOW()
        FROM weekly_awards wa
        WHERE ct.character_id = wa.character_id
          AND ct.title_id = wa.title_id
          AND ct.expires_at IS NOT NULL
          AND ct.expires_at = (wa.week_end_local_date::timestamp AT TIME ZONE $5)
        RETURNING ct.character_id, ct.expires_at
      ),
      fixed_character_stats AS (
        SELECT
          ft.character_id,
          COUNT(*)::int AS fixed_title_count,
          MIN(ft.expires_at) AS earliest_expire_at,
          MAX(ft.expires_at) AS latest_expire_at
        FROM fixed_titles ft
        GROUP BY ft.character_id
      )
      INSERT INTO mail (
        recipient_user_id,
        recipient_character_id,
        sender_type,
        sender_name,
        mail_type,
        title,
        content,
        expire_at,
        source,
        metadata,
        created_at,
        updated_at
      )
      SELECT
        c.user_id,
        fcs.character_id,
        'system',
        '系统',
        'reward',
        $6,
        $7,
        NOW() + INTERVAL '30 day',
        $8,
        jsonb_build_object(
          'migration_key', $9::text,
          'fixed_title_count', fcs.fixed_title_count,
          'earliest_expire_at', fcs.earliest_expire_at,
          'latest_expire_at', fcs.latest_expire_at
        ),
        NOW(),
        NOW()
      FROM fixed_character_stats fcs
      INNER JOIN characters c ON c.id = fcs.character_id
    `,
      [
        championTitleId,
        runnerupTitleId,
        thirdTitleId,
        PVP_WEEKLY_TITLE_VALID_DAYS,
        timezone,
        mailTitle,
        mailContent,
        mailSource,
        "character_title_pvp_weekly_expire_fix_and_compensation_mail_v1",
      ],
    );
  };

export const initAchievementTables = async (): Promise<void> => {
  await query(characterAchievementTableSQL);
  await query(characterAchievementPointsTableSQL);
  await query(characterTitleTableSQL);
  await runDbMigrationOnce({
    migrationKey: "character_title_expires_at_v1",
    description: "角色称号表增加 expires_at 字段与有效期查询索引",
    execute: migrateCharacterTitleExpiresAt,
  });
  await runDbMigrationOnce({
    migrationKey:
      "character_title_pvp_weekly_expire_fix_and_compensation_mail_v1",
    description: "修复历史PVP周称号有效期并向受影响玩家补发说明邮件",
    execute: migratePvpWeeklyTitleExpireFixAndCompensationMailV1,
  });
  console.log("✓ 成就与称号系统表检测完成");
};
