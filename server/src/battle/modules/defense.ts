/**
 * 作用：
 * - 统一封装战斗中的防御减伤曲线计算，避免各模块重复实现同一公式。
 * - 仅负责“减伤率”计算，不处理命中、暴击、招架、五行等其它伤害环节。
 *
 * 输入/输出：
 * - 输入：攻击方、受击方、伤害类型（physical | magic）。
 * - 输出：减伤率（0~1 之间的小数，表示最终伤害需乘以 1 - 减伤率）。
 *
 * 数据流/状态流：
 * - 从 BattleUnit.currentAttrs 读取攻防属性 -> 套用统一公式 -> 返回纯函数结果给 damage 模块消费。
 * - 不修改 BattleState/BattleUnit，不产生副作用。
 *
 * 关键边界条件与坑点：
 * - 至少 1 点攻击参与计算（避免攻击为 0 导致曲线失真或分母异常）。
 * - 防御最低按 0 处理（防止异常负值导致反向增伤）。
 */

import type { BattleUnit } from '../types.js';
import { BATTLE_CONSTANTS } from '../types.js';

type DefenseDamageType = 'physical' | 'magic';

function readAttackByDamageType(unit: BattleUnit, damageType: DefenseDamageType): number {
  const rawAttack = damageType === 'physical'
    ? unit.currentAttrs.wugong
    : unit.currentAttrs.fagong;
  return Math.max(1, rawAttack);
}

function readDefenseByDamageType(unit: BattleUnit, damageType: DefenseDamageType): number {
  const rawDefense = damageType === 'physical'
    ? unit.currentAttrs.wufang
    : unit.currentAttrs.fafang;
  return Math.max(0, rawDefense);
}

export function calculateDefenseReductionRate(
  attacker: BattleUnit,
  defender: BattleUnit,
  damageType: DefenseDamageType
): number {
  const attack = readAttackByDamageType(attacker, damageType);
  const defense = readDefenseByDamageType(defender, damageType);
  const denominator = defense
    + attack * BATTLE_CONSTANTS.DEFENSE_ATTACK_FACTOR
    + BATTLE_CONSTANTS.DEFENSE_BASE_OFFSET;

  if (denominator <= 0) return 0;
  return defense / denominator;
}
