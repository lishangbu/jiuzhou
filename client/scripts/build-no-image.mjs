import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 作用：以 production 模式触发客户端“无图片构建”，并把禁用图片资产的开关集中写入环境变量。
 * 不做什么：不负责 TypeScript 编译，不改写除 no-image 以外的其它构建参数。
 * 输入/输出：输入为当前 Node 进程环境变量；输出为 Vite 子进程的退出码与终端日志。
 * 数据流/状态流：package.json -> 本脚本注入 `VITE_DISABLE_IMAGE_ASSETS=true` -> 调起 `vite build --mode production` -> vite.config.ts 读取统一开关。
 * 关键边界条件与坑点：
 * 1. 必须显式固定 `production` 模式，确保 `.env.production` 会按 Vite 默认规则被加载。
 * 2. 通过 Node 子进程注入环境变量，避免 `VAR=value command` 这种写法在不同 shell/平台下兼容性不一致。
 */
const currentDir = dirname(fileURLToPath(import.meta.url));
const clientRoot = resolve(currentDir, "..");
const viteCliPath = resolve(clientRoot, "node_modules", "vite", "bin", "vite.js");

const childProcess = spawn(
  process.execPath,
  [viteCliPath, "build", "--mode", "production"],
  {
    cwd: clientRoot,
    env: {
      ...process.env,
      VITE_DISABLE_IMAGE_ASSETS: "true",
    },
    stdio: "inherit",
  },
);

childProcess.on("error", (error) => {
  console.error("[build-no-image] 启动 Vite 构建失败：", error);
  process.exit(1);
});

childProcess.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
