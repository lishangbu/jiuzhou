/**
 * 坊市伙伴功法二级抽屉
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：为移动端功法卡片提供二级底部抽屉，承载单门功法的完整技能详情。
 * 2. 做什么：统一购买预览与上架预览两条移动端链路的功法详情容器，避免每个入口各自维护一套 Drawer 状态和样式。
 * 3. 不做什么：不决定哪门功法被选中，也不处理列表点击来源。
 *
 * 输入 / 输出：
 * - 输入：`open` 是否打开、`technique` 当前选中的功法、`onClose` 关闭回调。
 * - 输出：一个 antd `Drawer` 节点。
 *
 * 数据流 / 状态流：
 * `MarketPartnerTechniqueList` 内部选中状态 -> 本抽屉 -> `MarketPartnerTechniqueDetailPanel`。
 *
 * 复用设计说明：
 * 1. 抽屉容器从列表里独立出来后，列表只负责“选中哪门功法”，容器与内容各司其职，减少状态耦合。
 * 2. 该容器复用坊市移动端已有 Drawer 视觉基线，只补功法详情本身需要的标题与正文区。
 *
 * 关键边界条件与坑点：
 * 1. `technique` 为空时不能渲染详情面板，避免关闭动画期间短暂输出空内容。
 * 2. 抽屉标题必须跟随当前选中功法更新，不能缓存上一次标题，否则连续点击不同功法会出现标题漂移。
 */
import type { FC } from 'react';
import { Drawer } from 'antd';
import type { PartnerTechniqueDto } from '../../../../services/api';
import MarketPartnerTechniqueDetailPanel from './MarketPartnerTechniqueDetailPanel';

interface MarketPartnerTechniqueDrawerProps {
  open: boolean;
  technique: PartnerTechniqueDto | null;
  onClose: () => void;
}

const MarketPartnerTechniqueDrawer: FC<MarketPartnerTechniqueDrawerProps> = ({
  open,
  technique,
  onClose,
}) => {
  return (
    <Drawer
      title={technique?.name ?? '功法详情'}
      placement="bottom"
      open={open}
      onClose={onClose}
      height="62dvh"
      className="market-mobile-preview-drawer market-partner-technique-drawer"
      styles={{ body: { padding: '10px 12px 12px' } }}
    >
      {technique ? <MarketPartnerTechniqueDetailPanel technique={technique} /> : null}
    </Drawer>
  );
};

export default MarketPartnerTechniqueDrawer;
