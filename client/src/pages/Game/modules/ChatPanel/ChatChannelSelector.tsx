/**
 * ChatPanel 频道选择区。
 *
 * 作用：
 * 1. 做什么：统一承载聊天频道切换入口，桌面端继续复用 antd Tabs，移动端改为 Dropdown 菜单触发器，彻底移除对横向滑动的依赖。
 * 2. 做什么：把移动端频道按钮布局与桌面端 Tabs 切换逻辑收敛到单一组件，避免 ChatPanel 主文件同时维护两套分支 JSX。
 * 3. 不做什么：不维护频道 state，不处理在线玩家抽屉/弹层状态，也不渲染消息内容。
 *
 * 输入 / 输出：
 * 1. 输入：当前是否移动端、当前激活频道、频道配置列表、额外操作区节点、频道切换回调。
 * 2. 输出：桌面端返回 Tabs，移动端返回频道菜单触发器与操作区。
 *
 * 数据流 / 状态流：
 * 1. ChatPanel 将活跃频道与切换回调传入本组件。
 * 2. 用户点击桌面 Tabs 或移动端按钮后，本组件只回传频道 key。
 * 3. 主组件据此更新 activeChannel，再驱动消息区与输入区切换。
 *
 * 复用设计说明：
 * 1. 移动端与桌面端共用同一份频道数据与回调，避免因平台分支产生重复业务判断。
 * 2. 将“移动端不使用横向滑动”这一策略固定在组件内部，后续若其他页面复用聊天频道区时只需复用本组件即可。
 *
 * 关键边界条件与坑点：
 * 1. 移动端频道入口不能再退回横向滚动，否则会重新暴露浏览器边缘返回手势问题。
 * 2. 频道切换仅传递合法 `ChatChannel`，不能把 DOM 文本或任意字符串直接回灌到主状态。
 */
import { DownOutlined } from '@ant-design/icons';
import { Dropdown, Tabs, type MenuProps, type TabsProps } from 'antd';
import { useMemo, type ReactNode } from 'react';

import type { ChatChannel, ChatChannelItem } from './chatChannelConfig';

interface ChatChannelSelectorProps {
  isMobile: boolean;
  activeChannel: ChatChannel;
  channelItems: readonly ChatChannelItem[];
  actions: ReactNode;
  onChange: (channel: ChatChannel) => void;
}

const buildDesktopTabItems = (channelItems: readonly ChatChannelItem[]): TabsProps['items'] => {
  return channelItems.map((item) => ({
    key: item.key,
    label: item.label,
  }));
};

const ChatChannelSelector = ({
  isMobile,
  activeChannel,
  channelItems,
  actions,
  onChange,
}: ChatChannelSelectorProps) => {
  const activeChannelLabel = useMemo(() => {
    return channelItems.find((item) => item.key === activeChannel)?.label ?? '';
  }, [activeChannel, channelItems]);

  const mobileMenuItems = useMemo<NonNullable<MenuProps['items']>>(() => {
    return channelItems.map((item) => ({
      key: item.key,
      label: item.label,
    }));
  }, [channelItems]);

  if (isMobile) {
    return (
      <div className="chat-mobile-selector">
        <Dropdown
          trigger={['click']}
          placement="bottomLeft"
          overlayClassName="chat-mobile-channel-dropdown"
          menu={{
            items: mobileMenuItems,
            selectable: true,
            selectedKeys: [activeChannel],
            onClick: ({ key }) => onChange(key as ChatChannel),
          }}
        >
          <button type="button" className="chat-mobile-channel-trigger" aria-label="聊天频道">
            <span className="chat-mobile-channel-label">{activeChannelLabel}</span>
            <DownOutlined className="chat-mobile-channel-trigger-icon" />
          </button>
        </Dropdown>
        <div className="chat-mobile-selector-actions">{actions}</div>
      </div>
    );
  }

  return (
    <Tabs
      activeKey={activeChannel}
      onChange={(key) => onChange(key as ChatChannel)}
      items={buildDesktopTabItems(channelItems)}
      size="small"
      className="chat-tabs"
      tabBarExtraContent={actions}
    />
  );
};

export default ChatChannelSelector;
