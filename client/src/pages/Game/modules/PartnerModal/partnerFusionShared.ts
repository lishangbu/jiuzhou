/**
 * 三魂归契共享纯函数
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中维护三魂归契页签的任务态映射、素材选择禁用规则与概率文案。
 * 2. 做什么：把“归契中/坊市中/出战中/品级不一致”这些高频判断从组件 JSX 中抽离，避免重复分支散落。
 * 3. 不做什么：不发请求、不持有状态，也不直接渲染 UI。
 *
 * 输入/输出：
 * - 输入：伙伴 DTO、三魂归契状态 DTO、当前已选素材。
 * - 输出：页签视图态、红点、禁用原因与文案列表。
 *
 * 数据流/状态流：
 * API / WebSocket / 伙伴总览 -> 本模块纯函数 -> PartnerModal 三魂归契面板。
 *
 * 关键边界条件与坑点：
 * 1. 黄/天边界概率要与服务端同口径展示，否则玩家看到的概率与实际结果会不一致。
 * 2. 同五行加成展示必须基于当前已选素材实时计算，否则“已选 2 个同五行”时前端会继续显示旧的 10% 升品概率。
 * 3. 素材禁用原因必须只有一个最终文案，避免同一卡片同时出现多条冲突说明。
 */
import type {
  PartnerDetailDto,
  PartnerFusionJobDto,
  PartnerFusionPreviewDto,
  PartnerFusionStatusDto,
} from '../../../../services/api';
import { ITEM_QUALITY_ASC_ORDER, type ItemQualityName } from '../../shared/itemQuality';

type PartnerFusionIndicator = {
  badgeDot: boolean;
};

export type PartnerFusionPanelView =
  | { kind: 'idle' }
  | { kind: 'pending'; job: PartnerFusionJobDto }
  | { kind: 'preview'; job: PartnerFusionJobDto; preview: PartnerFusionPreviewDto }
  | { kind: 'failed'; job: PartnerFusionJobDto; errorMessage: string };

const PARTNER_FUSION_DOWNGRADE_RATE = 5;
const PARTNER_FUSION_SAME_RATE = 85;
const PARTNER_FUSION_UPGRADE_RATE = 10;
const PARTNER_FUSION_UPGRADE_BONUS_PER_EXTRA_MATCH = 5;
const PARTNER_FUSION_EMPTY_ELEMENT = 'none';

export const buildPartnerFusionIndicator = (
  status: PartnerFusionStatusDto | null,
): PartnerFusionIndicator => {
  return {
    badgeDot: Boolean(status?.hasUnreadResult),
  };
};

export const resolvePartnerFusionPanelView = (
  status: PartnerFusionStatusDto | null,
): PartnerFusionPanelView => {
  const job = status?.currentJob;
  if (!job) return { kind: 'idle' };
  if (job.status === 'pending') {
    return { kind: 'pending', job };
  }
  if (job.status === 'generated_preview' && job.preview) {
    return { kind: 'preview', job, preview: job.preview };
  }
  return {
    kind: 'failed',
    job,
    errorMessage: job.errorMessage || '三魂归契失败',
  };
};

const resolvePartnerFusionUpgradeBonusRate = (
  selectedPartners: readonly Pick<PartnerDetailDto, 'element'>[],
): number => {
  const validElements = selectedPartners
    .map((partner) => partner.element.trim())
    .filter((element) => element.length > 0 && element !== PARTNER_FUSION_EMPTY_ELEMENT);
  if (validElements.length <= 1) {
    return 0;
  }

  const elementCountMap = new Map<string, number>();
  for (const element of validElements) {
    elementCountMap.set(element, (elementCountMap.get(element) ?? 0) + 1);
  }

  let maxSameElementCount = 0;
  for (const count of elementCountMap.values()) {
    if (count > maxSameElementCount) {
      maxSameElementCount = count;
    }
  }

  return Math.max(0, maxSameElementCount - 1) * PARTNER_FUSION_UPGRADE_BONUS_PER_EXTRA_MATCH;
};

