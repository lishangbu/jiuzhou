/**
 * 战斗极速日志格式化回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定光环日志的摘要收敛规则，避免相同效果在每个目标上重复带目标名，导致日志冗长难读。
 * 2. 做什么：覆盖“结果一致时压平成单条摘要”和“结果不一致时保留目标名”两条分支，保证信息量与可读性平衡。
 * 3. 不做什么：不验证服务端 battle log 结构生成，也不覆盖普通 action/dot/hot 的文案格式。
 *
 * 输入/输出：
 * - 输入：前端接收到的 `BattleLogEntryDto` 光环日志对象。
 * - 输出：`formatBattleLogLineFast` 生成的单行中文日志。
 *
 * 数据流/状态流：
 * - battle session log DTO -> logFormatterFast 统一格式化 -> BattleArea / ReplayViewer 共用展示。
 *
 * 复用设计说明：
 * - 直接锁定 `logFormatterFast` 的单一入口，避免在线战斗与离线回放各自维护一套光环日志文案规则。
 * - 一旦日志收敛策略调整，这组测试会同时保护 BattleArea 与 IdleBattle 回放展示口径。
 *
 * 关键边界条件与坑点：
 * 1. 多目标光环在结果完全一致时必须只展示一次效果摘要，不能继续把每个目标名都拼进去。
 * 2. 多目标光环若结果不同，仍必须保留目标名，否则伤害/治疗差异会失去可读性。
 */

import { describe, expect, it } from 'vitest';

import type { BattleLogEntryDto } from '../../../../services/api/combat-realm';
import { formatBattleLogLineFast } from '../BattleArea/logFormatterFast';

describe('battleLogFormatterFast', () => {
  it('开场展开光环的 action 日志应只保留技能名', () => {
    const log: BattleLogEntryDto = {
      type: 'action',
      round: 1,
      actorId: 'player-1',
      actorName: '来自丶白夜',
      skillId: 'skill-aura-open',
      skillName: '大荒无拘域',
      targets: [
        {
          targetId: 'player-1',
          targetName: '来自丶白夜',
          hits: [],
          buffsApplied: ['增益光环（自身：治疗+2655、法攻提升20%、增伤提升15%）'],
        },
      ],
    };

    expect(formatBattleLogLineFast(log)).toBe('第1回合 来自丶白夜 施展【大荒无拘域】');
  });

  it('光环日志应继续保留目标名称，避免范围结果失去指向', () => {
    const log: BattleLogEntryDto = {
      type: 'aura',
      round: 1,
      unitId: 'player-1',
      unitName: '来自丶白夜',
      buffName: 'buff-aura',
      auraTarget: 'all_ally',
      subResults: [
        {
          targetId: 'player-1',
          targetName: '来自丶白夜',
          heal: 2655,
          buffsApplied: ['法攻提升20%', '增伤提升15%'],
        },
        {
          targetId: 'partner-1',
          targetName: '绫非天',
          heal: 2655,
          buffsApplied: ['法攻提升20%', '增伤提升15%'],
        },
      ],
    };

    expect(formatBattleLogLineFast(log)).toBe(
      '第1回合 来自丶白夜 的【增益光环】生效：来自丶白夜（治疗+2655，法攻提升20%，增伤提升15%）；绫非天（治疗+2655，法攻提升20%，增伤提升15%）',
    );
  });

  it('光环对不同目标产生不同结果时，应保留目标名明细', () => {
    const log: BattleLogEntryDto = {
      type: 'aura',
      round: 2,
      unitId: 'monster-1',
      unitName: '赤鳞妖',
      buffName: 'debuff-aura',
      auraTarget: 'all_enemy',
      subResults: [
        {
          targetId: 'player-1',
          targetName: '甲',
          damage: 120,
        },
        {
          targetId: 'player-2',
          targetName: '乙',
          damage: 180,
        },
      ],
    };

    expect(formatBattleLogLineFast(log)).toBe(
      '第2回合 赤鳞妖 的【减益光环】生效：甲（伤害-120）；乙（伤害-180）',
    );
  });
});
