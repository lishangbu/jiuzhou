import fs from 'fs';
import path from 'path';

type TechniqueNameSensitiveFile = {
  words?: string[];
};

const CANDIDATE_PATHS = [
  path.join(process.cwd(), 'server', 'src', 'data', 'seeds', 'technique_name_sensitive_words.json'),
  path.join(process.cwd(), 'src', 'data', 'seeds', 'technique_name_sensitive_words.json'),
  path.join(process.cwd(), 'dist', 'data', 'seeds', 'technique_name_sensitive_words.json'),
];

let cachedWords = new Set<string>();
let cachedMtimeMs = -1;
let cachedPath: string | null = null;

const resolveSensitiveWordFilePath = (): string | null => {
  if (cachedPath && fs.existsSync(cachedPath)) return cachedPath;
  const matched = CANDIDATE_PATHS.find((filePath) => fs.existsSync(filePath)) ?? null;
  cachedPath = matched;
  return matched;
};

const parseSensitiveWords = (raw: unknown): Set<string> => {
  if (!raw || typeof raw !== 'object') return new Set();
  const words = (raw as TechniqueNameSensitiveFile).words;
  if (!Array.isArray(words)) return new Set();
  const normalized = words
    .map((word) => (typeof word === 'string' ? word.trim().toLowerCase() : ''))
    .filter((word): word is string => word.length > 0);
  return new Set(normalized);
};

/**
 * 读取敏感词词库。
 *
 * 说明：
 * - 支持热更新（mtime 检测），文件变化后下次调用自动重载；
 * - 文件缺失时返回空词库，不抛错。
 */
export const getTechniqueNameSensitiveWords = (): Set<string> => {
  const filePath = resolveSensitiveWordFilePath();
  if (!filePath) {
    cachedWords = new Set();
    cachedMtimeMs = -1;
    return cachedWords;
  }

  try {
    const stat = fs.statSync(filePath);
    const mtimeMs = Number(stat.mtimeMs) || 0;
    if (mtimeMs === cachedMtimeMs) {
      return cachedWords;
    }

    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    cachedWords = parseSensitiveWords(parsed);
    cachedMtimeMs = mtimeMs;
    return cachedWords;
  } catch {
    cachedWords = new Set();
    cachedMtimeMs = -1;
    return cachedWords;
  }
};
