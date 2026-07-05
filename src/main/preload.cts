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
  selectOsgbInputDirectory: "osgb-to-3dtiles:select-input-directory",
  selectOsgbOutputDirectory: "osgb-to-3dtiles:select-output-directory",
  validateOsgbRoot: "osgb-to-3dtiles:validate",
  convertOsgbTo3dTiles: "osgb-to-3dtiles:convert",
  osgbTo3dTilesConversionLog: "osgb-to-3dtiles:conversion-log",
  revealOsgbOutputDirectory: "osgb-to-3dtiles:reveal-output-directory",
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
type OsgbConversionLogLevel = "info" | "success" | "warning" | "error";
type OsgbInputLayout = "data-directory" | "flat-blocks";
type OsgbSelectDirectoryResult =
  | { canceled: true }
  | { canceled: false; path: string; name: string };
type OsgbRootValidationResult = {
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
type OsgbConvertRequest = {
  taskId: string;
  inputDir: string;
  outputParentDir: string;
};
type OsgbConvertResult = {
  taskId: string;
  inputDir: string;
  outputDir: string;
  tilesetPath: string;
  converterPath: string;
  converterInputDir: string;
  usedWorkspaceAdapter: boolean;
  validation: OsgbRootValidationResult;
};
type OsgbConversionLog = {
  taskId: string;
  level: OsgbConversionLogLevel;
  message: string;
  createdAt: string;
};
type OsgbConversionLogCallback = (log: OsgbConversionLog) => void;
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
    osgbTo3dTiles: {
      selectInputDirectory: () =>
        ipcRenderer.invoke(
          CHANNELS.selectOsgbInputDirectory
        ) as Promise<OsgbSelectDirectoryResult>,
      selectOutputDirectory: () =>
        ipcRenderer.invoke(
          CHANNELS.selectOsgbOutputDirectory
        ) as Promise<OsgbSelectDirectoryResult>,
      validate: (inputDir: string) =>
        ipcRenderer.invoke(
          CHANNELS.validateOsgbRoot,
          inputDir
        ) as Promise<OsgbRootValidationResult>,
      convert: (request: OsgbConvertRequest) =>
        ipcRenderer.invoke(
          CHANNELS.convertOsgbTo3dTiles,
          request
        ) as Promise<OsgbConvertResult>,
      revealOutputDirectory: (outputDir: string) =>
        ipcRenderer.invoke(
          CHANNELS.revealOsgbOutputDirectory,
          outputDir
        ) as Promise<void>,
      onConversionLog: (
        callback: OsgbConversionLogCallback
      ): RemoveListener => {
        const listener = (
          _event: Electron.IpcRendererEvent,
          value: OsgbConversionLog
        ) => {
          callback(value);
        };

        ipcRenderer.on(CHANNELS.osgbTo3dTilesConversionLog, listener);

        // 转换进程输出较长时需要在页面卸载后及时移除监听。
        return () => {
          ipcRenderer.removeListener(
            CHANNELS.osgbTo3dTilesConversionLog,
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
