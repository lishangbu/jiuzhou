import { query } from '../config/database.js';
import { getSkillDefinitions, getTechniqueDefinitions } from './staticConfigLoader.js';

export type TechniqueDefRow = {
  id: string;
  code: string | null;
  name: string;
  type: string;
  quality: string;
  quality_rank: number;
  max_layer: number;
  required_realm: string;
  attribute_type: string;
  attribute_element: string;
  tags: string[];
  description: string | null;
  long_desc: string | null;
  icon: string | null;
  obtain_type: string | null;
  obtain_hint: string[];
  sort_weight: number;
  version: number;
  enabled: boolean;
};

export type TechniqueLayerRow = {
  technique_id: string;
  layer: number;
  cost_spirit_stones: number;
  cost_exp: number;
  cost_materials: unknown;
  passives: unknown;
  unlock_skill_ids: string[];
  upgrade_skill_ids: string[];
  required_realm: string | null;
  required_quest_id: string | null;
  layer_desc: string | null;
};

export type SkillDefRow = {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  icon: string | null;
  source_type: string;
  source_id: string | null;
  cost_lingqi: number;
  cost_qixue: number;
  cooldown: number;
  target_type: string;
  target_count: number;
  damage_type: string | null;
  element: string;
  effects: unknown[];
  trigger_type: string;
  conditions: unknown;
  ai_priority: number;
  ai_conditions: unknown;
  upgrades: unknown;
  sort_weight: number;
  version: number;
  enabled: boolean;
};

const coerceCostMaterials = (raw: unknown): Array<{ itemId: string; qty: number }> => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => {
      if (!x || typeof x !== 'object') return null;
      const itemId = (x as { itemId?: unknown }).itemId;
      const qty = (x as { qty?: unknown }).qty;
      if (typeof itemId !== 'string') return null;
      if (typeof qty !== 'number') return null;
      return { itemId, qty };
    })
    .filter((v): v is { itemId: string; qty: number } => !!v);
};

const getItemMetaMap = async (itemIds: string[]): Promise<Map<string, { name: string; icon: string | null }>> => {
  const uniq = Array.from(new Set(itemIds.filter((x) => typeof x === 'string' && x.trim().length > 0)));
  if (uniq.length === 0) return new Map();
  const result = await query(`SELECT id, name, icon FROM item_def WHERE id = ANY($1::text[]) AND enabled = true`, [uniq]);
  return new Map(result.rows.map((r) => [r.id, { name: r.name, icon: r.icon ?? null }]));
};

export const getEnabledTechniqueDefs = async (): Promise<TechniqueDefRow[]> => {
  const rows = getTechniqueDefinitions()
    .filter((entry) => entry.enabled !== false)
    .map((entry) => ({
      id: entry.id,
      code: entry.code ?? null,
      name: entry.name,
      type: entry.type,
      quality: entry.quality,
      quality_rank: Number(entry.quality_rank ?? 1),
      max_layer: Number(entry.max_layer ?? 1),
      required_realm: entry.required_realm ?? '凡人',
      attribute_type: entry.attribute_type ?? 'physical',
      attribute_element: entry.attribute_element ?? 'none',
      tags: Array.isArray(entry.tags) ? entry.tags : [],
      description: entry.description ?? null,
      long_desc: entry.long_desc ?? null,
      icon: entry.icon ?? null,
      obtain_type: entry.obtain_type ?? null,
      obtain_hint: Array.isArray(entry.obtain_hint) ? entry.obtain_hint : [],
      sort_weight: Number(entry.sort_weight ?? 0),
      version: Number(entry.version ?? 1),
      enabled: true,
    } satisfies TechniqueDefRow))
    .sort((left, right) => right.sort_weight - left.sort_weight || right.quality_rank - left.quality_rank || left.id.localeCompare(right.id));
  return rows;
};

