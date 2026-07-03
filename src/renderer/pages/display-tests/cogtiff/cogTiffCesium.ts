import {
  ImageryLayer,
  Math as CesiumMath,
  type ImageryProvider,
  type Viewer,
} from "cesium";
import {
  fromUrl,
  type GeoTIFF,
  type GeoTIFFImage,
  type RemoteSourceOptions,
  type TypedArrayArrayWithDimensions,
} from "geotiff";
import {
  TIFFImageryProvider,
  type TIFFImageryProviderRenderOptions,
} from "tiff-imagery-provider";

export const COGTIFF_COLOR_SCALES = [
  "viridis",
  "turbo",
  "rainbow",
  "jet",
  "greys",
  "magma",
  "plasma",
  "inferno",
  "ylgnbu",
  "earth",
] as const;

export type CogTiffColorScaleName = (typeof COGTIFF_COLOR_SCALES)[number];
export type CogTiffRenderMode = "single" | "rgb";

export type CogTiffRenderConfig = {
  mode: CogTiffRenderMode;
  singleBand: number;
  colorScale: CogTiffColorScaleName;
  useCustomDomain: boolean;
  domainMin: number;
  domainMax: number;
  redBand: number;
  greenBand: number;
  blueBand: number;
};

export type CogTiffBandStats = {
  min: number;
  max: number;
};

export type CogTiffMetadata = {
  width: number;
  height: number;
  bandCount: number;
  bandStats: Record<number, CogTiffBandStats>;
  tileWidth: number;
  tileHeight: number;
  bbox: [number, number, number, number] | null;
  epsgCode: number | null;
  noData: number | null;
};

export type CogTiffLoadedLayer = {
  layer: ImageryLayer;
  provider: TIFFImageryProvider;
  metadata: CogTiffMetadata;
};

export type CogTiffBandValue = {
  band: number;
  value: number | null;
};

export type CogTiffPointQueryResult = {
  longitude: number;
  latitude: number;
  pixelX: number;
  pixelY: number;
  values: CogTiffBandValue[];
};

const WEB_MERCATOR_EPSG_CODES = new Set([3857, 900913]);
const WEB_MERCATOR_MAX_LATITUDE = 85.05112878;
const WGS84_MAJOR_RADIUS = 6_378_137;

const COG_REQUEST_OPTIONS: RemoteSourceOptions = {
  // geotiff.js 中 maxRanges=0 表示不合并多段 Range，请求更容易被教学环境观察。
  maxRanges: 0,
  // Electron 自定义协议已支持 Range；普通 Web 环境建议由静态服务器返回 206。
  allowFullFile: false,
};

const cogTiffCache = new Map<string, Promise<GeoTIFF>>();
const metadataCache = new Map<string, Promise<CogTiffMetadata>>();

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeBand(value: number, bandCount?: number): number {
  const maxBand = bandCount && bandCount > 0 ? bandCount : Number.MAX_SAFE_INTEGER;

  if (!Number.isFinite(value)) {
    return 1;
  }

  return clamp(Math.round(value), 1, maxBand);
}

function ensureUsableStats(stats: CogTiffBandStats): CogTiffBandStats {
  if (stats.min === stats.max) {
    return {
      min: stats.min,
      max: stats.max + 1,
    };
  }

  return stats;
}

function readBandStatsFromGdal(
  value: Record<string, unknown> | null
): CogTiffBandStats | null {
  const minValue = value?.STATISTICS_MINIMUM;
  const maxValue = value?.STATISTICS_MAXIMUM;
  const min =
    typeof minValue === "number" ? minValue : Number.parseFloat(String(minValue));
  const max =
    typeof maxValue === "number" ? maxValue : Number.parseFloat(String(maxValue));

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return null;
  }

  return ensureUsableStats({ min, max });
}

function readEpsgCode(geoKeys: Record<string, unknown> | null): number | null {
  const projectedCode = geoKeys?.ProjectedCSTypeGeoKey;
  const geographicCode = geoKeys?.GeographicTypeGeoKey;
  const code = typeof projectedCode === "number" ? projectedCode : geographicCode;

  return typeof code === "number" ? code : null;
}

function readBoundingBox(image: {
  getBoundingBox: () => number[];
}): [number, number, number, number] | null {
  try {
    const bbox = image.getBoundingBox();

    if (bbox.length < 4 || bbox.some((value) => !Number.isFinite(value))) {
      return null;
    }

    return [bbox[0], bbox[1], bbox[2], bbox[3]];
  } catch {
    return null;
  }
}

function openCogTiff(url: string): Promise<GeoTIFF> {
  const cached = cogTiffCache.get(url);

  if (cached) {
    return cached;
  }

  const request = fromUrl(url, COG_REQUEST_OPTIONS);
  cogTiffCache.set(url, request);
  return request;
}

