/**
 * 成就弹窗视图模型工具
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中维护左侧菜单定义、顶部标题映射、关键词归一化、成就统计与称号排序派生。
 * 2. 做什么：把桌面端按钮、移动端分段器和右侧面板共用的文案与过滤逻辑收敛到单一入口，避免同一规则散落在组件里重复维护。
 * 3. 不做什么：不发起接口请求，不管理 React 状态，也不处理领取奖励、装备称号等副作用。
 *
 * 输入/输出：
 * - 输入：成就列表、成就点奖励列表、称号列表与搜索关键词。
 * - 输出：菜单配置、顶部统计结果、过滤后的成就/奖励/称号视图数据。
 *
 * 数据流/状态流：
 * - 接口 DTO -> 本模块完成归一化、排序与过滤 -> AchievementModal 直接消费结果渲染。
 *
 * 复用设计说明：
 * - 左侧菜单、顶部标题和移动端切换共用同一份菜单配置，新增或改名时只需要维护一个地方。
 * - 关键词过滤与称号效果检索统一放在这里，后续如果首页摘要或其他弹窗复用相同数据口径，可以直接复用本模块纯函数。
 *
 * 关键边界条件与坑点：
 * 1. 关键词必须统一 `trim + toLowerCase`，否则不同入口使用相同关键字时命中结果会不一致。
 * 2. 称号效果文案必须在排序后一次性生成并复用，不能把格式化逻辑散落在渲染分支里重复执行。
 */
import type {
  AchievementItemDto,
  AchievementPointRewardDto,
  TitleInfoDto,
} from '../../../../services/api';
import { formatTitleEffectsText } from '../../shared/titleEffectText';

export type AchievementTab = 'all' | 'combat' | 'cultivation' | 'exploration' | 'social' | 'collection';
export type AchievementMenuKey = AchievementTab | 'titles';

export type AchievementMenuItem = {
  key: AchievementMenuKey;
  label: string;
  mobileLabel: string;
};

export type AchievementOverall = {
  total: number;
  doneCount: number;
  claimedCount: number;
};

export type TitleOverall = {
  total: number;
  equippedCount: number;
};

export type TitleViewModel = {
  title: TitleInfoDto;
  effectsText: string;
  searchText: string;
};

export const ACHIEVEMENT_MENU_ITEMS: AchievementMenuItem[] = [
  { key: 'all', label: '全部成就', mobileLabel: '全部' },
  { key: 'combat', label: '战斗成就', mobileLabel: '战斗' },
  { key: 'cultivation', label: '修炼成就', mobileLabel: '修炼' },
  { key: 'exploration', label: '探索成就', mobileLabel: '探索' },
  { key: 'social', label: '社交成就', mobileLabel: '社交' },
  { key: 'collection', label: '收集成就', mobileLabel: '收集' },
  { key: 'titles', label: '称号', mobileLabel: '称号' },
];

const ACHIEVEMENT_MENU_LABEL_MAP: Record<AchievementMenuKey, string> = Object.fromEntries(
  ACHIEVEMENT_MENU_ITEMS.map((item) => [item.key, item.label]),
) as Record<AchievementMenuKey, string>;

const ACHIEVEMENT_MENU_KEY_SET = new Set<AchievementMenuKey>(ACHIEVEMENT_MENU_ITEMS.map((item) => item.key));

const normalizeKeyword = (keyword: string): string => keyword.trim().toLowerCase();

export const isAchievementMenuKey = (value: string): value is AchievementMenuKey => {
  return ACHIEVEMENT_MENU_KEY_SET.has(value as AchievementMenuKey);
};

export const isAchievementTab = (value: AchievementMenuKey): value is AchievementTab => value !== 'titles';

export const getAchievementMenuLabel = (key: AchievementMenuKey): string => {
  return ACHIEVEMENT_MENU_LABEL_MAP[key];
};

export const calculateAchievementOverall = (achievements: AchievementItemDto[]): AchievementOverall => {
  let doneCount = 0;
  let claimedCount = 0;

  for (const achievement of achievements) {
    if (achievement.progress?.done) {
      doneCount += 1;
    }
    if (achievement.status === 'claimed') {
      claimedCount += 1;
    }
  }

  return {
    total: achievements.length,
    doneCount,
    claimedCount,
  };
};

export const filterAchievementsByKeyword = (
  achievements: AchievementItemDto[],
  keyword: string,
): AchievementItemDto[] => {
  const normalizedKeyword = normalizeKeyword(keyword);
  if (!normalizedKeyword) return achievements;

  const filtered: AchievementItemDto[] = [];
  for (const achievement of achievements) {
    const searchText = `${achievement.name} ${achievement.description}`.toLowerCase();
    if (searchText.includes(normalizedKeyword)) {
      filtered.push(achievement);
    }
  }
  return filtered;
};

export const filterPointRewardsByKeyword = (
  pointRewards: AchievementPointRewardDto[],
  keyword: string,
): AchievementPointRewardDto[] => {
  const normalizedKeyword = normalizeKeyword(keyword);
  if (!normalizedKeyword) return pointRewards;

  const filtered: AchievementPointRewardDto[] = [];
  for (const reward of pointRewards) {
    const titleName = reward.title?.name ?? '';
    const searchText = `${reward.name} ${reward.description} ${titleName}`.toLowerCase();
    if (searchText.includes(normalizedKeyword)) {
      filtered.push(reward);
    }
  }
  return filtered;
};

export const buildTitleViewModels = (titles: TitleInfoDto[]): TitleViewModel[] => {
  const list = [...titles];
  list.sort((a, b) => {
    if (a.isEquipped && !b.isEquipped) return -1;
    if (!a.isEquipped && b.isEquipped) return 1;
    return a.name.localeCompare(b.name);
  });

  return list.map((title) => {
    const effectsText = formatTitleEffectsText(title.effects || {});
    return {
      title,
      effectsText,
      searchText: `${title.name} ${title.description} ${effectsText}`.toLowerCase(),
    };
  });
};

export const calculateTitleOverall = (titles: TitleInfoDto[]): TitleOverall => {
  let equippedCount = 0;
  for (const title of titles) {
    if (title.isEquipped) {
      equippedCount += 1;
    }
  }

  return {
    total: titles.length,
    equippedCount,
  };
};

export const filterTitleViewModelsByKeyword = (
  titles: TitleViewModel[],
  keyword: string,
): TitleViewModel[] => {
  const normalizedKeyword = normalizeKeyword(keyword);
  if (!normalizedKeyword) return titles;

  const filtered: TitleViewModel[] = [];
  for (const title of titles) {
    if (title.searchText.includes(normalizedKeyword)) {
      filtered.push(title);
    }
  }
  return filtered;
};
