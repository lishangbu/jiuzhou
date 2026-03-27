/**
 * 坊市伙伴功法详情面板
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中渲染单门伙伴功法的名称、层数、标签、描述与已解锁技能，供移动端二级抽屉复用。
 * 2. 做什么：把“当前层已解锁技能”的展示收敛到单一面板，避免购买预览与上架预览各写一套详情结构。
 * 3. 不做什么：不负责弹层开关、不处理点击行为，也不发起任何额外请求。
 *
 * 输入 / 输出：
 * - 输入：`technique` 单门伙伴功法 DTO。
 * - 输出：可直接放入抽屉 body 的详情节点。
 *
 * 数据流 / 状态流：
 * 坊市伙伴 DTO -> `MarketPartnerTechniqueList` 选中功法 -> 本面板渲染描述与技能详情。
 *
 * 复用设计说明：
 * 1. 抽出纯展示面板后，Drawer 壳层只处理开关与容器样式，移动端两个入口共用同一份详情内容。
 * 2. 技能区继续复用 `TechniqueSkillSection`，避免功法技能文案映射在坊市里重复维护。
 * 3. 后续如果桌面端也要增加“固定详情面板”形态，可以直接复用本组件而不需要再拆技能逻辑。
 *
 * 关键边界条件与坑点：
 * 1. 必须只消费 DTO 里已经给出的 `skills`，不能在抽屉打开时再补请求，否则移动端点击会产生额外等待。
 * 2. 描述为空时要给出明确占位，避免抽屉头部只剩标签导致信息断层。
 */
import type { FC } from 'react';
import type { PartnerTechniqueDto } from '../../../../services/api';
import { TechniqueSkillSection } from '../../shared/TechniqueSkillSection';
import { formatPartnerTechniqueLayerLabel } from '../../shared/partnerDisplay';
import { getItemQualityTagClassName } from '../../shared/itemQuality';

interface MarketPartnerTechniqueDetailPanelProps {
  technique: PartnerTechniqueDto;
}

const MarketPartnerTechniqueDetailPanel: FC<MarketPartnerTechniqueDetailPanelProps> = ({ technique }) => {
  return (
    <div className="market-partner-technique-detail">
      <div className="market-partner-technique-detail-summary">
        <div className="market-partner-technique-detail-name">{technique.name}</div>
        <div className="market-partner-technique-detail-tags">
          <span className={`market-list-sheet-tag ${getItemQualityTagClassName(technique.quality)}`}>
            {technique.quality}
          </span>
          <span className="market-list-sheet-tag">
            {formatPartnerTechniqueLayerLabel(technique)}
          </span>
          <span className="market-list-sheet-tag">
            {technique.isInnate ? '天生功法' : '后天功法'}
          </span>
        </div>
        <div className="market-partner-technique-detail-desc">
          {technique.description || '暂无描述'}
        </div>
      </div>

      <TechniqueSkillSection
        title="已解锁技能"
        emptyText="当前层暂无已解锁技能"
        skills={technique.skills}
        loading={false}
        error={null}
        variant="mobile"
      />
    </div>
  );
};

export default MarketPartnerTechniqueDetailPanel;