async function estimateBandStatsFromOverview(
  tiff: GeoTIFF,
  bandCount: number,
  noData: number | null
): Promise<Record<number, CogTiffBandStats>> {
  try {
    const imageCount = await tiff.getImageCount();
    const overviewImage = await tiff.getImage(Math.max(imageCount - 1, 0));
    const rasters = (await overviewImage.readRasters({
      interleave: false,
    })) as TypedArrayArrayWithDimensions;
    const stats: Record<number, CogTiffBandStats> = {};

    Array.from({ length: bandCount }, (_, index) => {
      const values = rasters[index];
      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;

      if (!values) {
        return;
      }

      for (const value of values) {
        if (
          !Number.isFinite(value) ||
          (noData !== null && Object.is(value, noData))
        ) {
          continue;
        }

        min = Math.min(min, value);
        max = Math.max(max, value);
      }

      if (Number.isFinite(min) && Number.isFinite(max)) {
        stats[index + 1] = ensureUsableStats({ min, max });
      }
    });

    return stats;
  } catch {
    return {};
  }
}

async function readBandStats(
  tiff: GeoTIFF,
  image: GeoTIFFImage,
  bandCount: number,
  noData: number | null
): Promise<Record<number, CogTiffBandStats>> {
  const metadataStatsEntries = await Promise.all(
    Array.from({ length: bandCount }, async (_, index) => {
      const stats = readBandStatsFromGdal(
        (await image.getGDALMetadata(index)) as Record<string, unknown> | null
      );

      return [index + 1, stats] as const;
    })
  );
  const metadataStats: Record<number, CogTiffBandStats> = {};
  const missingBands: number[] = [];

  metadataStatsEntries.forEach(([band, stats]) => {
    if (stats) {
      metadataStats[band] = stats;
    } else {
      missingBands.push(band);
    }
  });

  if (missingBands.length === 0) {
    return metadataStats;
  }

  return {
    ...(await estimateBandStatsFromOverview(tiff, bandCount, noData)),
    ...metadataStats,
  };
}

function lonLatToSourceCoordinate(
  longitude: number,
  latitude: number,
  epsgCode: number | null
): [number, number] {
  if (!epsgCode || epsgCode === 4326) {
    return [longitude, latitude];
  }

  if (WEB_MERCATOR_EPSG_CODES.has(epsgCode)) {
    const safeLatitude = clamp(
      latitude,
      -WEB_MERCATOR_MAX_LATITUDE,
      WEB_MERCATOR_MAX_LATITUDE
    );
    const x = WGS84_MAJOR_RADIUS * CesiumMath.toRadians(longitude);
    const y =
      WGS84_MAJOR_RADIUS *
      Math.log(Math.tan(Math.PI / 4 + CesiumMath.toRadians(safeLatitude) / 2));

    return [x, y];
  }

  // TIFFImageryProvider 可通过 projFunc 支持更多投影；此教学页只内置最常见两类坐标系。
  throw new Error(`当前查询示例暂不支持 EPSG:${epsgCode}，请为该投影接入 proj4。`);
}

function lonLatToPixel(
  metadata: CogTiffMetadata,
  longitude: number,
  latitude: number
): { pixelX: number; pixelY: number } {
  if (!metadata.bbox) {
    throw new Error("当前 COGTiff 缺少可用于查询的地理范围信息。");
  }

  const [minX, minY, maxX, maxY] = metadata.bbox;
  const [sourceX, sourceY] = lonLatToSourceCoordinate(
    longitude,
    latitude,
    metadata.epsgCode
  );

  if (
    sourceX < minX ||
    sourceX > maxX ||
    sourceY < minY ||
    sourceY > maxY
  ) {
    throw new Error("点击位置不在当前 COGTiff 影像范围内。");
  }

  // GeoTIFF 的 bbox 是地理坐标范围；readRasters 的 window 使用左上角为原点的像素坐标。
  const pixelX = Math.floor(((sourceX - minX) / (maxX - minX)) * metadata.width);
  const pixelY = Math.floor(((maxY - sourceY) / (maxY - minY)) * metadata.height);

  return {
    pixelX: clamp(pixelX, 0, metadata.width - 1),
    pixelY: clamp(pixelY, 0, metadata.height - 1),
  };
}

function createSingleBandOptions(
  config: CogTiffRenderConfig,
  bandCount?: number
): TIFFImageryProviderRenderOptions {
  const single: NonNullable<TIFFImageryProviderRenderOptions["single"]> = {
    band: normalizeBand(config.singleBand, bandCount),
    colorScale: config.colorScale,
    type: "continuous",
  };

  if (
    config.useCustomDomain &&
    Number.isFinite(config.domainMin) &&
    Number.isFinite(config.domainMax) &&
    config.domainMin < config.domainMax
  ) {
    single.domain = [config.domainMin, config.domainMax];
  }

  return {
    single,
    resampleMethod: "nearest",
  };
}

