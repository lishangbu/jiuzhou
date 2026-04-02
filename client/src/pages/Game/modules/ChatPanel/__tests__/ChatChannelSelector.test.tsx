import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import ChatChannelSelector from '../ChatChannelSelector';
import { CHAT_CHANNEL_ITEMS } from '../chatChannelConfig';

describe('ChatChannelSelector', () => {
  it('移动端应渲染 Dropdown 触发按钮并展示当前频道文案', () => {
    const html = renderToStaticMarkup(
      <ChatChannelSelector
        isMobile
        activeChannel="sect"
        channelItems={CHAT_CHANNEL_ITEMS}
        actions={<div>操作区</div>}
        onChange={() => void 0}
      />,
    );

    expect(html).toContain('chat-mobile-channel-trigger');
    expect(html).toContain('宗门');
    expect(html).not.toContain('ant-select');
  });

  it('桌面端应继续渲染 Tabs 结构', () => {
    const html = renderToStaticMarkup(
      <ChatChannelSelector
        isMobile={false}
        activeChannel="world"
        channelItems={CHAT_CHANNEL_ITEMS}
        actions={<div>操作区</div>}
        onChange={() => void 0}
      />,
    );

    expect(html).toContain('chat-tabs');
    expect(html).toContain('世界');
  });
});
