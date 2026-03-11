/**
 * 头像上传响应共享解析
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：统一解析头像上传 STS 接口的标准成功响应，避免业务层把 `sendSuccess` 的 `data` 包装读错。
 * 2. 做什么：集中定义 COS STS 直传与本地回退两种响应类型，消除同一结构在多个文件重复声明。
 * 3. 不做什么：不发起网络请求，不处理文件上传，也不负责头像确认写库。
 *
 * 输入/输出：
 * - 输入：`/upload/avatar/sts` 的成功响应对象。
 * - 输出：解包后的上传数据，包含 `cosEnabled`、大小上限以及直传所需字段。
 *
 * 数据流/状态流：
 * - 路由 `sendSuccess(res, payload)` 返回 `{ success: true, data: payload }`
 * - `profile.ts` 调用接口后复用本模块解包 `data`
 * - 上传入口再基于 `cosEnabled` 决定走 STS 直传还是本地回退
 *
 * 关键边界条件与坑点：
 * 1. 后端 `sendSuccess` 会把真实 payload 包在 `data` 字段中，不能把 `cosEnabled` 误读为顶层字段。
 * 2. 只有 `cosEnabled === true` 时才保证存在 `bucket/region/key/credentials`，本地回退分支不能强行读取这些字段。
 */

export type AvatarUploadStsPayload =
  | {
      cosEnabled: true;
      maxFileSizeBytes: number;
      bucket: string;
      region: string;
      key: string;
      avatarUrl: string;
      startTime: number;
      expiredTime: number;
      credentials: {
        tmpSecretId: string;
        tmpSecretKey: string;
        sessionToken: string;
      };
    }
  | {
      cosEnabled: false;
      maxFileSizeBytes: number;
    };

export type AvatarUploadStsResponse = {
  success: true;
  data: AvatarUploadStsPayload;
};

export const resolveAvatarUploadStsPayload = (
  response: AvatarUploadStsResponse,
): AvatarUploadStsPayload => {
  return response.data;
};
