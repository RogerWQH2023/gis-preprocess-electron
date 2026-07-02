import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

type ThreeDgsInputConvention = "graphdeco" | "khr_native";
type ThreeDgsColorSpace = "lin_rec709_display" | "srgb_rec709_display";
type ConversionLogLevel = "info" | "success" | "warning" | "error";

type ConverterLogger = {
  silent?: boolean;
  line: (message?: unknown) => void;
  info: (message: unknown) => void;
  ok: (message: unknown) => void;
  warn: (message: unknown) => void;
  error: (message: unknown) => void;
};

type ConverterOptions = {
  inputConvention: ThreeDgsInputConvention;
  colorSpace: ThreeDgsColorSpace;
  memoryBudget: number;
  openInspector: false;
  clean: true;
  silent?: true;
  logger?: ConverterLogger;
};

type ConverterRawResult = {
  inputPath: string;
  outputDir: string;
  splatCount: number;
  shDegree: number;
};

type ConverterModule = {
  convert: (
    inputPath: string,
    outputDir: string,
    options: ConverterOptions
  ) => Promise<ConverterRawResult>;
};

const { convert } = require(
  "3dgs-ply-3dtiles-converter"
) as ConverterModule;

export type ThreeDgsTilesConversionLog = {
  level: ConversionLogLevel;
  message: string;
  createdAt: string;
};

export type ThreeDgsTilesConversionRequest = {
  inputPath: string;
  outputParentDir: string;
  inputConvention?: ThreeDgsInputConvention;
  memoryBudgetGb?: number;
};

export type ThreeDgsTilesConversionResult = {
  inputPath: string;
  outputDir: string;
  tilesetPath: string;
  summaryPath: string;
  splatCount: number;
  shDegree: number;
};

function normalizeLogMessage(message: unknown): string {
  return String(message ?? "").trim();
}

function emitLog(
  onLog: ((entry: ThreeDgsTilesConversionLog) => void) | undefined,
  level: ConversionLogLevel,
  message: unknown
): void {
  const normalizedMessage = normalizeLogMessage(message);
  if (!normalizedMessage) {
    return;
  }

  onLog?.({
    level,
    message: normalizedMessage,
    createdAt: new Date().toISOString(),
  });
}

function createRendererLogger(
  onLog: (entry: ThreeDgsTilesConversionLog) => void
): ConverterLogger {
  return {
    line: (message) => emitLog(onLog, "info", message),
    info: (message) => emitLog(onLog, "info", message),
    ok: (message) => emitLog(onLog, "success", message),
    warn: (message) => emitLog(onLog, "warning", message),
    error: (message) => emitLog(onLog, "error", message),
  };
}

function sanitizeOutputBaseName(fileName: string): string {
  const safeName = fileName
    .replace(/[<>:"/\\|?*]/g, "_")
    .split("")
    .map((character) => (character.charCodeAt(0) < 32 ? "_" : character))
    .join("")
    .replace(/\s+/g, " ")
    .trim();

  return safeName.length > 0 ? safeName : "tileset";
}

async function assertReadablePly(inputPath: string): Promise<void> {
  const inputStat = await fs.stat(inputPath).catch(() => null);

  if (!inputStat?.isFile()) {
    throw new Error(`输入文件不存在或不是普通文件：${inputPath}`);
  }

  if (path.extname(inputPath).toLowerCase() !== ".ply") {
    throw new Error("当前工具只支持选择 .ply 文件。");
  }
}

async function ensureOutputParentDirectory(outputParentDir: string): Promise<void> {
  // Electron 对话框会返回已存在目录；这里仍保留 mkdir，便于后续自动化测试直接传入路径。
  await fs.mkdir(outputParentDir, { recursive: true });

  const outputParentStat = await fs.stat(outputParentDir);
  if (!outputParentStat.isDirectory()) {
    throw new Error(`输出位置不是目录：${outputParentDir}`);
  }
}

export function makeDefaultOutputDir(
  inputPath: string,
  outputParentDir: string
): string {
  const inputBaseName = path.basename(inputPath, path.extname(inputPath));
  return path.join(
    outputParentDir,
    `${sanitizeOutputBaseName(inputBaseName)}-3dtiles`
  );
}

export async function convertThreeDgsPlyToTiles(
  request: ThreeDgsTilesConversionRequest,
  onLog?: (entry: ThreeDgsTilesConversionLog) => void
): Promise<ThreeDgsTilesConversionResult> {
  const inputPath = path.resolve(request.inputPath);
  const outputParentDir = path.resolve(request.outputParentDir);
  const outputDir = makeDefaultOutputDir(inputPath, outputParentDir);
  const memoryBudgetGb = request.memoryBudgetGb ?? 3;

  await assertReadablePly(inputPath);
  await ensureOutputParentDirectory(outputParentDir);

  if (!Number.isFinite(memoryBudgetGb) || memoryBudgetGb <= 0) {
    throw new Error("内存预算必须是大于 0 的数字。");
  }

  emitLog(onLog, "info", `输入文件：${inputPath}`);
  emitLog(onLog, "info", `输出目录：${outputDir}`);

  const logger = onLog ? createRendererLogger(onLog) : undefined;
  const rawResult = await convert(inputPath, outputDir, {
    inputConvention: request.inputConvention ?? "graphdeco",
    colorSpace: "srgb_rec709_display",
    memoryBudget: memoryBudgetGb,
    openInspector: false,
    clean: true,
    ...(logger ? { logger } : { silent: true }),
  });

  return {
    inputPath: rawResult.inputPath,
    outputDir: rawResult.outputDir,
    tilesetPath: path.join(rawResult.outputDir, "tileset.json"),
    summaryPath: path.join(rawResult.outputDir, "build_summary.json"),
    splatCount: rawResult.splatCount,
    shDegree: rawResult.shDegree,
  };
}
