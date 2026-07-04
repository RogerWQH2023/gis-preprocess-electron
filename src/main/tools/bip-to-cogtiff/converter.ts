import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import { runBipToCogTiffWorker } from "./runner.js";

const require = createRequire(import.meta.url);

type GdalSize = {
  x: number;
  y: number;
};

type GdalSpatialReference = {
  toWKT: () => string;
};

type GdalSpatialReferenceFactory = {
  fromUserInput: (input: string) => GdalSpatialReference;
};

type GdalRasterBand = {
  readonly dataTypeAsync: Promise<string | null>;
};

type GdalDataset = {
  readonly driver: {
    readonly description: string;
  };
  readonly rasterSizeAsync: Promise<GdalSize>;
  readonly srsAsync: Promise<GdalSpatialReference | null>;
  readonly geoTransformAsync: Promise<number[] | null>;
  readonly bands: {
    countAsync: () => Promise<number>;
    getAsync: (id: number) => Promise<GdalRasterBand>;
  };
  flushAsync: () => Promise<void>;
  close: () => void;
};

type GdalModule = {
  readonly GDT_Float16: string;
  readonly GDT_Float32: string;
  readonly GDT_Float64: string;
  readonly GDT_CFloat16: string;
  readonly GDT_CFloat32: string;
  readonly GDT_CFloat64: string;
  readonly version: string;
  readonly config: {
    get?: (key: string) => string | null;
    set: (key: string, value: string | null) => void;
  };
  readonly SpatialReference: GdalSpatialReferenceFactory;
  setPROJSearchPath?: (path: string) => void;
  openAsync: (
    inputPath: string,
    mode?: string,
    drivers?: string | string[]
  ) => Promise<GdalDataset>;
  translateAsync: (
    outputPath: string,
    source: GdalDataset,
    args?: string[],
    options?: {
      progress_cb?: (complete: number, message: string) => void;
    }
  ) => Promise<GdalDataset>;
};

type EnviHeaderMatch = {
  path: string | null;
  exists: boolean;
};

type BundledGdalDataPaths = {
  gdalDataPath: string;
  projDataPath: string;
};

export type BipToCogTiffCompression = "DEFLATE" | "LZW";
export type BipToCogTiffInterleave = "BAND" | "PIXEL";
export type BipToCogTiffPredictor = "AUTO" | "STANDARD" | "FLOATING_POINT" | "NO";
export type BipToCogTiffBigTiff = "YES" | "IF_NEEDED" | "IF_SAFER" | "NO";
export type BipToCogTiffLogLevel = "info" | "success" | "warning" | "error";

export type BipToCogTiffBounds = {
  xmin: number;
  ymax: number;
  xmax: number;
  ymin: number;
};

export type BipToCogTiffConversionLog = {
  level: BipToCogTiffLogLevel;
  message: string;
  createdAt: string;
};

export type BipToCogTiffConversionOptions = {
  compression?: BipToCogTiffCompression;
  predictor?: BipToCogTiffPredictor;
  blockSize?: number;
  bigTiff?: BipToCogTiffBigTiff;
  interleave?: BipToCogTiffInterleave;
};

export type BipToCogTiffConversionRequest = {
  inputPath: string;
  outputDirectory: string;
  outputFileName?: string;
  tmpDir?: string;
  srs?: string;
  bounds?: BipToCogTiffBounds | null;
  overwrite?: boolean;
  options?: BipToCogTiffConversionOptions;
};

export type BipToCogTiffMetadata = {
  driver: string;
  width: number;
  height: number;
  bandCount: number;
  dataType: string | null;
  geoTransform: number[] | null;
  srsWkt: string | null;
  gdalVersion: string;
};