export const resolvePartnerFusionRateLines = (
  sourceQuality: string,
  selectedPartners: readonly Pick<PartnerDetailDto, 'element'>[] = [],
): string[] => {
  const qualityIndex = ITEM_QUALITY_ASC_ORDER.findIndex((entry) => entry === sourceQuality);
  const upgradeBonusRate = resolvePartnerFusionUpgradeBonusRate(selectedPartners);
  const sameQualityRate = PARTNER_FUSION_SAME_RATE - upgradeBonusRate;
  const upgradeQualityRate = PARTNER_FUSION_UPGRADE_RATE + upgradeBonusRate;
  if (qualityIndex < 0) {
    return [`${sameQualityRate}% 同品级`, `${PARTNER_FUSION_DOWNGRADE_RATE}% -1 品级`, `${upgradeQualityRate}% +1 品级`];
  }
  const lowerQuality = ITEM_QUALITY_ASC_ORDER[qualityIndex - 1];
  const higherQuality = ITEM_QUALITY_ASC_ORDER[qualityIndex + 1];
  const lines: string[] = [];
  if (lowerQuality) {
    lines.push(`${PARTNER_FUSION_DOWNGRADE_RATE}% 获得${lowerQuality}品伙伴`);
  }
  lines.push(`${higherQuality ? (lowerQuality ? sameQualityRate : PARTNER_FUSION_DOWNGRADE_RATE + sameQualityRate) : sameQualityRate + upgradeQualityRate}% 获得${sourceQuality}品伙伴`);
  if (higherQuality) {
    lines.push(`${upgradeQualityRate}% 获得${higherQuality}品伙伴`);
  }
  return lines;
};

export const togglePartnerFusionMaterialSelection = (
  selectedIds: number[],
  partnerId: number,
): number[] => {
  if (selectedIds.includes(partnerId)) {
    return selectedIds.filter((entry) => entry !== partnerId);
  }
  if (selectedIds.length >= 3) {
    return selectedIds;
  }
  return [...selectedIds, partnerId];
};

export const resolvePartnerFusionSelectedQuality = (
  partners: PartnerDetailDto[],
  selectedIds: number[],
): string | null => {
  for (const partnerId of selectedIds) {
    const partner = partners.find((entry) => entry.id === partnerId);
    if (partner) return partner.quality;
  }
  return null;
};

export const resolvePartnerFusionMaterialDisabledReason = (
  partner: PartnerDetailDto,
  selectedQuality: string | null,
  selectedCount: number,
): string | null => {
  if (partner.isActive) return '出战中';
  if (partner.tradeStatus === 'market_listed') return '坊市中';
  if (partner.fusionStatus === 'fusion_locked') return '归契中';
  if (selectedQuality && partner.quality !== selectedQuality) return '品级不一致';
  if (selectedCount >= 3) return '已选满3个';
  return null;
};

export const groupPartnersByFusionQuality = (
  partners: PartnerDetailDto[],
  selectedQuality: string | null,
): Array<{ quality: string; partners: PartnerDetailDto[] }> => {
  const qualityBuckets: Record<ItemQualityName, PartnerDetailDto[]> = {
    黄: [],
    玄: [],
    地: [],
    天: [],
  };

  for (const partner of partners) {
    if (partner.isActive || partner.tradeStatus === 'market_listed') {
      continue;
    }
    if (selectedQuality && partner.quality !== selectedQuality) {
      continue;
    }
    if (partner.quality !== '黄' && partner.quality !== '玄' && partner.quality !== '地' && partner.quality !== '天') {
      continue;
    }
    qualityBuckets[partner.quality].push(partner);
  }

  return ITEM_QUALITY_ASC_ORDER
    .map((quality) => ({
      quality,
      partners: qualityBuckets[quality],
    }))
    .filter((entry) => entry.partners.length > 0);
};
