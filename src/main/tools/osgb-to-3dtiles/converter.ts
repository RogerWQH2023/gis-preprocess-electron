import { app } from "electron";
import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { Dirent } from "node:fs";

type ConversionLogLevel = "info" | "success" | "warning" | "error";
type OsgbInputLayout = "data-directory" | "flat-blocks";

export type OsgbTo3dTilesConversionLog = {
  level: ConversionLogLevel;
  message: string;
  createdAt: string;
};

export type OsgbRootValidationResult = {
  ok: boolean;
  inputDir: string;
  layout: OsgbInputLayout | null;
  adapterRequired: boolean;
  metadataPath: string | null;
  dataDir: string | null;
  rootOsgbFiles: string[];
  dataOsgbFiles: string[];
  detectedOsgbFiles: string[];
  blockDirs: string[];
  warnings: string[];
  errors: string[];
};

export type OsgbTo3dTilesConversionRequest = {
  inputDir: string;
  outputParentDir: string;
};

export type OsgbTo3dTilesConversionResult = {
  inputDir: string;
  outputDir: string;
  tilesetPath: string;
  converterPath: string;
  converterInputDir: string;
  usedWorkspaceAdapter: boolean;
  validation: OsgbRootValidationResult;
};

type LogEmitter = (entry: OsgbTo3dTilesConversionLog) => void;
type PreparedConverterInput = {
  converterInputDir: string;
  workspaceDir: string | null;
  usedWorkspaceAdapter: boolean;
  cleanup: () => Promise<void>;
};

const CONVERTER_FILE_NAMES = ["3dtile.exe", "_3dtile.exe"] as const;

function emitLog(
  onLog: LogEmitter | undefined,
  level: ConversionLogLevel,
  message: string
): void {
  const normalizedMessage = message.trim();
  if (!normalizedMessage) {
    return;
  }

  onLog?.({
    level,
    message: normalizedMessage,
    createdAt: new Date().toISOString(),
  });
}

function getOsgbConverterBaseDir(): string {
  if (process.platform !== "win32" || process.arch !== "x64") {
    throw new Error(
      `当前暂只支持 Windows x64 平台：${process.platform}-${process.arch}`
    );
  }

  return app.isPackaged
    ? path.join(process.resourcesPath, "bin", "win32-x64")
    : path.join(process.cwd(), "native-bin", "win32-x64");
}

async function resolveOsgbConverterPath(): Promise<string> {
  const converterBaseDir = getOsgbConverterBaseDir();

  for (const fileName of CONVERTER_FILE_NAMES) {
    const candidatePath = path.join(converterBaseDir, fileName);
    const isReadable = await fs
      .access(candidatePath, fsConstants.R_OK)
      .then(() => true)
      .catch(() => false);

    if (isReadable) {
      return candidatePath;
    }
  }

  throw new Error(
    `转换程序不存在，请检查 ${CONVERTER_FILE_NAMES.join(" 或 ")} 是否位于：${converterBaseDir}`
  );
}

