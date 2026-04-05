/**
 * 运行时资源 URL 解析回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定静态资源与上传资源的单一拼接规则，确保 favicon 与游戏内图片共用同一条 CDN 解析链。
 * 2. 做什么：覆盖 `/assets/*` 走 CDN、`/uploads/*` 与 `version.json` 走源站三类核心分支，避免以后再把入口资源写回错误域名。
 * 3. 不做什么：不依赖真实浏览器 location，不验证 axios，也不跑页面渲染。
 *
 * 输入/输出：
 * - 输入：资源路径字符串与人工构造的 `{ serverBase, cdnBase }`。
 * - 输出：`buildAssetUrl` / `buildServerUrl` 产出的最终访问 URL。
 *
 * 数据流/状态流：
 * - 业务或入口层提供资源相对路径
 * - `buildAssetUrl` / `buildServerUrl` 依据统一 host 配置拼接
 * - 返回值被 favicon、头像与版本清单逻辑共同消费
 *
 * 关键边界条件与坑点：
 * 1. `/assets/favicon.png` 必须命中 `cdnBase`，这是这次线上 favicon 走错域名的根因位置。
 * 2. `/uploads/*` 与 `/version.json` 不能走 CDN，否则头像展示和版本检测都会直接失效，所以这里单独锁住源站分支。
 */

import { describe, expect, it } from 'vitest';
import { buildAssetUrl, buildServerUrl } from '../runtimeUrls';

describe('runtimeUrls', () => {
  const hostConfig = {
    serverBase: 'https://jz.faith.wang',
    cdnBase: 'https://cdn.faith.wang/jiuzhou',
  };

  it('应将 favicon 这类静态资源拼到 CDN 基址', () => {
    expect(buildAssetUrl('/assets/favicon.png', hostConfig)).toBe(
      'https://cdn.faith.wang/jiuzhou/assets/favicon.png',
    );
  });

  it('应将上传资源保留在源站基址', () => {
    expect(buildAssetUrl('/uploads/avatar.png', hostConfig)).toBe(
      'https://jz.faith.wang/uploads/avatar.png',
    );
  });

  it('应将版本清单保留在源站基址', () => {
    expect(buildServerUrl('/version.json', hostConfig.serverBase)).toBe(
      'https://jz.faith.wang/version.json',
    );
  });
});
