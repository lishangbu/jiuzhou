import type { PoolClient } from 'pg';
import type { AffixDef, AffixPoolRules, GeneratedAffix, Quality } from './equipmentService.js';

export interface RerollAffixPool {
  rules: AffixPoolRules;
  affixes: AffixDef[];
}

export interface RerollResult {
  success: boolean;
  message: string;
  affixes?: GeneratedAffix[];
}

const QUALITY_BY_RANK: Record<number, Quality> = {
  1: '黄',
  2: '玄',
  3: '地',
  4: '天',
};

const QUALITY_MULTIPLIER_BY_RANK: Record<number, number> = {
  1: 1,
  2: 1.2,
  3: 1.45,
  4: 1.75,
};

const EQUIP_REALM_ORDER = [
  '凡人',
  '炼精化炁·养气期',
  '炼精化炁·通脉期',
  '炼精化炁·凝炁期',
  '炼炁化神·炼己期',
  '炼炁化神·采药期',
  '炼炁化神·结胎期',
  '炼神返虚·养神期',
  '炼神返虚·还虚期',
  '炼神返虚·合道期',
  '炼虚合道·证道期',
  '炼虚合道·历劫期',
  '炼虚合道·成圣期',
] as const;

type EquipRealm = (typeof EQUIP_REALM_ORDER)[number];

const EQUIP_REALM_MAJOR_TO_FIRST: Record<string, EquipRealm> = {
  凡人: '凡人',
  炼精化炁: '炼精化炁·养气期',
  炼炁化神: '炼炁化神·炼己期',
  炼神返虚: '炼神返虚·养神期',
  炼虚合道: '炼虚合道·证道期',
};

const EQUIP_REALM_SUB_TO_FULL: Record<string, EquipRealm> = {
  养气期: '炼精化炁·养气期',
  通脉期: '炼精化炁·通脉期',
  凝炁期: '炼精化炁·凝炁期',
  炼己期: '炼炁化神·炼己期',
  采药期: '炼炁化神·采药期',
  结胎期: '炼炁化神·结胎期',
  养神期: '炼神返虚·养神期',
  还虚期: '炼神返虚·还虚期',
  合道期: '炼神返虚·合道期',
  证道期: '炼虚合道·证道期',
  历劫期: '炼虚合道·历劫期',
  成圣期: '炼虚合道·成圣期',
};

const isQuality = (value: unknown): value is Quality => {
  return value === '黄' || value === '玄' || value === '地' || value === '天';
};

const toNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const clampInt = (value: number, min: number, max: number): number => {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.max(min, Math.min(max, Math.floor(num)));
};

const normalizeQualityByRank = (qualityRankRaw: unknown): Quality => {
  const rank = clampInt(toNumber(qualityRankRaw, 1), 1, 4);
  return QUALITY_BY_RANK[rank] ?? '黄';
};

export const resolveQualityForReroll = (
  instanceQualityRaw: unknown,
  instanceQualityRankRaw: unknown,
  defQualityRaw: unknown,
  defQualityRankRaw: unknown
): Quality => {
  if (isQuality(instanceQualityRaw)) return instanceQualityRaw;
  if (isQuality(defQualityRaw)) return defQualityRaw;
  const instanceRankQuality = normalizeQualityByRank(instanceQualityRankRaw);
  if (instanceRankQuality) return instanceRankQuality;
  return normalizeQualityByRank(defQualityRankRaw);
};

export const getQualityMultiplierForReroll = (qualityRankRaw: unknown): number => {
  const rank = clampInt(toNumber(qualityRankRaw, 1), 1, 4);
  return QUALITY_MULTIPLIER_BY_RANK[rank] ?? 1;
};

const isEquipRealm = (value: string): value is EquipRealm => {
  return (EQUIP_REALM_ORDER as readonly string[]).includes(value);
};