function sanitizeOutputBaseName(fileName: string): string {
  const safeName = fileName
    .replace(/[<>:"/\\|?*]/g, "_")
    .split("")
    .map((character) => (character.charCodeAt(0) < 32 ? "_" : character))
    .join("")
    .replace(/\s+/g, " ")
    .trim();

  return safeName.length > 0 ? safeName : "osgb-model";
}

function hasPathCompatibilityRisk(value: string): boolean {
  return /[^\x20-\x7e]/.test(value) || /\s/.test(value);
}

async function assertReadableDirectory(dirPath: string, label: string): Promise<void> {
  const stat = await fs.stat(dirPath).catch(() => null);
  if (!stat?.isDirectory()) {
    throw new Error(`${label}不存在或不是目录：${dirPath}`);
  }

  await fs.access(dirPath, fsConstants.R_OK);
}

async function ensureWritableOutputParent(outputParentDir: string): Promise<void> {
  await fs.mkdir(outputParentDir, { recursive: true });

  const stat = await fs.stat(outputParentDir);
  if (!stat.isDirectory()) {
    throw new Error(`输出位置不是目录：${outputParentDir}`);
  }

  await fs.access(outputParentDir, fsConstants.W_OK);
}

async function ensureEmptyOutputDir(outputDir: string): Promise<void> {
  await fs.mkdir(outputDir, { recursive: true });
  const entries = await fs.readdir(outputDir);

  if (entries.length > 0) {
    throw new Error(`输出目录已存在且不为空，请更换输出位置或清空目录：${outputDir}`);
  }
}

async function collectOsgbFiles(
  searchDir: string,
  maxDepth: number,
  maxFiles: number
): Promise<string[]> {
  const foundFiles: string[] = [];
  const pending: Array<{ dir: string; depth: number }> = [
    { dir: searchDir, depth: 0 },
  ];

  while (pending.length > 0 && foundFiles.length < maxFiles) {
    const current = pending.shift();
    if (!current) {
      break;
    }

    const entries = await fs
      .readdir(current.dir, { withFileTypes: true })
      .catch(() => []);

    for (const entry of entries) {
      const entryPath = path.join(current.dir, entry.name);

      if (entry.isFile() && entry.name.toLowerCase().endsWith(".osgb")) {
        foundFiles.push(entryPath);
        if (foundFiles.length >= maxFiles) {
          break;
        }
      }

      if (entry.isDirectory() && current.depth < maxDepth) {
        pending.push({ dir: entryPath, depth: current.depth + 1 });
      }
    }
  }

  return foundFiles;
}

async function findTilesetPath(outputDir: string): Promise<string | null> {
  const directCandidates = [
    path.join(outputDir, "tileset.json"),
    path.join(outputDir, "Data", "tileset.json"),
  ];

  for (const candidatePath of directCandidates) {
    const exists = await fs
      .access(candidatePath, fsConstants.R_OK)
      .then(() => true)
      .catch(() => false);

    if (exists) {
      return candidatePath;
    }
  }

  const pending: Array<{ dir: string; depth: number }> = [
    { dir: outputDir, depth: 0 },
  ];

  while (pending.length > 0) {
    const current = pending.shift();
    if (!current || current.depth > 3) {
      continue;
    }

    const entries = await fs
      .readdir(current.dir, { withFileTypes: true })
      .catch(() => []);

    for (const entry of entries) {
      const entryPath = path.join(current.dir, entry.name);

      if (entry.isFile() && entry.name.toLowerCase() === "tileset.json") {
        return entryPath;
      }

      if (entry.isDirectory()) {
        pending.push({ dir: entryPath, depth: current.depth + 1 });
      }
    }
  }

  return null;
}

function createConverterEnvironment(converterDir: string): NodeJS.ProcessEnv {
  const pathValue = process.env.Path ?? process.env.PATH ?? "";
  const nextPathValue = `${converterDir}${path.delimiter}${pathValue}`;

  return {
    ...process.env,
    Path: nextPathValue,
    PATH: nextPathValue,
    GDAL_DATA: path.join(converterDir, "gdal_data"),
    OSG_LIBRARY_PATH: path.join(converterDir, "osgPlugins-3.4.0"),
  };
}

function getWorkspaceTasksRoot(): string {
  return path.join(app.getPath("userData"), "tasks", "osgb-to-3dtiles");
}

async function removeWorkspace(workspaceDir: string): Promise<void> {
  const tasksRoot = path.resolve(getWorkspaceTasksRoot());
  const resolvedWorkspaceDir = path.resolve(workspaceDir);
  const relativePath = path.relative(tasksRoot, resolvedWorkspaceDir);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(`临时目录不在任务目录内，已拒绝清理：${workspaceDir}`);
  }

  await fs.rm(resolvedWorkspaceDir, { recursive: true, force: true });
}

async function createFlatLayoutWorkspace(
  validation: OsgbRootValidationResult,
  onLog: LogEmitter | undefined
): Promise<PreparedConverterInput> {
  if (!validation.metadataPath) {
    throw new Error("无法创建适配目录：缺少 metadata.xml。");
  }

  const workspaceDir = path.join(getWorkspaceTasksRoot(), randomUUID());
  const workspaceDataDir = path.join(workspaceDir, "Data");

  await fs.mkdir(workspaceDataDir, { recursive: true });
  await fs.copyFile(
    validation.metadataPath,
    path.join(workspaceDir, "metadata.xml")
  );

  for (const osgbFile of validation.rootOsgbFiles) {
    await fs.copyFile(osgbFile, path.join(workspaceDataDir, path.basename(osgbFile)));
  }

  for (const blockDir of validation.blockDirs) {
    const targetDir = path.join(workspaceDataDir, path.basename(blockDir));
    await fs.symlink(blockDir, targetDir, "junction");
  }

  emitLog(
    onLog,
    "info",
    `已创建临时 Data 适配目录：${workspaceDir}`
  );

  return {
    converterInputDir: workspaceDir,
    workspaceDir,
    usedWorkspaceAdapter: true,
    cleanup: () => removeWorkspace(workspaceDir),
  };
}

async function prepareConverterInput(
  inputDir: string,
  validation: OsgbRootValidationResult,
  onLog: LogEmitter | undefined
): Promise<PreparedConverterInput> {
  if (validation.layout === "flat-blocks") {
    return createFlatLayoutWorkspace(validation, onLog);
  }

  return {
    converterInputDir: inputDir,
    workspaceDir: null,
    usedWorkspaceAdapter: false,
    cleanup: async () => {},
  };
}

export function makeDefaultOsgbOutputDir(
  inputDir: string,
  outputParentDir: string
): string {
  const inputBaseName = sanitizeOutputBaseName(path.basename(inputDir));
  return path.join(outputParentDir, `${inputBaseName}-3dtiles`);
}

export async function validateOsgbRoot(
  inputDir: string
): Promise<OsgbRootValidationResult> {
  const resolvedInputDir = path.resolve(inputDir);
  const result: OsgbRootValidationResult = {
    ok: false,
    inputDir: resolvedInputDir,
    layout: null,
    adapterRequired: false,
    metadataPath: null,
    dataDir: null,
    rootOsgbFiles: [],
    dataOsgbFiles: [],
    detectedOsgbFiles: [],
    blockDirs: [],
    warnings: [],
    errors: [],
  };

  let entries: Dirent[];

  try {
    await assertReadableDirectory(resolvedInputDir, "输入目录");
    entries = await fs.readdir(resolvedInputDir, { withFileTypes: true });
  } catch {
    result.errors.push("输入目录不可读取。");
    return result;
  }

  if (entries.length === 0) {
    result.errors.push("输入目录为空。");
  }

  for (const entry of entries) {
    const entryPath = path.join(resolvedInputDir, entry.name);
    const lowerName = entry.name.toLowerCase();

    if (entry.isFile() && lowerName === "metadata.xml") {
      result.metadataPath = entryPath;
    }

    if (entry.isFile() && lowerName.endsWith(".osgb")) {
      result.rootOsgbFiles.push(entryPath);
    }

    if (entry.isDirectory() && /^block/i.test(entry.name)) {
      result.blockDirs.push(entryPath);
    }

    if (entry.isDirectory() && lowerName === "data") {
      result.dataDir = entryPath;
    }
  }

  if (result.dataDir) {
    result.dataOsgbFiles = await collectOsgbFiles(result.dataDir, 3, 20);
    const dataEntries = await fs
      .readdir(result.dataDir, { withFileTypes: true })
      .catch(() => []);

    result.blockDirs = dataEntries
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(result.dataDir as string, entry.name));

    if (result.dataOsgbFiles.length === 0) {
      result.errors.push("Data 目录下未发现 .osgb 文件。");
    }

    result.detectedOsgbFiles = result.dataOsgbFiles;
    result.layout = "data-directory";
  } else if (result.rootOsgbFiles.length > 0 || result.blockDirs.length > 0) {
    const nestedOsgbFiles = (
      await Promise.all(
        result.blockDirs.map((blockDir) => collectOsgbFiles(blockDir, 3, 20))
      )
    ).flat();

    result.detectedOsgbFiles = [...result.rootOsgbFiles, ...nestedOsgbFiles];
    result.layout = "flat-blocks";
    result.adapterRequired = true;

    if (result.detectedOsgbFiles.length === 0) {
      result.errors.push("平铺目录下未发现 .osgb 文件。");
    } else {
      result.warnings.push("检测到平铺 Block 结构，转换时会自动创建临时 Data 适配目录。");
    }
  } else {
    result.errors.push("未发现 Data 目录，也未发现可适配的 Block 平铺结构。");
  }

  if (!result.metadataPath) {
    result.errors.push(
      "未发现 metadata.xml。请选择 OSGB 根目录。"
    );
  }

  if (hasPathCompatibilityRisk(resolvedInputDir)) {
    result.warnings.push(
      "输入路径包含空格或非 ASCII 字符；如果转换器报错，可改用纯英文路径重试。"
    );
  }

  result.ok = result.errors.length === 0;
  return result;
}

