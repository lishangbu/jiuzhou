/**
 * BattleArea 普通地图自动开战判定回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定普通地图战斗的目标解析规则，以及“何时允许自动发起本地战斗”的单一判定，防止空目标或重复触发把战斗误判成取消。
 * 2. 不做什么：不挂载 React 组件、不请求后端接口、不覆盖战斗日志渲染与 socket 同步。
 *
 * 输入/输出：
 * - 输入：普通地图敌方单位列表、BattleArea 当前本地开战上下文。
 * - 输出：`resolveLocalBattleMonsterIds` 的解析结果，以及 `shouldAutoStartLocalBattle` 的布尔判定。
 *
 * 数据流/状态流：
 * - 怪物点击后生成 `enemies` -> 解析 monsterIds -> 判定是否允许自动开战。
 *
 * 关键边界条件与坑点：
 * 1. 敌方列表短暂为空时，必须静默等待目标恢复，不能把它当成“战斗取消”。
 * 2. 已有 battleId、已有未结束状态、或已有外部 battleId 时，必须拦截重复自动开战，避免把当前战斗重置掉。
 */

import { describe, expect, it } from 'vitest';
import {
  resolveLocalBattleMonsterIds,
  shouldAutoStartLocalBattle,
} from '../BattleArea/localStartResolver';

describe('resolveLocalBattleMonsterIds', () => {
  it('应从普通地图怪物展示 ID 还原后端需要的 monster_def_id', () => {
    expect(
      resolveLocalBattleMonsterIds([
        { id: 'monster-monster-gray-wolf', name: '灰狼' },
        { id: 'monster-monster-gray-wolf-敌2', name: '灰狼-敌2' },
      ]),
    ).toEqual(['monster-gray-wolf']);
  });

  it('没有有效怪物目标时应返回空数组，而不是伪造取消目标', () => {
    expect(
      resolveLocalBattleMonsterIds([
        { id: 'player-1001', name: '我方' },
        { id: 'npc-guide', name: '引路人' },
      ]),
    ).toEqual([]);
  });
});

describe('shouldAutoStartLocalBattle', () => {
  it('普通地图首次进入战斗页且目标有效时，应允许自动开战', () => {
    expect(
      shouldAutoStartLocalBattle({
        allowLocalStart: true,
        externalBattleId: null,
        monsterIds: ['monster-gray-wolf'],
        currentBattleId: null,
        currentBattlePhase: null,
        isStartingBattle: false,
      }),
    ).toBe(true);
  });

  it('目标暂时为空时，应禁止自动开战，避免误记战斗取消', () => {
    expect(
      shouldAutoStartLocalBattle({
        allowLocalStart: true,
        externalBattleId: null,
        monsterIds: [],
        currentBattleId: null,
        currentBattlePhase: null,
        isStartingBattle: false,
      }),
    ).toBe(false);
  });

  it('当前已在战斗中时，应禁止重复自动开战', () => {
    expect(
      shouldAutoStartLocalBattle({
        allowLocalStart: true,
        externalBattleId: null,
        monsterIds: ['monster-gray-wolf'],
        currentBattleId: 'battle-1',
        currentBattlePhase: 'action',
        isStartingBattle: false,
      }),
    ).toBe(false);
  });

  it('存在外部 battleId 时，应禁止误走普通地图本地开战', () => {
    expect(
      shouldAutoStartLocalBattle({
        allowLocalStart: true,
        externalBattleId: 'battle-reconnect-1',
        monsterIds: ['monster-gray-wolf'],
        currentBattleId: null,
        currentBattlePhase: null,
        isStartingBattle: false,
      }),
    ).toBe(false);
  });
});
