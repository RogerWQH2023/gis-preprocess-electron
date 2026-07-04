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
  selectBipFile: "bip-to-cogtiff:select-bip-file",
  selectBipCogTiffOutputDirectory: "bip-to-cogtiff:select-output-directory",
  selectBipCogTiffTempDirectory: "bip-to-cogtiff:select-temp-directory",
  convertBipToCogTiff: "bip-to-cogtiff:convert",
  bipToCogTiffConversionLog: "bip-to-cogtiff:conversion-log",
  revealBipCogTiffOutputDirectory: "bip-to-cogtiff:reveal-output-directory",
  selectThreeDgsTileset: "three-dgs-tiles-preview:select-tileset",
  selectCogTiff: "cogtiff-preview:select-cogtiff",
  selectObgsInputDirectory: "obgs-to-3dtiles:select-input-directory",
  selectObgsOutputDirectory: "obgs-to-3dtiles:select-output-directory",
  validateObgsRoot: "obgs-to-3dtiles:validate",
  convertObgsTo3dTiles: "obgs-to-3dtiles:convert",
  obgsTo3dTilesConversionLog: "obgs-to-3dtiles:conversion-log",
  revealObgsOutputDirectory: "obgs-to-3dtiles:reveal-output-directory",
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
type ObgsConversionLogLevel = "info" | "success" | "warning" | "error";
type ObgsInputLayout = "data-directory" | "flat-blocks";
type ObgsSelectDirectoryResult =
  | { canceled: true }
  | { canceled: false; path: string; name: string };
type ObgsRootValidationResult = {
  ok: boolean;
  inputDir: string;
  layout: ObgsInputLayout | null;
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
type ObgsConvertRequest = {
  taskId: string;
  inputDir: string;
  outputParentDir: string;
};
type ObgsConvertResult = {
  taskId: string;
  inputDir: string;
  outputDir: string;
  tilesetPath: string;
  converterPath: string;
  converterInputDir: string;
  usedWorkspaceAdapter: boolean;
  validation: ObgsRootValidationResult;
};
type ObgsConversionLog = {
  taskId: string;
  level: ObgsConversionLogLevel;
  message: string;
  createdAt: string;
};
type ObgsConversionLogCallback = (log: ObgsConversionLog) => void;
type BipToCogTiffCompression = "DEFLATE" | "LZW";
type BipToCogTiffPredictor = "AUTO" | "STANDARD" | "FLOATING_POINT" | "NO";
type BipToCogTiffBigTiff = "YES" | "IF_NEEDED" | "IF_SAFER" | "NO";
type BipToCogTiffInterleave = "BAND" | "PIXEL";
type BipToCogTiffConversionLogLevel =
  | "info"
  | "success"
  | "warning"
  | "error";
type BipToCogTiffBounds = {
  xmin: number;
  ymax: number;
  xmax: number;
  ymin: number;
};
type BipToCogTiffSelectBipFileResult =
  | { canceled: true }
  | {
      canceled: false;
      path: string;
      name: string;
      defaultOutputFileName: string;
      hdrPath: string | null;
      hasHdr: boolean;
    };
type BipToCogTiffSelectDirectoryResult =
  | { canceled: true }
  | { canceled: false; path: string };
type BipToCogTiffMetadata = {
  driver: string;
  width: number;
  height: number;
  bandCount: number;
  dataType: string | null;
  geoTransform: number[] | null;
  srsWkt: string | null;
  gdalVersion: string;
};
type BipToCogTiffConvertRequest = {
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
type BipToCogTiffConvertResult = {
  taskId: string;
  inputPath: string;
  outputPath: string;
  outputDirectory: string;
  outputFileName: string;
  outputSizeBytes: number;
  hdrPath: string | null;
  hasHdr: boolean;
  metadata: BipToCogTiffMetadata;
  translateArgs: string[];
};
type BipToCogTiffConversionLog = {
  taskId: string;
  level: BipToCogTiffConversionLogLevel;
  message: string;
  createdAt: string;
};
type BipToCogTiffConversionLogCallback = (
  log: BipToCogTiffConversionLog
) => void;

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
    obgsTo3dTiles: {
      selectInputDirectory: () =>
        ipcRenderer.invoke(
          CHANNELS.selectObgsInputDirectory
        ) as Promise<ObgsSelectDirectoryResult>,
      selectOutputDirectory: () =>
        ipcRenderer.invoke(
          CHANNELS.selectObgsOutputDirectory
        ) as Promise<ObgsSelectDirectoryResult>,
      validate: (inputDir: string) =>
        ipcRenderer.invoke(
          CHANNELS.validateObgsRoot,
          inputDir
        ) as Promise<ObgsRootValidationResult>,
      convert: (request: ObgsConvertRequest) =>
        ipcRenderer.invoke(
          CHANNELS.convertObgsTo3dTiles,
          request
        ) as Promise<ObgsConvertResult>,
      revealOutputDirectory: (outputDir: string) =>
        ipcRenderer.invoke(
          CHANNELS.revealObgsOutputDirectory,
          outputDir
        ) as Promise<void>,
      onConversionLog: (
        callback: ObgsConversionLogCallback
      ): RemoveListener => {
        const listener = (
          _event: Electron.IpcRendererEvent,
          value: ObgsConversionLog
        ) => {
          callback(value);
        };

        ipcRenderer.on(CHANNELS.obgsTo3dTilesConversionLog, listener);

        // 转换进程输出较长时需要在页面卸载后及时移除监听。
        return () => {
          ipcRenderer.removeListener(
            CHANNELS.obgsTo3dTilesConversionLog,
            listener
          );
        };
      },
    },
    bipToCogTiff: {
      selectBipFile: () =>
        ipcRenderer.invoke(
          CHANNELS.selectBipFile
        ) as Promise<BipToCogTiffSelectBipFileResult>,
      selectOutputDirectory: () =>
        ipcRenderer.invoke(
          CHANNELS.selectBipCogTiffOutputDirectory
        ) as Promise<BipToCogTiffSelectDirectoryResult>,
      selectTempDirectory: () =>
        ipcRenderer.invoke(
          CHANNELS.selectBipCogTiffTempDirectory
        ) as Promise<BipToCogTiffSelectDirectoryResult>,
      convert: (request: BipToCogTiffConvertRequest) =>
        ipcRenderer.invoke(
          CHANNELS.convertBipToCogTiff,
          request
        ) as Promise<BipToCogTiffConvertResult>,
      revealOutputDirectory: (outputDirectory: string) =>
        ipcRenderer.invoke(
          CHANNELS.revealBipCogTiffOutputDirectory,
          outputDirectory
        ) as Promise<void>,
      onConversionLog: (
        callback: BipToCogTiffConversionLogCallback
      ): RemoveListener => {
        const listener = (
          _event: Electron.IpcRendererEvent,
          value: BipToCogTiffConversionLog
        ) => {
          callback(value);
        };

        ipcRenderer.on(CHANNELS.bipToCogTiffConversionLog, listener);

        // 转换可能处理 2GB+ 栅格，组件卸载时需要清理日志监听。
        return () => {
          ipcRenderer.removeListener(
            CHANNELS.bipToCogTiffConversionLog,
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
