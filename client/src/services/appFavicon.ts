import { resolveAssetUrl } from './runtimeUrls';

/**
 * 作用：
 * 1. 集中管理应用品牌 favicon 的资源路径与浏览器注入逻辑，避免 `index.html` 和页面组件各自维护一份图标地址。
 * 2. 让 favicon 复用现有 CDN 资源解析链，和其它 `public/assets` 静态资源保持同一个数据源。
 * 不做什么：
 * 1. 不管理 `apple-touch-icon`、`manifest` 等其它头部资源。
 * 2. 不处理主题切换、多尺寸图标或业务页面内的图片占位。
 *
 * 输入/输出：
 * - 输入：浏览器 `Document`。
 * - 输出：无返回值；副作用是把文档头部 favicon 更新为统一 CDN URL。
 *
 * 数据流/状态流：
 * - 固定资源路径 `/assets/favicon.png` -> `resolveAssetUrl`
 * - 解析后的 URL -> `applyDocumentFavicon` -> `document.head`
 *
 * 关键边界条件与坑点：
 * 1. favicon 文件必须位于 `public/assets/favicon.png`，这样构建后不会再被 Vite 产生成源站绝对路径的 hash 资源。
 * 2. 仅维护一个 `rel="icon"` 节点，避免重复插入多个 favicon 链接导致浏览器缓存行为不一致。
 */

export const APP_FAVICON_ASSET_PATH = '/assets/favicon.png';
export const APP_FAVICON_URL = resolveAssetUrl(APP_FAVICON_ASSET_PATH);

export const applyDocumentFavicon = (documentNode: Document): void => {
  const currentLink = documentNode.head.querySelector<HTMLLinkElement>('link[rel="icon"]');
  const faviconLink = currentLink ?? documentNode.createElement('link');
  faviconLink.rel = 'icon';
  faviconLink.type = 'image/png';
  faviconLink.href = APP_FAVICON_URL;

  if (!currentLink) {
    documentNode.head.appendChild(faviconLink);
  }
};
