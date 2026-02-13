import { query } from '../config/database.js';
import { runDbMigrationOnce } from './migrationHistoryTable.js';

type JsonRecord = Record<string, unknown>;

const RATIO_ATTR_KEYS = new Set([
  'shuxing_shuzhi',
  'mingzhong',
  'shanbi',
  'zhaojia',
  'baoji',
  'baoshang',
  'kangbao',
  'zengshang',
  'zhiliao',
  'jianliao',
  'xixue',
  'lengque',
  'kongzhi_kangxing',
  'jin_kangxing',
  'mu_kangxing',
  'shui_kangxing',
  'huo_kangxing',
  'tu_kangxing',
]);

const RATE_PARAM_KEYS = ['chance', 'scale_rate', 'rate', 'ratio'] as const;
const RATE_PARAM_KEY_SET = new Set<string>(RATE_PARAM_KEYS);

const toJsonRecord = (value: unknown): JsonRecord | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as JsonRecord;
};

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const toRoundedRatio = (value: number, divisor: number): number => {
  return Number((value / divisor).toFixed(6));
};

/**
 * v1 迁移：将旧的万分比口径统一为比例值（1 = 100%）。
 * 历史词条种子是万分比存储，因此这里统一按 /10000 转换。
 */
const normalizeLegacyPercentValue = (value: number, _attrKeyRaw?: unknown): number => {
  if (!Number.isFinite(value)) return value;
  if (value > 1) return toRoundedRatio(value, 10000);
  return value;
};

const normalizeNumericFieldAsPercent = (
  row: JsonRecord,
  field: string,
  attrKeyHint?: unknown
): boolean => {
  const raw = toFiniteNumber(row[field]);
  if (raw === null) return false;
  const normalized = normalizeLegacyPercentValue(raw, attrKeyHint);
  if (normalized === raw) return false;
  row[field] = normalized;
  return true;
};

const isRatioValueContext = (
  applyTypeRaw: unknown,
  attrKeyRaw: unknown,
  effectTypeRaw?: unknown,
  params?: JsonRecord | null
): boolean => {
  if (applyTypeRaw === 'percent') return true;
  if (typeof attrKeyRaw === 'string' && RATIO_ATTR_KEYS.has(attrKeyRaw)) return true;
  if (applyTypeRaw !== 'special') return false;

  const effectType = typeof effectTypeRaw === 'string' ? effectTypeRaw : '';
  const paramApplyType = params && typeof params.apply_type === 'string' ? params.apply_type : '';
  const paramAttrKey = params && typeof params.attr_key === 'string' ? params.attr_key : '';
  const damageType = params && typeof params.damage_type === 'string' ? params.damage_type : '';
  const debuffType = params && typeof params.debuff_type === 'string' ? params.debuff_type : '';

  if ((effectType === 'buff' || effectType === 'debuff') && (paramApplyType === 'percent' || RATIO_ATTR_KEYS.has(paramAttrKey))) {
    return true;
  }
  if (effectType === 'damage' && damageType === 'reflect') return true;
  if (effectType === 'debuff' && debuffType === 'bleed') return true;
  return false;
};

const normalizeAffixParamsPercentFields = (
  paramsRaw: unknown,
  fallbackApplyType: string,
  fallbackAttrKey: string,
  effectTypeRaw?: unknown
): { normalizedParams?: JsonRecord; changed: boolean } => {
  const params = toJsonRecord(paramsRaw);
  if (!params) return { changed: false };

  const nextParams: JsonRecord = { ...params };
  let changed = false;

  for (const key of RATE_PARAM_KEYS) {
    changed = normalizeNumericFieldAsPercent(nextParams, key) || changed;
  }

  const paramApplyType =
    typeof nextParams.apply_type === 'string' ? nextParams.apply_type : fallbackApplyType;
  const paramAttrKey =
    typeof nextParams.attr_key === 'string' ? nextParams.attr_key : fallbackAttrKey;
  if (isRatioValueContext(paramApplyType, paramAttrKey, effectTypeRaw, nextParams)) {
    changed = normalizeNumericFieldAsPercent(nextParams, 'value', paramAttrKey) || changed;
  }

  return { normalizedParams: nextParams, changed };
};