export const getTechniqueDefById = async (techniqueId: string): Promise<TechniqueDefRow | null> => {
  const id = String(techniqueId || '').trim();
  if (!id) return null;
  const entry = getTechniqueDefinitions().find((row) => row.id === id && row.enabled !== false);
  if (!entry) return null;
  return {
    id: entry.id,
    code: entry.code ?? null,
    name: entry.name,
    type: entry.type,
    quality: entry.quality,
    quality_rank: Number(entry.quality_rank ?? 1),
    max_layer: Number(entry.max_layer ?? 1),
    required_realm: entry.required_realm ?? '凡人',
    attribute_type: entry.attribute_type ?? 'physical',
    attribute_element: entry.attribute_element ?? 'none',
    tags: Array.isArray(entry.tags) ? entry.tags : [],
    description: entry.description ?? null,
    long_desc: entry.long_desc ?? null,
    icon: entry.icon ?? null,
    obtain_type: entry.obtain_type ?? null,
    obtain_hint: Array.isArray(entry.obtain_hint) ? entry.obtain_hint : [],
    sort_weight: Number(entry.sort_weight ?? 0),
    version: Number(entry.version ?? 1),
    enabled: true,
  };
};

export const getTechniqueLayersByTechniqueId = async (techniqueId: string): Promise<TechniqueLayerRow[]> => {
  const result = await query(
    `
      SELECT
        technique_id, layer, cost_spirit_stones, cost_exp, cost_materials,
        passives, unlock_skill_ids, upgrade_skill_ids, required_realm, required_quest_id, layer_desc
      FROM technique_layer
      WHERE technique_id = $1
      ORDER BY layer ASC
    `,
    [techniqueId]
  );
  const rows = result.rows as TechniqueLayerRow[];
  const itemIds: string[] = [];
  for (const r of rows) {
    for (const m of coerceCostMaterials(r.cost_materials)) {
      itemIds.push(m.itemId);
    }
  }
  const metaMap = await getItemMetaMap(itemIds);
  return rows.map((r) => {
    const materials = coerceCostMaterials(r.cost_materials).map((m) => {
      const meta = metaMap.get(m.itemId) ?? null;
      return { itemId: m.itemId, qty: m.qty, itemName: meta?.name, itemIcon: meta?.icon };
    });
    return { ...r, cost_materials: materials };
  });
};

export const getSkillsByTechniqueId = async (techniqueId: string): Promise<SkillDefRow[]> => {
  return getSkillDefinitions()
    .filter((entry) => entry.enabled !== false)
    .filter((entry) => entry.source_type === 'technique' && entry.source_id === techniqueId)
    .map((entry) => ({
      id: entry.id,
      code: entry.code ?? null,
      name: entry.name,
      description: entry.description ?? null,
      icon: entry.icon ?? null,
      source_type: entry.source_type,
      source_id: entry.source_id ?? null,
      cost_lingqi: Number(entry.cost_lingqi ?? 0),
      cost_qixue: Number(entry.cost_qixue ?? 0),
      cooldown: Number(entry.cooldown ?? 0),
      target_type: entry.target_type,
      target_count: Number(entry.target_count ?? 1),
      damage_type: entry.damage_type ?? null,
      element: entry.element ?? 'none',
      effects: Array.isArray(entry.effects) ? entry.effects : [],
      trigger_type: entry.trigger_type ?? 'active',
      conditions: entry.conditions ?? null,
      ai_priority: Number(entry.ai_priority ?? 50),
      ai_conditions: entry.ai_conditions ?? null,
      upgrades: entry.upgrades ?? [],
      sort_weight: Number(entry.sort_weight ?? 0),
      version: Number(entry.version ?? 1),
      enabled: true,
    } satisfies SkillDefRow))
    .sort((left, right) => right.sort_weight - left.sort_weight || left.id.localeCompare(right.id));
};

export const getTechniqueDetailById = async (
  techniqueId: string
): Promise<{ technique: TechniqueDefRow; layers: TechniqueLayerRow[]; skills: SkillDefRow[] } | null> => {
  const technique = await getTechniqueDefById(techniqueId);
  if (!technique) return null;
  const [layers, skills] = await Promise.all([
    getTechniqueLayersByTechniqueId(techniqueId),
    getSkillsByTechniqueId(techniqueId),
  ]);
  return { technique, layers, skills };
};
