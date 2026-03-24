/**
 * 伙伴定义 Redis 按需缓存
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：把动态伙伴定义改为“按 ID 首次读取时才写入 Redis”，避免启动或刷新时全量扫描 `generated_partner_def`。
 * 2. 做什么：提供单条与批量按 ID 读取、以及统一失效入口，供伙伴服务、坊市、预览与战斗构建复用。
 * 3. 不做什么：不维护进程内伙伴定义缓存，不在这里缓存不存在结果，也不负责战斗缓存刷新。
 *
 * 输入/输出：
 * - 输入：伙伴定义 ID 或 ID 列表。
 * - 输出：命中的伙伴定义、按 ID 组织的伙伴定义映射，以及缓存失效结果。
 *
 * 数据流/状态流：
 * - 读：调用方传入 partnerDefId -> 先查静态文件 -> 再查 Redis -> 未命中时单条/批量查 DB -> 回填 Redis。
 * - 刷：调用方触发 refreshPartnerDefinitionCache -> 删除 Redis 中已有伙伴定义 key -> 下次读取再懒加载。
 *
 * 关键边界条件与坑点：
 * 1. 这里绝不在刷新时全表扫描数据库，否则大表会把“缓存优化”重新变成重负载初始化。
 * 2. 批量读取必须只回源缺失 ID，不能退化成每个 ID 各查一次，否则伙伴列表会产生 N 次数据库往返。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { redis } from '../config/redis.js';
import { query } from '../config/database.js';
import type { PartnerBaseAttrConfig, PartnerDefConfig } from './staticConfigLoader.js';

type PartnerDefFile = {
  partners?: PartnerDefConfig[];
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEEDS_DIR = [
  path.join(process.cwd(), 'src', 'data', 'seeds'),
  path.join(process.cwd(), 'dist', 'data', 'seeds'),
  path.join(__dirname, '../data/seeds'),
].find((candidatePath) => fs.existsSync(candidatePath)) ?? path.join(__dirname, '../data/seeds');

const PARTNER_DEFINITION_REDIS_KEY_PREFIX = 'config:partner-definition:v2:';
const PARTNER_DEFINITION_REDIS_KEY_SCAN_PATTERN = `${PARTNER_DEFINITION_REDIS_KEY_PREFIX}*`;

const asString = (raw: unknown): string => (typeof raw === 'string' ? raw.trim() : '');

const asNumber = (raw: unknown, fallback = 0): number => {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const asNonNegativeNumber = (raw: unknown, fallback = 0): number => {
  return Math.max(0, asNumber(raw, fallback));
};

const asStringArray = (raw: unknown): string[] => {
  if (Array.isArray(raw)) {
    return raw
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((entry): entry is string => entry.length > 0);
  }
  if (typeof raw === 'string') {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((entry): entry is string => entry.length > 0);
  }
  return [];
};

const asPartnerBaseAttrs = (raw: unknown): PartnerBaseAttrConfig | null => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const maxQixue = asNonNegativeNumber(row.max_qixue, 0);
  if (maxQixue <= 0) return null;
  return {
    max_qixue: maxQixue,
    max_lingqi: asNonNegativeNumber(row.max_lingqi, 0),
    wugong: asNonNegativeNumber(row.wugong, 0),
    fagong: asNonNegativeNumber(row.fagong, 0),
    wufang: asNonNegativeNumber(row.wufang, 0),
    fafang: asNonNegativeNumber(row.fafang, 0),
    sudu: asNonNegativeNumber(row.sudu, 0),
    mingzhong: asNonNegativeNumber(row.mingzhong, 0),
    shanbi: asNonNegativeNumber(row.shanbi, 0),
    zhaojia: asNonNegativeNumber(row.zhaojia, 0),
    baoji: asNonNegativeNumber(row.baoji, 0),
    baoshang: asNonNegativeNumber(row.baoshang, 0),
    jianbaoshang: asNonNegativeNumber(row.jianbaoshang, 0),
    jianfantan: asNonNegativeNumber(row.jianfantan, 0),
    kangbao: asNonNegativeNumber(row.kangbao, 0),
    zengshang: asNonNegativeNumber(row.zengshang, 0),
    zhiliao: asNonNegativeNumber(row.zhiliao, 0),
    jianliao: asNonNegativeNumber(row.jianliao, 0),
    xixue: asNonNegativeNumber(row.xixue, 0),
    lengque: asNonNegativeNumber(row.lengque, 0),
    kongzhi_kangxing: asNonNegativeNumber(row.kongzhi_kangxing, 0),
    jin_kangxing: asNonNegativeNumber(row.jin_kangxing, 0),
    mu_kangxing: asNonNegativeNumber(row.mu_kangxing, 0),
    shui_kangxing: asNonNegativeNumber(row.shui_kangxing, 0),
    huo_kangxing: asNonNegativeNumber(row.huo_kangxing, 0),
    tu_kangxing: asNonNegativeNumber(row.tu_kangxing, 0),
    qixue_huifu: asNonNegativeNumber(row.qixue_huifu, 0),
    lingqi_huifu: asNonNegativeNumber(row.lingqi_huifu, 0),
  };
};

const readStaticPartnerDefinitions = (): PartnerDefConfig[] => {
  const filePath = path.join(SEEDS_DIR, 'partner_def.json');
  if (!fs.existsSync(filePath)) {
    throw new Error('partner_def.json 不存在');
  }
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as PartnerDefFile;
  if (!Array.isArray(parsed.partners)) {
    throw new Error('partner_def.json 缺少 partners 数组');
  }
  return parsed.partners;
};

const buildPartnerDefinitionRedisKey = (partnerDefId: string): string => {
  return `${PARTNER_DEFINITION_REDIS_KEY_PREFIX}${partnerDefId}`;
};

const mapGeneratedPartnerRow = (row: Record<string, unknown>): PartnerDefConfig | null => {
  const id = asString(row.id);
  const name = asString(row.name);
  const baseAttrs = asPartnerBaseAttrs(row.base_attrs);
  if (!id || !name || !baseAttrs) return null;
  const levelAttrGains = asPartnerBaseAttrs(row.level_attr_gains) ?? {};
  return {
    id,
    name,
    description: asString(row.description),
    avatar: asString(row.avatar) || null,
    quality: asString(row.quality) || '黄',
    attribute_element: asString(row.attribute_element) || 'none',
    role: asString(row.role) || '伙伴',
    max_technique_slots: Math.max(1, Math.floor(asNumber(row.max_technique_slots, 1))),
    innate_technique_ids: asStringArray(row.innate_technique_ids),
    base_attrs: baseAttrs,
    level_attr_gains: levelAttrGains,
    enabled: row.enabled !== false,
    sort_weight: 1000,
    created_by_character_id: Math.max(0, Math.floor(asNumber(row.created_by_character_id, 0))),
    source_job_id: asString(row.source_job_id) || undefined,
    created_at: asString(row.created_at) || undefined,
    updated_at: asString(row.updated_at) || undefined,
  } satisfies PartnerDefConfig;
};

const loadGeneratedPartnerDefinitionById = async (
  partnerDefId: string,
): Promise<PartnerDefConfig | null> => {
  const result = await query(
    `
      SELECT
        id,
        name,
        description,
        avatar,
        quality,
        attribute_element,
        role,
        max_technique_slots,
        base_attrs,
        level_attr_gains,
        innate_technique_ids,
        enabled,
        created_by_character_id,
        source_job_id,
        created_at,
        updated_at
      FROM generated_partner_def
      WHERE id = $1
        AND enabled = true
      LIMIT 1
    `,
    [partnerDefId],
  );
  if (result.rows.length <= 0) {
    return null;
  }
  return mapGeneratedPartnerRow(result.rows[0] as Record<string, unknown>);
};

const loadGeneratedPartnerDefinitionsByIds = async (
  partnerDefIds: string[],
): Promise<Map<string, PartnerDefConfig>> => {
  const normalizedIds = [...new Set(
    partnerDefIds
      .map((partnerDefId) => String(partnerDefId || '').trim())
      .filter((partnerDefId) => partnerDefId.length > 0),
  )];
  const resultMap = new Map<string, PartnerDefConfig>();
  if (normalizedIds.length <= 0) {
    return resultMap;
  }

  const result = await query(
    `
      SELECT
        id,
        name,
        description,
        avatar,
        quality,
        attribute_element,
        role,
        max_technique_slots,
        base_attrs,
        level_attr_gains,
        innate_technique_ids,
        enabled,
        created_by_character_id,
        source_job_id,
        created_at,
        updated_at
      FROM generated_partner_def
      WHERE enabled = true
        AND id = ANY($1)
    `,
    [normalizedIds],
  );

  for (const row of result.rows as Array<Record<string, unknown>>) {
    const definition = mapGeneratedPartnerRow(row);
    if (!definition) continue;
    resultMap.set(definition.id, definition);
  }
  return resultMap;
};

const writePartnerDefinitionsToRedis = async (
  definitions: readonly PartnerDefConfig[],
): Promise<void> => {
  if (definitions.length <= 0) {
    return;
  }
  const multi = redis.multi();
  for (const definition of definitions) {
    multi.set(buildPartnerDefinitionRedisKey(definition.id), JSON.stringify(definition));
  }
  await multi.exec();
};

const deleteKeysByPattern = async (pattern: string): Promise<void> => {
  let cursor = '0';
  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    cursor = nextCursor;
  } while (cursor !== '0');
};

export const refreshPartnerDefinitionCache = async (): Promise<void> => {
  await deleteKeysByPattern(PARTNER_DEFINITION_REDIS_KEY_SCAN_PATTERN);
};

export const getPartnerDefinitions = async (): Promise<PartnerDefConfig[]> => {
  const staticDefinitions = readStaticPartnerDefinitions();
  const generatedResult = await query(
    `
      SELECT
        id,
        name,
        description,
        avatar,
        quality,
        attribute_element,
        role,
        max_technique_slots,
        base_attrs,
        level_attr_gains,
        innate_technique_ids,
        enabled,
        created_by_character_id,
        source_job_id,
        created_at,
        updated_at
      FROM generated_partner_def
      WHERE enabled = true
      ORDER BY created_at DESC
    `,
  );
  const generatedDefinitions = (generatedResult.rows as Array<Record<string, unknown>>)
    .map((row) => mapGeneratedPartnerRow(row))
    .filter((definition): definition is PartnerDefConfig => definition !== null);
  return [...staticDefinitions, ...generatedDefinitions];
};

export const getPartnerDefinitionsByIds = async (
  partnerDefIds: string[],
): Promise<Map<string, PartnerDefConfig>> => {
  const normalizedIds = [...new Set(
    partnerDefIds
      .map((partnerDefId) => String(partnerDefId || '').trim())
      .filter((partnerDefId) => partnerDefId.length > 0),
  )];
  const result = new Map<string, PartnerDefConfig>();
  if (normalizedIds.length <= 0) {
    return result;
  }

  const staticDefinitionMap = new Map(
    readStaticPartnerDefinitions()
      .filter((definition) => definition.enabled !== false)
      .map((definition) => [definition.id, definition] as const),
  );

  const dynamicIds: string[] = [];
  for (const partnerDefId of normalizedIds) {
    const staticDefinition = staticDefinitionMap.get(partnerDefId);
    if (staticDefinition) {
      result.set(partnerDefId, staticDefinition);
      continue;
    }
    dynamicIds.push(partnerDefId);
  }

  if (dynamicIds.length <= 0) {
    return result;
  }

  const redisKeys = dynamicIds.map((partnerDefId) => buildPartnerDefinitionRedisKey(partnerDefId));
  const redisEntries = await redis.mget(...redisKeys);
  const missedIds: string[] = [];
  for (let index = 0; index < dynamicIds.length; index += 1) {
    const partnerDefId = dynamicIds[index];
    const rawEntry = redisEntries[index];
    if (!rawEntry) {
      missedIds.push(partnerDefId);
      continue;
    }
    result.set(partnerDefId, JSON.parse(rawEntry) as PartnerDefConfig);
  }

  if (missedIds.length <= 0) {
    return result;
  }

  const loadedDefinitionMap = await loadGeneratedPartnerDefinitionsByIds(missedIds);
  await writePartnerDefinitionsToRedis([...loadedDefinitionMap.values()]);
  for (const partnerDefId of missedIds) {
    const definition = loadedDefinitionMap.get(partnerDefId);
    if (definition) {
      result.set(partnerDefId, definition);
    }
  }
  return result;
};

export const getPartnerDefinitionById = async (
  partnerDefId: string,
): Promise<PartnerDefConfig | null> => {
  const normalizedId = String(partnerDefId || '').trim();
  if (!normalizedId) return null;

  const staticDefinition = readStaticPartnerDefinitions()
    .find((definition) => definition.id === normalizedId && definition.enabled !== false);
  if (staticDefinition) {
    return staticDefinition;
  }

  const redisKey = buildPartnerDefinitionRedisKey(normalizedId);
  const cached = await redis.get(redisKey);
  if (cached) {
    return JSON.parse(cached) as PartnerDefConfig;
  }

  const definition = await loadGeneratedPartnerDefinitionById(normalizedId);
  if (!definition) {
    return null;
  }
  await writePartnerDefinitionsToRedis([definition]);
  return definition;
};

export const PARTNER_DEFINITION_REDIS_KEYS = {
  prefix: PARTNER_DEFINITION_REDIS_KEY_PREFIX,
  scanPattern: PARTNER_DEFINITION_REDIS_KEY_SCAN_PATTERN,
} as const;
