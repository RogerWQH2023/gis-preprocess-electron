import { BrowserWindow, dialog, ipcMain, shell } from "electron";
import { randomUUID } from "node:crypto";
import path from "node:path";

import {
  convertBipToCogTiff,
  findEnviHeader,
  makeDefaultCogTiffFileName,
  type BipToCogTiffBigTiff,
  type BipToCogTiffBounds,
  type BipToCogTiffCompression,
  type BipToCogTiffConversionLog,
  type BipToCogTiffInterleave,
  type BipToCogTiffPredictor,
} from "../tools/bip-to-cogtiff/converter.js";

import type {
  IpcMainInvokeEvent,
  OpenDialogOptions,
  OpenDialogReturnValue,
} from "electron";

const CHANNELS = {
  selectBipFile: "bip-to-cogtiff:select-bip-file",
  selectOutputDirectory: "bip-to-cogtiff:select-output-directory",
  selectTempDirectory: "bip-to-cogtiff:select-temp-directory",
  convert: "bip-to-cogtiff:convert",
  conversionLog: "bip-to-cogtiff:conversion-log",
  revealOutputDirectory: "bip-to-cogtiff:reveal-output-directory",
} as const;

type MainWindowGetter = () => BrowserWindow | null;
type UnknownRecord = Record<string, unknown>;

type SelectBipFileResult =
  | { canceled: true }
  | {
      canceled: false;
      path: string;
      name: string;
      defaultOutputFileName: string;
      hdrPath: string | null;
      hasHdr: boolean;
    };

type SelectDirectoryResult =
  | { canceled: true }
  | { canceled: false; path: string };

type RendererConversionRequest = {
  taskId: string;
  inputPath: string;
  outputDirectory: string;
  outputFileName?: string;
  tmpDir?: string;
  srs?: string;
  bounds?: BipToCogTiffBounds | null;
  overwrite?: boolean;
  options: {
    compression?: BipToCogTiffCompression;
    predictor?: BipToCogTiffPredictor;
    blockSize?: number;
    bigTiff?: BipToCogTiffBigTiff;
    interleave?: BipToCogTiffInterleave;
  };
};

let hasRegisteredBipToCogTiffIpc = false;

function resolveWindow(
  event: IpcMainInvokeEvent,
  getMainWindow: MainWindowGetter
): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender) ?? getMainWindow();
}

async function showOpenDialog(
  browserWindow: BrowserWindow | null,
  options: OpenDialogOptions
): Promise<OpenDialogReturnValue> {
  return browserWindow
    ? dialog.showOpenDialog(browserWindow, options)
    : dialog.showOpenDialog(options);
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function readRequiredString(source: UnknownRecord, key: string): string {
  const value = source[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`缺少必要参数：${key}`);
  }

  return value;
}

function readOptionalString(source: UnknownRecord, key: string): string | undefined {
  const value = source[key];
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`${key} 必须是字符串。`);
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : undefined;
}

function readOptionalBoolean(source: UnknownRecord, key: string): boolean | undefined {
  const value = source[key];
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new Error(`${key} 必须是布尔值。`);
  }

  return value;
}

