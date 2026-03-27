/**
 * 坊市伙伴功法列表回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定移动端伙伴详情里功法卡片的抽屉交互协议，确保列表项会渲染成可点击入口，技能详情则进入单独面板。
 * 2. 做什么：把“功法技能展示模式”约束在共享列表与详情面板单一入口，避免移动端预览和桌面端 Tooltip 再次出现分叉。
 * 3. 不做什么：不验证 antd Drawer 的打开动画、不挂载真实弹窗，也不覆盖购买按钮逻辑。
 *
 * 输入 / 输出：
 * - 输入：带有已解锁技能的 `PartnerTechniqueDto` 列表，以及 `drawer` 技能展示模式。
 * - 输出：静态 HTML 片段；列表入口需可点击，详情面板需包含技能区标题与技能名称。
 *
 * 数据流 / 状态流：
 * 伙伴详情 DTO -> `MarketPartnerTechniqueList` -> `MarketPartnerTechniqueDetailPanel` -> 移动端伙伴预览二级抽屉。
 *
 * 复用设计说明：
 * 1. 直接针对共享列表组件与详情面板做回归，移动端购买预览与移动端上架预览都能一起受保护。
 * 2. 桌面端继续共用同一组件，只通过展示模式切换 Tooltip / Drawer，避免复制两套功法 UI。
 *
 * 关键边界条件与坑点：
 * 1. 技能名必须与功法名不同，才能确保测试断言命中的确是技能内容，而不是误命中功法标题。
 * 2. 移动端没有 hover，若 `drawer` 模式下列表直接把技能渲染出来，后续很容易再次退化成主弹层过长。
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PartnerTechniqueDto } from '../../../../../services/api';
import MarketPartnerTechniqueList from '../MarketPartnerTechniqueList';
import MarketPartnerTechniqueDetailPanel from '../MarketPartnerTechniqueDetailPanel';

const createTechnique = (): PartnerTechniqueDto => ({
  techniqueId: 'tech-mowu-linzhen',
  name: '玄雾鳞障',
  description: '墨鳞吐雾凝鳞成障，偏重护体续战。',
  icon: '/assets/partner/tech-mowu-linzhen.png',
  quality: '玄',
  currentLayer: 1,
  maxLayer: 4,
  skillIds: ['skill-mowu-huxin'],
  skills: [
    {
      id: 'skill-mowu-huxin',
      name: '墨雾护心',
      icon: '/assets/skills/icon_skill_31.png',
      description: '吐出护体墨雾，降低本回合所受伤害。',
      cooldown: 2,
      target_type: 'self',
      effects: [],
    },
  ],
  passiveAttrs: {},
  isInnate: true,
});

describe('MarketPartnerTechniqueList', () => {
  it('移动端抽屉模式应渲染可点击功法入口而不是直接内联技能', () => {
    const html = renderToStaticMarkup(
      <MarketPartnerTechniqueList
        techniques={[createTechnique()]}
        skillDisplayMode="drawer"
      />,
    );

    expect(html).toContain('market-partner-technique-trigger');
    expect(html).not.toContain('已解锁技能');
    expect(html).not.toContain('墨雾护心');
  });

  it('详情面板应展示已解锁技能列表', () => {
    const html = renderToStaticMarkup(
      <MarketPartnerTechniqueDetailPanel technique={createTechnique()} />,
    );

    expect(html).toContain('已解锁技能');
    expect(html).toContain('墨雾护心');
  });
});
