/**
 * 伙伴天生功法可见性校验模块
 *
 * 作用（做什么 / 不做什么）：
 * 1) 做什么：集中校验伙伴定义里的天生功法是否已能通过统一功法静态入口读取，并在首次缺失时主动刷新一次生成功法快照。
 * 2) 做什么：把“招募预览读取 / 三魂归契预览读取 / 正式创建伙伴实例”对同一批天生功法的可见性判断收敛到单一入口，避免多个服务各写一套刷新与缺失判断。
 * 3) 不做什么：不修改伙伴定义、不补写数据库，也不吞掉刷新后仍缺失的真实数据问题。
 *
 * 输入/输出：
 * - 输入：完整 `PartnerDefConfig`。
 * - 输出：`{ success: true }` 或 `{ success: false, missingTechniqueIds }`。
 *
 * 数据流/状态流：
 * partner.innate_technique_ids -> 统一功法静态快照 -> 缺失时刷新生成功法快照 -> 再次校验 -> 返回结果。
 *
 * 复用设计说明：
 * - 伙伴招募、三魂归契和实例创建都依赖同一套“天生功法必须可读”的规则，集中后只维护一份刷新策略与缺失判定。
 * - 高频变化点是“生成功法何时对当前线程可见”，因此把快照刷新放在这里，调用方只关心业务成功/失败，不再重复拼装缓存修复逻辑。
 *
 * 关键边界条件与坑点：
 * 1) 空的 `innate_technique_ids` 视为已通过；这里不擅自补默认功法，缺什么由上游生成链路负责。
 * 2) 这里只允许刷新一次快照；刷新后仍缺失说明是真实数据断链，必须明确失败，不能继续沿用旧快照硬闯。
 */
import {
  refreshGeneratedTechniqueSnapshots,
  type PartnerDefConfig,
} from '../staticConfigLoader.js';
import {
  getPartnerInnateTechniqueIds,
  getPartnerTechniqueStaticMeta,
} from './partnerView.js';

export type PartnerInnateTechniqueVisibilityResult =
  | { success: true }
  | { success: false; missingTechniqueIds: string[] };

const collectMissingInnateTechniqueIds = (definition: PartnerDefConfig): string[] => {
  const innateTechniqueIds = getPartnerInnateTechniqueIds(definition);
  if (innateTechniqueIds.length <= 0) {
    return [];
  }

  return innateTechniqueIds.filter((techniqueId) => !getPartnerTechniqueStaticMeta(techniqueId, 1));
};

export const ensurePartnerInnateTechniquesVisible = async (
  definition: PartnerDefConfig,
): Promise<PartnerInnateTechniqueVisibilityResult> => {
  const currentMissingTechniqueIds = collectMissingInnateTechniqueIds(definition);
  if (currentMissingTechniqueIds.length <= 0) {
    return { success: true };
  }

  await refreshGeneratedTechniqueSnapshots();

  const refreshedMissingTechniqueIds = collectMissingInnateTechniqueIds(definition);
  if (refreshedMissingTechniqueIds.length <= 0) {
    return { success: true };
  }

  return {
    success: false,
    missingTechniqueIds: refreshedMissingTechniqueIds,
  };
};
