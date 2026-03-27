/**
 * 坊市伙伴功法列表共享组件
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中渲染坊市伙伴详情里的功法名称、当前层数与描述，供上架预览、购买详情、移动端预览三类入口复用。
 * 2. 做什么：把“功法层数展示必须读取真实 `currentLayer/maxLayer`”与“桌面端 Tooltip / 移动端二级抽屉”两套规则收敛到单一入口，避免多个 JSX 分支再次各写一份字符串。
 * 3. 不做什么：不处理坊市购买/上架按钮，也不负责伙伴属性区域布局。
 *
 * 输入/输出：
 * - 输入：伙伴功法列表、单列布局开关，以及技能展示模式。
 * - 输出：统一的坊市功法列表 DOM 结构；无功法时输出占位文案。
 *
 * 数据流/状态流：
 * 坊市伙伴 DTO -> 调用方传入 `techniques` -> 本组件格式化层数字样并渲染 -> 多个坊市详情入口共用。
 *
 * 关键边界条件与坑点：
 * 1. 层数字样必须始终从 DTO 实际值读取，不能再写死“第一层”，否则坊市会与伙伴面板展示脱节。
 * 2. 移动端无 hover 能力，技能展示不能再依赖 Tooltip；必须通过显式模式切换为二级抽屉，避免主弹层过长且信息仍然不可达。
 * 3. 单列与双列仅允许通过布局参数控制，内容结构本身保持一致，避免后续修文案时又在不同弹层漏改一处。
 */
import { useState, type FC } from 'react';
import { Tooltip } from 'antd';
import type { PartnerTechniqueDto } from '../../../../services/api';
import { formatPartnerTechniqueLayerLabel } from '../../shared/partnerDisplay';
import MarketPartnerTechniqueDrawer from './MarketPartnerTechniqueDrawer';
import MarketPartnerTechniqueTooltip, {
  MARKET_PARTNER_TECHNIQUE_TOOLTIP_CLASS_NAMES,
} from './MarketPartnerTechniqueTooltip';

export type MarketPartnerTechniqueSkillDisplayMode = 'none' | 'tooltip' | 'drawer';

interface MarketPartnerTechniqueListProps {
  techniques: PartnerTechniqueDto[];
  skillDisplayMode?: MarketPartnerTechniqueSkillDisplayMode;
  singleColumn?: boolean;
}

const MarketPartnerTechniqueList: FC<MarketPartnerTechniqueListProps> = ({
  techniques,
  skillDisplayMode = 'none',
  singleColumn = false,
}) => {
  const [selectedTechniqueId, setSelectedTechniqueId] = useState<string | null>(null);

  if (techniques.length <= 0) {
    return <div className="market-list-detail-text">暂无功法</div>;
  }

  const selectedTechnique = selectedTechniqueId
    ? techniques.find((technique) => technique.techniqueId === selectedTechniqueId) ?? null
    : null;

  return (
    <>
      <div
        className="market-partner-technique-grid"
        style={singleColumn ? { gridTemplateColumns: '1fr' } : undefined}
      >
        {techniques.map((technique) => {
          const shouldUseTooltip = skillDisplayMode === 'tooltip';
          const shouldUseDrawer = skillDisplayMode === 'drawer';
          const isInteractive = shouldUseTooltip || shouldUseDrawer;
          const content = (
            <div
              className={[
                'market-partner-technique-cell',
                isInteractive ? 'market-partner-technique-cell--interactive' : '',
              ].filter(Boolean).join(' ')}
            >
              <div className="market-partner-technique-name">
                {technique.name}
                <span className="market-partner-technique-level">
                  {formatPartnerTechniqueLayerLabel(technique)}
                </span>
              </div>
              <div className="market-partner-technique-desc">{technique.description || '暂无描述'}</div>
            </div>
          );

          if (shouldUseTooltip) {
            return (
              <Tooltip
                key={technique.techniqueId}
                title={<MarketPartnerTechniqueTooltip technique={technique} />}
                placement={singleColumn ? 'leftTop' : 'topLeft'}
                classNames={MARKET_PARTNER_TECHNIQUE_TOOLTIP_CLASS_NAMES}
              >
                <button type="button" className="market-partner-technique-trigger">
                  {content}
                </button>
              </Tooltip>
            );
          }

          if (shouldUseDrawer) {
            return (
              <button
                key={technique.techniqueId}
                type="button"
                className="market-partner-technique-trigger"
                onClick={() => setSelectedTechniqueId(technique.techniqueId)}
              >
                {content}
              </button>
            );
          }

          return <div key={technique.techniqueId}>{content}</div>;
        })}
      </div>
      {skillDisplayMode === 'drawer' ? (
        <MarketPartnerTechniqueDrawer
          open={selectedTechnique !== null}
          technique={selectedTechnique}
          onClose={() => setSelectedTechniqueId(null)}
        />
      ) : null}
    </>
  );
};

export default MarketPartnerTechniqueList;
