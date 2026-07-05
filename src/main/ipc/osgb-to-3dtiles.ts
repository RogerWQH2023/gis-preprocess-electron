import { BrowserWindow, dialog, ipcMain, shell } from "electron";
import { randomUUID } from "node:crypto";
import path from "node:path";

import {
  convertOsgbTo3dTiles,
  validateOsgbRoot,
  type OsgbTo3dTilesConversionLog,
} from "../tools/osgb-to-3dtiles/converter.js";

import type {
  IpcMainInvokeEvent,
  OpenDialogOptions,
  OpenDialogReturnValue,
} from "electron";

const CHANNELS = {
  selectInputDirectory: "osgb-to-3dtiles:select-input-directory",
  selectOutputDirectory: "osgb-to-3dtiles:select-output-directory",
  validate: "osgb-to-3dtiles:validate",
  convert: "osgb-to-3dtiles:convert",
  conversionLog: "osgb-to-3dtiles:conversion-log",
  revealOutputDirectory: "osgb-to-3dtiles:reveal-output-directory",
} as const;

type MainWindowGetter = () => BrowserWindow | null;
type UnknownRecord = Record<string, unknown>;

type SelectDirectoryResult =
  | { canceled: true }
  | { canceled: false; path: string; name: string };

type RendererConversionRequest = {
  taskId: string;
  inputDir: string;
  outputParentDir: string;
};

let hasRegisteredOsgbTo3dTilesIpc = false;
let activeConversionTaskId: string | null = null;

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

function normalizeConversionRequest(payload: unknown): RendererConversionRequest {
  if (!isRecord(payload)) {
    throw new Error("转换请求格式不正确。");
  }

  return {
    taskId:
      typeof payload.taskId === "string" && payload.taskId.trim().length > 0
        ? payload.taskId
        : randomUUID(),
    inputDir: readRequiredString(payload, "inputDir"),
    outputParentDir: readRequiredString(payload, "outputParentDir"),
  };
}

function sendConversionLog(
  event: IpcMainInvokeEvent,
  taskId: string,
  log: OsgbTo3dTilesConversionLog
): void {
  if (event.sender.isDestroyed()) {
    return;
  }

  event.sender.send(CHANNELS.conversionLog, {
    taskId,
    ...log,
  });
}

export function registerOsgbTo3dTilesIpc(
  getMainWindow: MainWindowGetter
): void {
  if (hasRegisteredOsgbTo3dTilesIpc) {
    return;
  }

  hasRegisteredOsgbTo3dTilesIpc = true;

  ipcMain.handle(
    CHANNELS.selectInputDirectory,
    async (event): Promise<SelectDirectoryResult> => {
      const browserWindow = resolveWindow(event, getMainWindow);
      const result = await showOpenDialog(browserWindow, {
        title: "选择倾斜摄影 OSGB 根目录",
        properties: ["openDirectory"],
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
    async (event): Promise<SelectDirectoryResult> => {
      const browserWindow = resolveWindow(event, getMainWindow);
      const result = await showOpenDialog(browserWindow, {
        title: "选择 3DTiles 输出位置",
        properties: ["openDirectory", "createDirectory"],
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

  ipcMain.handle(CHANNELS.validate, async (_event, value: unknown) => {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error("缺少输入目录路径。");
    }

    return validateOsgbRoot(value);
  });

  ipcMain.handle(CHANNELS.convert, async (event, payload: unknown) => {
    const request = normalizeConversionRequest(payload);

    if (activeConversionTaskId) {
      throw new Error("已有倾斜摄影转换任务正在运行，请等待当前任务完成。");
    }

    activeConversionTaskId = request.taskId;

    try {
      sendConversionLog(event, request.taskId, {
        level: "info",
        message: "开始 OSGB 转 3DTiles。",
        createdAt: new Date().toISOString(),
      });

      const result = await convertOsgbTo3dTiles(
        {
          inputDir: request.inputDir,
          outputParentDir: request.outputParentDir,
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
    } finally {
      activeConversionTaskId = null;
    }
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