const normalizeEquipRealm = (realmRaw?: unknown): EquipRealm => {
  const raw = typeof realmRaw === 'string' ? realmRaw.trim() : '';
  if (!raw) return '凡人';
  if (isEquipRealm(raw)) return raw;

  const mappedMajor = EQUIP_REALM_MAJOR_TO_FIRST[raw];
  if (mappedMajor) return mappedMajor;

  const mappedSub = EQUIP_REALM_SUB_TO_FULL[raw];
  if (mappedSub) return mappedSub;

  const split = raw.split('·');
  if (split.length >= 2) {
    const full = `${split[0]}·${split[1]}`;
    if (isEquipRealm(full)) return full;
    const subMapped = EQUIP_REALM_SUB_TO_FULL[split[1] ?? ''];
    if (subMapped) return subMapped;
  }
  return '凡人';
};

export const getEquipRealmRankForReroll = (realmRaw?: unknown): number => {
  const normalized = normalizeEquipRealm(realmRaw);
  const index = EQUIP_REALM_ORDER.indexOf(normalized);
  return index >= 0 ? index + 1 : 1;
};

const normalizeGeneratedAffixApplyType = (value: unknown): GeneratedAffix['apply_type'] | null => {
  if (value === 'flat' || value === 'percent' || value === 'special') return value;
  return null;
};

