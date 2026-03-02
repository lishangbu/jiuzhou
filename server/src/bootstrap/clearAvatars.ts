/**
 * 一次性启动脚本：清理所有玩家已上传的头像
 *
 * 作用：
 * - 将 characters 表中所有 avatar 字段置为 NULL
 * - 删除本地 uploads/avatars/ 目录下的所有文件
 * - COS 上的旧头像不在此处清理（数量少可手动在控制台删除，或后续按需扩展）
 *
 * 使用方式：
 * - 在 startupPipeline.ts 中 initTables() 之后调用 clearAllAvatarsOnce()
 * - 通过环境变量 CLEAR_AVATARS=1 触发，仅执行一次后移除该变量即可
 *
 * 输入/输出：
 * - 无参数，返回 void
 *
 * 关键边界条件：
 * 1) 仅在 CLEAR_AVATARS=1 时执行，防止每次重启都清理
 * 2) 本地目录不存在时静默跳过，不报错
 */
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { query } from "../config/database.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOAD_DIR = path.join(__dirname, "../../uploads/avatars");

/**
 * 清理所有玩家头像（一次性操作）。
 * 仅在环境变量 CLEAR_AVATARS=1 时执行。
 */
export const clearAllAvatarsOnce = async (): Promise<void> => {
  if (process.env.CLEAR_AVATARS !== "1") return;

  console.log("🧹 正在清理所有玩家头像...");

  // 1. 数据库：avatar 全部置 NULL
  const result = await query(
    "UPDATE characters SET avatar = NULL, updated_at = CURRENT_TIMESTAMP WHERE avatar IS NOT NULL",
    [],
  );
  console.log(`  ✓ 已清除 ${result.rowCount ?? 0} 条头像记录`);

  // 2. 本地文件：删除 uploads/avatars/ 下所有文件
  if (fs.existsSync(UPLOAD_DIR)) {
    const files = fs.readdirSync(UPLOAD_DIR);
    let count = 0;
    for (const file of files) {
      const filePath = path.join(UPLOAD_DIR, file);
      if (fs.statSync(filePath).isFile()) {
        fs.unlinkSync(filePath);
        count++;
      }
    }
    console.log(`  ✓ 已删除 ${count} 个本地头像文件`);
  }

  console.log("✓ 头像清理完成（请移除 CLEAR_AVATARS 环境变量以防重复执行）\n");
};
