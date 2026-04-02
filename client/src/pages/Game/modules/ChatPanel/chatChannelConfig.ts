/**
 * 聊天频道配置。
 *
 * 作用：
 * 1. 做什么：集中定义 ChatPanel 可切换的频道类型与展示文案，避免桌面 Tabs、移动端频道按钮、消息发送逻辑各自维护一份枚举。
 * 2. 做什么：提供桌面端与移动端共享的只读配置，保证频道顺序、key 与标签文案始终一致。
 * 3. 不做什么：不处理频道切换状态，不承载 UI 渲染，也不包含消息过滤或发送逻辑。
 *
 * 输入 / 输出：
 * 1. 输入：无运行时输入，模块初始化时直接产出静态配置。
 * 2. 输出：`ChatChannel`、`PublicChatChannel` 类型，以及 `CHAT_CHANNEL_ITEMS` 只读频道列表。
 *
 * 数据流 / 状态流：
 * 1. 静态频道配置从本模块输出。
 * 2. ChatPanel 与移动端频道选择组件消费同一份配置。
 * 3. 频道 key 再流向消息过滤、输入可用性判断与 UI 激活态展示。
 *
 * 复用设计说明：
 * 1. 将频道定义抽到单一模块后，桌面端 Tabs 与移动端固定按钮网格复用同一份数据，避免出现“桌面多一个频道、移动端少一个频道”的散落维护。
 * 2. 高频变化点只有频道顺序与文案，因此集中在这里维护，业务逻辑文件只消费稳定配置。
 *
 * 关键边界条件与坑点：
 * 1. `private` 频道虽然不属于公共频道，但必须保留在总配置内，否则移动端和桌面端频道顺序会不一致。
 * 2. `PublicChatChannel` 只能排除 `all` 与 `private`，不能误删 `battle` / `system`，否则发送限制与消息归档会失真。
 */
export type ChatChannel = 'all' | 'world' | 'team' | 'sect' | 'private' | 'battle' | 'system';

export type PublicChatChannel = Exclude<ChatChannel, 'all' | 'private'>;

export interface ChatChannelItem {
  key: ChatChannel;
  label: string;
}

export const CHAT_CHANNEL_ITEMS: readonly ChatChannelItem[] = [
  { key: 'all', label: '综合' },
  { key: 'world', label: '世界' },
  { key: 'team', label: '队伍' },
  { key: 'sect', label: '宗门' },
  { key: 'private', label: '私聊' },
  { key: 'battle', label: '战况' },
  { key: 'system', label: '系统' },
];