export type BipToCogTiffConversionResult = {
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

const DEFAULT_OPTIONS: Required<BipToCogTiffConversionOptions> = {
  compression: "DEFLATE",
  predictor: "AUTO",
  blockSize: 512,
  bigTiff: "YES",
  interleave: "BAND",
};
const DEFAULT_TARGET_SRS = "EPSG:4326";

let cachedGdal: GdalModule | null = null;

function resolveBundledGdalDataPaths(): BundledGdalDataPaths {
  const packageRoot = path.dirname(require.resolve("gdal-async/package.json"));

  return {
    gdalDataPath: path.join(packageRoot, "deps", "libgdal", "gdal", "data"),
    projDataPath: path.join(packageRoot, "deps", "libproj", "proj", "data"),
  };
}

function prepareBundledGdalEnvironment(): BundledGdalDataPaths {
  const dataPaths = resolveBundledGdalDataPaths();

  // Windows 上常见的 PostGIS/QGIS 会写入全局 GDAL_DATA/PROJ_LIB。
  // 这些目录的 proj.db 版本可能和 gdal-async 内置 PROJ 不匹配，因此这里强制使用包内数据。
  process.env.GDAL_DATA = dataPaths.gdalDataPath;
  process.env.PROJ_LIB = dataPaths.projDataPath;
  process.env.PROJ_DATA = dataPaths.projDataPath;

  return dataPaths;
}

function configureGdalRuntimePaths(
  gdal: GdalModule,
  dataPaths: BundledGdalDataPaths
): void {
  gdal.config.set("GDAL_DATA", dataPaths.gdalDataPath);
  gdal.config.set("PROJ_LIB", dataPaths.projDataPath);
  gdal.config.set("PROJ_DATA", dataPaths.projDataPath);

  // PROJ 的搜索路径在原生模块加载后也要显式刷新，否则可能仍沿用旧的系统环境。
  gdal.setPROJSearchPath?.(dataPaths.projDataPath);
}

function loadGdal(): GdalModule {
  if (cachedGdal) {
    return cachedGdal;
  }

  try {
    const dataPaths = prepareBundledGdalEnvironment();
    cachedGdal = require("gdal-async") as GdalModule;
    configureGdalRuntimePaths(cachedGdal, dataPaths);
    return cachedGdal;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `无法加载 gdal-async，请确认已完成 pnpm install 并安装了可用的 GDAL 原生绑定：${message}`
    );
  }
}

function emitLog(
  onLog: ((entry: BipToCogTiffConversionLog) => void) | undefined,
  level: BipToCogTiffLogLevel,
  message: string
): void {
  if (!message.trim()) {
    return;
  }

  onLog?.({
    level,
    message,
    createdAt: new Date().toISOString(),
  });
}