const normalizeAffixDefRecord = (raw: unknown): { normalized: unknown; changed: boolean } => {
  const row = toJsonRecord(raw);
  if (!row) return { normalized: raw, changed: false };

  const next: JsonRecord = { ...row };
  const applyType = typeof next.apply_type === 'string' ? next.apply_type : '';
  const attrKey = typeof next.attr_key === 'string' ? next.attr_key : '';
  const effectType = next.effect_type;
  const params = toJsonRecord(next.params);

  let changed = false;
  if (isRatioValueContext(applyType, attrKey, effectType, params) && Array.isArray(next.tiers)) {
    let tiersChanged = false;
    const normalizedTiers = next.tiers.map((tierRaw) => {
      const tier = toJsonRecord(tierRaw);
      if (!tier) return tierRaw;
      const nextTier: JsonRecord = { ...tier };
      let tierChanged = false;
      tierChanged = normalizeNumericFieldAsPercent(nextTier, 'min', attrKey) || tierChanged;
      tierChanged = normalizeNumericFieldAsPercent(nextTier, 'max', attrKey) || tierChanged;
      if (!tierChanged) return tierRaw;
      tiersChanged = true;
      return nextTier;
    });
    if (tiersChanged) {
      next.tiers = normalizedTiers;
      changed = true;
    }
  }

  const { normalizedParams, changed: paramsChanged } = normalizeAffixParamsPercentFields(
    next.params,
    applyType,
    attrKey,
    effectType
  );
  if (paramsChanged && normalizedParams) {
    next.params = normalizedParams;
    changed = true;
  }

  return { normalized: next, changed };
};

const normalizeGeneratedAffixRecord = (raw: unknown): { normalized: unknown; changed: boolean } => {
  const row = toJsonRecord(raw);
  if (!row) return { normalized: raw, changed: false };

  const next: JsonRecord = { ...row };
  const applyType = typeof next.apply_type === 'string' ? next.apply_type : '';
  const attrKey = typeof next.attr_key === 'string' ? next.attr_key : '';
  const effectType = next.effect_type;
  const params = toJsonRecord(next.params);

  let changed = false;
  if (isRatioValueContext(applyType, attrKey, effectType, params)) {
    changed = normalizeNumericFieldAsPercent(next, 'value', attrKey) || changed;
  }

  const { normalizedParams, changed: paramsChanged } = normalizeAffixParamsPercentFields(
    next.params,
    applyType,
    attrKey,
    effectType
  );
  if (paramsChanged && normalizedParams) {
    next.params = normalizedParams;
    changed = true;
  }

  return { normalized: next, changed };
};

const normalizeOverScaledRateFieldFromV1 = (value: number): number => {
  if (!Number.isFinite(value)) return value;
  if (value > 1 && value <= 10) return toRoundedRatio(value, 100);
  return value;
};

const normalizeOverScaledAffixValueFromV1 = (value: number, attrKeyRaw?: unknown): number => {
  if (!Number.isFinite(value)) return value;
  if (value <= 0 || value > 10) return value;

  const attrKey = typeof attrKeyRaw === 'string' ? attrKeyRaw : '';
  // 旧 shanbi 词条最小值会落到 0.16，单独放宽阈值避免漏修。
  const threshold = attrKey === 'shanbi' ? 0.1 : 0.2;
  if (value > threshold) return toRoundedRatio(value, 100);
  return value;
};

const normalizeNumericFieldForV1OverScaledFix = (
  row: JsonRecord,
  field: string,
  options: {
    attrKeyHint?: unknown;
    applyTypeHint?: unknown;
  } = {}
): boolean => {
  const raw = toFiniteNumber(row[field]);
  if (raw === null) return false;

  let normalized = raw;
  if (RATE_PARAM_KEY_SET.has(field) || field === 'legendary_chance') {
    normalized = normalizeOverScaledRateFieldFromV1(raw);
  } else if (options.applyTypeHint !== 'special') {
    normalized = normalizeOverScaledAffixValueFromV1(raw, options.attrKeyHint);
  }

  if (normalized === raw) return false;
  row[field] = normalized;
  return true;
};

const normalizeAffixParamsRateFieldsForV1OverScaledFix = (
  paramsRaw: unknown
): { normalizedParams?: JsonRecord; changed: boolean } => {
  const params = toJsonRecord(paramsRaw);
  if (!params) return { changed: false };

  const nextParams: JsonRecord = { ...params };
  let changed = false;
  for (const key of RATE_PARAM_KEYS) {
    changed = normalizeNumericFieldForV1OverScaledFix(nextParams, key, { applyTypeHint: 'special' }) || changed;
  }

  return { normalizedParams: nextParams, changed };
};

