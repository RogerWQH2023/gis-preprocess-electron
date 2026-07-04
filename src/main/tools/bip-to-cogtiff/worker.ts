import { stdin, stdout } from "node:process";

import {
  convertBipToCogTiffDirect,
  type BipToCogTiffConversionLog,
  type BipToCogTiffConversionRequest,
  type BipToCogTiffConversionResult,
} from "./converter.js";

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
      error: {
        message: string;
        stack?: string;
      };
    };

function sendMessage(message: WorkerMessage): void {
  stdout.write(`${JSON.stringify(message)}\n`);
}

function readRequestFromStdin(): Promise<BipToCogTiffConversionRequest> {
  return new Promise((resolve, reject) => {
    let rawInput = "";

    stdin.setEncoding("utf8");
    stdin.on("data", (chunk: string) => {
      rawInput += chunk;
    });
    stdin.on("error", reject);
    stdin.on("end", () => {
      try {
        resolve(JSON.parse(rawInput) as BipToCogTiffConversionRequest);
      } catch (error) {
        reject(error);
      }
    });
  });
}

function assertNodeAbi(): void {
  const requiredAbi = process.env.BIP_TO_COGTIFF_REQUIRED_NODE_ABI ?? "127";
  if (process.versions.modules === requiredAbi) {
    return;
  }

  throw new Error(
    `GDAL worker 需要 Node ABI ${requiredAbi}，当前为 ${process.version} / ABI ${process.versions.modules}。请执行 pnpm install，让 pnpm 根据 .npmrc 下载 Node 22.16.0。`
  );
}

async function main(): Promise<void> {
  assertNodeAbi();

  const request = await readRequestFromStdin();
  const result = await convertBipToCogTiffDirect(request, (log) => {
    sendMessage({
      type: "log",
      log,
    });
  });

  sendMessage({
    type: "result",
    result,
  });
}

main().catch((error: unknown) => {
  const normalizedError = error instanceof Error ? error : new Error(String(error));
  sendMessage({
    type: "error",
    error: {
      message: normalizedError.message,
      stack: normalizedError.stack,
    },
  });
  process.exitCode = 1;
});
