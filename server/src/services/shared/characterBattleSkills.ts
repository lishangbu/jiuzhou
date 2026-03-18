/**
 * 角色战斗技能共享读取模块
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：统一读取角色当前已装备技能槽，并按当前功法层数计算每个技能的升级层级。
 * 2. 做什么：让功法服务与战斗准备层复用同一套“技能可用性 + 升级层数”口径，避免两边各自维护一份查询与映射逻辑。
 * 3. 不做什么：不负责把技能定义转换成战斗引擎 SkillData，也不负责写入技能槽或功法数据。
 *
 * 输入/输出：
 * - 输入：characterId。
 * - 输出：按技能槽顺序返回的 `{ skillId, upgradeLevel }[]`。
 *
 * 数据流/状态流：
 * character_skill_slot 已装备技能 -> characterAvailableSkills 过滤当前仍可用的 skillId
 * -> character_technique 当前层数 -> techniqueUpgradeRules 计算升级次数 -> 调用方继续组装战斗技能。
 *
 * 关键边界条件与坑点：
 * 1. 只保留“当前仍可用”的技能；功法切换后已失效但尚未被前端刷新掉的技能槽必须直接过滤。
 * 2. 升级层数必须按技能所属 source_id 对应的功法累计计算，不能按 skillId 全局混算，否则多功法同技能体系会串层数。
 */

import { query } from '../../config/database.js';
import {
  getEnabledSkillDefMap,
  listCharacterAvailableSkillIdSet,
} from './characterAvailableSkills.js';
import {
  buildTechniqueSkillUpgradeCountMap,
  getTechniqueLayersByTechniqueIdsStatic,
} from './techniqueUpgradeRules.js';

type CharacterSkillSlotRow = {
  skill_id: string | null;
};

type CharacterTechniqueBattleRow = {
  technique_id: string | null;
  current_layer: number | string | bigint | null;
};

export interface CharacterBattleSkillEntry {
  skillId: string;
  upgradeLevel: number;
}

const normalizeSkillId = (value: string | null): string => {
  return typeof value === 'string' ? value.trim() : '';
};

const normalizeNonNegativeInteger = (
  value: number | string | bigint | null | undefined,
): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
};

const loadOrderedAvailableSkillIds = async (characterId: number): Promise<string[]> => {
  const slotResult = await query(
    'SELECT skill_id FROM character_skill_slot WHERE character_id = $1 ORDER BY slot_index',
    [characterId],
  );
  if (slotResult.rows.length <= 0) return [];

  const rawOrderedSkillIds = (slotResult.rows as CharacterSkillSlotRow[])
    .map((row) => normalizeSkillId(row.skill_id))
    .filter((skillId): skillId is string => skillId.length > 0);
  if (rawOrderedSkillIds.length <= 0) return [];

  const availableSkillIds = await listCharacterAvailableSkillIdSet(characterId);
  return rawOrderedSkillIds.filter((skillId) => availableSkillIds.has(skillId));
};

const loadTechniqueUpgradeLevelBySkillId = async (
  characterId: number,
  skillIds: string[],
): Promise<Map<string, number>> => {
  const uniqueSkillIds = Array.from(new Set(skillIds));
  if (uniqueSkillIds.length <= 0) return new Map();

  const techniqueResult = await query(
    `
      SELECT technique_id, current_layer
      FROM character_technique
      WHERE character_id = $1
    `,
    [characterId],
  );
  if (techniqueResult.rows.length <= 0) {
    return new Map(uniqueSkillIds.map((skillId) => [skillId, 0] as const));
  }

  const techniqueRows = (techniqueResult.rows as CharacterTechniqueBattleRow[])
    .map((row) => {
      const techniqueId = normalizeSkillId(row.technique_id);
      const currentLayer = normalizeNonNegativeInteger(row.current_layer);
      if (!techniqueId || currentLayer <= 0) return null;
      return { techniqueId, currentLayer };
    })
    .filter((row): row is { techniqueId: string; currentLayer: number } => row !== null);

  const techniqueIds = techniqueRows.map((row) => row.techniqueId);
  const layerRows = getTechniqueLayersByTechniqueIdsStatic(techniqueIds);
  const layerRowsByTechniqueId = new Map<string, ReturnType<typeof getTechniqueLayersByTechniqueIdsStatic>>();
  for (const row of layerRows) {
    const rows = layerRowsByTechniqueId.get(row.techniqueId) ?? [];
    rows.push(row);
    layerRowsByTechniqueId.set(row.techniqueId, rows);
  }

  const upgradeCountByTechniqueId = new Map<string, Map<string, number>>();
  for (const row of techniqueRows) {
    upgradeCountByTechniqueId.set(
      row.techniqueId,
      buildTechniqueSkillUpgradeCountMap(
        layerRowsByTechniqueId.get(row.techniqueId) ?? [],
        row.currentLayer,
      ),
    );
  }

  const skillMap = getEnabledSkillDefMap();
  const upgradeLevelBySkillId = new Map<string, number>();
  for (const skillId of uniqueSkillIds) {
    const skillDef = skillMap.get(skillId);
    if (
      !skillDef
      || skillDef.source_type !== 'technique'
      || typeof skillDef.source_id !== 'string'
      || skillDef.source_id.trim().length <= 0
    ) {
      upgradeLevelBySkillId.set(skillId, 0);
      continue;
    }

    const techniqueId = skillDef.source_id.trim();
    const upgradeLevel = upgradeCountByTechniqueId.get(techniqueId)?.get(skillId) ?? 0;
    upgradeLevelBySkillId.set(skillId, upgradeLevel);
  }

  return upgradeLevelBySkillId;
};

export const loadCharacterBattleSkillEntries = async (
  characterId: number,
): Promise<CharacterBattleSkillEntry[]> => {
  const orderedSkillIds = await loadOrderedAvailableSkillIds(characterId);
  if (orderedSkillIds.length <= 0) return [];

  const upgradeLevelBySkillId = await loadTechniqueUpgradeLevelBySkillId(
    characterId,
    orderedSkillIds,
  );

  return orderedSkillIds.map((skillId) => ({
    skillId,
    upgradeLevel: upgradeLevelBySkillId.get(skillId) ?? 0,
  }));
};
