import { contextBridge, ipcRenderer } from "electron";

const CHANNELS = {
  minimize: "window:minimize",
  toggleMaximize: "window:toggle-maximize",
  close: "window:close",
  openDevTools: "window:open-devtools",
  isMaximized: "window:is-maximized",
  maximizedChange: "window:maximized-change",
  selectThreeDgsPlyFile: "three-dgs-tiles:select-ply-file",
  selectThreeDgsOutputDirectory: "three-dgs-tiles:select-output-directory",
  convertThreeDgsTiles: "three-dgs-tiles:convert",
  threeDgsConversionLog: "three-dgs-tiles:conversion-log",
  revealThreeDgsOutputDirectory: "three-dgs-tiles:reveal-output-directory",
  selectThreeDgsTileset: "three-dgs-tiles-preview:select-tileset",
  selectCogTiff: "cogtiff-preview:select-cogtiff",
} as const;

type RemoveListener = () => void;
type MaximizedChangeCallback = (isMaximized: boolean) => void;
type ThreeDgsInputConvention = "graphdeco" | "khr_native";
type ThreeDgsConversionLogLevel = "info" | "success" | "warning" | "error";
type ThreeDgsSelectPlyFileResult =
  | { canceled: true }
  | { canceled: false; path: string; name: string };
type ThreeDgsSelectOutputDirectoryResult =
  | { canceled: true }
  | { canceled: false; path: string };
type ThreeDgsSelectTilesetResult =
  | { canceled: true }
  | { canceled: false; path: string; name: string; url: string };
type CogTiffSelectFileResult =
  | { canceled: true }
  | {
      canceled: false;
      path: string;
      name: string;
      url: string;
      sizeBytes: number;
    };
type ThreeDgsConvertRequest = {
  taskId: string;
  inputPath: string;
  outputParentDir: string;
  options: {
    inputConvention: ThreeDgsInputConvention;
    memoryBudgetGb: number;
  };
};
type ThreeDgsConvertResult = {
  taskId: string;
  inputPath: string;
  outputDir: string;
  tilesetPath: string;
  summaryPath: string;
  splatCount: number;
  shDegree: number;
};
type ThreeDgsConversionLog = {
  taskId: string;
  level: ThreeDgsConversionLogLevel;
  message: string;
  createdAt: string;
};
type ThreeDgsConversionLogCallback = (log: ThreeDgsConversionLog) => void;

const electronAPI = {
  runtime: {
    platform: process.platform,
    isElectron: true,
  },
  window: {
    minimize: () => ipcRenderer.send(CHANNELS.minimize),
    close: () => ipcRenderer.send(CHANNELS.close),
    openDevTools: () => ipcRenderer.send(CHANNELS.openDevTools),
    toggleMaximize: () =>
      ipcRenderer.invoke(CHANNELS.toggleMaximize) as Promise<boolean>,
    isMaximized: () =>
      ipcRenderer.invoke(CHANNELS.isMaximized) as Promise<boolean>,
    onMaximizedChange: (
      callback: MaximizedChangeCallback
    ): RemoveListener => {
      const listener = (_event: Electron.IpcRendererEvent, value: boolean) => {
        callback(value);
      };

      ipcRenderer.on(CHANNELS.maximizedChange, listener);

      // 返回取消监听函数，避免 React 组件卸载后仍保留事件监听。
      return () => {
        ipcRenderer.removeListener(CHANNELS.maximizedChange, listener);
      };
    },
  },
  tools: {
    threeDgsTiles: {
      selectPlyFile: () =>
        ipcRenderer.invoke(
          CHANNELS.selectThreeDgsPlyFile
        ) as Promise<ThreeDgsSelectPlyFileResult>,
      selectOutputDirectory: () =>
        ipcRenderer.invoke(
          CHANNELS.selectThreeDgsOutputDirectory
        ) as Promise<ThreeDgsSelectOutputDirectoryResult>,
      convert: (request: ThreeDgsConvertRequest) =>
        ipcRenderer.invoke(
          CHANNELS.convertThreeDgsTiles,
          request
        ) as Promise<ThreeDgsConvertResult>,
      revealOutputDirectory: (outputDir: string) =>
        ipcRenderer.invoke(
          CHANNELS.revealThreeDgsOutputDirectory,
          outputDir
        ) as Promise<void>,
      selectTileset: () =>
        ipcRenderer.invoke(
          CHANNELS.selectThreeDgsTileset
        ) as Promise<ThreeDgsSelectTilesetResult>,
      onConversionLog: (
        callback: ThreeDgsConversionLogCallback
      ): RemoveListener => {
        const listener = (
          _event: Electron.IpcRendererEvent,
          value: ThreeDgsConversionLog
        ) => {
          callback(value);
        };

        ipcRenderer.on(CHANNELS.threeDgsConversionLog, listener);

        // 转换日志可能持续较久，组件卸载时必须移除监听，避免重复追加日志。
        return () => {
          ipcRenderer.removeListener(
            CHANNELS.threeDgsConversionLog,
            listener
          );
        };
      },
    },
    cogTiff: {
      selectFile: () =>
        ipcRenderer.invoke(
          CHANNELS.selectCogTiff
        ) as Promise<CogTiffSelectFileResult>,
    },
  },
} as const;

// 只暴露受控 API，不把 ipcRenderer 或 Node.js 对象直接交给渲染进程。
contextBridge.exposeInMainWorld("electronAPI", electronAPI);

export type ElectronAPI = typeof electronAPI;
