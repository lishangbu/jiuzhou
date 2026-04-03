/**
 * 功法被动加成共享模块
 *
 * 作用：
 * 1. 统一处理“已解锁层数 -> 被动列表 -> 同属性合并”的展示口径，避免 TechniqueModal 的总览、Tooltip、行内摘要各写一份合并逻辑。
 * 2. 只负责功法被动的提取、合并与数值格式化，不负责技能、层级消耗或表格 UI 渲染。
 *
 * 输入 / 输出：
 * - 输入：层级数组（每层包含 `bonuses`）、当前已修炼层数，以及单条被动的 `key / label / amount`。
 * - 输出：过滤掉 0 值后的已解锁被动列表，或按 `key` 聚合后的展示列表（保留首个出现顺序）。
 *
 * 数据流：
 * - TechniqueModal 先把后端 passives 适配为 `TechniqueBonus`。
 * - 本模块从已解锁层中提取 bonuses，必要时按 key 求和，再统一生成展示值。
 *
 * 关键边界条件与坑点：
 * 1. `currentLayer` 可能小于 0 或大于层数总数，必须先钳制，避免 slice 越界后出现展示漂移。
 * 2. 合并必须按 `key` 而不是 `label`，否则未来文案调整或别名变化会把本应相同的被动拆成两条。
 * 3. 聚合后必须重新格式化 `value`，不能复用原字符串，否则 `+6%` 与 `+10%` 合并后仍会显示旧值。
 * 4. `0` 或浮点误差产生的近似 0 被动必须直接隐藏，否则 UI 会出现无信息量的 `0%`/`0` 噪音。
 * 5. 本模块不做兜底兼容；调用方应保证传入的 `amount` 已经是合法数字。
 */
import { formatTechniquePassiveAmount, shouldDisplayTechniquePassiveAmount } from '../../shared/techniquePassiveDisplay';

export type TechniqueBonus = {
  key: string;
  label: string;
  value: string;
  amount: number;
};

type TechniqueLayerBonuses = {
  bonuses: TechniqueBonus[];
};

const clampUnlockedLayerCount = (currentLayer: number, totalLayers: number): number =>
  Math.max(0, Math.min(currentLayer, totalLayers));

const filterVisibleTechniqueBonuses = (bonuses: TechniqueBonus[]): TechniqueBonus[] => {
  return bonuses.filter((bonus) => shouldDisplayTechniquePassiveAmount(bonus.amount));
};

export const formatTechniqueBonusAmount = (key: string, amount: number): string => {
  return formatTechniquePassiveAmount(key, amount);
};

export const getUnlockedTechniqueBonuses = <T extends TechniqueLayerBonuses>(
  layers: T[],
  currentLayer: number,
): TechniqueBonus[] => layers
  .slice(0, clampUnlockedLayerCount(currentLayer, layers.length))
  .flatMap((layer) => filterVisibleTechniqueBonuses(layer.bonuses));

export const mergeTechniqueBonuses = (bonuses: TechniqueBonus[]): TechniqueBonus[] => {
  const merged = new Map<string, TechniqueBonus>();

  bonuses.forEach((bonus) => {
    if (!shouldDisplayTechniquePassiveAmount(bonus.amount)) {
      return;
    }

    const existing = merged.get(bonus.key);
    if (!existing) {
      merged.set(bonus.key, {
        ...bonus,
        value: formatTechniqueBonusAmount(bonus.key, bonus.amount),
      });
      return;
    }

    const nextAmount = existing.amount + bonus.amount;
    if (!shouldDisplayTechniquePassiveAmount(nextAmount)) {
      merged.delete(bonus.key);
      return;
    }

    merged.set(bonus.key, {
      ...existing,
      amount: nextAmount,
      value: formatTechniqueBonusAmount(existing.key, nextAmount),
    });
  });

  return Array.from(merged.values());
};

export const getMergedUnlockedTechniqueBonuses = <T extends TechniqueLayerBonuses>(
  layers: T[],
  currentLayer: number,
): TechniqueBonus[] => mergeTechniqueBonuses(getUnlockedTechniqueBonuses(layers, currentLayer));
