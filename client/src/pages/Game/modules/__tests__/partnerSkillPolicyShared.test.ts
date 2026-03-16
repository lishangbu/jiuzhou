/**
 * 伙伴技能策略共享纯函数测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁住前端“顺序即优先级”的重排规则，避免 JSX 内联逻辑回归。
 * 2. 做什么：验证启用/禁用切换与保存 payload 构造统一走共享纯函数。
 * 3. 不做什么：不渲染真实弹窗，不发请求，也不覆盖后端策略校验。
 *
 * 输入/输出：
 * - 输入：技能策略 entries 列表。
 * - 输出：分组结果、移动后的 entries、提交用 slots。
 *
 * 数据流/状态流：
 * partner skill policy DTO -> partnerShared 纯函数 -> PartnerModal 技能策略面板。
 *
 * 关键边界条件与坑点：
 * 1. 禁用后的技能必须沉到禁用区末尾，不能继续保留启用优先级。
 * 2. 重新启用时必须追加到启用区末尾，避免和现有顺序抢位。
 */

import { describe, expect, it } from 'vitest';
import type { PartnerSkillPolicyEntryDto } from '../../../../services/api/partner';
import {
  buildPartnerSkillPolicySlots,
  groupPartnerSkillPolicyEntries,
  movePartnerSkillPolicyEntry,
  reorderPartnerSkillPolicyEntry,
  togglePartnerSkillPolicyEntry,
} from '../PartnerModal/partnerShared';

const createEntries = (): PartnerSkillPolicyEntryDto[] => [
  {
    skillId: 'skill-a',
    skillName: '青木斩',
    skillIcon: '/a.png',
    sourceTechniqueId: 'tech-a',
    sourceTechniqueName: '青木诀',
    sourceTechniqueQuality: '黄',
    priority: 1,
    enabled: true,
  },
  {
    skillId: 'skill-b',
    skillName: '落叶式',
    skillIcon: '/b.png',
    sourceTechniqueId: 'tech-a',
    sourceTechniqueName: '青木诀',
    sourceTechniqueQuality: '黄',
    priority: 2,
    enabled: true,
  },
  {
    skillId: 'skill-c',
    skillName: '灵藤护体',
    skillIcon: '/c.png',
    sourceTechniqueId: 'tech-b',
    sourceTechniqueName: '藤灵诀',
    sourceTechniqueQuality: '玄',
    priority: 3,
    enabled: false,
  },
];

describe('groupPartnerSkillPolicyEntries', () => {
  it('应正确拆分启用与禁用分组', () => {
    const result = groupPartnerSkillPolicyEntries(createEntries());
    expect(result.enabledEntries.map((entry) => entry.skillId)).toEqual(['skill-a', 'skill-b']);
    expect(result.disabledEntries.map((entry) => entry.skillId)).toEqual(['skill-c']);
  });
});

describe('movePartnerSkillPolicyEntry', () => {
  it('上移后应重排启用区优先级', () => {
    const result = movePartnerSkillPolicyEntry(createEntries(), 'skill-b', 'up');
    expect(result.map((entry) => [entry.skillId, entry.priority, entry.enabled])).toEqual([
      ['skill-b', 1, true],
      ['skill-a', 2, true],
      ['skill-c', 3, false],
    ]);
  });
});

describe('reorderPartnerSkillPolicyEntry', () => {
  it('拖拽换位后应按目标位置重排启用区优先级', () => {
    const result = reorderPartnerSkillPolicyEntry(createEntries(), 'skill-b', 'skill-a');
    expect(result.map((entry) => [entry.skillId, entry.priority, entry.enabled])).toEqual([
      ['skill-b', 1, true],
      ['skill-a', 2, true],
      ['skill-c', 3, false],
    ]);
  });

  it('拖到后面的技能上时应落到目标后面', () => {
    const result = reorderPartnerSkillPolicyEntry([
      ...createEntries(),
      {
        skillId: 'skill-d',
        skillName: '飞花步',
        skillIcon: '/d.png',
        sourceTechniqueId: 'tech-b',
        sourceTechniqueName: '藤灵诀',
        sourceTechniqueQuality: '玄',
        priority: 4,
        enabled: true,
      },
    ], 'skill-a', 'skill-d');
    expect(result.map((entry) => [entry.skillId, entry.priority, entry.enabled])).toEqual([
      ['skill-b', 1, true],
      ['skill-d', 2, true],
      ['skill-a', 3, true],
      ['skill-c', 4, false],
    ]);
  });

  it('拖拽到自身时应保持原顺序', () => {
    const result = reorderPartnerSkillPolicyEntry(createEntries(), 'skill-a', 'skill-a');
    expect(result.map((entry) => [entry.skillId, entry.priority, entry.enabled])).toEqual([
      ['skill-a', 1, true],
      ['skill-b', 2, true],
      ['skill-c', 3, false],
    ]);
  });
});

describe('togglePartnerSkillPolicyEntry', () => {
  it('禁用技能后应移到禁用区末尾', () => {
    const result = togglePartnerSkillPolicyEntry(createEntries(), 'skill-a');
    expect(result.map((entry) => [entry.skillId, entry.priority, entry.enabled])).toEqual([
      ['skill-b', 1, true],
      ['skill-c', 2, false],
      ['skill-a', 3, false],
    ]);
  });

  it('重新启用技能后应追加到启用区末尾', () => {
    const result = togglePartnerSkillPolicyEntry(createEntries(), 'skill-c');
    expect(result.map((entry) => [entry.skillId, entry.priority, entry.enabled])).toEqual([
      ['skill-a', 1, true],
      ['skill-b', 2, true],
      ['skill-c', 3, true],
    ]);
  });
});

describe('buildPartnerSkillPolicySlots', () => {
  it('应输出保存所需的完整 slots', () => {
    expect(buildPartnerSkillPolicySlots(createEntries())).toEqual([
      { skillId: 'skill-a', priority: 1, enabled: true },
      { skillId: 'skill-b', priority: 2, enabled: true },
      { skillId: 'skill-c', priority: 3, enabled: false },
    ]);
  });
});
