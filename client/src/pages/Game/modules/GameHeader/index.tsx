/**
 * GameHeader — 游戏主界面顶部栏
 *
 * 作用：
 * 1. 统一承接主界面顶部栏的品牌、状态、货币与快捷操作展示。
 * 2. 在同一份数据源上切换桌面端与移动端布局，避免在页面层重复维护两套按钮与货币映射。
 * 3. 不处理任何业务状态，只负责把父组件已经准备好的展示节点和事件排布成可交互 UI。
 *
 * 输入 / 输出：
 * - 输入：当前是否移动端、版本号、两种货币值、采集/挂机状态节点、红点状态、各快捷操作回调。
 * - 输出：顶部栏 React 节点；所有点击行为原样透传给父组件。
 *
 * 数据流 / 状态流：
 * Game/index.tsx 收敛版本号、货币、红点和弹窗开关回调
 * -> GameHeader 统一映射为桌面端/移动端布局
 * -> 用户点击后再把事件回传给父组件修改弹窗状态。
 *
 * 复用设计说明：
 * 1. 货币芯片与快捷操作先收敛成单一配置，再分别投影到桌面端和移动端，避免同一规则写两遍。
 * 2. 采集状态与挂机状态保持为父组件传入节点，延续现有业务实现，不重新复制状态逻辑。
 * 3. 顶部栏从超大页面拆出后，后续继续调整移动端排布时只改这一处，不会把样式和 JSX 再散回页面主体。
 *
 * 关键边界条件与坑点：
 * 1. 移动端顶部栏必须保持单行，不允许依赖换行或横向滚动“藏空间”。
 * 2. 设置与退出属于低频入口，移动端必须并入更多菜单，给高频状态与红点操作留出固定宽度。
 */

import { Badge, Button, Popover } from 'antd';
import { CalendarOutlined, LogoutOutlined, MailOutlined, MoreOutlined, SettingOutlined } from '@ant-design/icons';
import { useMemo, type ReactNode } from 'react';
import {
  IMG_GAME_HEADER_LOGO as gameHeaderLogo,
  IMG_LINGSHI as lingshi,
  IMG_TONGQIAN as tongqian,
} from '../../shared/imageAssets';
import './index.scss';

interface GameHeaderProps {
  isMobile: boolean;
  version: string;
  spiritStones: number;
  silver: number;
  gatherStatusNode: ReactNode;
  idleStatusNode: ReactNode;
  showSignInDot: boolean;
  showMailDot: boolean;
  onOpenSignIn: () => void;
  onOpenMail: () => void;
  onOpenSetting: () => void;
  onLogout?: () => void;
}

interface HeaderCurrencyItem {
  key: 'spiritStones' | 'silver';
  icon: string;
  alt: string;
  value: string;
}

interface HeaderActionItem {
  key: 'signIn' | 'mail' | 'setting' | 'logout';
  label: string;
  ariaLabel: string;
  icon: ReactNode;
  showDot: boolean;
  onClick: () => void;
}

const formatCompactCurrency = (value: number): string => {
  const absValue = Math.abs(value);
  if (absValue >= 100000000) {
    const formatted = (value / 100000000).toFixed(absValue >= 1000000000 ? 0 : 1);
    return `${formatted.replace(/\.0$/, '')}亿`;
  }
  if (absValue >= 10000) {
    const formatted = (value / 10000).toFixed(absValue >= 100000 ? 0 : 1);
    return `${formatted.replace(/\.0$/, '')}万`;
  }
  return value.toLocaleString();
};

const renderCurrencyItem = (item: HeaderCurrencyItem) => (
  <div key={item.key} className="game-header-currency">
    <img className="game-header-currency-icon" src={item.icon} alt={item.alt} />
    <span className="game-header-currency-value">{item.value}</span>
  </div>
);

const renderCombinedCurrency = (items: HeaderCurrencyItem[]) => (
  <div className="game-header-currency game-header-currency--combined">
    {items.map((item) => (
      <span key={item.key} className="game-header-currency-group">
        <img className="game-header-currency-icon" src={item.icon} alt={item.alt} />
        <span className="game-header-currency-value">{item.value}</span>
      </span>
    ))}
  </div>
);

const renderActionButton = (item: HeaderActionItem, isMobile: boolean) => {
  const button = (
    <Button
      className={isMobile ? 'game-header-mobile-action-btn' : 'game-header-icon-btn'}
      type="text"
      icon={item.icon}
      aria-label={item.ariaLabel}
      onClick={item.onClick}
    >
      {isMobile ? <span className="game-header-mobile-action-label">{item.label}</span> : null}
    </Button>
  );

  if (!item.showDot) {
    return button;
  }

  return (
    <Badge key={item.key} dot offset={isMobile ? [-6, 6] : [-2, 2]}>
      {button}
    </Badge>
  );
};

