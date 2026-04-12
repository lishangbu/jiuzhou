/**
 * 通用图片验证码拉取 Hook
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：统一处理验证码图片的首次加载、刷新、并发请求去重与失效清空，供登录注册和坊市验证码弹窗复用。
 * 2. 做什么：把 `captchaId/imageData/expiresAt` 的请求生命周期收敛到单一 Hook，避免多个组件各自维护一套相同的请求状态。
 * 3. 不做什么：不渲染 UI，不管理验证码输入值，也不决定验证成功后的业务动作。
 *
 * 输入/输出：
 * - 输入：是否启用、刷新 nonce、验证码加载函数、失败兜底文案、加载成功/清空回调。
 * - 输出：当前验证码、加载态、手动刷新方法、清空方法。
 *
 * 数据流/状态流：
 * - `enabled/refreshNonce` 变化 -> 调用加载函数 -> 更新本地验证码状态 -> 回调调用方同步业务字段。
 *
 * 关键边界条件与坑点：
 * 1. 验证码在服务端是一条一次性记录，请求返回的新 `captchaId` 必须及时同步给调用方，不能只换图片不换 ID。
 * 2. 组件快速关闭/打开或连续点击刷新时，旧请求结果不能覆盖新请求结果，所以这里统一用 `requestId` 做并发淘汰。
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { getUnifiedApiErrorMessage } from '../../services/api/error';
import type {
  CaptchaChallenge,
  CaptchaResponse,
} from '../../services/api/auth-character';

interface UseCaptchaChallengeOptions {
  enabled: boolean;
  refreshNonce: number;
  loadCaptcha: () => Promise<CaptchaResponse>;
  fallbackMessage: string;
  onLoaded?: (captcha: CaptchaChallenge) => void;
  onCleared?: () => void;
  onLoadError?: (message: string, error?: unknown) => void;
}

interface UseCaptchaChallengeResult {
  captcha: CaptchaChallenge | null;
  loading: boolean;
  refreshCaptcha: () => Promise<void>;
  clearCaptcha: () => void;
}

export const useCaptchaChallenge = ({
  enabled,
  refreshNonce,
  loadCaptcha,
  fallbackMessage,
  onLoaded,
  onCleared,
  onLoadError,
}: UseCaptchaChallengeOptions): UseCaptchaChallengeResult => {
  const [captcha, setCaptcha] = useState<CaptchaChallenge | null>(null);
  const [loading, setLoading] = useState(false);
  const requestIdRef = useRef(0);
  const onLoadedRef = useRef(onLoaded);
  const onClearedRef = useRef(onCleared);
  const onLoadErrorRef = useRef(onLoadError);

  useEffect(() => {
    onLoadedRef.current = onLoaded;
  }, [onLoaded]);

  useEffect(() => {
    onClearedRef.current = onCleared;
  }, [onCleared]);

  useEffect(() => {
    onLoadErrorRef.current = onLoadError;
  }, [onLoadError]);

  const clearCaptcha = useCallback(() => {
    requestIdRef.current += 1;
    setCaptcha(null);
    setLoading(false);
    onClearedRef.current?.();
  }, []);

  const refreshCaptcha = useCallback(async (): Promise<void> => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);

    try {
      const result = await loadCaptcha();
      if (requestIdRef.current !== requestId) {
        return;
      }

      setCaptcha(result.data);
      onLoadedRef.current?.(result.data);
    } catch (error) {
      if (requestIdRef.current !== requestId) {
        return;
      }

      setCaptcha(null);
      onClearedRef.current?.();
      onLoadErrorRef.current?.(getUnifiedApiErrorMessage(error, fallbackMessage), error);
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [fallbackMessage, loadCaptcha]);

  useEffect(() => {
    if (!enabled) {
      clearCaptcha();
      return;
    }

    void refreshCaptcha();
  }, [clearCaptcha, enabled, refreshCaptcha, refreshNonce]);

  return {
    captcha,
    loading,
    refreshCaptcha,
    clearCaptcha,
  };
};
