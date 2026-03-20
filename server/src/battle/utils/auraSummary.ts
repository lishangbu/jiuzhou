/**
 * 光环日志摘要共享工具
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：统一把光环子效果与整条光环效果格式化成战斗日志文案，供首次施放摘要与每回合 tick 日志共同复用。
 * 2. 做什么：复用 battle 运行时快照值，保证日志显示与实际结算一致，避免前后端各写一套光环文案规则。
 * 3. 不做什么：不执行光环结算，不处理日志拼接时机，也不修改 Buff 的持续时间与叠层逻辑。
 *
 * 输入/输出：
 * - 输入：光环类型、运行时 AuraEffect、或单个 AuraSubEffect。
 * - 输出：可直接写入 battle log 的中文摘要字符串。
 *
 * 数据流/状态流：
 * 技能执行/光环回合结算 -> AuraEffect/AuraSubEffect 运行时快照 -> 本模块格式化 -> action log / aura log 复用。
 *
 * 关键边界条件与坑点：
 * 1. 比率型属性在运行时可能以 `flat` 模式叠加到基础 0 属性上，但日志仍应按百分比展示，不能被截成 `+0`。
 * 2. 光环子 Buff 的 `buffDefId` 可能只是内部 key；若没有 attrModifiers/hot/dot 等结构化快照，才退回到翻译 buffKey。
 */

import type { AuraEffect, AuraSubEffect, AuraTargetType } from '../types.js';
import { normalizeBuffAttrKey } from './buffSpec.js';
import {
  CHARACTER_ATTR_LABEL_MAP,
  CHARACTER_RATIO_ATTR_KEY_SET,
} from '../../services/shared/characterAttrRegistry.js';

const AURA_TARGET_LABEL: Record<AuraTargetType, string> = {
  all_ally: '全体友方',
  all_enemy: '全体敌方',
  self: '自身',
};

const DAMAGE_TYPE_LABEL: Record<'physical' | 'magic' | 'true', string> = {
  physical: '物理',
  magic: '法术',
  true: '真实',
};

const RESOURCE_TYPE_LABEL: Record<'qixue' | 'lingqi', string> = {
  qixue: '气血',
  lingqi: '灵气',
};

const CONTROL_LABEL: Record<string, string> = {
  stun: '眩晕',
  freeze: '冻结',
  silence: '沉默',
  disarm: '缴械',
  root: '定身',
  taunt: '嘲讽',
  fear: '恐惧',
};

const KNOWN_BUFF_LABEL: Record<string, string> = {
  'debuff-burn': '灼烧',
  'buff-hot': '持续治疗',
  'buff-dodge-next': '下一次闪避',
  'buff-reflect-damage': '受击反震',
  'debuff-heal-forbid': '断脉',
  'buff-next-skill-chaos': '下一式异变',
  'buff-aura': '增益光环',
  'debuff-aura': '减益光环',
};

const formatSignedPercent = (value: number): string => {
  const percent = Math.abs(value) * 100;
  return Number.isInteger(percent) ? `${percent}%` : `${Number(percent.toFixed(2))}%`;
};

const formatSignedInt = (value: number): string => {
  return `${Math.abs(Math.floor(value))}`;
};

export const translateBattleBuffName = (buffKey: string): string => {
  const raw = buffKey.trim();
  if (!raw) return '';

  const known = KNOWN_BUFF_LABEL[raw];
  if (known) return known;

  if (raw.startsWith('control-')) {
    return CONTROL_LABEL[raw.slice('control-'.length)] ?? raw;
  }

  const matched = /^(buff|debuff)-([a-z0-9_-]+)-(up|down)$/i.exec(raw);
  if (!matched) return raw;

  const [, kind, attrRaw, directionRaw] = matched;
  const attrKey = normalizeBuffAttrKey(attrRaw);
  const attrLabel = CHARACTER_ATTR_LABEL_MAP[attrKey as keyof typeof CHARACTER_ATTR_LABEL_MAP] ?? attrKey;
  const direction = directionRaw.toLowerCase() === 'down'
    ? '降低'
    : directionRaw.toLowerCase() === 'up'
      ? '提升'
      : kind.toLowerCase() === 'buff'
        ? '提升'
        : '降低';
  return `${attrLabel}${direction}`;
};

export const buildAuraSubEffectSummary = (sub: AuraSubEffect): string => {
  if (sub.type === 'damage') {
    const damageType = DAMAGE_TYPE_LABEL[sub.damageType ?? 'physical'] ?? '伤害';
    return `${damageType}伤害${Math.max(1, Math.floor(sub.resolvedValue))}`;
  }
  if (sub.type === 'heal') {
    return `治疗+${Math.max(1, Math.floor(sub.resolvedValue))}`;
  }
  if (sub.type === 'resource') {
    const resourceType = RESOURCE_TYPE_LABEL[sub.resourceType ?? 'lingqi'] ?? '资源';
    const value = Math.floor(sub.resolvedValue);
    return `${resourceType}${value >= 0 ? '+' : '-'}${formatSignedInt(value)}`;
  }
  if (sub.type === 'restore_lingqi') {
    return `灵气+${Math.max(1, Math.floor(sub.resolvedValue))}`;
  }
  if (sub.type !== 'buff' && sub.type !== 'debuff') {
    return '';
  }

  const attrModifiers = sub.attrModifiers ?? [];
  if (attrModifiers.length > 0) {
    return attrModifiers
      .map((modifier) => {
        const attrKey = normalizeBuffAttrKey(modifier.attr);
        const attrLabel = CHARACTER_ATTR_LABEL_MAP[attrKey as keyof typeof CHARACTER_ATTR_LABEL_MAP] ?? attrKey;
        const direction = modifier.value >= 0 ? '提升' : '降低';
        const shouldFormatAsPercent =
          modifier.mode === 'percent'
          || CHARACTER_RATIO_ATTR_KEY_SET.has(attrKey);
        const valueText = shouldFormatAsPercent
          ? formatSignedPercent(modifier.value)
          : formatSignedInt(modifier.value);
        return `${attrLabel}${direction}${valueText}`;
      })
      .join('、');
  }
  if (sub.hot) {
    return `持续治疗+${Math.max(1, Math.floor(sub.hot.heal))}`;
  }
  if (sub.dot) {
    const buffName = translateBattleBuffName(sub.buffDefId ?? 'debuff-burn');
    return `${buffName}${Math.max(1, Math.floor(sub.dot.damage))}`;
  }
  if (sub.healForbidden) {
    return '断脉';
  }
  return translateBattleBuffName(sub.buffDefId ?? (sub.type === 'buff' ? 'buff-aura' : 'debuff-aura'));
};

export const buildAuraApplySummary = (
  buffType: 'buff' | 'debuff',
  aura: AuraEffect,
): string => {
  const auraName = buffType === 'buff' ? '增益光环' : '减益光环';
  const targetLabel = AURA_TARGET_LABEL[aura.auraTarget] ?? '范围';
  const effectLabels = aura.effects
    .map((sub) => buildAuraSubEffectSummary(sub))
    .filter((label) => label.length > 0);

  if (effectLabels.length === 0) return auraName;
  return `${auraName}（${targetLabel}：${effectLabels.join('、')}）`;
};