function createRgbOptions(
  config: CogTiffRenderConfig,
  metadata?: Pick<CogTiffMetadata, "bandCount" | "bandStats">
): TIFFImageryProviderRenderOptions {
  const redBand = normalizeBand(config.redBand, metadata?.bandCount);
  const greenBand = normalizeBand(config.greenBand, metadata?.bandCount);
  const blueBand = normalizeBand(config.blueBand, metadata?.bandCount);
  const redStats = metadata?.bandStats[redBand];
  const greenStats = metadata?.bandStats[greenBand];
  const blueStats = metadata?.bandStats[blueBand];

  return {
    multi: {
      r: { band: redBand, min: redStats?.min, max: redStats?.max },
      g: { band: greenBand, min: greenStats?.min, max: greenStats?.max },
      b: { band: blueBand, min: blueStats?.min, max: blueStats?.max },
    },
    resampleMethod: "nearest",
  };
}

export function createCogTiffRenderOptions(
  config: CogTiffRenderConfig,
  metadata?: Pick<CogTiffMetadata, "bandCount" | "bandStats">
): TIFFImageryProviderRenderOptions {
  return config.mode === "single"
    ? createSingleBandOptions(config, metadata?.bandCount)
    : createRgbOptions(config, metadata);
}

export async function readCogTiffMetadata(
  url: string
): Promise<CogTiffMetadata> {
  const cached = metadataCache.get(url);

  if (cached) {
    return cached;
  }

  const request = openCogTiff(url).then(async (tiff) => {
    const image = await tiff.getImage();
    const geoKeys = image.getGeoKeys() as Record<string, unknown> | null;
    const bandCount = image.getSamplesPerPixel();
    const noData = image.getGDALNoData();

    return {
      width: image.getWidth(),
      height: image.getHeight(),
      bandCount,
      bandStats: await readBandStats(tiff, image, bandCount, noData),
      tileWidth: image.getTileWidth(),
      tileHeight: image.getTileHeight(),
      bbox: readBoundingBox(image),
      epsgCode: readEpsgCode(geoKeys),
      noData,
    };
  });

  metadataCache.set(url, request);
  return request;
}

export async function loadCogTiffLayer(
  viewer: Viewer,
  url: string,
  config: CogTiffRenderConfig,
  metadata?: CogTiffMetadata
): Promise<CogTiffLoadedLayer> {
  // 普通 Web 环境不需要 Electron：把文件放入 public/cog/demo.tif 后，url 传 "/cog/demo.tif" 即可。
  // Electron 环境中，本页 url 来自主进程注册的 gis-cogtiff:// 协议，文件字节仍由 Main 进程读取。
  const provider = await TIFFImageryProvider.fromUrl(url, {
    enablePickFeatures: true,
    requestOptions: COG_REQUEST_OPTIONS,
    renderOptions: createCogTiffRenderOptions(config, metadata),
  });
  const layer = viewer.imageryLayers.addImageryProvider(
    provider as unknown as ImageryProvider
  );
  const loadedMetadata = metadata ?? (await readCogTiffMetadata(url));

  return {
    layer,
    provider,
    metadata: loadedMetadata,
  };
}

export function removeCogTiffLayer(viewer: Viewer, layer: ImageryLayer): void {
  viewer.imageryLayers.remove(layer, true);
}

export function zoomToCogTiffLayer(
  viewer: Viewer,
  provider: TIFFImageryProvider
): void {
  viewer.camera.flyTo({
    destination: provider.rectangle,
    duration: 0.7,
  });
}

export async function queryCogTiffPointValues(
  url: string,
  longitude: number,
  latitude: number
): Promise<CogTiffPointQueryResult> {
  const [tiff, metadata] = await Promise.all([
    openCogTiff(url),
    readCogTiffMetadata(url),
  ]);
  const image = await tiff.getImage();
  const { pixelX, pixelY } = lonLatToPixel(metadata, longitude, latitude);

  // 默认 samples 为空时，geotiff.js 会读取该像素的全部波段样本。
  const rasters = (await image.readRasters({
    window: [pixelX, pixelY, pixelX + 1, pixelY + 1],
    interleave: false,
  })) as TypedArrayArrayWithDimensions;

  return {
    longitude,
    latitude,
    pixelX,
    pixelY,
    values: Array.from({ length: metadata.bandCount }, (_, index) => {
      const rawValue = rasters[index]?.[0];
      const value = typeof rawValue === "number" && Number.isFinite(rawValue)
        ? rawValue
        : null;

      return {
        band: index + 1,
        value,
      };
    }),
  };
}
