/**
 * 三魂归契规则模块
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中维护三魂归契的素材数量、品级浮动概率、同五行升品加成与结果抽取规则。
 * 2. 做什么：把黄/天边界概率并回同品级的规则收口，避免服务层和前端各自手写一套。
 * 3. 不做什么：不读数据库、不创建任务，也不处理伙伴占用校验。
 *
 * 输入/输出：
 * - 输入：源品级、素材五行列表。
 * - 输出：融合结果权重列表与一次抽取后的目标品级。
 *
 * 数据流/状态流：
 * 融合发起 -> 本模块算结果品级 -> 业务任务记录 result_quality -> AI 伙伴生成。
 *
 * 关键边界条件与坑点：
 * 1. 黄品不能降、天品不能升；无效概率必须并回同品级，保证总权重始终是 100。
 * 2. 同五行加成只允许把“同品级”概率转移到“升 1 品级”概率，不能改动降品概率，否则基础风险会漂移。
 * 3. `none` 或空五行不参与加成统计；抽取逻辑必须只依赖同一份权重表，避免“展示概率”和“实际概率”分叉。
 */
import {
  QUALITY_BY_RANK,
  QUALITY_RANK_MAP,
  type QualityName,
} from './itemQuality.js';

export const PARTNER_FUSION_MATERIAL_COUNT = 3;
const PARTNER_FUSION_DOWNGRADE_WEIGHT = 5;
const PARTNER_FUSION_SAME_WEIGHT = 85;
const PARTNER_FUSION_UPGRADE_WEIGHT = 10;
const PARTNER_FUSION_UPGRADE_BONUS_PER_EXTRA_MATCH = 5;
const PARTNER_FUSION_EMPTY_ELEMENT = 'none';

export type PartnerFusionQualityWeight = {
  quality: QualityName;
  weight: number;
};

/**
 * 根据素材五行计算“三魂归契升 1 品级加成”。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：统计素材中最多相同五行的数量，并把超出 1 个后的每个相同项换算成 5% 升品加成。
 * 2. 做什么：统一过滤空字符串与 `none`，避免服务层再次手写“哪些五行可参与统计”的判断。
 * 3. 不做什么：不校验素材数量，不决定具体品级映射，也不处理边界并回。
 *
 * 输入/输出：
 * - 输入：素材五行列表。
 * - 输出：应转移到“升 1 品级”桶的概率值。
 *
 * 数据流/状态流：
 * startFusion 收集素材五行 -> 本函数计算升品加成 -> resolvePartnerFusionQualityWeights 统一产出最终权重。
 *
 * 关键边界条件与坑点：
 * 1. 只有重复的有效五行才加成，因此 1 个五行 + 2 个 `none` 不应得到任何升品奖励。
 * 2. 当前三魂归契固定 3 个素材，理论最大加成是 10%；这里仍按素材上限做 clamp，避免未来素材数变化时直接突破同品级桶。
 */
export const resolvePartnerFusionUpgradeBonusWeight = (
  materialElements: readonly string[],
): number => {
  const normalizedElements = materialElements
    .map((element) => element.trim())
    .filter((element) => element.length > 0 && element !== PARTNER_FUSION_EMPTY_ELEMENT);
  if (normalizedElements.length <= 1) {
    return 0;
  }

  const elementCountMap = new Map<string, number>();
  for (const element of normalizedElements) {
    elementCountMap.set(element, (elementCountMap.get(element) ?? 0) + 1);
  }

  let maxSameElementCount = 0;
  for (const count of elementCountMap.values()) {
    if (count > maxSameElementCount) {
      maxSameElementCount = count;
    }
  }

  const extraMatchCount = Math.max(0, maxSameElementCount - 1);
  const rawBonusWeight = extraMatchCount * PARTNER_FUSION_UPGRADE_BONUS_PER_EXTRA_MATCH;
  const maxBonusWeight =
    (PARTNER_FUSION_MATERIAL_COUNT - 1) * PARTNER_FUSION_UPGRADE_BONUS_PER_EXTRA_MATCH;
  return Math.min(rawBonusWeight, maxBonusWeight);
};

export const resolvePartnerFusionQualityWeights = (
  sourceQuality: QualityName,
  materialElements: readonly string[] = [],
): PartnerFusionQualityWeight[] => {
  const sourceRank = QUALITY_RANK_MAP[sourceQuality];
  const weightsByQuality: Record<QualityName, number> = {
    黄: 0,
    玄: 0,
    地: 0,
    天: 0,
  };
  const upgradeBonusWeight = resolvePartnerFusionUpgradeBonusWeight(materialElements);
  const sameQualityWeight = PARTNER_FUSION_SAME_WEIGHT - upgradeBonusWeight;
  const upgradeQualityWeight = PARTNER_FUSION_UPGRADE_WEIGHT + upgradeBonusWeight;

  const lowerQuality = QUALITY_BY_RANK[sourceRank - 1];
  const higherQuality = QUALITY_BY_RANK[sourceRank + 1];
  if (lowerQuality) {
    weightsByQuality[lowerQuality] += PARTNER_FUSION_DOWNGRADE_WEIGHT;
  } else {
    weightsByQuality[sourceQuality] += PARTNER_FUSION_DOWNGRADE_WEIGHT;
  }

  weightsByQuality[sourceQuality] += sameQualityWeight;

  if (higherQuality) {
    weightsByQuality[higherQuality] += upgradeQualityWeight;
  } else {
    weightsByQuality[sourceQuality] += upgradeQualityWeight;
  }

  return (Object.keys(weightsByQuality) as QualityName[])
    .map((quality) => ({
      quality,
      weight: weightsByQuality[quality],
    }))
    .filter((entry) => entry.weight > 0);
};

export const rollPartnerFusionResultQuality = (
  sourceQuality: QualityName,
  randomValue: number = Math.random(),
  materialElements: readonly string[] = [],
): QualityName => {
  const weights = resolvePartnerFusionQualityWeights(sourceQuality, materialElements);
  const totalWeight = weights.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) {
    return sourceQuality;
  }

  let remaining = Math.max(0, Math.min(0.999999, randomValue)) * totalWeight;
  for (const entry of weights) {
    if (remaining < entry.weight) {
      return entry.quality;
    }
    remaining -= entry.weight;
  }

  return weights[weights.length - 1]?.quality ?? sourceQuality;
};
