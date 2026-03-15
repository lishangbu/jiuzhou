/**
 * 静态图片资源路径常量
 *
 * 作用：
 * - 集中管理所有 UI / 地图等固定图片的路径
 * - 公共资源统一从这里导出，避免业务组件各自维护图片路径
 * - `public/assets` 下的静态资源通过 resolveAssetUrl 解析，自动适配 CDN（VITE_CDN_BASE）
 * - 应用品牌图标统一复用 `APP_FAVICON_URL`，避免页签 favicon 与页面内 logo 各自维护路径
 *
 * 数据流：
 *   资源路径常量 → 业务组件引用 → 浏览器请求静态资源
 *
 * 边界条件：
 * - `public/assets` 资源路径必须与此处声明一致
 * - 应用图标资源由 `client/public/assets/favicon.png` 提供，避免继续生成仅源站可见的构建产物路径
 *
 * 复用点：
 * - Auth/index.tsx, Game/index.tsx, MapModal, TaskModal, TechniqueModal,
 *   AchievementModal, RealmModal, RankModal, BattlePassModal, MonthCardModal,
 *   TeamModal, SectModal, SkillFloatButton 等
 */

import { APP_FAVICON_URL } from "../../../services/appFavicon";
import { resolveAssetUrl } from "../../../services/api";

/* ───────── 通用 UI ───────── */

export const IMG_LOGO = resolveAssetUrl("/assets/logo2.png");
export const IMG_GAME_HEADER_LOGO = APP_FAVICON_URL;
export const IMG_COIN = resolveAssetUrl("/assets/ui/sh_icon_0006_jinbi_02.png");
export const IMG_LINGSHI = resolveAssetUrl("/assets/ui/lingshi.png");
export const IMG_TONGQIAN = resolveAssetUrl("/assets/ui/tongqian.png");
export const IMG_EQUIP_MALE = resolveAssetUrl("/assets/ui/ep-n.png");
export const IMG_EQUIP_FEMALE = resolveAssetUrl("/assets/ui/ep.png");
export const IMG_EXP = resolveAssetUrl("/assets/ui/icon_exp.png");

/* ───────── 地图 ───────── */

export const IMG_MAP_01 = resolveAssetUrl("/assets/map/cp_icon_map01.png");
export const IMG_MAP_02 = resolveAssetUrl("/assets/map/cp_icon_map02.png");
export const IMG_MAP_03 = resolveAssetUrl("/assets/map/cp_icon_map03.png");
export const IMG_MAP_04 = resolveAssetUrl("/assets/map/cp_icon_map04.png");
export const IMG_MAP_05 = resolveAssetUrl("/assets/map/cp_icon_map05.png");
export const IMG_MAP_06 = resolveAssetUrl("/assets/map/cp_icon_map06.png");
