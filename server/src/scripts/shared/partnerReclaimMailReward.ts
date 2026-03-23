/**
 * 伙伴回收邮件奖励共享模块
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中汇总伙伴回收所需返还的补偿令牌、功法书、升级材料、经验与灵石，生成单一邮件奖励载荷。
 * 2. 做什么：统一生成伙伴回收奖励邮件的标题与正文，避免 dry run 预览和 execute 发奖各自拼一套文案。
 * 3. 不做什么：不发送邮件、不连接数据库，也不决定伙伴是否可回收。
 *
 * 输入/输出：
 * - 输入：伙伴回收返还所需的补偿令牌、伙伴灌注经验、功法书与功法升级返还摘要。
 * - 输出：可直接交给 `mailService.sendMail({ attachRewards })` 的奖励载荷，以及邮件标题/正文。
 *
 * 数据流/状态流：
 * 回收脚本训练返还摘要 -> 本模块汇总奖励与文案 -> 回收脚本 dry run 展示 / execute 发系统奖励邮件。
 *
 * 关键边界条件与坑点：
 * 1. 同一 `itemDefId` 必须在这里合并数量，不能把聚合逻辑散到打印、发奖、测试三处分别处理。
 * 2. 当前保留功法书返还是“物品书本”，不是直接返还角色已学功法；这样才能和脚本现有可追溯数据保持一致。
 */
import type { GrantedRewardPayload } from '../../services/shared/rewardPayload.js';

type PartnerReclaimTechniqueMaterialRefund = {
    itemId: string;
    itemName: string;
    qty: number;
};

type PartnerReclaimLearnedTechniqueBookSummary = {
    itemDefId: string;
    itemName: string;
    techniqueId: string;
    techniqueName: string;
};

type PartnerReclaimTechniqueUpgradeRefund = {
    spiritStones: number;
    exp: number;
    materials: PartnerReclaimTechniqueMaterialRefund[];
};

export type PartnerReclaimMailRewardInput = {
    compensationItemDefId: string;
    compensationQty: number;
    partnerSpentExp: number;
    learnedTechniqueBooks: PartnerReclaimLearnedTechniqueBookSummary[];
    techniqueUpgradeRefund: PartnerReclaimTechniqueUpgradeRefund;
};

export type PartnerReclaimMailContentInput = {
    partnerNickname: string;
    partnerName: string;
    baseModel: string;
};

const normalizePositiveInteger = (value: number): number => {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.floor(value));
};

const mergeRewardItems = (
    itemMap: Map<string, number>,
    orderedItemIds: string[],
    itemDefId: string,
    quantity: number,
): void => {
    if (!itemDefId) return;
    const normalizedQuantity = normalizePositiveInteger(quantity);
    if (normalizedQuantity <= 0) return;

    if (!itemMap.has(itemDefId)) {
        orderedItemIds.push(itemDefId);
        itemMap.set(itemDefId, normalizedQuantity);
        return;
    }

    itemMap.set(itemDefId, (itemMap.get(itemDefId) ?? 0) + normalizedQuantity);
};

export const buildPartnerReclaimMailRewardPayload = (
    input: PartnerReclaimMailRewardInput,
): GrantedRewardPayload => {
    const itemMap = new Map<string, number>();
    const orderedItemIds: string[] = [];

    mergeRewardItems(
        itemMap,
        orderedItemIds,
        input.compensationItemDefId,
        input.compensationQty,
    );

    for (const book of input.learnedTechniqueBooks) {
        mergeRewardItems(itemMap, orderedItemIds, book.itemDefId, 1);
    }

    for (const material of input.techniqueUpgradeRefund.materials) {
        mergeRewardItems(itemMap, orderedItemIds, material.itemId, material.qty);
    }

    const exp =
        normalizePositiveInteger(input.partnerSpentExp)
        + normalizePositiveInteger(input.techniqueUpgradeRefund.exp);
    const spiritStones = normalizePositiveInteger(input.techniqueUpgradeRefund.spiritStones);
    const items = orderedItemIds.map((itemDefId) => ({
        itemDefId,
        quantity: itemMap.get(itemDefId) ?? 0,
    }));

    return {
        ...(exp > 0 ? { exp } : {}),
        ...(spiritStones > 0 ? { spiritStones } : {}),
        ...(items.length > 0 ? { items } : {}),
    };
};

export const buildPartnerReclaimMailTitle = (): string => {
    return '伙伴回收返还已送达';
};

export const buildPartnerReclaimMailContent = (
    input: PartnerReclaimMailContentInput,
): string => {
    return `你被回收的伙伴【${input.partnerNickname}】/${input.partnerName}（底模：${input.baseModel}）相关补偿、材料、经验、物品与功法书已通过系统邮件返还，请及时领取。`;
};
