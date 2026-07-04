import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type {
  BipToCogTiffConversionLog,
  BipToCogTiffConversionRequest,
  BipToCogTiffConversionResult,
} from "./converter.js";

const REQUIRED_NODE_VERSION = "22.16.0";
const REQUIRED_NODE_ABI = "127";

type NodeExecutableResolution = {
  command: string;
  warning?: string;
};

type WorkerErrorPayload = {
  message?: string;
  stack?: string;
};

type WorkerMessage =
  | {
      type: "log";
      log: BipToCogTiffConversionLog;
    }
  | {
      type: "result";
      result: BipToCogTiffConversionResult;
    }
  | {
      type: "error";
      error: WorkerErrorPayload;
    };

async function pathExists(filePath: string): Promise<boolean> {
  return fs
    .access(filePath)
    .then(() => true)
    .catch(() => false);
}

async function resolveNodeExecutable(): Promise<NodeExecutableResolution> {
  const configuredNode = process.env.BIP_TO_COGTIFF_NODE?.trim();
  if (configuredNode && (await pathExists(configuredNode))) {
    return { command: configuredNode };
  }

  const candidates: string[] = [];
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    candidates.push(
      path.join(
        process.env.LOCALAPPDATA,
        "pnpm",
        "nodejs",
        REQUIRED_NODE_VERSION,
        "node.exe"
      )
    );
  }

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return { command: candidate };
    }
  }

  return {
    command: "node",
    warning:
      "未找到 pnpm 管理的 Node 22.16.0，将尝试使用 PATH 中的 node；如果当前 node 不是 ABI 127，GDAL worker 会拒绝执行。",
  };
}

function getWorkerScriptPath(): string {
  return fileURLToPath(new URL("./worker.js", import.meta.url));
}

function toError(error: WorkerErrorPayload): Error {
  const message = error.message?.trim() || "GDAL worker 执行失败。";
  const normalizedError = new Error(message);
  if (error.stack) {
    normalizedError.stack = error.stack;
  }

  return normalizedError;
}

function tailText(text: string, maxLength = 4000): string {
  return text.length > maxLength ? text.slice(text.length - maxLength) : text;
}

function parseWorkerMessage(line: string): WorkerMessage | null {
  const trimmedLine = line.trim();
  if (!trimmedLine) {
    return null;
  }

  return JSON.parse(trimmedLine) as WorkerMessage;
}

export async function runBipToCogTiffWorker(
  request: BipToCogTiffConversionRequest,
  onLog?: (entry: BipToCogTiffConversionLog) => void
): Promise<BipToCogTiffConversionResult> {
  const nodeExecutable = await resolveNodeExecutable();
  const workerScriptPath = getWorkerScriptPath();
  await fs.access(workerScriptPath);

  if (nodeExecutable.warning) {
    onLog?.({
      level: "warning",
      message: nodeExecutable.warning,
      createdAt: new Date().toISOString(),
    });
  }

  return new Promise((resolve, reject) => {
    const child = spawn(nodeExecutable.command, [workerScriptPath], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        BIP_TO_COGTIFF_REQUIRED_NODE_ABI: REQUIRED_NODE_ABI,
      },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdoutBuffer = "";
    let stderrBuffer = "";
    let result: BipToCogTiffConversionResult | null = null;
    let settled = false;

    const fail = (error: Error): void => {
      if (settled) {
        return;
      }

      settled = true;
      reject(error);
    };

    const handleLine = (line: string): void => {
      let message: WorkerMessage | null = null;
      try {
        message = parseWorkerMessage(line);
      } catch {
        onLog?.({
          level: "warning",
          message: `GDAL worker 输出了非 JSON 内容：${line.trim()}`,
          createdAt: new Date().toISOString(),
        });
        return;
      }

      if (!message) {
        return;
      }

      if (message.type === "log") {
        onLog?.(message.log);
        return;
      }

      if (message.type === "result") {
        result = message.result;
        return;
      }

      fail(toError(message.error));
    };

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdoutBuffer += chunk;
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) {
        handleLine(line);
      }
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderrBuffer += chunk;
    });

    child.on("error", (error) => {
      fail(new Error(`无法启动 GDAL Node worker：${error.message}`));
    });

    child.on("close", (code) => {
      if (stdoutBuffer.trim()) {
        handleLine(stdoutBuffer);
      }

      if (settled) {
        return;
      }

      if (code === 0 && result) {
        settled = true;
        resolve(result);
        return;
      }

      const stderrTail = tailText(stderrBuffer.trim());
      const detail = stderrTail ? `\n${stderrTail}` : "";
      fail(new Error(`GDAL Node worker 异常退出，退出码：${code ?? "unknown"}。${detail}`));
    });

    child.stdin.end(JSON.stringify(request), "utf8");
  });
}
