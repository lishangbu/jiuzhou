/**
 * AI 生成图片持久化共享模块
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中维护 AI 图片压缩后的最终落点，在 COS/CDN 启用时上传到 COS，未启用时写入本地 `uploads/`。
 * 2. 做什么：统一返回“可直接入库的最终资源地址”，让伙伴头像与生成功法技能图标共享同一套存储规则，避免两边各写一遍 `if (COS_ENABLED)`。
 * 3. 不做什么：不负责图片压缩、不负责图片生成提示词，也不负责业务层失败补偿。
 *
 * 输入/输出：
 * - 输入：图片二进制、资源分组、文件名种子、内容类型。
 * - 输出：最终可访问地址；本地模式返回 `/uploads/...`，COS 模式返回完整 CDN/COS URL。
 *
 * 数据流/状态流：
 * 调用方压缩图片 -> 本模块判断是否启用 COS -> 上传 COS 或写本地 -> 返回最终地址 -> 调用方写库。
 *
 * 关键边界条件与坑点：
 * 1. 资源分组必须只在这里映射到本地目录与 COS 前缀，避免伙伴头像和技能图标将来再次出现“本地/远端路径各写一份”的漂移。
 * 2. COS 模式下返回值必须是最终公网地址而不是对象键，否则前端与数据库会继续混用两种地址口径。
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  buildCosPublicUrl,
  COS_BUCKET,
  COS_ENABLED,
  COS_GENERATED_IMAGE_PREFIX,
  COS_REGION,
  cosClient,
} from '../../config/cos.js';

export type GeneratedImageGroup = 'partners' | 'techniques';

export type PersistGeneratedImageParams = {
  buffer: Buffer;
  group: GeneratedImageGroup;
  fileStem: string;
  contentType: string;
  extension: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOCAL_UPLOAD_ROOT = path.join(__dirname, '../../../uploads');

const sanitizeFileStem = (value: string): string => {
  return String(value || '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64) || 'asset';
};

const normalizePathSegment = (value: string): string => {
  return String(value || '')
    .trim()
    .replace(/^\/+|\/+$/g, '');
};

const buildGeneratedImageFileName = (fileStem: string, extension: string): string => {
  const normalizedExtension = normalizePathSegment(extension).replace(/\./g, '') || 'bin';
  return `${sanitizeFileStem(fileStem)}-${Date.now().toString(36)}.${normalizedExtension}`;
};

const buildLocalImageRelativePath = (group: GeneratedImageGroup, fileName: string): string => {
  return `/uploads/${group}/${fileName}`;
};

const writeGeneratedImageToLocal = async (
  group: GeneratedImageGroup,
  fileName: string,
  buffer: Buffer,
): Promise<string> => {
  const dir = path.join(LOCAL_UPLOAD_ROOT, group);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, fileName), buffer);
  return buildLocalImageRelativePath(group, fileName);
};

const uploadGeneratedImageToCos = async (
  group: GeneratedImageGroup,
  fileName: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> => {
  const key = `${COS_GENERATED_IMAGE_PREFIX}${group}/${fileName}`;
  await new Promise<void>((resolve, reject) => {
    cosClient.putObject(
      {
        Bucket: COS_BUCKET,
        Region: COS_REGION,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      },
      (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      },
    );
  });
  return buildCosPublicUrl(key);
};

export const persistGeneratedImage = async (
  params: PersistGeneratedImageParams,
): Promise<string> => {
  const { buffer, group, fileStem, contentType, extension } = params;
  if (buffer.length <= 0) {
    throw new Error('生成图片持久化失败：图片内容为空');
  }

  const fileName = buildGeneratedImageFileName(fileStem, extension);
  if (COS_ENABLED) {
    return uploadGeneratedImageToCos(group, fileName, buffer, contentType);
  }

  return writeGeneratedImageToLocal(group, fileName, buffer);
};
