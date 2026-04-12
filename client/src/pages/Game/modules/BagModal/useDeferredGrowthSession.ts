/**
 * 装备成长延迟刷新会话 Hook
 *
 * 作用：
 * 1. 做什么：集中管理强化/精炼连续操作期间的待刷新背包状态，只在成长弹窗关闭时统一刷新一次。
 * 2. 做什么：维护成长弹窗内的材料消耗增量、预览重拉触发器，以及成功操作后的当前属性覆盖值，避免桌面端和移动端各写一套状态机。
 * 3. 不做什么：不发起强化/精炼请求，不决定是否允许操作，也不处理镶嵌、洗炼等仍需即时刷新的流程。
 *
 * 输入 / 输出：
 * - 输入：弹窗是否打开 `open`、重置键 `resetKey`、统一刷新函数 `onRefresh`、背包变化广播 `onInventoryChanged`、关闭弹窗 `onClose`。
 * - 输出：`materialDeltaByDefId`、`previewVersion`、`currentBaseAttrsOverride`、`markCommitted`、`handleClose`、`closing`。
 *
 * 数据流 / 状态流：
 * - 强化/精炼成功或产生实际消耗 -> `markCommitted` 标记待刷新并累计材料消耗 -> 弹窗内预览按 `previewVersion` 轻量重拉。
 * - 用户关闭弹窗或装备碎裂后强制关闭 -> `handleClose` 统一执行一次 `onRefresh` -> 广播 `inventory:changed` -> 重置会话状态。
 *
 * 复用设计说明：
 * - 桌面端 BagModal 和移动端 GrowthSheet 都有“连续成长操作 + 关闭时统一刷新”的需求，把这段会话状态抽到 Hook 后，避免两端重复维护 pending/materialDelta/flush 细节。
 * - 材料消耗与预览重拉属于高频变化点，集中在这里可以确保两端行为一致，减少未来扩展时的分叉风险。
 *
 * 关键边界条件与坑点：
 * 1. 强化导致装备碎裂时，关闭动作会在同一轮异步流程里触发，因此待刷新标记不能只依赖 React state，必须同时保留 ref，避免还没重渲染就漏刷背包。
 * 2. `handleClose` 可能被遮罩、取消按钮、关闭图标重复触发，必须有关闭中保护，避免同一轮 close 执行多次刷新。
 */
import { useCallback, useEffect, useRef, useState } from 'react';

type UsedMaterial = {
  itemDefId: string;
  qty: number;
};

type MarkCommittedOptions = {
  usedMaterial?: UsedMaterial | null;
  nextCurrentBaseAttrs?: Record<string, number> | null;
};

type UseDeferredGrowthSessionOptions = {
  open: boolean;
  resetKey: number | null | undefined;
  onRefresh: () => Promise<void>;
  onInventoryChanged: () => void;
  onClose: () => void;
};

type UseDeferredGrowthSessionResult = {
  materialDeltaByDefId: Record<string, number>;
  previewVersion: number;
  currentBaseAttrsOverride: Record<string, number> | null;
  closing: boolean;
  markCommitted: (options?: MarkCommittedOptions) => void;
  clearSession: () => void;
  handleClose: () => Promise<void>;
};

export const useDeferredGrowthSession = ({
  open,
  resetKey,
  onRefresh,
  onInventoryChanged,
  onClose,
}: UseDeferredGrowthSessionOptions): UseDeferredGrowthSessionResult => {
  const [materialDeltaByDefId, setMaterialDeltaByDefId] = useState<Record<string, number>>({});
  const [previewVersion, setPreviewVersion] = useState(0);
  const [currentBaseAttrsOverride, setCurrentBaseAttrsOverride] = useState<Record<string, number> | null>(null);
  const [closing, setClosing] = useState(false);
  const pendingRefreshRef = useRef(false);
  const closingRef = useRef(false);

  const resetSession = useCallback(() => {
    pendingRefreshRef.current = false;
    setMaterialDeltaByDefId({});
    setPreviewVersion(0);
    setCurrentBaseAttrsOverride(null);
  }, []);

  useEffect(() => {
    if (open) return;
    resetSession();
    closingRef.current = false;
    setClosing(false);
  }, [open, resetSession]);

  useEffect(() => {
    if (!open) return;
    resetSession();
  }, [open, resetKey, resetSession]);

  const markCommitted = useCallback((options?: MarkCommittedOptions) => {
    pendingRefreshRef.current = true;
    const usedMaterial = options?.usedMaterial;
    if (usedMaterial && usedMaterial.itemDefId && usedMaterial.qty > 0) {
      setMaterialDeltaByDefId((prev) => ({
        ...prev,
        [usedMaterial.itemDefId]: (prev[usedMaterial.itemDefId] ?? 0) + usedMaterial.qty,
      }));
    }
    if (options?.nextCurrentBaseAttrs) {
      setCurrentBaseAttrsOverride(options.nextCurrentBaseAttrs);
    }
    setPreviewVersion((prev) => prev + 1);
  }, []);

  const handleClose = useCallback(async () => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    try {
      if (pendingRefreshRef.current) {
        try {
          await onRefresh();
          onInventoryChanged();
        } catch {
          void 0;
        }
      }
      onClose();
      resetSession();
    } finally {
      closingRef.current = false;
      setClosing(false);
    }
  }, [onClose, onInventoryChanged, onRefresh, resetSession]);

  return {
    materialDeltaByDefId,
    previewVersion,
    currentBaseAttrsOverride,
    closing,
    markCommitted,
    clearSession: resetSession,
    handleClose,
  };
};
