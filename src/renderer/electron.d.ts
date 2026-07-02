export {};

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

declare global {
  interface Window {
    electronAPI?: {
      runtime: {
        platform: NodeJS.Platform;
        isElectron: true;
      };
      window: {
        minimize: () => void;
        close: () => void;
        openDevTools: () => void;
        toggleMaximize: () => Promise<boolean>;
        isMaximized: () => Promise<boolean>;
        onMaximizedChange: (
          callback: (isMaximized: boolean) => void
        ) => () => void;
      };
      tools: {
        threeDgsTiles: {
          selectPlyFile: () => Promise<ThreeDgsSelectPlyFileResult>;
          selectOutputDirectory: () => Promise<ThreeDgsSelectOutputDirectoryResult>;
          convert: (
            request: ThreeDgsConvertRequest
          ) => Promise<ThreeDgsConvertResult>;
          revealOutputDirectory: (outputDir: string) => Promise<void>;
          selectTileset: () => Promise<ThreeDgsSelectTilesetResult>;
          onConversionLog: (
            callback: (log: ThreeDgsConversionLog) => void
          ) => () => void;
        };
      };
    };
  }
}