const fixOverScaledAffixDefRecordFromV1 = (raw: unknown): { normalized: unknown; changed: boolean } => {
  const row = toJsonRecord(raw);
  if (!row) return { normalized: raw, changed: false };

  const next: JsonRecord = { ...row };
  const applyType = typeof next.apply_type === 'string' ? next.apply_type : '';
  const attrKey = typeof next.attr_key === 'string' ? next.attr_key : '';
  const effectType = next.effect_type;
  const params = toJsonRecord(next.params);

  let changed = false;
  if (applyType !== 'special' && isRatioValueContext(applyType, attrKey, effectType, params) && Array.isArray(next.tiers)) {
    let tiersChanged = false;
    const normalizedTiers = next.tiers.map((tierRaw) => {
      const tier = toJsonRecord(tierRaw);
      if (!tier) return tierRaw;
      const nextTier: JsonRecord = { ...tier };
      let tierChanged = false;
      tierChanged = normalizeNumericFieldForV1OverScaledFix(nextTier, 'min', { attrKeyHint: attrKey, applyTypeHint: applyType }) || tierChanged;
      tierChanged = normalizeNumericFieldForV1OverScaledFix(nextTier, 'max', { attrKeyHint: attrKey, applyTypeHint: applyType }) || tierChanged;
      if (!tierChanged) return tierRaw;
      tiersChanged = true;
      return nextTier;
    });

    if (tiersChanged) {
      next.tiers = normalizedTiers;
      changed = true;
    }
  }

  const { normalizedParams, changed: paramsChanged } = normalizeAffixParamsRateFieldsForV1OverScaledFix(next.params);
  if (paramsChanged && normalizedParams) {
    next.params = normalizedParams;
    changed = true;
  }

  return { normalized: next, changed };
};

const fixOverScaledGeneratedAffixRecordFromV1 = (
  raw: unknown
): { normalized: unknown; changed: boolean } => {
  const row = toJsonRecord(raw);
  if (!row) return { normalized: raw, changed: false };

  const next: JsonRecord = { ...row };
  const applyType = typeof next.apply_type === 'string' ? next.apply_type : '';
  const attrKey = typeof next.attr_key === 'string' ? next.attr_key : '';
  const effectType = next.effect_type;
  const params = toJsonRecord(next.params);

  let changed = false;
  if (applyType !== 'special' && isRatioValueContext(applyType, attrKey, effectType, params)) {
    changed = normalizeNumericFieldForV1OverScaledFix(next, 'value', {
      attrKeyHint: attrKey,
      applyTypeHint: applyType,
    }) || changed;
  }

  const { normalizedParams, changed: paramsChanged } = normalizeAffixParamsRateFieldsForV1OverScaledFix(next.params);
  if (paramsChanged && normalizedParams) {
    next.params = normalizedParams;
    changed = true;
  }

  return { normalized: next, changed };
};

export const migrateLegacyAffixPoolPercentValues = async (): Promise<void> => {
  const result = await query(`
    SELECT id, rules, affixes
    FROM affix_pool
    WHERE affixes IS NOT NULL
  `);

  let updatedCount = 0;
  for (const row of result.rows) {
    if (!Array.isArray(row.affixes)) continue;

    let affixesChanged = false;
    const normalizedAffixes = row.affixes.map((affixRaw: unknown) => {
      const { normalized, changed } = normalizeAffixDefRecord(affixRaw);
      if (changed) affixesChanged = true;
      return normalized;
    });

    const rulesRecord = toJsonRecord(row.rules);
    let rulesChanged = false;
    let normalizedRules: unknown = row.rules;
    if (rulesRecord) {
      const nextRules: JsonRecord = { ...rulesRecord };
      rulesChanged = normalizeNumericFieldAsPercent(nextRules, 'legendary_chance') || rulesChanged;
      if (rulesChanged) normalizedRules = nextRules;
    }

    if (!affixesChanged && !rulesChanged) continue;

    await query(
      `
        UPDATE affix_pool
        SET rules = $2::jsonb,
            affixes = $3::jsonb,
            updated_at = NOW()
        WHERE id = $1
      `,
      [
        row.id,
        JSON.stringify(normalizedRules ?? {}),
        JSON.stringify(normalizedAffixes),
      ]
    );
    updatedCount += 1;
  }

  if (updatedCount > 0) {
    console.log(`词条池历史百分比口径迁移完成: ${updatedCount} 条`);
  }
};

