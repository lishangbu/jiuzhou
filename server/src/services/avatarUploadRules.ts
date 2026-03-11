/**
 * 头像上传规则
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中维护头像上传允许的 MIME、文件大小上限、对象键生成规则，避免本地回退、STS 颁发、路由校验各写一套。
 * 2. 做什么：提供纯函数给路由和服务复用，让“头像上传规则”只有单一数据源。
 * 3. 不做什么：不负责数据库写入，不负责向 COS 发请求，也不负责前端 UI 刷新。
 *
 * 输入/输出：
 * - 输入：文件 MIME、文件大小、COS 前缀。
 * - 输出：校验结果、扩展名、对象键。
 *
 * 数据流/状态流：
 * - 路由读取客户端上传元信息 -> 本模块完成规则校验
 * - STS 服务与本地上传服务复用同一份限制
 * - 客户端通过 STS 响应拿到同一份最大大小配置，避免前后端规则漂移
 *
 * 关键边界条件与坑点：
 * 1. 文件大小限制必须只维护一处，否则本地回退、STS 与前端提示容易不一致。
 * 2. 对象键必须由服务端生成并固定到头像前缀下，不能相信客户端传入文件名或路径。
 */

export const AVATAR_UPLOAD_MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;

export const ALLOWED_AVATAR_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

export type AvatarMimeType = (typeof ALLOWED_AVATAR_MIME_TYPES)[number];

const AVATAR_MIME_TO_EXT: Record<AvatarMimeType, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

export const isAllowedAvatarMimeType = (
  contentType: string,
): contentType is AvatarMimeType => {
  return ALLOWED_AVATAR_MIME_TYPES.includes(contentType as AvatarMimeType);
};

export const getAvatarFileExtension = (
  contentType: AvatarMimeType,
): string => {
  return AVATAR_MIME_TO_EXT[contentType];
};

export const generateAvatarFilename = (ext: string): string => {
  const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  return `avatar-${uniqueSuffix}${ext}`;
};

export const buildAvatarCosKey = (
  avatarPrefix: string,
  contentType: AvatarMimeType,
): string => {
  return `${avatarPrefix}${generateAvatarFilename(
    getAvatarFileExtension(contentType),
  )}`;
};

export const isAvatarFileSizeAllowed = (fileSize: number): boolean => {
  return (
    Number.isFinite(fileSize) &&
    fileSize > 0 &&
    fileSize <= AVATAR_UPLOAD_MAX_FILE_SIZE_BYTES
  );
};
