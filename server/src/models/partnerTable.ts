import { query } from '../config/database.js';

/**
 * 伙伴系统表初始化
 *
 * 作用（做什么 / 不做什么）：
 * 1) 做什么：创建伙伴实例表与伙伴已学功法表，作为伙伴成长、出战和打书的唯一动态数据源。
 * 2) 不做什么：不计算伙伴属性，不承载主线奖励或背包消费逻辑。
 *
 * 输入/输出：
 * - 输入：无（初始化阶段调用）。
 * - 输出：`character_partner`、`character_partner_technique` 表与索引/注释。
 *
 * 数据流/状态流：
 * initTables -> initPartnerTables -> 主线奖励创建初始伙伴 -> 伙伴服务读写实例与功法。
 *
 * 关键边界条件与坑点：
 * 1) 一个角色同一时间只能有一个 `is_active = true` 的伙伴，因此需要部分唯一索引约束。
 * 2) 伙伴功法使用实例维度存储，不能直接绑角色，否则后续多伙伴会互相污染打书结果。
 */
const characterPartnerTableSQL = `
CREATE TABLE IF NOT EXISTS character_partner (
  id SERIAL PRIMARY KEY,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  partner_def_id VARCHAR(64) NOT NULL,
  nickname VARCHAR(64) NOT NULL,
  level BIGINT NOT NULL DEFAULT 1,
  progress_exp BIGINT NOT NULL DEFAULT 0,
  growth_max_qixue INTEGER NOT NULL,
  growth_wugong INTEGER NOT NULL,
  growth_fagong INTEGER NOT NULL,
  growth_wufang INTEGER NOT NULL,
  growth_fafang INTEGER NOT NULL,
  growth_sudu INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  obtained_from VARCHAR(64) NOT NULL,
  obtained_ref_id VARCHAR(64) DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE character_partner IS '角色伙伴实例表';
COMMENT ON COLUMN character_partner.character_id IS '角色ID';
COMMENT ON COLUMN character_partner.partner_def_id IS '伙伴模板ID';
COMMENT ON COLUMN character_partner.nickname IS '伙伴昵称';
COMMENT ON COLUMN character_partner.level IS '伙伴等级（无上限）';
COMMENT ON COLUMN character_partner.progress_exp IS '当前等级内进度经验';
COMMENT ON COLUMN character_partner.growth_max_qixue IS '气血成长值';
COMMENT ON COLUMN character_partner.growth_wugong IS '物攻成长值';
COMMENT ON COLUMN character_partner.growth_fagong IS '法攻成长值';
COMMENT ON COLUMN character_partner.growth_wufang IS '物防成长值';
COMMENT ON COLUMN character_partner.growth_fafang IS '法防成长值';
COMMENT ON COLUMN character_partner.growth_sudu IS '速度成长值';
COMMENT ON COLUMN character_partner.is_active IS '是否当前出战';
COMMENT ON COLUMN character_partner.obtained_from IS '获得来源';
COMMENT ON COLUMN character_partner.obtained_ref_id IS '来源引用ID';

CREATE INDEX IF NOT EXISTS idx_character_partner_character_id
  ON character_partner(character_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_character_partner_active_unique
  ON character_partner(character_id)
  WHERE is_active = TRUE;
`;

const characterPartnerTechniqueTableSQL = `
CREATE TABLE IF NOT EXISTS character_partner_technique (
  id SERIAL PRIMARY KEY,
  partner_id INTEGER NOT NULL REFERENCES character_partner(id) ON DELETE CASCADE,
  technique_id VARCHAR(64) NOT NULL,
  current_layer INTEGER NOT NULL DEFAULT 1,
  is_innate BOOLEAN NOT NULL DEFAULT FALSE,
  learned_from_item_def_id VARCHAR(64) DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(partner_id, technique_id)
);
`;

const characterPartnerTechniqueCommentSQL = `
COMMENT ON TABLE character_partner_technique IS '伙伴已学功法表';
COMMENT ON COLUMN character_partner_technique.partner_id IS '伙伴实例ID';
COMMENT ON COLUMN character_partner_technique.technique_id IS '伙伴功法ID';
COMMENT ON COLUMN character_partner_technique.current_layer IS '伙伴功法当前层数';
COMMENT ON COLUMN character_partner_technique.is_innate IS '是否天生功法';
COMMENT ON COLUMN character_partner_technique.learned_from_item_def_id IS '学习来源物品定义ID';

CREATE INDEX IF NOT EXISTS idx_character_partner_technique_partner_id
  ON character_partner_technique(partner_id);
`;

export const initPartnerTables = async (): Promise<void> => {
  await query(characterPartnerTableSQL);
  await query(characterPartnerTechniqueTableSQL);
  await query(`
    ALTER TABLE character_partner_technique
    ADD COLUMN IF NOT EXISTS current_layer INTEGER
  `);
  await query(`
    UPDATE character_partner_technique
    SET current_layer = 1
    WHERE current_layer IS NULL OR current_layer <= 0
  `);
  await query(`
    ALTER TABLE character_partner_technique
    ALTER COLUMN current_layer SET DEFAULT 1
  `);
  await query(`
    ALTER TABLE character_partner_technique
    ALTER COLUMN current_layer SET NOT NULL
  `);
  await query(characterPartnerTechniqueCommentSQL);
  console.log('✓ 伙伴系统表检测完成');
};