function readOptionalNumber(source: UnknownRecord, key: string): number | undefined {
  const value = source[key];
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${key} 必须是有效数字。`);
  }

  return value;
}

function readCompression(value: unknown): BipToCogTiffCompression | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (value === "DEFLATE" || value === "LZW") {
    return value;
  }

  throw new Error("压缩方式必须是 DEFLATE 或 LZW。");
}

function readPredictor(value: unknown): BipToCogTiffPredictor | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (
    value === "AUTO" ||
    value === "STANDARD" ||
    value === "FLOATING_POINT" ||
    value === "NO"
  ) {
    return value;
  }

  throw new Error("Predictor 必须是 AUTO、STANDARD、FLOATING_POINT 或 NO。");
}

function readBigTiff(value: unknown): BipToCogTiffBigTiff | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (
    value === "YES" ||
    value === "IF_NEEDED" ||
    value === "IF_SAFER" ||
    value === "NO"
  ) {
    return value;
  }

  throw new Error("BigTIFF 选项必须是 YES、IF_NEEDED、IF_SAFER 或 NO。");
}

function readInterleave(value: unknown): BipToCogTiffInterleave | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (value === "BAND" || value === "PIXEL") {
    return value;
  }

  throw new Error("交错方式必须是 BAND 或 PIXEL。");
}

function readBounds(value: unknown): BipToCogTiffBounds | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (!isRecord(value)) {
    throw new Error("四至范围格式不正确。");
  }

  const bounds = {
    xmin: readOptionalNumber(value, "xmin"),
    ymax: readOptionalNumber(value, "ymax"),
    xmax: readOptionalNumber(value, "xmax"),
    ymin: readOptionalNumber(value, "ymin"),
  };

  if (
    bounds.xmin === undefined ||
    bounds.ymax === undefined ||
    bounds.xmax === undefined ||
    bounds.ymin === undefined
  ) {
    throw new Error("四至范围必须完整填写 xmin、ymax、xmax、ymin。");
  }

  if (bounds.xmin >= bounds.xmax || bounds.ymin >= bounds.ymax) {
    throw new Error("四至范围必须满足 xmin < xmax 且 ymin < ymax。");
  }

  return {
    xmin: bounds.xmin,
    ymax: bounds.ymax,
    xmax: bounds.xmax,
    ymin: bounds.ymin,
  };
}

function normalizeConversionRequest(payload: unknown): RendererConversionRequest {
  if (!isRecord(payload)) {
    throw new Error("转换请求格式不正确。");
  }

  const options = isRecord(payload.options) ? payload.options : {};

  return {
    taskId:
      typeof payload.taskId === "string" && payload.taskId.trim().length > 0
        ? payload.taskId
        : randomUUID(),
    inputPath: readRequiredString(payload, "inputPath"),
    outputDirectory: readRequiredString(payload, "outputDirectory"),
    outputFileName: readOptionalString(payload, "outputFileName"),
    tmpDir: readOptionalString(payload, "tmpDir"),
    srs: readOptionalString(payload, "srs"),
    bounds: readBounds(payload.bounds),
    overwrite: readOptionalBoolean(payload, "overwrite"),
    options: {
      compression: readCompression(options.compression),
      predictor: readPredictor(options.predictor),
      blockSize: readOptionalNumber(options, "blockSize"),
      bigTiff: readBigTiff(options.bigTiff),
      interleave: readInterleave(options.interleave),
    },
  };
}

function sendConversionLog(
  event: IpcMainInvokeEvent,
  taskId: string,
  log: BipToCogTiffConversionLog
): void {
  if (event.sender.isDestroyed()) {
    return;
  }

  event.sender.send(CHANNELS.conversionLog, {
    taskId,
    ...log,
  });
}

export function registerBipToCogTiffIpc(
  getMainWindow: MainWindowGetter
): void {
  if (hasRegisteredBipToCogTiffIpc) {
    return;
  }

  hasRegisteredBipToCogTiffIpc = true;

  ipcMain.handle(
    CHANNELS.selectBipFile,
    async (event): Promise<SelectBipFileResult> => {
      const browserWindow = resolveWindow(event, getMainWindow);
      const result = await showOpenDialog(browserWindow, {
        title: "选择 ENVI BIP 文件",
        properties: ["openFile"],
        filters: [
          { name: "BIP 文件", extensions: ["bip"] },
          { name: "所有文件", extensions: ["*"] },
        ],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true };
      }

      const selectedPath = result.filePaths[0];
      const header = await findEnviHeader(selectedPath);

      return {
        canceled: false,
        path: selectedPath,
        name: path.basename(selectedPath),
        defaultOutputFileName: makeDefaultCogTiffFileName(selectedPath),
        hdrPath: header.path,
        hasHdr: header.exists,
      };
    }
  );

  ipcMain.handle(
    CHANNELS.selectOutputDirectory,
    async (event): Promise<SelectDirectoryResult> => {
      const browserWindow = resolveWindow(event, getMainWindow);
      const result = await showOpenDialog(browserWindow, {
        title: "选择 COGTiff 输出位置",
        properties: ["openDirectory", "createDirectory"],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true };
      }

      return { canceled: false, path: result.filePaths[0] };
    }
  );

  ipcMain.handle(
    CHANNELS.selectTempDirectory,
    async (event): Promise<SelectDirectoryResult> => {
      const browserWindow = resolveWindow(event, getMainWindow);
      const result = await showOpenDialog(browserWindow, {
        title: "选择 GDAL 临时目录",
        properties: ["openDirectory", "createDirectory"],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true };
      }

      return { canceled: false, path: result.filePaths[0] };
    }
  );

  ipcMain.handle(CHANNELS.convert, async (event, payload: unknown) => {
    const request = normalizeConversionRequest(payload);

    sendConversionLog(event, request.taskId, {
      level: "info",
      message: "开始 BIP 转 COGTiff。",
      createdAt: new Date().toISOString(),
    });

    const result = await convertBipToCogTiff(
      {
        inputPath: request.inputPath,
        outputDirectory: request.outputDirectory,
        outputFileName: request.outputFileName,
        tmpDir: request.tmpDir,
        srs: request.srs,
        bounds: request.bounds,
        overwrite: request.overwrite,
        options: request.options,
      },
      (log) => sendConversionLog(event, request.taskId, log)
    );

    sendConversionLog(event, request.taskId, {
      level: "success",
      message: "转换完成。",
      createdAt: new Date().toISOString(),
    });

    return {
      taskId: request.taskId,
      ...result,
    };
  });

  ipcMain.handle(CHANNELS.revealOutputDirectory, async (_event, value) => {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error("缺少输出目录路径。");
    }

    const message = await shell.openPath(value);
    if (message) {
      throw new Error(message);
    }
  });
}
