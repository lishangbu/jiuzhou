/**
 * 功法详情视图构建测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定功法详情视图在层数加成上的展示过滤规则，避免详情面板路径继续透出 `0%`。
 * 2. 不做什么：不校验技能升级、标签拼装或消耗图标样式，这些由各自共享模块负责。
 *
 * 输入 / 输出：
 * - 输入：最小可运行的功法定义、层配置与图标解析函数。
 * - 输出：`buildTechniqueDetailView` 生成的层级加成列表。
 *
 * 数据流 / 状态流：
 * Technique DTO -> `buildTechniqueDetailView` -> `TechniqueDetailPanel`。
 *
 * 复用设计说明：
 * 1. 这条测试直接锁住共享详情视图转换器，角色功法、伙伴功法、坊市详情都会一起受保护。
 * 2. `0` 值过滤属于真实复用规则，因此测试放在共享层，而不是绑定某个具体页面组件。
 *
 * 关键边界条件与坑点：
 * 1. 同层存在多个被动时，只能过滤 `0` 值项，不能误删正常加成。
 * 2. 详情视图与总览面板走的是不同数据链，这里必须单独覆盖，避免只改到一半。
 */
import { describe, expect, it } from 'vitest';
import type { TechniqueDefDto, TechniqueLayerDto } from '../../../../services/api';
import { buildTechniqueDetailView } from '../techniqueDetailView';

const technique: TechniqueDefDto = {
  id: 'tech-1',
  code: 'tech_1',
  name: '测试功法',
  type: 'spell',
  quality: '玄',
  quality_rank: 2,
  max_layer: 6,
  required_realm: '练气',
  attribute_type: '法术',
  attribute_element: '雷',
  tags: [],
  description: '测试描述',
  long_desc: '测试长描述',
  icon: 'tech.png',
  obtain_type: null,
  obtain_hint: [],
  sort_weight: 0,
  version: 1,
  enabled: true,
};

const layers: TechniqueLayerDto[] = [
  {
    technique_id: 'tech-1',
    layer: 1,
    cost_spirit_stones: 0,
    cost_exp: 0,
    cost_materials: [],
    passives: [
      { key: 'fagong', value: 0 },
      { key: 'mingzhong', value: 0.06 },
      { key: 'lingqi_huifu', value: 10 },
    ],
    unlock_skill_ids: [],
    upgrade_skill_ids: [],
    required_realm: null,
    required_quest_id: null,
    layer_desc: null,
  },
];

describe('techniqueDetailView', () => {
  it('buildTechniqueDetailView: 应过滤每层加成中的 0 值条目', () => {
    const detail = buildTechniqueDetailView({
      technique,
      currentLayer: 1,
      layers,
      skills: [],
      resolveIcon: (icon) => icon ?? '',
      spiritStoneIcon: 'spirit.png',
      expIcon: 'exp.png',
    });

    expect(detail.layers[0]?.bonuses).toStrictEqual([
      {
        key: 'mingzhong',
        label: '命中',
        value: '+6%',
        amount: 0.06,
      },
      {
        key: 'lingqi_huifu',
        label: '灵气恢复',
        value: '+10',
        amount: 10,
      },
    ]);
  });
});
