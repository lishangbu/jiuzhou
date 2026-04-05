import { SearchOutlined } from '@ant-design/icons';
import { App, Button, Input, Modal, Progress, Segmented, Tag } from 'antd';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  claimAchievementPointsReward,
  claimAchievementReward,
  equipTitle,
  getAchievementList,
  getAchievementPointsRewards,
  getTitleList,
  type AchievementItemDto,
  type AchievementPointRewardDto,
  type AchievementRewardView,
  type TitleInfoDto,
} from '../../../../services/api';
import { gameSocket } from '../../../../services/gameSocket';
import { resolveIconUrl, DEFAULT_ICON as coin01 } from '../../shared/resolveIcon';
import { IMG_LINGSHI as lingshiIcon, IMG_TONGQIAN as tongqianIcon, IMG_EXP as expIcon } from '../../shared/imageAssets';
import { useIsMobile } from '../../shared/responsive';
import { useDebouncedValue } from '../../shared/useDebouncedValue';
import {
  ACHIEVEMENT_MENU_ITEMS,
  buildTitleViewModels,
  calculateAchievementOverall,
  calculateTitleOverall,
  filterAchievementsByKeyword,
  filterPointRewardsByKeyword,
  filterTitleViewModelsByKeyword,
  getAchievementMenuLabel,
  isAchievementMenuKey,
  type AchievementMenuKey,
} from './viewModel';
import './index.scss';

/**
 * 成就弹窗
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：承载成就分类、点数奖励与称号列表的查看、领取和装备交互。
 * 2. 做什么：把左侧菜单切换与右侧视图内容保持同源，桌面端按钮和移动端分段器共享同一套菜单配置。
 * 3. 不做什么：不处理接口 DTO 的展示派生规则，这些逻辑交给 `viewModel.ts` 统一收敛。
 *
 * 输入/输出：
 * - 输入：弹窗显隐、关闭回调、外层刷新回调。
 * - 输出：用户交互产生的领取/装备请求，以及渲染后的成就或称号视图。
 *
 * 数据流/状态流：
 * - 左侧菜单状态决定请求与右侧视图 -> 搜索词经防抖后参与本地过滤 -> 点击按钮触发接口 -> 成功后刷新当前视图并通知外层。
 *
 * 关键边界条件与坑点：
 * 1. 搜索只过滤当前菜单内容，切换菜单时会清空关键词，避免不同视图共用旧筛选导致空白页误判。
 * 2. 称号剩余时间按分钟刷新，不能绑到逐秒计时上，否则整个弹窗会发生无意义高频重渲染。
 */
interface AchievementModalProps {
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
}

type RewardViewModel = {
  id: string;
  name: string;
  icon: string;
  amountText: string;
};

const resolveRewardIcon = resolveIconUrl;
const EMPTY_POINTS_INFO = {
  total: 0,
  byCategory: { combat: 0, cultivation: 0, exploration: 0, social: 0, collection: 0 },
};

const resolveRewardView = (reward: AchievementRewardView, index: number): RewardViewModel | null => {
  if (!reward) return null;
  if (reward.type === 'item') {
    const rawItemName = String(reward.itemName || '').trim();
    const itemName = rawItemName && rawItemName !== reward.itemDefId ? rawItemName : '未知材料';
    const icon = resolveRewardIcon(reward.itemIcon);
    const qty = typeof reward.qty === 'number' ? Math.max(1, Math.floor(reward.qty)) : 1;
    return {
      id: `${reward.type}:${reward.itemDefId || index}`,
      name: itemName,
      icon,
      amountText: `×${qty.toLocaleString()}`,
    };
  }

  const amount = typeof reward.amount === 'number' ? Math.max(0, Math.floor(reward.amount)) : 0;
  const name = reward.type === 'silver' ? '银两' : reward.type === 'spirit_stones' ? '灵石' : '经验';
  const icon = reward.type === 'silver' ? tongqianIcon : reward.type === 'spirit_stones' ? lingshiIcon : expIcon;
  return {
    id: `${reward.type}:${index}`,
    name,
    icon,
    amountText: `×${amount.toLocaleString()}`,
  };
};

