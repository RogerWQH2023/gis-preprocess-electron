import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const electronBuilderCli = path.join(
  projectRoot,
  "node_modules",
  "electron-builder",
  "cli.js"
);

const env = { ...process.env };

// 国内网络访问 GitHub release 容易超时，打包阶段默认改用可访问的二进制镜像。
env.ELECTRON_MIRROR ??= "https://npmmirror.com/mirrors/electron/";
env.ELECTRON_BUILDER_BINARIES_MIRROR ??=
  "https://npmmirror.com/mirrors/electron-builder-binaries/";

// 避免继承开发终端中可能残留的 Electron Node 模式。
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(process.execPath, [electronBuilderCli, ...process.argv.slice(2)], {
  cwd: projectRoot,
  env,
  stdio: "inherit",
  windowsHide: false,
});

child.on("error", (error) => {
  console.error("[electron-builder] 启动失败：", error);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`[electron-builder] 进程被信号终止：${signal}`);
    process.exit(1);
  }

  process.exit(code ?? 0);
});
