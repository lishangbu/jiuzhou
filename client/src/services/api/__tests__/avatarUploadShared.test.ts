import { describe, expect, it } from 'vitest';
import {
  resolveAvatarUploadStsPayload,
  type AvatarUploadStsResponse,
} from '../avatarUploadShared';

/**
 * 头像上传 STS 响应解析测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁住后端 `sendSuccess` 返回 `{ success, data }` 包装时，前端必须从 `data` 里取出头像上传配置。
 * 2. 做什么：覆盖 COS 直传与本地回退两种分支，避免以后再次把 `cosEnabled` 误读成顶层字段。
 * 3. 不做什么：不发真实请求，不依赖浏览器上传组件，也不触发 COS PUT。
 *
 * 输入/输出：
 * - 输入：人工构造的 STS 成功响应。
 * - 输出：解包后的 `AvatarUploadStsPayload`。
 *
 * 数据流/状态流：
 * - 测试构造服务端标准响应
 * - 调用 `resolveAvatarUploadStsPayload`
 * - 断言上传入口真正消费到的 payload 与后端数据一致
 *
 * 关键边界条件与坑点：
 * 1. 这里专门验证 `data` 包装层，防止“接口成功但字段读取层级错误”导致误走本地上传。
 * 2. `cosEnabled=false` 时不应假定存在 COS 直传字段，否则会在回退路径产生伪直传状态。
 */

describe('avatarUploadShared', () => {
  it('resolveAvatarUploadStsPayload: COS 启用时应从 data 中读取 STS 上传信息', () => {
    const response: AvatarUploadStsResponse = {
      success: true,
      data: {
        cosEnabled: true,
        maxFileSizeBytes: 2 * 1024 * 1024,
        bucket: 'idle-1254084933',
        region: 'ap-guangzhou',
        key: 'jiuzhou/avatars/avatar.png',
        avatarUrl: 'https://cdn.example.com/avatar.png',
        startTime: 1_773_234_866,
        expiredTime: 1_773_235_466,
        credentials: {
          tmpSecretId: 'tmp-id',
          tmpSecretKey: 'tmp-key',
          sessionToken: 'tmp-token',
        },
      },
    };

    expect(resolveAvatarUploadStsPayload(response)).toEqual({
      cosEnabled: true,
      maxFileSizeBytes: 2 * 1024 * 1024,
      bucket: 'idle-1254084933',
      region: 'ap-guangzhou',
      key: 'jiuzhou/avatars/avatar.png',
      avatarUrl: 'https://cdn.example.com/avatar.png',
      startTime: 1_773_234_866,
      expiredTime: 1_773_235_466,
      credentials: {
        tmpSecretId: 'tmp-id',
        tmpSecretKey: 'tmp-key',
        sessionToken: 'tmp-token',
      },
    });
  });

  it('resolveAvatarUploadStsPayload: COS 未启用时应返回本地回退标记与大小上限', () => {
    const response: AvatarUploadStsResponse = {
      success: true,
      data: {
        cosEnabled: false,
        maxFileSizeBytes: 2 * 1024 * 1024,
      },
    };

    expect(resolveAvatarUploadStsPayload(response)).toEqual({
      cosEnabled: false,
      maxFileSizeBytes: 2 * 1024 * 1024,
    });
  });
});
