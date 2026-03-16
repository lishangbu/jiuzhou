import { App, Button, Tag, Progress, Spin, Switch } from 'antd';
import { BookOutlined, CheckCircleOutlined, RightOutlined, TrophyOutlined, AimOutlined, EnvironmentOutlined } from '@ant-design/icons';
import { useCallback, useState } from 'react';
import {
  getChapterList,
  getSectionList,
  completeSection,
  setMainQuestTracked,
  type MainQuestProgressDto,
  type ChapterDto,
  type SectionDto,
} from '../../../../services/mainQuestApi';
import { gameSocket } from '../../../../services/gameSocket';
import { resolveIconUrl } from '../../shared/resolveIcon';
import { IMG_LINGSHI as lingshiIcon, IMG_TONGQIAN as tongqianIcon } from '../../shared/imageAssets';
import { formatMainQuestRewardTexts } from '../../shared/mainQuestRewardText';
import './MainQuestPanel.scss';

/**
 * MainQuestPanel — 主线任务面板
 *
 * 作用：展示主线进度、章节列表、任务节列表，支持追踪/完成操作。
 *       不负责初始数据加载——由父组件 TaskModal 按当前页签懒加载主线进度后，
 *       通过 props.progress 传入，避免打开弹窗就把普通任务/悬赏也一起拉取。
 *
 * Props：
 *   progress         — 父组件传入的主线进度（null 表示尚未加载）
 *   onProgressChange — 完成任务节后通知父组件更新进度 state（数据源唯一）
 *   onClose          — 关闭弹窗（可选）
 *   onTrackChange    — 追踪状态变更后通知父组件刷新地图标记（可选）
 *
 * 数据流：
 *   TaskModal 只在主线页签请求 `/main-quest/progress` → props.progress 传入 → 本组件只读展示
 *   completeSection() → onRefresh() 只刷新主线并标记其它任务页签为脏数据 → 用户切换时再按需拉取
 *   章节/任务节列表由用户主动点击触发，仍在本组件内部管理（不影响父组件）
 *
 * 边界条件：
 *   1. progress 为 null 时展示"暂无主线进度"，不发任何请求
 *   2. handleCompleteSection 完成后不直接自己补拉多个任务接口，
 *      而是交给父组件只刷新主线数据，避免重新打满整组任务请求
 */

interface MainQuestPanelProps {
  /** 由父组件 TaskModal 统一拉取后传入，null 表示尚未加载 */
  progress: MainQuestProgressDto | null;
  /** 追踪状态乐观更新：直接修改父组件 state，无需重新请求 */
  onProgressChange: (progress: MainQuestProgressDto) => void;
  /** 完成任务节后只刷新主线进度，并由父组件标记其它任务分类为待刷新 */
  onRefresh: () => Promise<void>;
  onClose?: () => void;
  onTrackChange?: () => void;
}

type ViewMode = 'progress' | 'chapters' | 'sections';

const resolveRewardIcon = resolveIconUrl;

