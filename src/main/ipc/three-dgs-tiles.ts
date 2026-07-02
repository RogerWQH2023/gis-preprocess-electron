import { BrowserWindow, dialog, ipcMain, shell } from "electron";
import { randomUUID } from "node:crypto";
import path from "node:path";

import {
  convertThreeDgsPlyToTiles,
  type ThreeDgsTilesConversionLog,
} from "../tools/three-dgs-tiles/converter.js";

import type {
  IpcMainInvokeEvent,
  OpenDialogOptions,
  OpenDialogReturnValue,
} from "electron";

const CHANNELS = {
  selectPlyFile: "three-dgs-tiles:select-ply-file",
  selectOutputDirectory: "three-dgs-tiles:select-output-directory",
  convert: "three-dgs-tiles:convert",
  conversionLog: "three-dgs-tiles:conversion-log",
  revealOutputDirectory: "three-dgs-tiles:reveal-output-directory",
} as const;

type MainWindowGetter = () => BrowserWindow | null;
type UnknownRecord = Record<string, unknown>;
type ThreeDgsInputConvention = "graphdeco" | "khr_native";

type SelectPlyFileResult =
  | { canceled: true }
  | { canceled: false; path: string; name: string };

type SelectOutputDirectoryResult =
  | { canceled: true }
  | { canceled: false; path: string };

type RendererConversionRequest = {
  taskId: string;
  inputPath: string;
  outputParentDir: string;
  options: {
    inputConvention: ThreeDgsInputConvention;
    memoryBudgetGb: number;
  };
};

let hasRegisteredThreeDgsTilesIpc = false;

function resolveWindow(
  event: IpcMainInvokeEvent,
  getMainWindow: MainWindowGetter
): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender) ?? getMainWindow();
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

function readMemoryBudgetGb(source: UnknownRecord): number {
  const value = source.memoryBudgetGb;
  const memoryBudgetGb = typeof value === "number" ? value : 3;

  if (!Number.isFinite(memoryBudgetGb) || memoryBudgetGb <= 0) {
    throw new Error("内存预算必须是大于 0 的数字。");
  }

  return memoryBudgetGb;
}

function readInputConvention(source: UnknownRecord): ThreeDgsInputConvention {
  const value = source.inputConvention;

  if (value === "graphdeco" || value === "khr_native") {
    return value;
  }

  throw new Error("输入约定必须是 graphdeco 或 khr_native。");
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
    outputParentDir: readRequiredString(payload, "outputParentDir"),
    options: {
      inputConvention: readInputConvention(options),
      memoryBudgetGb: readMemoryBudgetGb(options),
    },
  };
}

async function showOpenDialog(
  browserWindow: BrowserWindow | null,
  options: OpenDialogOptions
): Promise<OpenDialogReturnValue> {
  return browserWindow
    ? dialog.showOpenDialog(browserWindow, options)
    : dialog.showOpenDialog(options);
}

function sendConversionLog(
  event: IpcMainInvokeEvent,
  taskId: string,
  log: ThreeDgsTilesConversionLog
): void {
  if (event.sender.isDestroyed()) {
    return;
  }

  event.sender.send(CHANNELS.conversionLog, {
    taskId,
    ...log,
  });
}

export function registerThreeDgsTilesIpc(
  getMainWindow: MainWindowGetter
): void {
  if (hasRegisteredThreeDgsTilesIpc) {
    return;
  }

  hasRegisteredThreeDgsTilesIpc = true;

  ipcMain.handle(
    CHANNELS.selectPlyFile,
    async (event): Promise<SelectPlyFileResult> => {
      const browserWindow = resolveWindow(event, getMainWindow);
      const result = await showOpenDialog(browserWindow, {
        title: "选择 3DGS PLY 文件",
        properties: ["openFile"],
        filters: [
          { name: "PLY 文件", extensions: ["ply"] },
          { name: "所有文件", extensions: ["*"] },
        ],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true };
      }

      const selectedPath = result.filePaths[0];
      return {
        canceled: false,
        path: selectedPath,
        name: path.basename(selectedPath),
      };
    }
  );

  ipcMain.handle(
    CHANNELS.selectOutputDirectory,
    async (event): Promise<SelectOutputDirectoryResult> => {
      const browserWindow = resolveWindow(event, getMainWindow);
      const result = await showOpenDialog(browserWindow, {
        title: "选择输出位置",
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
      message: "开始转换 3DGS PLY。",
      createdAt: new Date().toISOString(),
    });

    const result = await convertThreeDgsPlyToTiles(
      {
        inputPath: request.inputPath,
        outputParentDir: request.outputParentDir,
        inputConvention: request.options.inputConvention,
        memoryBudgetGb: request.options.memoryBudgetGb,
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
