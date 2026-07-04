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
        obgsTo3dTiles: {
          selectInputDirectory: () => Promise<ObgsSelectDirectoryResult>;
          selectOutputDirectory: () => Promise<ObgsSelectDirectoryResult>;
          validate: (inputDir: string) => Promise<ObgsRootValidationResult>;
          convert: (request: ObgsConvertRequest) => Promise<ObgsConvertResult>;
          revealOutputDirectory: (outputDir: string) => Promise<void>;
          onConversionLog: (
            callback: (log: ObgsConversionLog) => void
          ) => () => void;
        };
        bipToCogTiff: {
          selectBipFile: () => Promise<BipToCogTiffSelectBipFileResult>;
          selectOutputDirectory: () => Promise<BipToCogTiffSelectDirectoryResult>;
          selectTempDirectory: () => Promise<BipToCogTiffSelectDirectoryResult>;
          convert: (
            request: BipToCogTiffConvertRequest
          ) => Promise<BipToCogTiffConvertResult>;
          revealOutputDirectory: (outputDirectory: string) => Promise<void>;
          onConversionLog: (
            callback: (log: BipToCogTiffConversionLog) => void
          ) => () => void;
        };
        cogTiff: {
          selectFile: () => Promise<CogTiffSelectFileResult>;
        };
      };
    };
  }
}
