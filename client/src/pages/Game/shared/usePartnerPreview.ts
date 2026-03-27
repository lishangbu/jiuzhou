/**
 * 伙伴详情预览共享 Hook。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中处理“按伙伴 ID 拉取详情、模块间共享缓存、并发请求去重、手动错误提示”这条链路。
 * 2. 做什么：给聊天、排行榜等只拿到伙伴 ID 的入口提供统一打开详情的方法，避免每个模块各自维护一套状态和请求表。
 * 3. 不做什么：不决定详情面板是弹窗还是底部 Sheet，也不负责排行榜/聊天自己的点击样式。
 *
 * 输入/输出：
 * - 输入：无；调用方通过返回的方法传入 `partnerId` 或现成的 `PartnerDisplayDto`。
 * - 输出：当前预览中的伙伴、打开详情的方法、关闭详情的方法。
 *
 * 数据流/状态流：
 * 调用方点击伙伴名 -> 本 Hook 先读模块级缓存 -> 未命中时发起静默请求并去重 -> 成功后写缓存并设置当前预览伙伴 ->
 * 调用方把 `previewPartner` 交给详情浮层组件渲染。
 *
 * 复用设计说明：
 * 1. 缓存和并发去重放在模块级，聊天与排行榜共用同一份详情快照，避免重复请求同一个伙伴。
 * 2. 错误提示统一走这里，调用方只负责触发“打开详情”，不再各自拼装同一份 catch 文案。
 * 3. 同时支持“按 ID 请求”和“直接打开已知伙伴详情”两种入口，后续其他模块接入时不需要再扩展第三套 API。
 *
 * 关键边界条件与坑点：
 * 1. 这里使用静默请求配置关闭拦截器自动 toast，必须由本 Hook 单点补一次 `message.error`，避免重复提示。
 * 2. 伙伴详情可能在多个模块中同时被点击，请求表必须按 `partnerId` 去重，否则会出现并发重复请求。
 */
import { App } from 'antd';
import { useCallback, useState } from 'react';
import {
  getPartnerPreview,
  getUnifiedApiErrorMessage,
  SILENT_API_REQUEST_CONFIG,
  type PartnerDisplayDto,
} from '../../../services/api';

interface UsePartnerPreviewResult {
  previewPartner: PartnerDisplayDto | null;
  openPartnerPreview: (partner: PartnerDisplayDto) => void;
  openPartnerPreviewById: (partnerId: number) => Promise<void>;
  closePartnerPreview: () => void;
}

const partnerPreviewCache = new Map<number, PartnerDisplayDto>();
const partnerPreviewRequestMap = new Map<number, Promise<PartnerDisplayDto>>();

const normalizePartnerId = (partnerId: number): number => {
  const normalized = Math.floor(Number(partnerId));
  if (!Number.isFinite(normalized) || normalized <= 0) return 0;
  return normalized;
};

export const usePartnerPreview = (): UsePartnerPreviewResult => {
  const { message } = App.useApp();
  const [previewPartner, setPreviewPartner] = useState<PartnerDisplayDto | null>(null);

  const openPartnerPreview = useCallback((partner: PartnerDisplayDto) => {
    const normalizedPartnerId = normalizePartnerId(partner.id);
    if (normalizedPartnerId > 0) {
      partnerPreviewCache.set(normalizedPartnerId, partner);
    }
    setPreviewPartner(partner);
  }, []);

  const closePartnerPreview = useCallback(() => {
    setPreviewPartner(null);
  }, []);

  const openPartnerPreviewById = useCallback(async (partnerId: number) => {
    const normalizedPartnerId = normalizePartnerId(partnerId);
    if (normalizedPartnerId <= 0) return;

    const cachedPartner = partnerPreviewCache.get(normalizedPartnerId);
    if (cachedPartner) {
      openPartnerPreview(cachedPartner);
      return;
    }

    const existingRequest = partnerPreviewRequestMap.get(normalizedPartnerId);
    const request = existingRequest ?? (async () => {
      const result = await getPartnerPreview(normalizedPartnerId, SILENT_API_REQUEST_CONFIG);
      if (!result.data) {
        throw new Error('伙伴不存在');
      }
      return result.data;
    })();

    if (!existingRequest) {
      partnerPreviewRequestMap.set(normalizedPartnerId, request);
    }

    try {
      const partner = await request;
      partnerPreviewCache.set(normalizedPartnerId, partner);
      openPartnerPreview(partner);
    } catch (error) {
      message.error(getUnifiedApiErrorMessage(error, '伙伴详情加载失败'));
    } finally {
      if (partnerPreviewRequestMap.get(normalizedPartnerId) === request) {
        partnerPreviewRequestMap.delete(normalizedPartnerId);
      }
    }
  }, [message, openPartnerPreview]);

  return {
    previewPartner,
    openPartnerPreview,
    openPartnerPreviewById,
    closePartnerPreview,
  };
};
