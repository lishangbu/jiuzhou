/**
 * 功法书识别共享规则
 *
 * 作用（做什么 / 不做什么）：
 * 1) 做什么：统一识别“普通功法书 / 生成功法书”对应的可学习功法 ID，供物品使用、伙伴打书、路由校验复用。
 * 2) 不做什么：不负责扣物品、不负责落库学习，只返回可复用的解析结果。
 *
 * 输入/输出：
 * - 输入：物品定义、实例 metadata。
 * - 输出：命中时返回 `{ effectType, techniqueId }`；否则返回 `null`。
 *
 * 数据流/状态流：
 * itemDef + itemInstance.metadata -> resolveTechniqueBookLearning -> itemService / partnerService / partnerRoutes。
 *
 * 关键边界条件与坑点：
 * 1) 生成功法书的功法 ID 存在实例 metadata 中，不能只看 item_def。
 * 2) 这里只认“人物功法书”链路，不再识别伙伴专用功法书，避免再次分叉出第二套道具语义。
 */
import type { ItemDefConfig } from '../staticConfigLoader.js';

export type TechniqueBookEffectType = 'learn_technique' | 'learn_generated_technique';

export type TechniqueBookLearning = {
  effectType: TechniqueBookEffectType;
  techniqueId: string;
};

const asString = (value: string | null | undefined): string => {
  return typeof value === 'string' ? value.trim() : '';
};

const asRecord = (
  value: object | null | undefined,
): Record<string, string | number | boolean | object | null | undefined> | null => {
  if (!value || Array.isArray(value)) return null;
  return value as Record<string, string | number | boolean | object | null | undefined>;
};

export const resolveTechniqueBookLearning = (params: {
  itemDef: ItemDefConfig | null | undefined;
  metadata?: object | null;
}): TechniqueBookLearning | null => {
  const { itemDef } = params;
  if (!itemDef || itemDef.enabled === false) return null;

  const metadata = asRecord(params.metadata);
  const effectDefs = Array.isArray(itemDef.effect_defs) ? itemDef.effect_defs : [];
  for (const effectRaw of effectDefs) {
    if (!effectRaw || typeof effectRaw !== 'object' || Array.isArray(effectRaw)) continue;
    const effect = effectRaw as Record<string, string | number | boolean | object | null | undefined>;
    if (asString(effect.trigger as string | null | undefined) !== 'use') continue;

    const effectType = asString(effect.effect_type as string | null | undefined);
    if (effectType === 'learn_technique') {
      const effectParams = asRecord(effect.params as object | null | undefined);
      const techniqueId = asString(effectParams?.technique_id as string | null | undefined);
      if (!techniqueId) return null;
      return {
        effectType: 'learn_technique',
        techniqueId,
      };
    }

    if (effectType === 'learn_generated_technique') {
      const techniqueId = asString(metadata?.generatedTechniqueId as string | null | undefined);
      if (!techniqueId) return null;
      return {
        effectType: 'learn_generated_technique',
        techniqueId,
      };
    }
  }

  return null;
};