const GameHeader = ({
  isMobile,
  version,
  spiritStones,
  silver,
  gatherStatusNode,
  idleStatusNode,
  showSignInDot,
  showMailDot,
  onOpenSignIn,
  onOpenMail,
  onOpenSetting,
  onLogout,
}: GameHeaderProps) => {
  const hasMobileStatus = gatherStatusNode !== null || idleStatusNode !== null;
  const currencyItems = useMemo<HeaderCurrencyItem[]>(() => [
    {
      key: 'spiritStones',
      icon: lingshi,
      alt: '灵石',
      value: formatCompactCurrency(spiritStones),
    },
    {
      key: 'silver',
      icon: tongqian,
      alt: '银两',
      value: formatCompactCurrency(silver),
    },
  ], [silver, spiritStones]);

  const actionItems = useMemo<HeaderActionItem[]>(() => {
    const items: HeaderActionItem[] = [
      {
        key: 'signIn',
        label: '签到',
        ariaLabel: '签到',
        icon: <CalendarOutlined />,
        showDot: showSignInDot,
        onClick: onOpenSignIn,
      },
      {
        key: 'mail',
        label: '邮箱',
        ariaLabel: '邮箱',
        icon: <MailOutlined />,
        showDot: showMailDot,
        onClick: onOpenMail,
      },
      {
        key: 'setting',
        label: '设置',
        ariaLabel: '设置',
        icon: <SettingOutlined />,
        showDot: false,
        onClick: onOpenSetting,
      },
    ];

    if (onLogout) {
      items.push({
        key: 'logout',
        label: '退出',
        ariaLabel: '退出',
        icon: <LogoutOutlined />,
        showDot: false,
        onClick: onLogout,
      });
    }

    return items;
  }, [onLogout, onOpenMail, onOpenSetting, onOpenSignIn, showMailDot, showSignInDot]);

  const mobilePrimaryActionItems = useMemo<HeaderActionItem[]>(
    () => actionItems.filter((item) => item.key === 'signIn' || item.key === 'mail'),
    [actionItems],
  );

  const mobileSecondaryActionItems = useMemo<HeaderActionItem[]>(
    () => actionItems.filter((item) => item.key === 'setting' || item.key === 'logout'),
    [actionItems],
  );

  if (isMobile) {
    const moreMenuContent = (
      <div className="game-header-mobile-menu">
        {mobileSecondaryActionItems.map((item) => (
          <Button
            key={item.key}
            className="game-header-mobile-menu-btn"
            type="text"
            icon={item.icon}
            onClick={item.onClick}
          >
            {item.label}
          </Button>
        ))}
      </div>
    );

    return (
      <header className="game-header is-mobile">
        <div className="game-header-mobile-rail">
          <div className="game-header-mobile-summary">
            {hasMobileStatus ? (
              <div className="game-header-mobile-statuses">
                {gatherStatusNode}
                {idleStatusNode}
              </div>
            ) : null}
            {hasMobileStatus ? <div className="game-header-mobile-summary-divider" aria-hidden="true" /> : null}
            {renderCombinedCurrency(currencyItems)}
          </div>
          <div className="game-header-mobile-actions">
            {mobilePrimaryActionItems.map((item) => (
              <div key={item.key} className="game-header-mobile-action-item">
                {renderActionButton(item, true)}
              </div>
            ))}
            <div className="game-header-mobile-action-item">
              <Popover
                trigger="click"
                placement="bottomRight"
                content={moreMenuContent}
                overlayClassName="game-header-mobile-menu-popover"
              >
                <Button
                  className="game-header-mobile-action-btn"
                  type="text"
                  icon={<MoreOutlined />}
                  aria-label="更多"
                />
              </Popover>
            </div>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="game-header">
      <div className="game-header-left">
        <img className="game-header-logo" src={gameHeaderLogo} alt="九州修仙录" />
        <div className="game-header-meta">
          <div className="game-header-title">九州修仙录</div>
          <div className="game-header-version">v{version}</div>
        </div>
      </div>

      <div className="game-header-right">
        <div className="game-header-status-list">
          {gatherStatusNode}
          {idleStatusNode}
        </div>
        <div className="game-header-currency-list">
          {currencyItems.map(renderCurrencyItem)}
        </div>
        <div className="game-header-action-list">
          {actionItems.map((item) => (
            <div key={item.key} className="game-header-action-item">
              {renderActionButton(item, false)}
            </div>
          ))}
        </div>
      </div>
    </header>
  );
};

export default GameHeader;