function createLineHandler(
  onLine: (line: string) => void
): {
  handleChunk: (chunk: Buffer) => void;
  flush: () => void;
} {
  let buffer = "";

  return {
    handleChunk: (chunk) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        onLine(line);
      }
    },
    flush: () => {
      if (buffer.trim()) {
        onLine(buffer);
      }

      buffer = "";
    },
  };
}

export async function convertOsgbTo3dTiles(
  request: OsgbTo3dTilesConversionRequest,
  onLog?: LogEmitter
): Promise<OsgbTo3dTilesConversionResult> {
  const inputDir = path.resolve(request.inputDir);
  const outputParentDir = path.resolve(request.outputParentDir);
  const outputDir = makeDefaultOsgbOutputDir(inputDir, outputParentDir);
  const converterPath = await resolveOsgbConverterPath();
  const converterDir = path.dirname(converterPath);

  emitLog(onLog, "info", "校验输入目录。");
  const validation = await validateOsgbRoot(inputDir);
  if (!validation.ok) {
    throw new Error(validation.errors.join("；"));
  }

  for (const warning of validation.warnings) {
    emitLog(onLog, "warning", warning);
  }

  await assertReadableDirectory(inputDir, "输入目录");
  await ensureWritableOutputParent(outputParentDir);
  await ensureEmptyOutputDir(outputDir);

  const preparedInput = await prepareConverterInput(inputDir, validation, onLog);
  const args = [
    "-v",
    "-f",
    "osgb",
    "-i",
    preparedInput.converterInputDir,
    "-o",
    outputDir,
  ];

  emitLog(onLog, "info", `转换程序：${converterPath}`);
  emitLog(onLog, "info", `原始输入目录：${inputDir}`);
  emitLog(onLog, "info", `转换输入目录：${preparedInput.converterInputDir}`);
  emitLog(onLog, "info", `输出目录：${outputDir}`);

  try {
    await new Promise<void>((resolve, reject) => {
      const stdoutHandler = createLineHandler((line) =>
        emitLog(onLog, "info", line)
      );
      const stderrHandler = createLineHandler((line) =>
        emitLog(onLog, "warning", line)
      );
      const child = spawn(converterPath, args, {
        cwd: converterDir,
        env: createConverterEnvironment(converterDir),
        shell: false,
        windowsHide: true,
      });

      child.stdout.on("data", stdoutHandler.handleChunk);
      child.stderr.on("data", stderrHandler.handleChunk);

      child.on("error", (error) => {
        reject(new Error(`转换程序无法启动：${error.message}`));
      });

      child.on("close", (code) => {
        stdoutHandler.flush();
        stderrHandler.flush();

        if (code !== 0) {
          reject(new Error(`OSGB 转 3DTiles 失败，退出码：${code ?? "未知"}`));
          return;
        }

        resolve();
      });
    });
  } finally {
    if (preparedInput.workspaceDir) {
      try {
        await preparedInput.cleanup();
        emitLog(onLog, "info", "已清理临时 Data 适配目录。");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        emitLog(onLog, "warning", `临时 Data 适配目录清理失败：${message}`);
      }
    }
  }

  const tilesetPath = await findTilesetPath(outputDir);
  if (!tilesetPath) {
    throw new Error("转换结束，但未在输出目录中找到 tileset.json。");
  }

  emitLog(onLog, "success", "已生成 tileset.json。");

  return {
    inputDir,
    outputDir,
    tilesetPath,
    converterPath,
    converterInputDir: preparedInput.converterInputDir,
    usedWorkspaceAdapter: preparedInput.usedWorkspaceAdapter,
    validation,
  };
}
