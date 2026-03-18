/**
 * 伙伴招募基础类型共享模块
 *
 * 作用（做什么 / 不做什么）：
 * 1) 做什么：集中读取 `partner_base_models.txt`，并基于固定 seed 解析本次伙伴招募应使用的基础类型。
 * 2) 做什么：让伙伴文本生成入口复用同一份基础类型来源，避免以后不同调用方各自读文件、各自随机一遍。
 * 3) 不做什么：不调用 AI、不拼接业务 prompt，也不把基础类型写入数据库。
 *
 * 输入/输出：
 * - 输入：数值 seed。
 * - 输出：`partner_base_models.txt` 中按 seed 映射出的单个基础类型文本。
 *
 * 数据流/状态流：
 * partner_base_models.txt -> loadPartnerRecruitBaseModels -> resolvePartnerRecruitBaseModelBySeed -> 伙伴招募 prompt 构造。
 *
 * 关键边界条件与坑点：
 * 1) 种子文件允许重复项；这里按原始行保留重复，避免意外改变已有权重分布。
 * 2) 缺文件或空文件必须直接抛错，不能偷偷兜底成人类或其他默认类型，否则会把配置问题伪装成正常生成。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PARTNER_BASE_MODEL_FILENAME = 'partner_base_models.txt';
const PARTNER_BASE_MODEL_SEED_DIR = [
  path.join(process.cwd(), 'server', 'src', 'data', 'seeds'),
  path.join(process.cwd(), 'src', 'data', 'seeds'),
  path.join(process.cwd(), 'dist', 'data', 'seeds'),
  path.join(__dirname, '../../data/seeds'),
].find((candidatePath) => fs.existsSync(candidatePath));

let cachedPartnerRecruitBaseModels: string[] | null = null;

const resolvePartnerRecruitBaseModelPath = (): string => {
  if (!PARTNER_BASE_MODEL_SEED_DIR) {
    throw new Error(`${PARTNER_BASE_MODEL_FILENAME} 目录不存在`);
  }
  return path.join(PARTNER_BASE_MODEL_SEED_DIR, PARTNER_BASE_MODEL_FILENAME);
};

export const loadPartnerRecruitBaseModels = (): string[] => {
  if (cachedPartnerRecruitBaseModels) {
    return cachedPartnerRecruitBaseModels;
  }

  const filePath = resolvePartnerRecruitBaseModelPath();
  if (!fs.existsSync(filePath)) {
    throw new Error(`${PARTNER_BASE_MODEL_FILENAME} 不存在`);
  }

  const baseModels = fs.readFileSync(filePath, 'utf-8')
    .split(/\r?\n/u)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (baseModels.length <= 0) {
    throw new Error(`${PARTNER_BASE_MODEL_FILENAME} 不能为空`);
  }

  cachedPartnerRecruitBaseModels = baseModels;
  return cachedPartnerRecruitBaseModels;
};

export const resolvePartnerRecruitBaseModelBySeed = (seed: number): string => {
  if (!Number.isFinite(seed)) {
    throw new Error('伙伴招募基础类型 seed 非法');
  }

  const baseModels = loadPartnerRecruitBaseModels();
  const normalizedSeed = Math.trunc(seed);
  const index = ((normalizedSeed % baseModels.length) + baseModels.length) % baseModels.length;
  const baseModel = baseModels[index];
  if (!baseModel) {
    throw new Error('伙伴招募基础类型索引越界');
  }
  return baseModel;
};