const MainQuestPanel: React.FC<MainQuestPanelProps> = ({ progress, onProgressChange, onRefresh, onTrackChange }) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('progress');
  const [chapters, setChapters] = useState<ChapterDto[]>([]);
  const [sections, setSections] = useState<SectionDto[]>([]);
  const [selectedChapterId, setSelectedChapterId] = useState<string>('');
  const [trackLoading, setTrackLoading] = useState(false);

  const appendSystemChat = useCallback((content: string) => {
    const text = String(content || '').trim();
    if (!text) return;
    window.dispatchEvent(
      new CustomEvent('chat:append', {
        detail: {
          channel: 'system',
          content: text,
          senderName: '系统',
          senderTitle: '',
          timestamp: Date.now(),
        },
      }),
    );
  }, []);

  const loadChapters = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getChapterList();
      if (res?.success && res.data) {
        setChapters(res.data.chapters || []);
      }
    } catch {
      void 0;
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSections = useCallback(async (chapterId: string) => {
    setLoading(true);
    try {
      const res = await getSectionList(chapterId);
      if (res?.success && res.data) {
        setSections(res.data.sections || []);
      }
    } catch {
      void 0;
    } finally {
      setLoading(false);
    }
  }, []);

  const handleToggleTrack = useCallback(async (tracked: boolean) => {
    setTrackLoading(true);
    try {
      const res = await setMainQuestTracked(tracked);
      if (res?.success && progress) {
        // 乐观更新：直接修改父组件持有的 progress，无需重新请求
        onProgressChange({ ...progress, tracked });
        message.success(tracked ? '已追踪主线任务' : '已取消追踪');
        onTrackChange?.();
        window.dispatchEvent(new Event('room:objects:changed'));
      }
    } catch {
      void 0;
    } finally {
      setTrackLoading(false);
    }
  }, [message, onProgressChange, onTrackChange, progress]);

  // 完成任务节：副作用处理完后调用 onRefresh，由父组件统一并行拉取三个接口刷新数据
  const handleCompleteSection = useCallback(async () => {
    setLoading(true);
    try {
      const res = await completeSection();
      if (res?.success && res.data) {
        const rewardTexts = formatMainQuestRewardTexts(res.data.rewards || []);
        message.success('任务完成！');
        if (rewardTexts.length > 0) {
          appendSystemChat(`【主线】获得奖励：${rewardTexts.join('，')}`);
        }
        if (res.data.chapterCompleted) {
          appendSystemChat('【主线】恭喜完成本章！');
        }
        gameSocket.refreshCharacter();
        window.dispatchEvent(new Event('inventory:changed'));
        // 触发父组件完整 refresh，保证主线/普通任务/悬赏三个数据源同步更新
        await onRefresh();
      }
    } catch {
      void 0;
    } finally {
      setLoading(false);
    }
  }, [appendSystemChat, message, onRefresh]);

  const getTaskGuidance = (section: SectionDto): string => {
    if (section.status === 'not_started' || section.status === 'dialogue') {
      return section.npcId ? '前往与NPC对话开始任务' : '与相关NPC对话开始任务';
    }
    if (section.status === 'objectives') {
      const incomplete = section.objectives.filter((o) => o.done < o.target);
      return incomplete.length > 0 ? incomplete.map((o) => o.text).join('；') : '完成任务目标';
    }
    if (section.status === 'turnin') {
      return section.npcId ? '返回与NPC对话交付任务' : '返回交付任务';
    }
    return '';
  };

  const renderProgressView = () => {
    if (!progress) {
      return <div className="mq-empty">暂无主线进度</div>;
    }

    const { currentChapter, currentSection, tracked } = progress;

    return (
      <div className="mq-progress-view">
        {currentChapter && (
          <div className="mq-chapter-card">
            <div className="mq-chapter-header">
              <BookOutlined className="mq-chapter-icon" />
              <div className="mq-chapter-info">
                <div className="mq-chapter-num">第{currentChapter.chapterNum}章</div>
                <div className="mq-chapter-name">{currentChapter.name}</div>
              </div>
            </div>
            <div className="mq-chapter-bg">{currentChapter.background}</div>
          </div>
        )}

        {currentSection && (
          <div className="mq-section-card">
            <div className="mq-section-header">
              <div className="mq-section-title">
                <span className="mq-section-num">第{currentSection.sectionNum}节</span>
                <span className="mq-section-name">{currentSection.name}</span>
              </div>
              <Tag color={
                currentSection.status === 'completed' ? 'green' :
                  currentSection.status === 'turnin' ? 'gold' :
                    currentSection.status === 'objectives' ? 'blue' :
                      currentSection.status === 'dialogue' ? 'purple' : 'default'
              }>
                {currentSection.status === 'completed' ? '已完成' :
                  currentSection.status === 'turnin' ? '可交付' :
                    currentSection.status === 'objectives' ? '进行中' :
                      currentSection.status === 'dialogue' ? '对话中' : '未开始'}
              </Tag>
            </div>
            <div className="mq-section-desc">{currentSection.description}</div>

            {currentSection.status !== 'completed' && (
              <div className="mq-guidance">
                <EnvironmentOutlined className="mq-guidance-icon" />
                <span className="mq-guidance-text">{getTaskGuidance(currentSection)}</span>
              </div>
            )}

            {currentSection.objectives.length > 0 && (
              <div className="mq-objectives">
                <div className="mq-objectives-title">任务目标</div>
                {currentSection.objectives.map((obj) => (
                  <div key={obj.id} className="mq-objective">
                    <div className="mq-objective-text">{obj.text}</div>
                    <div className="mq-objective-progress">
                      <Progress
                        percent={Math.min(100, Math.round((obj.done / obj.target) * 100))}
                        size="small"
                        format={() => `${obj.done}/${obj.target}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {currentSection.rewards && (
              <div className="mq-rewards">
                <div className="mq-rewards-title">任务奖励</div>
                <div className="mq-rewards-list">
                  {currentSection.rewards.exp && (
                    <div className="mq-reward-item">
                      <span className="mq-reward-label">经验</span>
                      <span className="mq-reward-value">+{currentSection.rewards.exp}</span>
                    </div>
                  )}
                  {currentSection.rewards.silver && (
                    <div className="mq-reward-item">
                      <img src={tongqianIcon} alt="银两" className="mq-reward-icon" />
                      <span className="mq-reward-value">+{currentSection.rewards.silver}</span>
                    </div>
                  )}
                  {currentSection.rewards.spirit_stones && (
                    <div className="mq-reward-item">
                      <img src={lingshiIcon} alt="灵石" className="mq-reward-icon" />
                      <span className="mq-reward-value">+{currentSection.rewards.spirit_stones}</span>
                    </div>
                  )}
                  {currentSection.rewards.items_detail?.map((it) => (
                    <div key={it.item_def_id} className="mq-reward-item">
                      <img src={resolveRewardIcon(it.icon)} alt={it.name || it.item_def_id} className="mq-reward-icon" />
                      <span className="mq-reward-value">
                        {(it.name || it.item_def_id) ?? '物品'} ×{it.quantity}
                      </span>
                    </div>
                  ))}
                  {currentSection.rewards.techniques_detail?.map((t) => (
                    <div key={t.id} className="mq-reward-item">
                      {t.icon ? <img src={resolveRewardIcon(t.icon)} alt={t.name || t.id} className="mq-reward-icon" /> : null}
                      <span className="mq-reward-label">功法</span>
                      <span className="mq-reward-value">{t.name || t.id}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mq-section-actions">
              {currentSection.status !== 'completed' && (
                <div className="mq-track-row">
                  <AimOutlined className={`mq-track-icon ${tracked ? 'active' : ''}`} />
                  <span className="mq-track-label">追踪任务</span>
                  <Switch
                    checked={tracked}
                    onChange={handleToggleTrack}
                    loading={trackLoading}
                    size="small"
                  />
                </div>
              )}
              {currentSection.status === 'turnin' && (
                <Button
                  type="primary"
                  onClick={handleCompleteSection}
                  loading={loading}
                  icon={<TrophyOutlined />}
                >
                  完成任务
                </Button>
              )}
            </div>
          </div>
        )}

        <div className="mq-nav-actions">
          <Button onClick={() => { void loadChapters(); setViewMode('chapters'); }}>
            查看全部章节
          </Button>
        </div>
      </div>
    );
  };

  const renderChaptersView = () => (
    <div className="mq-chapters-view">
      <div className="mq-view-header">
        <Button onClick={() => setViewMode('progress')}>← 返回</Button>
        <div className="mq-view-title">全部章节</div>
      </div>
      <div className="mq-chapters-list">
        {chapters.map((chapter) => (
          <div
            key={chapter.id}
            className={`mq-chapter-item ${chapter.isCompleted ? 'completed' : ''}`}
            onClick={() => {
              setSelectedChapterId(chapter.id);
              void loadSections(chapter.id);
              setViewMode('sections');
            }}
          >
            <div className="mq-chapter-item-left">
              <div className="mq-chapter-item-num">第{chapter.chapterNum}章</div>
              <div className="mq-chapter-item-name">{chapter.name}</div>
              <div className="mq-chapter-item-desc">{chapter.description}</div>
            </div>
            <div className="mq-chapter-item-right">
              {chapter.isCompleted ? (
                <CheckCircleOutlined className="mq-completed-icon" />
              ) : (
                <RightOutlined />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderSectionsView = () => {
    const chapter = chapters.find((c) => c.id === selectedChapterId);
    return (
      <div className="mq-sections-view">
        <div className="mq-view-header">
          <Button onClick={() => setViewMode('chapters')}>← 返回</Button>
          <div className="mq-view-title">{chapter ? `第${chapter.chapterNum}章 ${chapter.name}` : '任务节'}</div>
        </div>
        <div className="mq-sections-list">
          {sections.map((section) => (
            <div key={section.id} className={`mq-section-item ${section.status}`}>
              <div className="mq-section-item-header">
                <div className="mq-section-item-num">第{section.sectionNum}节</div>
                <div className="mq-section-item-name">{section.name}</div>
                <Tag color={
                  section.status === 'completed' ? 'green' :
                    section.status === 'turnin' ? 'gold' :
                      section.status === 'objectives' ? 'blue' : 'default'
                }>
                  {section.status === 'completed' ? '已完成' :
                    section.status === 'turnin' ? '可交付' :
                      section.status === 'objectives' ? '进行中' : '未开始'}
                </Tag>
              </div>
              <div className="mq-section-item-brief">{section.brief}</div>
              {section.objectives.length > 0 && (
                <div className="mq-section-item-objectives">
                  {section.objectives.map((obj) => (
                    <div key={obj.id} className="mq-mini-objective">
                      <span>{obj.text}</span>
                      <span>{obj.done}/{obj.target}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="main-quest-panel">
      <Spin spinning={loading}>
        {viewMode === 'progress' && renderProgressView()}
        {viewMode === 'chapters' && renderChaptersView()}
        {viewMode === 'sections' && renderSectionsView()}
      </Spin>
    </div>
  );
};

export default MainQuestPanel;
