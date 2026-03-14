/**
 * 印记专属附加效果执行器
 *
 * 作用（做什么 / 不做什么）：
 * 1) 做什么：把印记消耗后的专属附加效果统一落到运行时，例如灼痕灼烧/潜爆、蚀心锁抽灵、月痕返灵/连段强化。
 * 2) 不做什么：不处理印记基础叠层/消耗公式，不重复实现 mark 主流程。
 *
 * 输入/输出：
 * - 输入：施法者、目标、consume 结果、当前目标结算结果、来源技能标识。
 * - 输出：直接修改 battle 运行时与 `TargetResult`，无额外返回值。
 *
 * 数据流/状态流：
 * mark.ts -> buildMarkConsumeAddon -> 本模块执行附加效果 -> skill.ts / setBonus.ts 复用同一入口。
 *
 * 关键边界条件与坑点：
 * 1) 本模块只消费 `buildMarkConsumeAddon` 的结构化输出，避免 skill.ts / setBonus.ts 各自手写 markId 分支。
 * 2) 返灵/抽灵写在当前目标的结果上，是为了保留“因该目标印记触发”的可追溯性，不额外扩展日志结构。
 */

import type { BattleUnit, TargetResult } from '../types.js';
import {
  addBuff,
  createDelayedBurstRuntime,
  createNextSkillBonusRuntime,
} from './buff.js';
import {
  buildMarkConsumeAddon,
  getMarkName,
  type MarkConsumeResult,
  type ResolvedMarkEffect,
} from './mark.js';

export const applyMarkConsumeRuntimeAddon = (params: {
  caster: BattleUnit;
  target: BattleUnit;
  config: ResolvedMarkEffect;
  consumed: MarkConsumeResult;
  targetResult: TargetResult;
  sourceSkillId: string;
}): void => {
  const { caster, target, config, consumed, targetResult, sourceSkillId } = params;
  const addon = buildMarkConsumeAddon(config, consumed);

  if (addon.burnDot) {
    const markName = getMarkName(config.markId);
    addBuff(target, {
      id: `mark-addon-${sourceSkillId}-${config.markId}-${Date.now()}`,
      buffDefId: `mark-addon-${sourceSkillId}-${config.markId}-burn`,
      name: `${markName}·灼烧`,
      type: 'debuff',
      category: 'mark',
      sourceUnitId: caster.id,
      maxStacks: 1,
      dot: {
        damage: addon.burnDot.damage,
        damageType: addon.burnDot.damageType,
        element: addon.burnDot.element,
      },
      tags: ['mark_addon', config.markId],
      dispellable: true,
    }, addon.burnDot.duration, 1);
    targetResult.buffsApplied = [...(targetResult.buffsApplied ?? []), `${markName}·灼烧`];
  }

  if (addon.delayedBurst) {
    const markName = getMarkName(config.markId);
    addBuff(target, {
      id: `mark-addon-${sourceSkillId}-${config.markId}-burst-${Date.now()}`,
      buffDefId: `mark-addon-${sourceSkillId}-${config.markId}-burst`,
      name: `${markName}·余烬潜爆`,
      type: 'debuff',
      category: 'mark',
      sourceUnitId: caster.id,
      maxStacks: 1,
      delayedBurst: createDelayedBurstRuntime({
        damage: addon.delayedBurst.damage,
        damageType: addon.delayedBurst.damageType,
        element: addon.delayedBurst.element,
        remainingRounds: addon.delayedBurst.remainingRounds,
      }),
      tags: ['mark_addon', config.markId, 'delayed_burst'],
      dispellable: true,
    }, Math.max(1, addon.delayedBurst.remainingRounds), 1);
    targetResult.buffsApplied = [...(targetResult.buffsApplied ?? []), `${markName}·余烬潜爆`];
  }

  if (addon.restoreLingqi && addon.restoreLingqi > 0) {
    const actualGain = Math.max(
      0,
      Math.min(addon.restoreLingqi, caster.currentAttrs.max_lingqi - caster.lingqi),
    );
    if (actualGain > 0) {
      caster.lingqi += actualGain;
      targetResult.resources = [...(targetResult.resources ?? []), { type: 'lingqi', amount: actualGain }];
    }
  }

  if (addon.drainLingqi && addon.drainLingqi > 0) {
    const casterSpace = Math.max(0, caster.currentAttrs.max_lingqi - caster.lingqi);
    const actualGain = Math.max(0, Math.min(addon.drainLingqi, target.lingqi, casterSpace));
    if (actualGain > 0) {
      target.lingqi -= actualGain;
      caster.lingqi += actualGain;
      targetResult.resources = [...(targetResult.resources ?? []), { type: 'lingqi', amount: actualGain }];
    }
  }

  if (addon.nextSkillBonus && addon.nextSkillBonus.rate > 0) {
    const markName = getMarkName(config.markId);
    addBuff(caster, {
      id: `mark-addon-${sourceSkillId}-${config.markId}-next-skill-${Date.now()}`,
      buffDefId: `mark-addon-${sourceSkillId}-${config.markId}-next-skill`,
      name: `${markName}·追月`,
      type: 'buff',
      category: 'mark',
      sourceUnitId: caster.id,
      maxStacks: 1,
      nextSkillBonus: createNextSkillBonusRuntime({
        rate: addon.nextSkillBonus.rate,
        bonusType: addon.nextSkillBonus.bonusType,
      }),
      tags: ['mark_addon', config.markId, 'next_skill_bonus'],
      dispellable: true,
    }, 1, 1);
  }

};
