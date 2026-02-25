import { query } from '../config/database.js';

/**
 * 离线挂机系统数据库表初始化
 *
 * 作用：创建离线挂机系统所需的三张表（idle_sessions、idle_battle_batches、idle_configs）
 * 输入：无（直接操作数据库连接）
 * 输出：无（副作用：建表/建索引）
 *
 * 数据流：
 *   initIdleTables() → query(CREATE TABLE IF NOT EXISTS ...) × 3
 *   → query(CREATE INDEX IF NOT EXISTS ...) × 4
 *
 * 关键边界条件：
 *   1. idle_battle_batches.session_id 外键带 ON DELETE CASCADE，删除会话时自动清理战斗记录
 *   2. idle_configs 以 character_id 为主键（一角色一配置），使用 UPSERT 更新
 */

// ─── idle_sessions：挂机会话主表 ───────────────────────────────────────────────
const idleSessionsTableSQL = `
CREATE TABLE IF NOT EXISTS idle_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id    INTEGER NOT NULL REFERENCES characters(id),
  status          VARCHAR(20) NOT NULL DEFAULT 'active',
  map_id          VARCHAR(100) NOT NULL,
  room_id         VARCHAR(100) NOT NULL,
  max_duration_ms BIGINT NOT NULL,
  session_snapshot JSONB NOT NULL,
  total_battles   INTEGER NOT NULL DEFAULT 0,
  win_count       INTEGER NOT NULL DEFAULT 0,
  lose_count      INTEGER NOT NULL DEFAULT 0,
  total_exp       INTEGER NOT NULL DEFAULT 0,
  total_silver    INTEGER NOT NULL DEFAULT 0,
  reward_items    JSONB NOT NULL DEFAULT '[]',
  bag_full_flag   BOOLEAN NOT NULL DEFAULT false,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at        TIMESTAMPTZ,
  viewed_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_idle_sessions_character_status ON idle_sessions(character_id, status);
CREATE INDEX IF NOT EXISTS idx_idle_sessions_character_started ON idle_sessions(character_id, started_at DESC);
`;

// ─── idle_battle_batches：单场战斗记录表 ──────────────────────────────────────
const idleBattleBatchesTableSQL = `
CREATE TABLE IF NOT EXISTS idle_battle_batches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES idle_sessions(id) ON DELETE CASCADE,
  batch_index     INTEGER NOT NULL,
  result          VARCHAR(20) NOT NULL,
  round_count     INTEGER NOT NULL DEFAULT 0,
  random_seed     BIGINT NOT NULL,
  exp_gained      INTEGER NOT NULL DEFAULT 0,
  silver_gained   INTEGER NOT NULL DEFAULT 0,
  items_gained    JSONB NOT NULL DEFAULT '[]',
  battle_log      JSONB NOT NULL DEFAULT '[]',
  monster_ids     TEXT[] NOT NULL DEFAULT '{}',
  executed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_idle_batches_session ON idle_battle_batches(session_id, batch_index);
`;

// ─── idle_configs：挂机配置持久化表 ──────────────────────────────────────────
const idleConfigsTableSQL = `
CREATE TABLE IF NOT EXISTS idle_configs (
  character_id    INTEGER PRIMARY KEY REFERENCES characters(id),
  map_id          VARCHAR(100),
  room_id         VARCHAR(100),
  max_duration_ms BIGINT NOT NULL DEFAULT 3600000,
  auto_skill_policy JSONB NOT NULL DEFAULT '{"slots":[]}',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

/**
 * 初始化离线挂机系统所需的全部数据库表
 *
 * 复用点：与 initDungeonTables、initArenaTables 等保持相同的 try/catch + console.log 模式
 * 被调用方：server/src/models/initTables.ts 中的 initTables()
 */
export const initIdleTables = async (): Promise<void> => {
  try {
    // 先建主表，再建依赖主表的子表（外键顺序）
    await query(idleSessionsTableSQL);
    console.log('  → 离线挂机会话表检测完成');

    await query(idleBattleBatchesTableSQL);
    console.log('  → 离线挂机战斗批次表检测完成');

    await query(idleConfigsTableSQL);
    console.log('  → 离线挂机配置表检测完成');

    console.log('✓ 离线挂机表检测完成');
  } catch (error) {
    console.error('✗ 离线挂机系统表初始化失败:', error);
    throw error;
  }
};
