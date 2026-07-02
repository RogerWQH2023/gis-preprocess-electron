import { spawn } from "node:child_process";
import process from "node:process";

import electronPath from "electron";

const args = process.argv.slice(2);
const env = { ...process.env };

// ELECTRON_RUN_AS_NODE 只要存在就会让 Electron 按 Node.js 模式运行，必须从子进程环境中删除。
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, args.length > 0 ? args : ["."], {
  env,
  stdio: "inherit",
  windowsHide: false,
});

child.on("error", (error) => {
  console.error("[electron] 启动失败：", error);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`[electron] 进程被信号终止：${signal}`);
    process.exit(1);
  }

  process.exit(code ?? 0);
});
