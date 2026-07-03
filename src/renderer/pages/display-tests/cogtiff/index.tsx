import { useEffect, useRef, useState } from "react";
import {
  Cartesian3,
  Cartographic,
  ImageryLayer,
  Ion,
  Math as CesiumMath,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Terrain,
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

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function setDefaultView(viewer: CesiumViewer): void {
  viewer.camera.setView({
    destination: Cartesian3.fromDegrees(104, 32, 18_000_000),
  });
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

function BandLineChart({ values }: { values: CogTiffBandValue[] }) {
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
    .filter((item): item is CogTiffBandValue & { x: number; y: number } =>
      Boolean(item)
    );

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
      <polyline
        className="cogtiff-chart__line"
        points={points.map((point) => `${point.x},${point.y}`).join(" ")}
      />
      {points.map((point) => (
        <circle
          className="cogtiff-chart__point"
          cx={point.x}
          cy={point.y}
          r="3.5"
          key={point.band}
        />
      ))}
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
    </svg>
  );
}

export function CogTiffTestPage() {
  const { token, hasToken } = useCesiumIonAuth();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<CesiumViewer | null>(null);
  const layerRef = useRef<ImageryLayer | null>(null);
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
      clickHandler.destroy();
      if (viewerRef.current) {
        viewerRef.current.destroy();
      }
      viewerRef.current = null;
    };
  }, [hasToken, token]);

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
                <label className="field-group">
                  <span className="field-label">波段</span>
                  <input
                    className="number-input"
                    type="number"
                    min="1"
                    max={bandCount}
                    value={renderConfig.singleBand}
                    onChange={(event) =>
                      updateBandValue("singleBand", event.target.value)
                    }
                    disabled={isBusy}
                  />
                </label>
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
                <label className="field-group">
                  <span className="field-label">R</span>
                  <input
                    className="number-input"
                    type="number"
                    min="1"
                    max={bandCount}
                    value={renderConfig.redBand}
                    onChange={(event) =>
                      updateBandValue("redBand", event.target.value)
                    }
                    disabled={isBusy}
                  />
                </label>
                <label className="field-group">
                  <span className="field-label">G</span>
                  <input
                    className="number-input"
                    type="number"
                    min="1"
                    max={bandCount}
                    value={renderConfig.greenBand}
                    onChange={(event) =>
                      updateBandValue("greenBand", event.target.value)
                    }
                    disabled={isBusy}
                  />
                </label>
                <label className="field-group">
                  <span className="field-label">B</span>
                  <input
                    className="number-input"
                    type="number"
                    min="1"
                    max={bandCount}
                    value={renderConfig.blueBand}
                    onChange={(event) =>
                      updateBandValue("blueBand", event.target.value)
                    }
                    disabled={isBusy}
                  />
                </label>
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
