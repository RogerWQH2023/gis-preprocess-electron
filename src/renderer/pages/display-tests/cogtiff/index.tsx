import { useCallback, useEffect, useRef, useState } from "react";
import {
  Cartesian3,
  Cartographic,
  Entity,
  HeightReference,
  ImageryLayer,
  Ion,
  Math as CesiumMath,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Terrain,
  VerticalOrigin,
  Viewer,
  type Viewer as CesiumViewer,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";

import { useCesiumIonAuth } from "../../../cesiumIonAuthContext";
import {
  COGTIFF_COLOR_SCALES,
  loadCogTiffLayer,
  queryCogTiffPointValues,
  readCogTiffMetadata,
  removeCogTiffLayer,
  zoomToCogTiffLayer,
  type CogTiffBandValue,
  type CogTiffColorScaleName,
  type CogTiffMetadata,
  type CogTiffPointQueryResult,
  type CogTiffRenderConfig,
  type CogTiffRenderMode,
} from "./cogTiffCesium";
import "./styles.css";

type LoadStatus = "idle" | "loading" | "loaded" | "error";
type QueryStatus = "idle" | "querying" | "done" | "error";

type LoadedCogTiffInfo = {
  name: string;
  path: string;
  url: string;
  sizeBytes: number;
  metadata: CogTiffMetadata;
};

type ChartHoverPoint = CogTiffBandValue & {
  x: number;
  y: number;
};

const defaultRenderConfig: CogTiffRenderConfig = {
  mode: "single",
  singleBand: 1,
  colorScale: "viridis",
  useCustomDomain: false,
  domainMin: 0,
  domainMax: 255,
  redBand: 1,
  greenBand: 2,
  blueBand: 3,
};

const statusText: Record<LoadStatus, string> = {
  idle: "待加载",
  loading: "加载中",
  loaded: "已加载",
  error: "加载失败",
};
const statusPillClass: Record<LoadStatus, string> = {
  idle: "idle",
  loading: "running",
  loaded: "success",
  error: "error",
};

let crosshairImageDataUrl: string | null = null;

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function setDefaultView(viewer: CesiumViewer): void {
  viewer.camera.setView({
    destination: Cartesian3.fromDegrees(104, 32, 18_000_000),
  });
}

function getCrosshairImageDataUrl(): string {
  if (crosshairImageDataUrl) {
    return crosshairImageDataUrl;
  }

  const size = 40;
  const center = size / 2;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  canvas.width = size;
  canvas.height = size;

  if (!context) {
    return "";
  }

  context.clearRect(0, 0, size, size);
  context.strokeStyle = "#ffffff";
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(center, 4);
  context.lineTo(center, 14);
  context.moveTo(center, 26);
  context.lineTo(center, 36);
  context.moveTo(4, center);
  context.lineTo(14, center);
  context.moveTo(26, center);
  context.lineTo(36, center);
  context.stroke();

  context.strokeStyle = "#d92d20";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(center, 4);
  context.lineTo(center, 14);
  context.moveTo(center, 26);
  context.lineTo(center, 36);
  context.moveTo(4, center);
  context.lineTo(14, center);
  context.moveTo(26, center);
  context.lineTo(36, center);
  context.stroke();
  context.beginPath();
  context.arc(center, center, 5, 0, Math.PI * 2);
  context.stroke();

  crosshairImageDataUrl = canvas.toDataURL("image/png");
  return crosshairImageDataUrl;
}

function clampBand(value: number, bandCount: number): number {
  return Math.min(Math.max(Math.round(value), 1), Math.max(bandCount, 1));
}

function normalizeRenderConfig(
  config: CogTiffRenderConfig,
  bandCount: number
): CogTiffRenderConfig {
  return {
    ...config,
    singleBand: clampBand(config.singleBand, bandCount),
    redBand: clampBand(config.redBand, bandCount),
    greenBand: clampBand(config.greenBand, bandCount),
    blueBand: clampBand(config.blueBand, bandCount),
  };
}

function validateRenderConfig(
  config: CogTiffRenderConfig,
  metadata: CogTiffMetadata
): void {
  if (config.mode !== "rgb") {
    return;
  }

  if (metadata.bandCount < 3) {
    throw new Error(
      `当前 COGTiff 只有 ${metadata.bandCount} 个波段，RGB 渲染需要至少 3 个波段。请使用单波段渲染。`
    );
  }

  const selectedBands = [config.redBand, config.greenBand, config.blueBand];
  const uniqueBandCount = new Set(selectedBands).size;

  if (uniqueBandCount !== selectedBands.length) {
    throw new Error(
      "TIFFImageryProvider 的 RGB 渲染不支持重复通道，请为 R、G、B 选择 3 个不同波段。"
    );
  }
}

function readNumberInput(value: string, fallback: number): number {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function createBandOptions(bandCount: number | undefined, value: number): number[] {
  const count = bandCount ?? Math.max(Math.round(value), 1);

  return Array.from({ length: count }, (_, index) => index + 1);
}

function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let size = value / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 100 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatValue(value: number | null): string {
  if (value === null) {
    return "NoData";
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(4);
}

function createSmoothPath(points: ChartHoverPoint[]): string {
  if (points.length === 0) {
    return "";
  }

  if (points.length === 1) {
    return `M ${points[0].x - 18} ${points[0].y} L ${points[0].x + 18} ${points[0].y}`;
  }

  return points
    .map((point, index) => {
      if (index === 0) {
        return `M ${point.x} ${point.y}`;
      }

      const previous = points[index - 1];
      const next = points[index + 1] ?? point;
      const beforePrevious = points[index - 2] ?? previous;
      const controlPointStartX = previous.x + (point.x - beforePrevious.x) / 6;
      const controlPointStartY = previous.y + (point.y - beforePrevious.y) / 6;
      const controlPointEndX = point.x - (next.x - previous.x) / 6;
      const controlPointEndY = point.y - (next.y - previous.y) / 6;

      return `C ${controlPointStartX} ${controlPointStartY}, ${controlPointEndX} ${controlPointEndY}, ${point.x} ${point.y}`;
    })
    .join(" ");
}

function BandLineChart({ values }: { values: CogTiffBandValue[] }) {
  const [hoveredPoint, setHoveredPoint] = useState<ChartHoverPoint | null>(
    null
  );
  const width = 360;
  const height = 168;
  const padding = 28;
  const finiteValues = values
    .map((item) => item.value)
    .filter((value): value is number => value !== null);

  if (finiteValues.length === 0) {
    return <div className="cogtiff-chart-empty">当前点无有效波段值</div>;
  }

  const minValue = Math.min(...finiteValues);
  const maxValue = Math.max(...finiteValues);
  const valueRange = maxValue - minValue || 1;
  const points = values
    .map((item, index) => {
      if (item.value === null) {
        return null;
      }

      const x =
        values.length === 1
          ? width / 2
          : padding +
            (index / (values.length - 1)) * (width - padding * 2);
      const y =
        height -
        padding -
        ((item.value - minValue) / valueRange) * (height - padding * 2);

      return { ...item, x, y };
    })
    .filter((item): item is ChartHoverPoint => Boolean(item));
  const pathData = createSmoothPath(points);
  const tooltipX = hoveredPoint
    ? Math.min(Math.max(hoveredPoint.x - 42, padding), width - 92)
    : 0;
  const tooltipY = hoveredPoint
    ? Math.max(hoveredPoint.y - 40, padding - 18)
    : 0;

  return (
    <svg
      className="cogtiff-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="所有波段查询值折线图"
    >
      <line
        className="cogtiff-chart__axis"
        x1={padding}
        y1={height - padding}
        x2={width - padding}
        y2={height - padding}
      />
      <line
        className="cogtiff-chart__axis"
        x1={padding}
        y1={padding}
        x2={padding}
        y2={height - padding}
      />
      <path
        className="cogtiff-chart__line"
        d={pathData}
      />
      <text className="cogtiff-chart__label" x={padding} y={18}>
        {formatValue(maxValue)}
      </text>
      <text className="cogtiff-chart__label" x={padding} y={height - 6}>
        {formatValue(minValue)}
      </text>
      <text
        className="cogtiff-chart__label"
        x={width - padding}
        y={height - 6}
        textAnchor="end"
      >
        B{values.length}
      </text>
      {points.map((point, index) => {
        const nextX = points[index + 1]?.x ?? width - padding;
        const previousX = points[index - 1]?.x ?? padding;
        const startX = index === 0 ? padding : (previousX + point.x) / 2;
        const endX =
          index === points.length - 1 ? width - padding : (point.x + nextX) / 2;

        return (
          <rect
            className="cogtiff-chart__hover-zone"
            x={startX}
            y={padding}
            width={Math.max(endX - startX, 8)}
            height={height - padding * 2}
            onMouseEnter={() => setHoveredPoint(point)}
            onMouseLeave={() => setHoveredPoint(null)}
            key={point.band}
          />
        );
      })}
      {hoveredPoint ? (
        <g className="cogtiff-chart__tooltip">
          <line
            className="cogtiff-chart__hover-line"
            x1={hoveredPoint.x}
            y1={padding}
            x2={hoveredPoint.x}
            y2={height - padding}
          />
          <rect x={tooltipX} y={tooltipY} width="84" height="30" rx="6" />
          <text x={tooltipX + 8} y={tooltipY + 13}>
            B{hoveredPoint.band}
          </text>
          <text x={tooltipX + 8} y={tooltipY + 25}>
            {formatValue(hoveredPoint.value)}
          </text>
        </g>
      ) : null}
    </svg>
  );
}

function BandSelect({
  disabled,
  label,
  onChange,
  value,
  bandCount,
}: {
  disabled: boolean;
  label: string;
  onChange: (value: string) => void;
  value: number;
  bandCount: number | undefined;
}) {
  return (
    <label className="field-group">
      <span className="field-label">{label}</span>
      <select
        className="cogtiff-select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      >
        {createBandOptions(bandCount, value).map((band) => (
          <option value={band} key={band}>
            波段 {band}
          </option>
        ))}
      </select>
    </label>
  );
}

export function CogTiffTestPage() {
  const { token, hasToken } = useCesiumIonAuth();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<CesiumViewer | null>(null);
  const layerRef = useRef<ImageryLayer | null>(null);
  const queryCrosshairRef = useRef<Entity | null>(null);
  const queryUrlRef = useRef<string | null>(null);
  const querySeqRef = useRef(0);
  const cogTiffApi = window.electronAPI?.tools.cogTiff ?? null;
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [renderConfig, setRenderConfig] =
    useState<CogTiffRenderConfig>(defaultRenderConfig);
  const [loadedCogTiff, setLoadedCogTiff] =
    useState<LoadedCogTiffInfo | null>(null);
  const [queryStatus, setQueryStatus] = useState<QueryStatus>("idle");
  const [queryResult, setQueryResult] =
    useState<CogTiffPointQueryResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [queryErrorMessage, setQueryErrorMessage] = useState("");

  const removeQueryCrosshair = useCallback((viewer: CesiumViewer): void => {
    if (!queryCrosshairRef.current) {
      return;
    }

    viewer.entities.remove(queryCrosshairRef.current);
    queryCrosshairRef.current = null;
  }, []);

  const showQueryCrosshair = useCallback(
    (viewer: CesiumViewer, longitude: number, latitude: number): void => {
      removeQueryCrosshair(viewer);

      queryCrosshairRef.current = viewer.entities.add({
        position: Cartesian3.fromDegrees(longitude, latitude),
        billboard: {
          image: getCrosshairImageDataUrl(),
          width: 34,
          height: 34,
          verticalOrigin: VerticalOrigin.CENTER,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    },
    [removeQueryCrosshair]
  );

  useEffect(() => {
    if (!containerRef.current || viewerRef.current) {
      return;
    }

    setLoadedCogTiff(null);
    setStatus("idle");
    setErrorMessage("");
    Ion.defaultAccessToken = token;

    const viewer = new Viewer(containerRef.current, {
      animation: false,
      baseLayer: hasToken ? ImageryLayer.fromWorldImagery({}) : false,
      baseLayerPicker: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      navigationHelpButton: false,
      sceneModePicker: false,
      selectionIndicator: false,
      terrain: hasToken ? Terrain.fromWorldTerrain() : undefined,
      timeline: false,
    });
    const clickHandler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    let disposed = false;

    clickHandler.setInputAction(
      (event: ScreenSpaceEventHandler.PositionedEvent) => {
        const url = queryUrlRef.current;
        const cartesian = viewer.camera.pickEllipsoid(
          event.position,
          viewer.scene.globe.ellipsoid
        );

        if (!url || !cartesian) {
          return;
        }

        const cartographic = Cartographic.fromCartesian(cartesian);
        const longitude = CesiumMath.toDegrees(cartographic.longitude);
        const latitude = CesiumMath.toDegrees(cartographic.latitude);
        const querySeq = querySeqRef.current + 1;

        showQueryCrosshair(viewer, longitude, latitude);
        querySeqRef.current = querySeq;
        setQueryStatus("querying");
        setQueryErrorMessage("");

        void queryCogTiffPointValues(url, longitude, latitude)
          .then((result) => {
            if (disposed || querySeq !== querySeqRef.current) {
              return;
            }

            setQueryResult(result);
            setQueryStatus("done");
          })
          .catch((error: unknown) => {
            if (disposed || querySeq !== querySeqRef.current) {
              return;
            }

            setQueryStatus("error");
            setQueryErrorMessage(readErrorMessage(error));
          });
      },
      ScreenSpaceEventType.LEFT_CLICK
    );

    setDefaultView(viewer);
    viewerRef.current = viewer;

    return () => {
      disposed = true;
      queryUrlRef.current = null;
      layerRef.current = null;
      queryCrosshairRef.current = null;
      clickHandler.destroy();
      if (viewerRef.current) {
        viewerRef.current.destroy();
      }
      viewerRef.current = null;
    };
  }, [hasToken, showQueryCrosshair, token]);

  async function loadSelectedCogTiff(
    selection: {
      name: string;
      path: string;
      url: string;
      sizeBytes: number;
    },
    config: CogTiffRenderConfig
  ): Promise<void> {
    const viewer = viewerRef.current;

    if (!viewer) {
      return;
    }

    const metadata = await readCogTiffMetadata(selection.url);
    const safeConfig = normalizeRenderConfig(config, metadata.bandCount);

    validateRenderConfig(safeConfig, metadata);
    setRenderConfig(safeConfig);

    if (layerRef.current) {
      removeCogTiffLayer(viewer, layerRef.current);
      layerRef.current = null;
    }

    const loaded = await loadCogTiffLayer(
      viewer,
      selection.url,
      safeConfig,
      metadata
    );

    layerRef.current = loaded.layer;
    queryUrlRef.current = selection.url;
    setLoadedCogTiff({
      name: selection.name,
      path: selection.path,
      url: selection.url,
      sizeBytes: selection.sizeBytes,
      metadata: loaded.metadata,
    });
    setQueryResult(null);
    setQueryStatus("idle");
    setQueryErrorMessage("");
    removeQueryCrosshair(viewer);
    zoomToCogTiffLayer(viewer, loaded.provider);
  }

  async function handleSelectAndLoadCogTiff(): Promise<void> {
    if (!cogTiffApi || !viewerRef.current) {
      return;
    }

    try {
      const selection = await cogTiffApi.selectFile();

      if (selection.canceled) {
        return;
      }

      setStatus("loading");
      setLoadedCogTiff(null);
      setErrorMessage("");
      await loadSelectedCogTiff(selection, renderConfig);
      setStatus("loaded");
    } catch (error) {
      queryUrlRef.current = null;
      setStatus("error");
      setErrorMessage(readErrorMessage(error));
    }
  }

  async function handleApplyRenderConfig(): Promise<void> {
    if (!loadedCogTiff || status === "loading") {
      return;
    }

    try {
      setStatus("loading");
      setErrorMessage("");
      await loadSelectedCogTiff(loadedCogTiff, renderConfig);
      setStatus("loaded");
    } catch (error) {
      setStatus("error");
      setErrorMessage(readErrorMessage(error));
    }
  }

  function handleClearCogTiff(): void {
    const viewer = viewerRef.current;

    if (!viewer) {
      return;
    }

    if (layerRef.current) {
      removeCogTiffLayer(viewer, layerRef.current);
      layerRef.current = null;
    }

    removeQueryCrosshair(viewer);
    queryUrlRef.current = null;
    setLoadedCogTiff(null);
    setQueryResult(null);
    setQueryStatus("idle");
    setQueryErrorMessage("");
    setStatus("idle");
    setErrorMessage("");
    setDefaultView(viewer);
  }

  function updateRenderMode(mode: CogTiffRenderMode): void {
    setRenderConfig((current) => ({ ...current, mode }));
  }

  function updateBandValue(
    key: "singleBand" | "redBand" | "greenBand" | "blueBand",
    value: string
  ): void {
    const bandCount = loadedCogTiff?.metadata.bandCount ?? 99;

    setRenderConfig((current) => ({
      ...current,
      [key]: clampBand(readNumberInput(value, current[key]), bandCount),
    }));
  }

  const bandCount = loadedCogTiff?.metadata.bandCount;
  const isBusy = status === "loading";
  const isRgbUnavailable = bandCount !== undefined && bandCount < 3;

  return (
    <section className="cesium-test-page" aria-labelledby="cogtiff-test-title">
      <div className="cesium-stage">
        <div className="cesium-stage__viewer" ref={containerRef} />
        <div className="cogtiff-stage__panel">
          <div className="cesium-stage__panel-header">
            <div>
              <p className="workspace__eyebrow">TIFFImageryProvider</p>
              <h2 id="cogtiff-test-title">COGTiff 加载测试</h2>
            </div>
            <span
              className={`status-pill status-pill--${statusPillClass[status]}`}
            >
              {statusText[status]}
            </span>
          </div>

          {!cogTiffApi ? (
            <p className="runtime-warning">
              请在 Electron 桌面环境中选择本地 COGTiff 文件。
            </p>
          ) : null}

          <div className="converter-actions">
            <button
              className="primary-button"
              type="button"
              onClick={handleSelectAndLoadCogTiff}
              disabled={!cogTiffApi || isBusy}
            >
              选择并加载 COGTiff
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={handleApplyRenderConfig}
              disabled={!loadedCogTiff || isBusy}
            >
              应用渲染配置
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={handleClearCogTiff}
              disabled={!loadedCogTiff || isBusy}
            >
              清除影像
            </button>
          </div>

          <section className="cogtiff-panel-section" aria-label="渲染配置">
            <div className="field-group">
              <span className="field-label">渲染模式</span>
              <div className="segmented-control">
                <button
                  type="button"
                  aria-pressed={renderConfig.mode === "single"}
                  onClick={() => updateRenderMode("single")}
                  disabled={isBusy}
                >
                  单波段
                </button>
                <button
                  type="button"
                  aria-pressed={renderConfig.mode === "rgb"}
                  onClick={() => updateRenderMode("rgb")}
                  disabled={isBusy || isRgbUnavailable}
                >
                  多波段 RGB
                </button>
              </div>
            </div>

            {renderConfig.mode === "single" ? (
              <div className="cogtiff-band-grid">
                <BandSelect
                  label="波段"
                  value={renderConfig.singleBand}
                  bandCount={bandCount}
                  onChange={(value) => updateBandValue("singleBand", value)}
                  disabled={isBusy}
                />
                <label className="field-group">
                  <span className="field-label">色带</span>
                  <select
                    className="cogtiff-select"
                    value={renderConfig.colorScale}
                    onChange={(event) =>
                      setRenderConfig((current) => ({
                        ...current,
                        colorScale: event.target.value as CogTiffColorScaleName,
                      }))
                    }
                    disabled={isBusy}
                  >
                    {COGTIFF_COLOR_SCALES.map((colorScale) => (
                      <option value={colorScale} key={colorScale}>
                        {colorScale}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="cogtiff-checkbox-row">
                  <input
                    type="checkbox"
                    checked={renderConfig.useCustomDomain}
                    onChange={(event) =>
                      setRenderConfig((current) => ({
                        ...current,
                        useCustomDomain: event.target.checked,
                      }))
                    }
                    disabled={isBusy}
                  />
                  <span>自定义值域</span>
                </label>
                <div className="cogtiff-domain-grid">
                  <label className="field-group">
                    <span className="field-label">最小值</span>
                    <input
                      className="number-input"
                      type="number"
                      value={renderConfig.domainMin}
                      onChange={(event) =>
                        setRenderConfig((current) => ({
                          ...current,
                          domainMin: readNumberInput(
                            event.target.value,
                            current.domainMin
                          ),
                        }))
                      }
                      disabled={isBusy || !renderConfig.useCustomDomain}
                    />
                  </label>
                  <label className="field-group">
                    <span className="field-label">最大值</span>
                    <input
                      className="number-input"
                      type="number"
                      value={renderConfig.domainMax}
                      onChange={(event) =>
                        setRenderConfig((current) => ({
                          ...current,
                          domainMax: readNumberInput(
                            event.target.value,
                            current.domainMax
                          ),
                        }))
                      }
                      disabled={isBusy || !renderConfig.useCustomDomain}
                    />
                  </label>
                </div>
              </div>
            ) : (
              <div className="cogtiff-band-grid cogtiff-band-grid--rgb">
                <BandSelect
                  label="R"
                  value={renderConfig.redBand}
                  bandCount={bandCount}
                  onChange={(value) => updateBandValue("redBand", value)}
                  disabled={isBusy}
                />
                <BandSelect
                  label="G"
                  value={renderConfig.greenBand}
                  bandCount={bandCount}
                  onChange={(value) => updateBandValue("greenBand", value)}
                  disabled={isBusy}
                />
                <BandSelect
                  label="B"
                  value={renderConfig.blueBand}
                  bandCount={bandCount}
                  onChange={(value) => updateBandValue("blueBand", value)}
                  disabled={isBusy}
                />
              </div>
            )}
          </section>

          {loadedCogTiff ? (
            <dl className="cogtiff-details">
              <div>
                <dt>文件</dt>
                <dd>{loadedCogTiff.name}</dd>
              </div>
              <div>
                <dt>大小</dt>
                <dd>{formatBytes(loadedCogTiff.sizeBytes)}</dd>
              </div>
              <div>
                <dt>尺寸</dt>
                <dd>
                  {loadedCogTiff.metadata.width} x {loadedCogTiff.metadata.height}
                </dd>
              </div>
              <div>
                <dt>波段</dt>
                <dd>{loadedCogTiff.metadata.bandCount}</dd>
              </div>
              <div>
                <dt>EPSG</dt>
                <dd>{loadedCogTiff.metadata.epsgCode ?? "未知"}</dd>
              </div>
              <div>
                <dt>路径</dt>
                <dd>{loadedCogTiff.path}</dd>
              </div>
            </dl>
          ) : null}

          <section className="cogtiff-panel-section" aria-label="查询结果">
            <div className="cogtiff-section-heading">
              <strong>点查询</strong>
              <span>{queryStatus === "querying" ? "查询中" : "左键点击"}</span>
            </div>

            {queryResult ? (
              <>
                <p className="cesium-stage__note">
                  Lon {queryResult.longitude.toFixed(6)}, Lat{" "}
                  {queryResult.latitude.toFixed(6)}，像素 (
                  {queryResult.pixelX}, {queryResult.pixelY})
                </p>
                <BandLineChart values={queryResult.values} />
                <div className="cogtiff-value-list">
                  {queryResult.values.map((item) => (
                    <span key={item.band}>
                      B{item.band}: {formatValue(item.value)}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p className="cesium-stage__note">
                加载影像后点击地图，显示该位置所有波段的像元值。
              </p>
            )}

            {queryErrorMessage ? (
              <p className="error-message">{queryErrorMessage}</p>
            ) : null}
          </section>

          <p className="cesium-stage__note">
            普通 Web 项目可把 COG 放入 public/cog/demo.tif，并将加载 URL
            写成 /cog/demo.tif；本页的本地文件选择只服务于 Electron 演示。
          </p>

          {errorMessage ? (
            <p className="error-message">{errorMessage}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