export const parseGeneratedAffixesForReroll = (raw: unknown): GeneratedAffix[] => {
  let arr: unknown = raw;
  if (typeof arr === 'string') {
    try {
      arr = JSON.parse(arr) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  const out: GeneratedAffix[] = [];

  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const applyType = normalizeGeneratedAffixApplyType(row.apply_type);
    if (!applyType) continue;

    const key = typeof row.key === 'string' ? row.key.trim() : '';
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    const attrKey = typeof row.attr_key === 'string' ? row.attr_key.trim() : '';
    if (!key || !name || !attrKey) continue;

    const tier = Math.max(1, clampInt(toNumber(row.tier, 1), 1, 99));
    const value = Math.floor(toNumber(row.value, 0));

    const parsed: GeneratedAffix = {
      key,
      name,
      attr_key: attrKey,
      apply_type: applyType,
      tier,
      value,
      is_legendary: Boolean(row.is_legendary),
      description: typeof row.description === 'string' ? row.description : undefined,
    };

    if (applyType === 'special') {
      const trigger = typeof row.trigger === 'string' ? row.trigger : undefined;
      const target = typeof row.target === 'string' ? row.target : undefined;
      const effectType = typeof row.effect_type === 'string' ? row.effect_type : undefined;
      const durationRoundRaw = toNumber(row.duration_round, NaN);
      const durationRound = Number.isFinite(durationRoundRaw)
        ? Math.max(1, Math.floor(durationRoundRaw))
        : undefined;
      const paramsRaw =
        row.params && typeof row.params === 'object' && !Array.isArray(row.params)
          ? (row.params as Record<string, unknown>)
          : null;
      if (trigger) parsed.trigger = trigger as GeneratedAffix['trigger'];
      if (target) parsed.target = target as GeneratedAffix['target'];
      if (effectType) parsed.effect_type = effectType as GeneratedAffix['effect_type'];
      if (durationRound !== undefined) parsed.duration_round = durationRound;
      if (paramsRaw) {
        const params: Record<string, string | number | boolean> = {};
        for (const [paramKey, paramValue] of Object.entries(paramsRaw)) {
          if (typeof paramValue === 'string' || typeof paramValue === 'boolean') {
            params[paramKey] = paramValue;
            continue;
          }
          if (typeof paramValue === 'number' && Number.isFinite(paramValue)) {
            params[paramKey] = paramValue;
          }
        }
        if (Object.keys(params).length > 0) parsed.params = params;
      }
    }
    out.push(parsed);
  }
  return out;
};

export const loadAffixPoolForRerollTx = async (
  client: PoolClient,
  poolId: string
): Promise<RerollAffixPool | null> => {
  const result = await client.query(
    'SELECT rules, affixes FROM affix_pool WHERE id = $1 AND enabled = true LIMIT 1',
    [poolId]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0] as { rules: AffixPoolRules; affixes: AffixDef[] };
  if (!row || !row.rules || !Array.isArray(row.affixes)) return null;
  return {
    rules: row.rules,
    affixes: row.affixes,
  };
};

class SeededRandom {
  private seed: number;

  constructor(seed?: number) {
    this.seed = seed ?? Date.now();
  }

  next(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  nextInt(min: number, max: number): number {
    const safeMin = Math.min(min, max);
    const safeMax = Math.max(min, max);
    return Math.floor(this.next() * (safeMax - safeMin + 1)) + safeMin;
  }

  weightedChoice<T>(items: T[], weights: number[]): T {
    const sanitized = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
    const totalWeight = sanitized.reduce((sum, weight) => sum + weight, 0);
    if (totalWeight <= 0) {
      return items[Math.max(0, Math.min(items.length - 1, this.nextInt(0, Math.max(0, items.length - 1))))];
    }
    let random = this.next() * totalWeight;
    for (let i = 0; i < items.length; i += 1) {
      random -= sanitized[i] ?? 0;
      if (random <= 0) return items[i];
    }
    return items[items.length - 1];
  }
}

const rollAffixValue = (rng: SeededRandom, affix: AffixDef, realmRank: number, attrFactor: number): GeneratedAffix | null => {
  const validTiers = affix.tiers
    .filter((tier) => toNumber(tier.realm_rank_min, 0) <= realmRank)
    .sort((a, b) => toNumber(b.tier, 0) - toNumber(a.tier, 0));
  if (validTiers.length === 0) return null;

  const tierWeights = validTiers.map((_, idx) => Math.pow(0.6, idx));
  const selectedTier = rng.weightedChoice(validTiers, tierWeights);
  const min = Math.floor(toNumber(selectedTier.min, 0));
  const max = Math.floor(toNumber(selectedTier.max, 0));
  const value = rng.nextInt(min, max);
  const scaledValue =
    Number.isFinite(attrFactor) && attrFactor !== 1 ? Math.round(value * attrFactor) : value;

  const result: GeneratedAffix = {
    key: affix.key,
    name: affix.name,
    attr_key: affix.attr_key,
    apply_type: affix.apply_type,
    tier: Math.max(1, Math.floor(toNumber(selectedTier.tier, 1))),
    value: scaledValue,
    is_legendary: Boolean(affix.is_legendary),
    description: typeof selectedTier.description === 'string' ? selectedTier.description : undefined,
  };

  if (affix.apply_type === 'special') {
    result.trigger = affix.trigger;
    result.target = affix.target;
    result.effect_type = affix.effect_type;
    result.duration_round =
      typeof affix.duration_round === 'number' && Number.isFinite(affix.duration_round)
        ? Math.max(1, Math.floor(affix.duration_round))
        : undefined;
    if (affix.params) {
      result.params = { ...affix.params };
      if (result.params.value === undefined) result.params.value = scaledValue;
    } else {
      result.params = { value: scaledValue };
    }
  }
  return result;
};

const buildMutexGroups = (rules: AffixPoolRules): string[][] => {
  if (!Array.isArray(rules.mutex_groups)) return [];
  return rules.mutex_groups
    .filter((group) => Array.isArray(group))
    .map((group) =>
      group
        .map((key) => (typeof key === 'string' ? key.trim() : ''))
        .filter((key): key is string => key.length > 0)
    )
    .filter((group) => group.length > 0);
};

export const rerollEquipmentAffixesWithLocks = (params: {
  currentAffixes: GeneratedAffix[];
  lockIndexes: number[];
  pool: RerollAffixPool;
  quality: Quality;
  realmRank: number;
  attrFactor: number;
}): RerollResult => {
  const currentAffixes = params.currentAffixes;
  const totalCount = currentAffixes.length;
  if (totalCount <= 0) {
    return { success: false, message: '该装备没有可洗炼词条' };
  }

  const lockIndexSet = new Set<number>(params.lockIndexes);
  const rerollCount = totalCount - lockIndexSet.size;
  if (rerollCount <= 0) {
    return { success: false, message: '锁定词条数量不合法' };
  }

  const rules = params.pool.rules;
  const mutexGroups = buildMutexGroups(rules);
  const affixDefByKey = new Map<string, AffixDef>();
  for (const def of params.pool.affixes) {
    if (!def || typeof def !== 'object') continue;
    const key = typeof def.key === 'string' ? def.key.trim() : '';
    if (!key) continue;
    affixDefByKey.set(key, def);
  }

  const selectedKeys = new Set<string>();
  const groupCounts: Record<string, number> = {};
  let currentLegendaryCount = 0;

  for (const idx of lockIndexSet) {
    const lockedAffix = currentAffixes[idx];
    if (!lockedAffix) continue;
    selectedKeys.add(lockedAffix.key);
    if (lockedAffix.is_legendary) currentLegendaryCount += 1;
    const def = affixDefByKey.get(lockedAffix.key);
    if (def?.group) groupCounts[def.group] = (groupCounts[def.group] || 0) + 1;
  }

  const legendaryChance = Number.isFinite(Number(rules.legendary_chance))
    ? Math.max(0, Math.min(1, Number(rules.legendary_chance)))
    : 0;
  const additionalLegendary =
    legendaryChance > 0 && new SeededRandom().next() < legendaryChance ? 1 : 0;
  const maxLegendaryCount = currentLegendaryCount + additionalLegendary;

  const getMutexGroupByKey = (key: string): string[] | undefined => {
    return mutexGroups.find((group) => group.includes(key));
  };

  const rng = new SeededRandom();
  const generatedAffixes: GeneratedAffix[] = [];

  for (let i = 0; i < rerollCount; i += 1) {
    const validAffixes = params.pool.affixes.filter((affix) => {
      if (!affix || !affix.key) return false;
      if (!rules.allow_duplicate && selectedKeys.has(affix.key)) return false;

      const mutexGroup = getMutexGroupByKey(affix.key);
      if (mutexGroup && mutexGroup.some((key) => selectedKeys.has(key))) return false;

      const groupLimit = rules.max_per_group?.[affix.group];
      if (typeof groupLimit === 'number' && groupLimit > 0) {
        const currentGroupCount = groupCounts[affix.group] || 0;
        if (currentGroupCount >= groupLimit) return false;
      }

      if (affix.is_legendary && currentLegendaryCount >= maxLegendaryCount) return false;

      const hasValidTier = affix.tiers.some((tier) => toNumber(tier.realm_rank_min, 0) <= params.realmRank);
      return hasValidTier;
    });

    if (validAffixes.length === 0) {
      return { success: false, message: '当前锁定组合无法完成洗炼，请减少锁定词条' };
    }

    const weights = validAffixes.map((affix) => {
      const weight = toNumber(affix.weight, 0);
      return weight > 0 ? weight : 0;
    });
    const selectedAffix = rng.weightedChoice(validAffixes, weights);
    const generated = rollAffixValue(rng, selectedAffix, params.realmRank, params.attrFactor);
    if (!generated) {
      return { success: false, message: '当前锁定组合无法完成洗炼，请减少锁定词条' };
    }

    generatedAffixes.push(generated);
    selectedKeys.add(generated.key);
    groupCounts[selectedAffix.group] = (groupCounts[selectedAffix.group] || 0) + 1;
    if (generated.is_legendary) currentLegendaryCount += 1;
  }

  const finalAffixes: GeneratedAffix[] = [];
  let generatedCursor = 0;
  for (let i = 0; i < totalCount; i += 1) {
    if (lockIndexSet.has(i)) {
      finalAffixes.push(currentAffixes[i]);
      continue;
    }
    const generated = generatedAffixes[generatedCursor];
    if (!generated) {
      return { success: false, message: '当前锁定组合无法完成洗炼，请减少锁定词条' };
    }
    finalAffixes.push(generated);
    generatedCursor += 1;
  }

  if (finalAffixes.length !== totalCount) {
    return { success: false, message: '当前锁定组合无法完成洗炼，请减少锁定词条' };
  }

  return {
    success: true,
    message: 'ok',
    affixes: finalAffixes,
  };
};
