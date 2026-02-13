/**
 * 自动分解筛选项（前端共享）
 *
 * 作用：
 * - 统一“品类/子类”的中文显示，避免各页面重复维护导致英文直出。
 * - 统一筛选值归一化，确保提交给服务端的 value 始终是稳定英文编码。
 *
 * 输入：
 * - 原始值列表（可能包含空值、大小写不一致、重复项）。
 *
 * 输出：
 * - 去重、转小写后的稳定数组；
 * - 用于 Select 的 options（label 中文、value 英文编码）。
 */

export interface LabeledOption {
  label: string;
  value: string;
}

export const AUTO_DISASSEMBLE_CATEGORY_OPTIONS: LabeledOption[] = [
  { label: '装备', value: 'equipment' },
  { label: '消耗品', value: 'consumable' },
  { label: '材料', value: 'material' },
  { label: '功法书', value: 'skillbook' },
  { label: '功法', value: 'skill' },
  { label: '任务道具', value: 'quest' },
  { label: '其他', value: 'other' },
];

export const AUTO_DISASSEMBLE_SUB_CATEGORY_OPTIONS: LabeledOption[] = [
  { label: '剑', value: 'sword' },
  { label: '刀', value: 'blade' },
  { label: '法杖', value: 'staff' },
  { label: '盾牌', value: 'shield' },
  { label: '头盔', value: 'helmet' },
  { label: '帽子', value: 'hat' },
  { label: '法袍', value: 'robe' },
  { label: '手套', value: 'gloves' },
  { label: '臂甲', value: 'gauntlets' },
  { label: '下装', value: 'pants' },
  { label: '护腿', value: 'legguards' },
  { label: '戒指', value: 'ring' },
  { label: '项链', value: 'necklace' },
  { label: '护符', value: 'talisman' },
  { label: '宝镜', value: 'mirror' },
  { label: '配饰', value: 'accessory' },
  { label: '护甲', value: 'armor' },
  { label: '战令道具', value: 'battle_pass' },
  { label: '骨材', value: 'bone' },
  { label: '宝箱', value: 'box' },
  { label: '突破道具', value: 'breakthrough' },
  { label: '采集物', value: 'collect' },
  { label: '蛋类', value: 'egg' },
  { label: '强化道具', value: 'enhance' },
  { label: '精华', value: 'essence' },
  { label: '锻造材料', value: 'forge' },
  { label: '功能道具', value: 'function' },
  { label: '宝石', value: 'gem' },
  { label: '攻击宝石', value: 'gem_attack' },
  { label: '防御宝石', value: 'gem_defense' },
  { label: '生存宝石', value: 'gem_survival' },
  { label: '通用宝石', value: 'gem_all' },
  { label: '灵草', value: 'herb' },
  { label: '钥匙', value: 'key' },
  { label: '皮革', value: 'leather' },
  { label: '月卡道具', value: 'month_card' },
  { label: '杂项道具', value: 'object' },
  { label: '矿石', value: 'ore' },
  { label: '丹药', value: 'pill' },
  { label: '遗物', value: 'relic' },
  { label: '卷轴', value: 'scroll' },
  { label: '功法', value: 'technique' },
  { label: '功法书', value: 'technique_book' },
  { label: '代币', value: 'token' },
  { label: '木材', value: 'wood' },
];

const AUTO_DISASSEMBLE_CATEGORY_VALUE_SET = new Set(
  AUTO_DISASSEMBLE_CATEGORY_OPTIONS.map((option) => option.value)
);

const AUTO_DISASSEMBLE_SUB_CATEGORY_VALUE_SET = new Set(
  AUTO_DISASSEMBLE_SUB_CATEGORY_OPTIONS.map((option) => option.value)
);

const AUTO_DISASSEMBLE_SUB_CATEGORY_LABEL_MAP = new Map(
  AUTO_DISASSEMBLE_SUB_CATEGORY_OPTIONS.map((option) => [option.value, option.label] as const)
);

const normalizeStringList = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of raw) {
    const value = String(row ?? '').trim().toLowerCase();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
};

export const normalizeAutoDisassembleCategoryList = (raw: unknown): string[] => {
  return normalizeStringList(raw).filter((value) => AUTO_DISASSEMBLE_CATEGORY_VALUE_SET.has(value));
};

export const normalizeAutoDisassembleSubCategoryList = (raw: unknown): string[] => {
  return normalizeStringList(raw).filter((value) => AUTO_DISASSEMBLE_SUB_CATEGORY_VALUE_SET.has(value));
};

export const getAutoDisassembleSubCategoryLabel = (subCategoryValue: string): string => {
  const normalized = String(subCategoryValue || '').trim().toLowerCase();
  if (!normalized) return '未分类';
  return AUTO_DISASSEMBLE_SUB_CATEGORY_LABEL_MAP.get(normalized) ?? normalized;
};

export const buildAutoDisassembleSubCategoryOptions = (rawValues: string[]): LabeledOption[] => {
  const values = normalizeStringList(rawValues);
  const options = values.map((value) => ({
    value,
    label: getAutoDisassembleSubCategoryLabel(value),
  }));
  options.sort((a, b) => a.label.localeCompare(b.label, 'zh-Hans-CN') || a.value.localeCompare(b.value));
  return options;
};