export const migrateLegacyItemInstanceAffixes = async (): Promise<void> => {
  const result = await query(`
    SELECT id, affixes
    FROM item_instance
    WHERE affixes IS NOT NULL
      AND jsonb_typeof(affixes) = 'array'
  `);

  let updatedCount = 0;
  for (const row of result.rows) {
    if (!Array.isArray(row.affixes)) continue;

    let affixesChanged = false;
    const normalizedAffixes = row.affixes.map((affixRaw: unknown) => {
      const { normalized, changed } = normalizeGeneratedAffixRecord(affixRaw);
      if (changed) affixesChanged = true;
      return normalized;
    });
    if (!affixesChanged) continue;

    await query(
      `
        UPDATE item_instance
        SET affixes = $2::jsonb,
            updated_at = NOW()
        WHERE id = $1
      `,
      [row.id, JSON.stringify(normalizedAffixes)]
    );
    updatedCount += 1;
  }

  if (updatedCount > 0) {
    console.log(`装备实例历史词条百分比口径迁移完成: ${updatedCount} 条`);
  }
};

export const fixOverScaledAffixPoolPercentValuesFromV1 = async (): Promise<void> => {
  const result = await query(`
    SELECT id, rules, affixes
    FROM affix_pool
    WHERE affixes IS NOT NULL
  `);

  let updatedCount = 0;
  for (const row of result.rows) {
    if (!Array.isArray(row.affixes)) continue;

    let affixesChanged = false;
    const normalizedAffixes = row.affixes.map((affixRaw: unknown) => {
      const { normalized, changed } = fixOverScaledAffixDefRecordFromV1(affixRaw);
      if (changed) affixesChanged = true;
      return normalized;
    });

    const rulesRecord = toJsonRecord(row.rules);
    let rulesChanged = false;
    let normalizedRules: unknown = row.rules;
    if (rulesRecord) {
      const nextRules: JsonRecord = { ...rulesRecord };
      rulesChanged = normalizeNumericFieldForV1OverScaledFix(nextRules, 'legendary_chance', { applyTypeHint: 'special' }) || rulesChanged;
      if (rulesChanged) normalizedRules = nextRules;
    }

    if (!affixesChanged && !rulesChanged) continue;

    await query(
      `
        UPDATE affix_pool
        SET rules = $2::jsonb,
            affixes = $3::jsonb,
            updated_at = NOW()
        WHERE id = $1
      `,
      [
        row.id,
        JSON.stringify(normalizedRules ?? {}),
        JSON.stringify(normalizedAffixes),
      ]
    );
    updatedCount += 1;
  }

  if (updatedCount > 0) {
    console.log(`词条池百分比纠偏迁移完成(v2): ${updatedCount} 条`);
  }
};

export const fixOverScaledItemInstanceAffixesFromV1 = async (): Promise<void> => {
  const result = await query(`
    SELECT id, affixes
    FROM item_instance
    WHERE affixes IS NOT NULL
      AND jsonb_typeof(affixes) = 'array'
  `);

  let updatedCount = 0;
  for (const row of result.rows) {
    if (!Array.isArray(row.affixes)) continue;

    let affixesChanged = false;
    const normalizedAffixes = row.affixes.map((affixRaw: unknown) => {
      const { normalized, changed } = fixOverScaledGeneratedAffixRecordFromV1(affixRaw);
      if (changed) affixesChanged = true;
      return normalized;
    });
    if (!affixesChanged) continue;

    await query(
      `
        UPDATE item_instance
        SET affixes = $2::jsonb,
            updated_at = NOW()
        WHERE id = $1
      `,
      [row.id, JSON.stringify(normalizedAffixes)]
    );
    updatedCount += 1;
  }

  if (updatedCount > 0) {
    console.log(`装备实例词条百分比纠偏迁移完成(v2): ${updatedCount} 条`);
  }
};

export const runItemAffixPercentMigrations = async (): Promise<void> => {
  await runDbMigrationOnce({
    migrationKey: 'item_affix_percent_actual_value_v1',
    description: '装备词条相关百分比字段统一为比例值（1=100%）',
    execute: async () => {
      await migrateLegacyAffixPoolPercentValues();
      await migrateLegacyItemInstanceAffixes();
    },
  });

  await runDbMigrationOnce({
    migrationKey: 'item_affix_percent_actual_value_v2_fix_overscaled',
    description: '修正 v1 中被放大 100 倍的历史装备词条百分比值',
    execute: async () => {
      await fixOverScaledAffixPoolPercentValuesFromV1();
      await fixOverScaledItemInstanceAffixesFromV1();
    },
  });
};
