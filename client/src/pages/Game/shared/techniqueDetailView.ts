/**
 * 功法详情视图构建
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：把角色功法详情接口、伙伴功法详情接口统一转换成前端可直接渲染的详情视图结构。
 * 2. 做什么：集中处理层数被动、技能升级进度、消耗图标拼装，避免角色页与伙伴页各自维护一套层详情转换逻辑。
 * 3. 不做什么：不负责弹窗开关、不发起请求，也不处理“当前已解锁总览”的二次聚合展示。
 *
 * 输入 / 输出：
 * - 输入：功法定义、当前层数、层配置、技能定义、图标解析函数与消耗图标资源。
 * - 输出：`TechniqueDetailView`，包含详情头部、每层加成、每层技能变化与升层消耗。
 *
 * 数据流 / 状态流：
 * 角色/伙伴详情接口 -> 本模块归一化 -> `TechniqueDetailPanel` / 修炼弹窗 复用。
 *
 * 复用设计说明：
 * 1. 角色已学功法和伙伴已学功法都依赖同一份层配置与技能升级规则，抽到这里后只保留一个转换入口。
 * 2. 层技能变化继续复用 `buildTechniqueLayerSkillProgression`，避免升级层数和技能展示口径再次分叉。
 * 3. 未来若坊市、背包或图鉴也要展示完整功法详情，只需喂入同一结构，不需要复制转换逻辑。
 *
 * 关键边界条件与坑点：
 * 1. `extraTags` 必须先去重再写入，否则伙伴“天生功法/后天功法”和静态标签重复时会在头部出现两次。
 * 2. 当前层数可能超过静态最大层数，视图层只保留真实层列表，解锁态由消费方按 `layer <= currentLayer` 判断。
 */
import type { SkillDefDto, TechniqueDefDto, TechniqueLayerCostMaterialDto, TechniqueLayerDto } from '../../../services/api';
import { getAttrLabel } from './attrDisplay';
import { formatTechniqueBonusAmount } from '../modules/TechniqueModal/bonusShared';
import { shouldDisplayTechniquePassiveAmount } from './techniquePassiveDisplay';
import {
  buildTechniqueLayerSkillProgression,
  type TechniqueSkillProgressionEntry,
} from '../modules/TechniqueModal/techniqueSkillProgression';

export type TechniqueDetailQuality = '黄' | '玄' | '地' | '天';

export type TechniqueDetailSkill = TechniqueSkillProgressionEntry;

export type TechniqueDetailBonus = {
  key: string;
  label: string;
  value: string;
  amount: number;
};

export type TechniqueDetailCostItem = {
  id: string;
  name: string;
  icon: string;
  amount: number;
};

export type TechniqueDetailLayer = {
  layer: number;
  bonuses: TechniqueDetailBonus[];
  skills: TechniqueDetailSkill[];
  cost: TechniqueDetailCostItem[];
};

export type TechniqueDetailView = {
  id: string;
  name: string;
  quality: TechniqueDetailQuality;
  tags: string[];
  icon: string;
  desc: string;
  layer: number;
  layers: TechniqueDetailLayer[];
};

type TechniqueDetailSource = {
  technique: Pick<TechniqueDefDto, 'id' | 'name' | 'quality' | 'tags' | 'icon' | 'description' | 'long_desc'>;
  currentLayer: number;
  layers: TechniqueLayerDto[];
  skills: SkillDefDto[];
  resolveIcon: (icon: string | null | undefined) => string;
  spiritStoneIcon: string;
  expIcon: string;
  extraTags?: string[];
};

const mapTechniqueQuality = (value: string): TechniqueDetailQuality => {
  if (value === '天' || value === '地' || value === '玄' || value === '黄') return value;
  return '黄';
};

const normalizePassiveKey = (raw: string): string =>
  raw
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toLowerCase();

const toTechniqueBonuses = (passives: TechniqueLayerDto['passives']): TechniqueDetailBonus[] => {
  return passives
    .filter((passive) => shouldDisplayTechniquePassiveAmount(passive.value))
    .map((passive) => {
      const key = normalizePassiveKey(passive.key);
      if (!key) return null;
      return {
        key,
        label: getAttrLabel(key),
        value: formatTechniqueBonusAmount(key, passive.value),
        amount: passive.value,
      };
    })
    .filter((bonus): bonus is TechniqueDetailBonus => bonus !== null);
};

const appendMaterialCosts = (
  cost: TechniqueDetailCostItem[],
  materials: TechniqueLayerCostMaterialDto[],
  resolveIcon: TechniqueDetailSource['resolveIcon'],
): void => {
  materials.forEach((material) => {
    cost.push({
      id: material.itemId,
      name: material.itemName ?? material.itemId,
      icon: resolveIcon(material.itemIcon ?? null),
      amount: material.qty,
    });
  });
};

export const buildTechniqueDetailView = ({
  technique,
  currentLayer,
  layers,
  skills,
  resolveIcon,
  spiritStoneIcon,
  expIcon,
  extraTags = [],
}: TechniqueDetailSource): TechniqueDetailView => {
  const layerSkillProgression = buildTechniqueLayerSkillProgression(layers, skills, resolveIcon);
  const tags = Array.from(new Set([...extraTags, ...(Array.isArray(technique.tags) ? technique.tags : [])]));

  return {
    id: technique.id,
    name: technique.name,
    quality: mapTechniqueQuality(technique.quality),
    tags,
    icon: resolveIcon(technique.icon),
    desc: technique.long_desc || technique.description || '',
    layer: Math.max(0, currentLayer),
    layers: layers.map((layer) => {
      const cost: TechniqueDetailCostItem[] = [];
      if (layer.cost_spirit_stones > 0) {
        cost.push({
          id: 'spirit_stones',
          name: '灵石',
          icon: spiritStoneIcon,
          amount: layer.cost_spirit_stones,
        });
      }
      if (layer.cost_exp > 0) {
        cost.push({
          id: 'exp',
          name: '经验',
          icon: expIcon,
          amount: layer.cost_exp,
        });
      }
      appendMaterialCosts(cost, layer.cost_materials, resolveIcon);

      return {
        layer: layer.layer,
        bonuses: toTechniqueBonuses(layer.passives),
        skills: layerSkillProgression.get(layer.layer) ?? [],
        cost,
      };
    }),
  };
};
