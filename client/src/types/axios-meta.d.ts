import 'axios';

declare module 'axios' {
  interface AxiosRequestConfig {
    /**
     * 请求级元信息：
     * - autoErrorToast 默认 true
     * - 显式 false 时关闭响应拦截器自动错误提示
     */
    meta?: {
      autoErrorToast?: boolean;
    };
  }
}

export {};
