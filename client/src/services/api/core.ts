import axios from "axios";
import {
  emitApiErrorToast,
  shouldAutoErrorToast,
  toUnifiedApiError,
} from "./error";
import { API_BASE } from "../runtimeUrls";

const api = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

// 请求拦截器 - 添加token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截器
api.interceptors.response.use(
  (response) => {
    const payload = response.data;
    if (payload && typeof payload === "object" && "success" in payload) {
      const success = (payload as { success?: unknown }).success;
      if (success === false) {
        const record = payload as { message?: unknown; code?: unknown };
        const normalized = toUnifiedApiError(
          {
            message: record.message,
            code: record.code,
            success: false,
            httpStatus: response.status,
            raw: payload,
          },
          "请求失败",
        );
        if (shouldAutoErrorToast(response.config)) {
          emitApiErrorToast({ message: normalized.message, error: normalized });
        }
        return Promise.reject(normalized);
      }
    }
    return payload;
  },
  (error) => {
    const normalized = toUnifiedApiError(error, "网络错误");
    if (shouldAutoErrorToast(error?.config)) {
      emitApiErrorToast({ message: normalized.message, error: normalized });
    }
    return Promise.reject(normalized);
  },
);

export default api;