const pad2 = (value: number): string => String(value).padStart(2, '0');

const formatTitleExpireAt = (expiresAt: string): string => {
  const date = new Date(expiresAt);
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const hour = pad2(date.getHours());
  const minute = pad2(date.getMinutes());
  return `${year}-${month}-${day} ${hour}:${minute}`;
};

const formatTitleRemaining = (expiresAt: string, nowMs: number): string => {
  const deltaMs = new Date(expiresAt).getTime() - nowMs;
  if (deltaMs <= 0) return '已过期';

  const totalMinutes = Math.floor(deltaMs / 60_000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}天${hours}小时${minutes}分`;
  if (hours > 0) return `${hours}小时${minutes}分`;
  return `${minutes}分`;
};

const AchievementModal: React.FC<AchievementModalProps> = ({ open, onClose, onChanged }) => {
  const { message } = App.useApp();

  const [activeMenu, setActiveMenu] = useState<AchievementMenuKey>('all');
  const [query, setQuery] = useState('');
  const isMobile = useIsMobile();
  const [characterId, setCharacterId] = useState<number | null>(() => gameSocket.getCharacter()?.id ?? null);
  const [loading, setLoading] = useState(false);
  const [achievements, setAchievements] = useState<AchievementItemDto[]>([]);
  const [pointsInfo, setPointsInfo] = useState({
    total: 0,
    byCategory: { combat: 0, cultivation: 0, exploration: 0, social: 0, collection: 0 },
  });
  const [pointRewards, setPointRewards] = useState<AchievementPointRewardDto[]>([]);
  const [titles, setTitles] = useState<TitleInfoDto[]>([]);
  const [claimingId, setClaimingId] = useState('');
  const [claimingPointThreshold, setClaimingPointThreshold] = useState<number | null>(null);
  const [equippingTitleId, setEquippingTitleId] = useState('');
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const debouncedQuery = useDebouncedValue(query, 120);
  const isTitlePane = activeMenu === 'titles';

  const refreshData = useCallback(async (mode: 'blocking' | 'silent' = 'blocking') => {
    const isBlocking = mode === 'blocking';
    if (isBlocking) {
      setLoading(true);
    }

    try {
      if (isTitlePane) {
        const titleRes = await getTitleList();
        if (titleRes.success && titleRes.data) {
          setTitles(Array.isArray(titleRes.data.titles) ? titleRes.data.titles : []);
        } else {
          setTitles([]);
        }
        return;
      }

      const category = activeMenu === 'all' ? undefined : activeMenu;
      const [listRes, pointsRewardRes] = await Promise.all([
        getAchievementList({ category, page: 1, limit: 200 }),
        getAchievementPointsRewards(),
      ]);

      if (listRes.success && listRes.data) {
        setAchievements(Array.isArray(listRes.data.achievements) ? listRes.data.achievements : []);
        setPointsInfo(listRes.data.points || EMPTY_POINTS_INFO);
      } else {
        setAchievements([]);
        setPointsInfo(EMPTY_POINTS_INFO);
      }

      if (pointsRewardRes.success && pointsRewardRes.data) {
        setPointRewards(Array.isArray(pointsRewardRes.data.rewards) ? pointsRewardRes.data.rewards : []);
      } else {
        setPointRewards([]);
      }
    } catch {
      if (isTitlePane) {
        setTitles([]);
      } else {
        setAchievements([]);
        setPointsInfo(EMPTY_POINTS_INFO);
        setPointRewards([]);
      }
    } finally {
      if (isBlocking) {
        setLoading(false);
      }
    }
  }, [activeMenu, isTitlePane]);

  useEffect(() => {
    if (!open) return;
    void refreshData();
  }, [open, refreshData]);

  useEffect(() => {
    setQuery('');
  }, [activeMenu]);

  useEffect(() => {
    return gameSocket.onCharacterUpdate((character) => {
      setCharacterId(character?.id ?? null);
    });
  }, []);

  useEffect(() => {
    if (!open || !characterId) return;
    // 弹窗打开时已经主动拉取过完整数据，这里只接收后续增量推送，避免订阅瞬间回放当前缓存导致重复请求。
    return gameSocket.onAchievementUpdate((payload) => {
      if (payload.characterId !== characterId) return;
      void refreshData('silent');
    }, { emitCurrent: false });
  }, [characterId, open, refreshData]);

  /**
   * 称号剩余时间按分钟刷新即可，避免逐秒刷新导致不必要的重渲染。
   */
  useEffect(() => {
    if (!open) return;
    setNowMs(Date.now());
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 60 * 1000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [open]);

  const overall = useMemo(() => {
    return calculateAchievementOverall(achievements);
  }, [achievements]);

  const titleRows = useMemo(() => {
    return buildTitleViewModels(titles);
  }, [titles]);

  const titleOverall = useMemo(() => {
    return calculateTitleOverall(titles);
  }, [titles]);

  const filteredAchievements = useMemo(() => {
    return filterAchievementsByKeyword(achievements, debouncedQuery);
  }, [achievements, debouncedQuery]);

  const filteredPointRewards = useMemo(() => {
    return filterPointRewardsByKeyword(pointRewards, debouncedQuery);
  }, [debouncedQuery, pointRewards]);

  const filteredTitles = useMemo(() => {
    return filterTitleViewModelsByKeyword(titleRows, debouncedQuery);
  }, [debouncedQuery, titleRows]);

  const claimAchievement = useCallback(
    async (id: string) => {
      if (!id) return;
      setClaimingId(id);
      try {
        const res = await claimAchievementReward(id);
        if (!res.success) {
          void 0;
          return;
        }
        message.success('领取成功');
        await refreshData();
        onChanged?.();
      } catch {
        void 0;
      } finally {
        setClaimingId('');
      }
    },
    [message, onChanged, refreshData],
  );

  const claimPointReward = useCallback(
    async (threshold: number) => {
      setClaimingPointThreshold(threshold);
      try {
        const res = await claimAchievementPointsReward(threshold);
        if (!res.success) {
          void 0;
          return;
        }
        message.success('点数奖励领取成功');
        await refreshData();
        onChanged?.();
      } catch {
        void 0;
      } finally {
        setClaimingPointThreshold(null);
      }
    },
    [message, onChanged, refreshData],
  );

  const equipTitleAction = useCallback(
    async (titleId: string) => {
      if (!titleId) return;
      setEquippingTitleId(titleId);
      try {
        const res = await equipTitle(titleId);
        if (!res.success) {
          void 0;
          return;
        }
        message.success('已装备称号');
        await refreshData();
        onChanged?.();
      } catch {
        void 0;
      } finally {
        setEquippingTitleId('');
      }
    },
    [message, onChanged, refreshData],
  );

  const mobileTabOptions = useMemo(
    () => ACHIEVEMENT_MENU_ITEMS.map((item) => ({ value: item.key, label: item.mobileLabel })),
    [],
  );
  const isSearching = debouncedQuery.trim().length > 0;
  const paneTitle = getAchievementMenuLabel(activeMenu);
  const topProgressPercent = isTitlePane
    ? (titleOverall.total > 0 ? (titleOverall.equippedCount / titleOverall.total) * 100 : 0)
    : (overall.total > 0 ? (overall.doneCount / overall.total) * 100 : 0);
  const searchPlaceholder = isTitlePane ? '搜索称号名称/效果' : '搜索成就/点数奖励';

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title={null}
      centered
      width={1080}
      className="achievement-modal"
      destroyOnHidden
      maskClosable
      afterOpenChange={(visible) => {
        if (!visible) return;
        setActiveMenu('all');
        setQuery('');
      }}
    >
      <div className="achievement-shell">
        <div className="achievement-left">
          <div className="achievement-left-title">
            <img className="achievement-left-icon" src={coin01} alt="成就" />
            <div className="achievement-left-name">成就</div>
          </div>
          {isMobile ? (
            <div className="achievement-left-segmented-wrap">
              <Segmented
                className="achievement-left-segmented"
                value={activeMenu}
                options={mobileTabOptions}
                onChange={(value) => {
                  if (typeof value !== 'string') return;
                  if (!isAchievementMenuKey(value)) return;
                  setActiveMenu(value);
                }}
              />
            </div>
          ) : (
            <div className="achievement-left-list">
              {ACHIEVEMENT_MENU_ITEMS.map((item) => (
                <Fragment key={item.key}>
                  {item.key === 'titles' ? <div className="achievement-left-divider" /> : null}
                  <Button
                    type={activeMenu === item.key ? 'primary' : 'default'}
                    className="achievement-left-item"
                    onClick={() => setActiveMenu(item.key)}
                  >
                    {item.label}
                  </Button>
                </Fragment>
              ))}
            </div>
          )}
        </div>

        <div className="achievement-right">
          <div className="achievement-pane">
            <div className="achievement-pane-top">
              <div className="achievement-top-row">
                <div className="achievement-title">{paneTitle}</div>
                <div className="achievement-tags">
                  {isTitlePane ? (
                    <>
                      <Tag color="blue">已拥有 {titleOverall.total}</Tag>
                      <Tag color="green">
                        已装备 {titleOverall.equippedCount}/{titleOverall.total}
                      </Tag>
                    </>
                  ) : (
                    <>
                      <Tag color="blue">当前点数 {pointsInfo.total.toLocaleString()}</Tag>
                      <Tag color="green">
                        已完成 {overall.doneCount}/{overall.total}
                      </Tag>
                      <Tag color="purple">
                        已领取 {overall.claimedCount}/{overall.total}
                      </Tag>
                    </>
                  )}
                </div>
              </div>
              <div className="achievement-top-progress">
                <div className="achievement-progress-left">{isTitlePane ? '装备进度' : '分类进度'}</div>
                <div className="achievement-progress-right">
                  <Progress
                    percent={topProgressPercent}
                    showInfo={false}
                    strokeColor="var(--primary-color)"
                  />
                </div>
              </div>
            </div>

            <div className="achievement-pane-body">
              <div className="achievement-pane-actions">
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  allowClear
                  placeholder={searchPlaceholder}
                  prefix={<SearchOutlined />}
                />
              </div>

              {isTitlePane ? (
                <div className="achievement-title-list">
                  {filteredTitles.map(({ title, effectsText }) => (
                    <div key={title.id} className="achievement-title-item">
                      <div className="achievement-title-main">
                        <div className="achievement-title-top">
                          <div className="achievement-title-name">{title.name}</div>
                        </div>
                        <div className="achievement-item-desc">{title.description}</div>
                        <div className="achievement-item-desc">{effectsText}</div>
                        <div className="achievement-title-expire-line">
                          有效期：{title.expiresAt ? formatTitleExpireAt(title.expiresAt) : '永久'}
                        </div>
                        <div className="achievement-title-expire-line">
                          剩余：{title.expiresAt ? formatTitleRemaining(title.expiresAt, nowMs) : '永久'}
                        </div>
                      </div>
                      <div className="achievement-item-right">
                        <Button
                          type={title.isEquipped ? 'default' : 'primary'}
                          size="small"
                          disabled={title.isEquipped || loading}
                          loading={equippingTitleId === title.id}
                          onClick={() => void equipTitleAction(title.id)}
                        >
                          {title.isEquipped ? '已装备' : '装备'}
                        </Button>
                      </div>
                    </div>
                  ))}
                  {loading ? <div className="achievement-empty">加载中...</div> : null}
                  {!loading && filteredTitles.length === 0 ? (
                    <div className="achievement-empty">{isSearching ? '暂无匹配称号' : '暂无称号'}</div>
                  ) : null}
                </div>
              ) : (
                <>
                  <div className="achievement-list">
                    {filteredAchievements.map((row) => {
                      const claimable = row.claimable && row.status !== 'claimed';
                      const rewardRows = row.rewards
                        .map((reward, index) => resolveRewardView(reward, index))
                        .filter((item): item is RewardViewModel => item !== null);
                      return (
                        <div key={row.id} className="achievement-item">
                          <div className="achievement-item-main">
                            <div className="achievement-item-top">
                              <div className="achievement-item-title">{row.name}</div>
                              <div className="achievement-item-tags">
                                {row.status === 'claimed' ? (
                                  <Tag color="green">已领取</Tag>
                                ) : claimable ? (
                                  <Tag color="blue">可领取</Tag>
                                ) : row.progress?.done ? (
                                  <Tag color="gold">已完成</Tag>
                                ) : (
                                  <Tag>进行中</Tag>
                                )}
                                <Tag color="cyan">+{row.points}点</Tag>
                              </div>
                            </div>
                            <div className="achievement-item-desc">{row.description}</div>
                            <div className="achievement-item-progress">
                              <Progress
                                percent={typeof row.progress?.percent === 'number' ? row.progress.percent : 0}
                                showInfo={false}
                                strokeColor="var(--primary-color)"
                              />
                              <div className="achievement-item-progress-meta">
                                {(row.progress?.current ?? 0).toLocaleString()}/{(row.progress?.target ?? 0).toLocaleString()}
                              </div>
                            </div>
                            <div className="achievement-rewards">
                              {rewardRows.map((reward) => (
                                <div key={reward.id} className="achievement-reward">
                                  <img className="achievement-reward-icon" src={reward.icon} alt={reward.name} />
                                  <div className="achievement-reward-name">{reward.name}</div>
                                  <div className="achievement-reward-amount">{reward.amountText}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="achievement-item-right">
                            <Button
                              type="primary"
                              size="small"
                              className="achievement-claim-btn"
                              disabled={!claimable || loading}
                              loading={claimingId === row.id}
                              onClick={() => void claimAchievement(row.id)}
                            >
                              {row.status === 'claimed' ? '已领取' : '领取'}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                    {loading ? <div className="achievement-empty">加载中...</div> : null}
                    {!loading && filteredAchievements.length === 0 ? (
                      <div className="achievement-empty">{isSearching ? '暂无匹配成就' : '暂无成就'}</div>
                    ) : null}
                  </div>

                  <div className="achievement-section-title">成就点奖励</div>
                  <div className="achievement-points-list">
                    {filteredPointRewards.map((row) => {
                      const rewardRows = row.rewards
                        .map((reward, index) => resolveRewardView(reward, index))
                        .filter((item): item is RewardViewModel => item !== null);
                      return (
                        <div key={row.id} className="achievement-points-item">
                          <div className="achievement-points-main">
                            <div className="achievement-points-top">
                              <div className="achievement-points-name">{row.name}</div>
                              <Tag color="geekblue">{row.threshold} 点</Tag>
                            </div>
                            <div className="achievement-item-desc">{row.description}</div>
                            <div className="achievement-rewards">
                              {rewardRows.map((reward) => (
                                <div key={reward.id} className="achievement-reward">
                                  <img className="achievement-reward-icon" src={reward.icon} alt={reward.name} />
                                  <div className="achievement-reward-name">{reward.name}</div>
                                  <div className="achievement-reward-amount">{reward.amountText}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="achievement-item-right">
                            <Button
                              type="primary"
                              size="small"
                              disabled={!row.claimable || row.claimed || loading}
                              loading={claimingPointThreshold === row.threshold}
                              onClick={() => void claimPointReward(row.threshold)}
                            >
                              {row.claimed ? '已领取' : row.claimable ? '领取' : '未达成'}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                    {!loading && filteredPointRewards.length === 0 ? (
                      <div className="achievement-empty">{isSearching ? '暂无匹配点数奖励' : '暂无点数奖励'}</div>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default AchievementModal;
