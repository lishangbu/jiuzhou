import { query } from '../config/database.js';
import { runDbMigrationOnce } from './migrationHistoryTable.js';

/**
 * 功能解锁表初始化
 *
 * 作用（做什么 / 不做什么）：
 * 1) 做什么：创建角色功能解锁表，作为主线/活动等系统解锁状态的唯一持久化来源。
 * 2) 不做什么：不做奖励发放、不推送客户端、不决定解锁后的附带初始化。
 *
 * 输入/输出：
 * - 输入：无（初始化阶段调用）。
 * - 输出：`character_feature_unlocks` 表与索引/注释。
 *
 * 数据流/状态流：
 * initTables -> initFeatureUnlockTables -> 主线奖励/业务服务写入解锁记录 -> 角色与功能模块读取。
 *
 * 关键边界条件与坑点：
 * 1) 同一角色同一功能只能解锁一次，因此 `(character_id, feature_code)` 必须唯一。
 * 2) 这里只保存解锁状态，不保存功能配置，避免把静态定义和动态进度混在一张表里。
 */
const featureUnlockTableCreateSQL = `
CREATE TABLE IF NOT EXISTS character_feature_unlocks (
  id SERIAL PRIMARY KEY,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  feature_code VARCHAR(64) NOT NULL,
  obtained_from VARCHAR(64) NOT NULL,
  obtained_ref_id VARCHAR(64) DEFAULT NULL,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(character_id, feature_code)
);
`;

const featureUnlockTableCommentSQL = `
COMMENT ON TABLE character_feature_unlocks IS '角色功能解锁表';
COMMENT ON COLUMN character_feature_unlocks.character_id IS '角色ID';
COMMENT ON COLUMN character_feature_unlocks.feature_code IS '功能编码';
COMMENT ON COLUMN character_feature_unlocks.obtained_from IS '解锁来源';
COMMENT ON COLUMN character_feature_unlocks.obtained_ref_id IS '来源引用ID';
COMMENT ON COLUMN character_feature_unlocks.unlocked_at IS '解锁时间';
`;

const featureUnlockTableIndexSQL = `
CREATE INDEX IF NOT EXISTS idx_character_feature_unlocks_character_id
  ON character_feature_unlocks(character_id);
CREATE INDEX IF NOT EXISTS idx_character_feature_unlocks_feature_code
  ON character_feature_unlocks(feature_code);
`;

/**
 * 一次性迁移旧版功能解锁表字段。
 *
 * 作用（做什么 / 不做什么）：
 * 1) 做什么：把历史库中的 `unlocked_from/unlocked_ref_id` 列迁移为当前统一使用的
 *    `obtained_from/obtained_ref_id`，并补齐缺失字段。
 * 2) 不做什么：不做业务数据重算，只负责把表结构修正到当前版本可运行状态。
 *
 * 输入/输出：
 * - 输入：当前数据库中的 `character_feature_unlocks` 表。
 * - 输出：统一后的列结构与唯一约束。
 *
 * 数据流/状态流：
 * initFeatureUnlockTables -> runDbMigrationOnce -> 本函数 -> featureUnlockService 正常读写。
 *
 * 关键边界条件与坑点：
 * 1) 旧库可能只有旧列名，因此必须先迁移/补列，再执行 COMMENT 语句。
 * 2) `grantFeatureUnlocks` 依赖 `(character_id, feature_code)` 唯一约束做 `ON CONFLICT`，
 *    所以迁移时必须补齐该约束。
 */
const migrateFeatureUnlockColumnsV1 = async (): Promise<void> => {
  await query(`
    DO $do$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'character_feature_unlocks' AND column_name = 'unlocked_from'
      ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'character_feature_unlocks' AND column_name = 'obtained_from'
      ) THEN
        EXECUTE $$ALTER TABLE character_feature_unlocks RENAME COLUMN unlocked_from TO obtained_from$$;
      END IF;

      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'character_feature_unlocks' AND column_name = 'unlocked_ref_id'
      ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'character_feature_unlocks' AND column_name = 'obtained_ref_id'
      ) THEN
        EXECUTE $$ALTER TABLE character_feature_unlocks RENAME COLUMN unlocked_ref_id TO obtained_ref_id$$;
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'character_feature_unlocks' AND column_name = 'obtained_from'
      ) THEN
        EXECUTE $$ALTER TABLE character_feature_unlocks ADD COLUMN obtained_from VARCHAR(64)$$;
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'character_feature_unlocks' AND column_name = 'obtained_ref_id'
      ) THEN
        EXECUTE $$ALTER TABLE character_feature_unlocks ADD COLUMN obtained_ref_id VARCHAR(64) DEFAULT NULL$$;
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'character_feature_unlocks' AND column_name = 'unlocked_at'
      ) THEN
        EXECUTE $$ALTER TABLE character_feature_unlocks ADD COLUMN unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()$$;
      END IF;

      EXECUTE $$UPDATE character_feature_unlocks
        SET obtained_from = 'legacy'
        WHERE obtained_from IS NULL OR BTRIM(obtained_from) = ''$$;

      EXECUTE $$ALTER TABLE character_feature_unlocks ALTER COLUMN obtained_from SET NOT NULL$$;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'character_feature_unlocks'::regclass
          AND conname = 'character_feature_unlocks_character_id_feature_code_key'
      ) THEN
        EXECUTE $$ALTER TABLE character_feature_unlocks
          ADD CONSTRAINT character_feature_unlocks_character_id_feature_code_key
          UNIQUE (character_id, feature_code)$$;
      END IF;
    END
    $do$;
  `);
};

export const initFeatureUnlockTables = async (): Promise<void> => {
  await query(featureUnlockTableCreateSQL);
  await runDbMigrationOnce({
    migrationKey: 'character_feature_unlocks_obtained_columns_v1',
    description: '功能解锁表迁移 obtained_from/obtained_ref_id 字段并补齐唯一约束',
    execute: migrateFeatureUnlockColumnsV1,
  });
  await query(featureUnlockTableCommentSQL);
  await query(featureUnlockTableIndexSQL);
  console.log('✓ 功能解锁表检测完成');
};