function sanitizeFileName(fileName: string): string {
  const safeName = fileName
    .replace(/[<>:"/\\|?*]/g, "_")
    .split("")
    .map((character) => (character.charCodeAt(0) < 32 ? "_" : character))
    .join("")
    .replace(/\s+/g, " ")
    .trim();

  return safeName.length > 0 ? safeName : "result-cog.tif";
}

function ensureTiffExtension(fileName: string): string {
  return /\.(tif|tiff)$/i.test(fileName) ? fileName : `${fileName}.tif`;
}

export function makeDefaultCogTiffFileName(inputPath: string): string {
  const inputBaseName = path.basename(inputPath, path.extname(inputPath));
  return ensureTiffExtension(sanitizeFileName(`${inputBaseName}-cog`));
}

async function pathExists(filePath: string): Promise<boolean> {
  return fs
    .access(filePath)
    .then(() => true)
    .catch(() => false);
}

export async function findEnviHeader(inputPath: string): Promise<EnviHeaderMatch> {
  const sidecarHeaderPath = `${inputPath}.hdr`;
  if (await pathExists(sidecarHeaderPath)) {
    return {
      path: sidecarHeaderPath,
      exists: true,
    };
  }

  // ENVI 数据常见两种头文件命名：result.bip.hdr 或 result.hdr。
  const siblingHeaderPath = path.join(
    path.dirname(inputPath),
    `${path.basename(inputPath, path.extname(inputPath))}.hdr`
  );
  if (siblingHeaderPath !== sidecarHeaderPath && (await pathExists(siblingHeaderPath))) {
    return {
      path: siblingHeaderPath,
      exists: true,
    };
  }

  return {
    path: sidecarHeaderPath,
    exists: false,
  };
}

async function assertReadableBip(inputPath: string): Promise<void> {
  const inputStat = await fs.stat(inputPath).catch(() => null);

  if (!inputStat?.isFile()) {
    throw new Error(`输入 BIP 文件不存在或不是普通文件：${inputPath}`);
  }

  if (path.extname(inputPath).toLowerCase() !== ".bip") {
    throw new Error("当前工具只支持选择 .bip 文件。");
  }
}

async function ensureDirectory(directoryPath: string, label: string): Promise<void> {
  await fs.mkdir(directoryPath, { recursive: true });

  const directoryStat = await fs.stat(directoryPath);
  if (!directoryStat.isDirectory()) {
    throw new Error(`${label}不是目录：${directoryPath}`);
  }
}

function normalizeOptions(
  options: BipToCogTiffConversionOptions | undefined
): Required<BipToCogTiffConversionOptions> {
  const normalizedOptions = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  if (!["DEFLATE", "LZW"].includes(normalizedOptions.compression)) {
    throw new Error("压缩方式必须是 DEFLATE 或 LZW。");
  }

  if (!["AUTO", "STANDARD", "FLOATING_POINT", "NO"].includes(normalizedOptions.predictor)) {
    throw new Error("Predictor 必须是 AUTO、STANDARD、FLOATING_POINT 或 NO。");
  }

  if (!["YES", "IF_NEEDED", "IF_SAFER", "NO"].includes(normalizedOptions.bigTiff)) {
    throw new Error("BigTIFF 选项必须是 YES、IF_NEEDED、IF_SAFER 或 NO。");
  }

  if (!["BAND", "PIXEL"].includes(normalizedOptions.interleave)) {
    throw new Error("交错方式必须是 BAND 或 PIXEL。");
  }

  if (
    !Number.isInteger(normalizedOptions.blockSize) ||
    normalizedOptions.blockSize < 128 ||
    normalizedOptions.blockSize > 4096 ||
    normalizedOptions.blockSize % 16 !== 0
  ) {
    throw new Error("块大小必须是 128 到 4096 之间且可被 16 整除的整数。");
  }

  return normalizedOptions;
}

function isFloatingDataType(gdal: GdalModule, dataType: string | null): boolean {
  return (
    dataType === gdal.GDT_Float16 ||
    dataType === gdal.GDT_Float32 ||
    dataType === gdal.GDT_Float64 ||
    dataType === gdal.GDT_CFloat16 ||
    dataType === gdal.GDT_CFloat32 ||
    dataType === gdal.GDT_CFloat64 ||
    dataType?.toLowerCase().includes("float") === true
  );
}

function resolvePredictor(
  gdal: GdalModule,
  requestedPredictor: BipToCogTiffPredictor,
  dataType: string | null
): Exclude<BipToCogTiffPredictor, "AUTO"> {
  if (requestedPredictor !== "AUTO") {
    return requestedPredictor;
  }

  return isFloatingDataType(gdal, dataType) ? "FLOATING_POINT" : "STANDARD";
}

function resolveTargetSrsWkt(gdal: GdalModule, srsInput: string | undefined): string {
  const targetSrs = srsInput?.trim() || DEFAULT_TARGET_SRS;

  try {
    // 先在 worker 内完成坐标系解析，避免 COG 驱动直接解析 EPSG 字符串时受到外部 PROJ 环境影响。
    return gdal.SpatialReference.fromUserInput(targetSrs).toWKT();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`无法导入目标空间参考 ${targetSrs}：${message}`);
  }
}

function buildTranslateArgs(
  gdal: GdalModule,
  metadata: BipToCogTiffMetadata,
  options: Required<BipToCogTiffConversionOptions>,
  request: BipToCogTiffConversionRequest
): string[] {
  const predictor = resolvePredictor(gdal, options.predictor, metadata.dataType);
  const targetSrsWkt = resolveTargetSrsWkt(gdal, request.srs);
  const args = [
    "-of",
    "COG",
    "-co",
    `COMPRESS=${options.compression}`,
    "-co",
    `PREDICTOR=${predictor}`,
    "-co",
    `BLOCKSIZE=${options.blockSize}`,
    "-co",
    `BIGTIFF=${options.bigTiff}`,
    "-co",
    `INTERLEAVE=${options.interleave}`,
    "-co",
    `TARGET_SRS=${targetSrsWkt}`,
  ];

  if (request.overwrite === true) {
    args.push("-overwrite");
  }

  if (request.bounds) {
    args.push(
      "-co",
      `EXTENT=${request.bounds.xmin},${request.bounds.ymin},${request.bounds.xmax},${request.bounds.ymax}`
    );
  }

  return args;
}

async function readMetadata(
  gdal: GdalModule,
  dataset: GdalDataset
): Promise<BipToCogTiffMetadata> {
  const size = await dataset.rasterSizeAsync;
  const bandCount = await dataset.bands.countAsync();
  const firstBand = bandCount > 0 ? await dataset.bands.getAsync(1) : null;
  const dataType = firstBand ? await firstBand.dataTypeAsync : null;
  const geoTransform = await dataset.geoTransformAsync.catch(() => null);
  const spatialReference = await dataset.srsAsync.catch(() => null);

  return {
    driver: dataset.driver.description,
    width: size.x,
    height: size.y,
    bandCount,
    dataType,
    geoTransform,
    srsWkt: spatialReference?.toWKT() ?? null,
    gdalVersion: gdal.version,
  };
}

function closeDataset(dataset: GdalDataset | null): void {
  if (!dataset) {
    return;
  }

  try {
    dataset.close();
  } catch {
    // 关闭失败通常说明底层句柄已经释放，保留原始转换错误即可。
  }
}

function createProgressCallback(
  onLog: ((entry: BipToCogTiffConversionLog) => void) | undefined
): (complete: number, message: string) => void {
  let lastPercent = -1;
  let lastEmittedAt = 0;

  return (complete, message) => {
    const percent = Math.max(0, Math.min(100, Math.round(complete * 100)));
    const now = Date.now();
    const shouldEmit =
      percent === 100 ||
      percent >= lastPercent + 10 ||
      now - lastEmittedAt >= 2500;

    if (!shouldEmit) {
      return;
    }

    lastPercent = percent;
    lastEmittedAt = now;
    emitLog(
      onLog,
      "info",
      `GDAL 转换进度：${percent}%${message ? `，${message}` : ""}`
    );
  };
}

export async function convertBipToCogTiffDirect(
  request: BipToCogTiffConversionRequest,
  onLog?: (entry: BipToCogTiffConversionLog) => void
): Promise<BipToCogTiffConversionResult> {
  const inputPath = path.resolve(request.inputPath);
  const outputDirectory = path.resolve(request.outputDirectory);
  const outputFileName = ensureTiffExtension(
    sanitizeFileName(request.outputFileName ?? makeDefaultCogTiffFileName(inputPath))
  );
  const outputPath = path.join(outputDirectory, outputFileName);
  const tmpDir = request.tmpDir?.trim() ? path.resolve(request.tmpDir) : undefined;
  const options = normalizeOptions(request.options);

  await assertReadableBip(inputPath);
  await ensureDirectory(outputDirectory, "输出位置");

  if (tmpDir) {
    await ensureDirectory(tmpDir, "临时目录");
  }

  if (request.overwrite !== true && (await pathExists(outputPath))) {
    throw new Error(`输出文件已存在，请改名后重试：${outputPath}`);
  }

  const header = await findEnviHeader(inputPath);
  if (!header.exists) {
    emitLog(
      onLog,
      "warning",
      `未找到 ENVI HDR 头文件：${header.path ?? `${inputPath}.hdr`}，GDAL 可能无法识别 BIP 数据。`
    );
  }

  const gdal = loadGdal();
  let sourceDataset: GdalDataset | null = null;
  let outputDataset: GdalDataset | null = null;

  try {
    gdal.config.set("GDAL_NUM_THREADS", "ALL_CPUS");
    if (tmpDir) {
      gdal.config.set("CPL_TMPDIR", tmpDir);
    }

    emitLog(onLog, "info", `输入文件：${inputPath}`);
    emitLog(onLog, "info", `输出文件：${outputPath}`);
    emitLog(onLog, "info", `GDAL 版本：${gdal.version}`);

    // ENVI 驱动会根据 result.bip 或 result.bip.hdr 组合读取 BIP 栅格。
    sourceDataset = await gdal.openAsync(inputPath, "r", "ENVI");
    const metadata = await readMetadata(gdal, sourceDataset);
    const translateArgs = buildTranslateArgs(gdal, metadata, options, request);

    emitLog(
      onLog,
      "info",
      `源数据：${metadata.width} x ${metadata.height}，${metadata.bandCount} 波段，${metadata.dataType ?? "未知类型"}。`
    );

    outputDataset = await gdal.translateAsync(outputPath, sourceDataset, translateArgs, {
      progress_cb: createProgressCallback(onLog),
    });

    // translateAsync 返回仍打开的 dataset，flush/close 后才能稳定访问输出文件。
    await outputDataset.flushAsync();
    closeDataset(outputDataset);
    outputDataset = null;
    closeDataset(sourceDataset);
    sourceDataset = null;

    const outputStat = await fs.stat(outputPath);
    emitLog(onLog, "success", `COGTiff 已生成：${outputPath}`);

    return {
      inputPath,
      outputPath,
      outputDirectory,
      outputFileName,
      outputSizeBytes: outputStat.size,
      hdrPath: header.path,
      hasHdr: header.exists,
      metadata,
      translateArgs,
    };
  } catch (error) {
    closeDataset(outputDataset);
    closeDataset(sourceDataset);
    throw error;
  }
}

export async function convertBipToCogTiff(
  request: BipToCogTiffConversionRequest,
  onLog?: (entry: BipToCogTiffConversionLog) => void
): Promise<BipToCogTiffConversionResult> {
  // Electron 36 在 Windows 下直接加载 gdal-async 会遇到原生 ABI 链接问题。
  // 因此 main 进程只负责调度，实际 GDAL 调用交给同侧 Node 22 worker。
  return runBipToCogTiffWorker(request, onLog);
}
