import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Cartesian3,
  Ion,
  Math as CesiumMath,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
} from "cesium";

import type {
  Cesium3DTileset,
  Viewer as CesiumViewer,
} from "cesium";
import { useCesiumIonAuth } from "../../../../cesiumIonAuthContext";
import { downloadJson } from "../model-control-point-measurement/controlPointModelUtils";
import {
  buildSurfaceExportJson,
  createOsmBuildings,
  createSurfaceControlPoint,
  createSurfacePointId,
  createSurfaceViewer,
  focusSurfaceCoordinate,
  formatSurfaceNumber,
  getPickedCartesian,
  renderSurfaceMarkers,
  setSurfaceDefaultView,
} from "./surfaceCesiumUtils";

import type {
  OsmBuildingsStatus,
  SurfaceControlPoint,
} from "./surfaceTypes";

const osmStatusText: Record<OsmBuildingsStatus, string> = {
  off: "仅底图",
  loading: "加载建筑",
  on: "建筑已加载",
  error: "建筑失败",
};

const osmStatusClass: Record<OsmBuildingsStatus, string> = {
  off: "idle",
  loading: "running",
  on: "success",
  error: "error",
};

function parseLongitudeLatitude(value: string):
  | {
      longitude: number;
      latitude: number;
    }
  | null {
  const parts = value
    .trim()
    .replace(/[，;；]/g, ",")
    .split(/[,\s]+/)
    .filter(Boolean);

  if (parts.length < 2) {
    return null;
  }

  const longitude = Number(parts[0]);
  const latitude = Number(parts[1]);

  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    longitude < -180 ||
    longitude > 180 ||
    latitude < -90 ||
    latitude > 90
  ) {
    return null;
  }

  return { longitude, latitude };
}

type SurfaceControlPointMeasurementProps = {
  modeSwitch: ReactNode;
};

export function SurfaceControlPointMeasurement({
  modeSwitch,
}: SurfaceControlPointMeasurementProps) {
  const { token, hasToken } = useCesiumIonAuth();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<CesiumViewer | null>(null);
  const osmBuildingsRef = useRef<Cesium3DTileset | null>(null);
  const markerIdsRef = useRef<Set<string>>(new Set());
  const surfacePointsRef = useRef<SurfaceControlPoint[]>([]);
  const nextSurfacePointIndexRef = useRef(1);

  const [surfacePoints, setSurfacePoints] = useState<SurfaceControlPoint[]>(
    [],
  );
  const [activePointId, setActivePointId] = useState<string | null>(null);
  const [osmBuildingsStatus, setOsmBuildingsStatus] =
    useState<OsmBuildingsStatus>("off");
  const [coordinateInput, setCoordinateInput] = useState("120.0863, 30.3089");
  const [message, setMessage] = useState(
    "默认定位到浙江大学紫金港校区附近。单击地表或已加载建筑记录控制点。",
  );
  const [errorMessage, setErrorMessage] = useState("");

  const activePoint = useMemo(
    () => surfacePoints.find((point) => point.id === activePointId) ?? null,
    [activePointId, surfacePoints],
  );

  useEffect(() => {
    surfacePointsRef.current = surfacePoints;
  }, [surfacePoints]);

  useEffect(() => {
    if (!containerRef.current || viewerRef.current) {
      return;
    }

    Ion.defaultAccessToken = token;

    const viewer = createSurfaceViewer(containerRef.current, hasToken);
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    const markerIds = markerIdsRef.current;

    viewerRef.current = viewer;
    setSurfaceDefaultView(viewer);
    renderSurfaceMarkers(viewer, markerIds, surfacePointsRef.current);

    handler.setInputAction(
      (movement: ScreenSpaceEventHandler.PositionedEvent) => {
        // 优先拾取真实深度点，失败时工具函数会退回到地球表面拾取。
        const pickedCartesian = getPickedCartesian(viewer, movement.position);

        if (!pickedCartesian) {
          setErrorMessage("当前点击位置无法解析为地表坐标。");
          return;
        }

        const pointId = createSurfacePointId(nextSurfacePointIndexRef.current);
        const nextPoint = createSurfaceControlPoint(pointId, pickedCartesian);

        nextSurfacePointIndexRef.current += 1;
        setSurfacePoints((currentPoints) => [...currentPoints, nextPoint]);
        setActivePointId(pointId);
        setErrorMessage("");
        setMessage(`${pointId} 已记录。`);
      },
      ScreenSpaceEventType.LEFT_CLICK,
    );

    return () => {
      handler.destroy();
      osmBuildingsRef.current = null;
      markerIds.clear();

      if (!viewer.isDestroyed()) {
        viewer.destroy();
      }

      viewerRef.current = null;
    };
  }, [hasToken, token]);

  useEffect(() => {
    const viewer = viewerRef.current;

    if (!viewer) {
      return;
    }

    renderSurfaceMarkers(viewer, markerIdsRef.current, surfacePoints);
  }, [surfacePoints]);

  function handleResetView(): void {
    const viewer = viewerRef.current;

    if (!viewer) {
      return;
    }

    setSurfaceDefaultView(viewer);
    setMessage("视角已重置到浙江大学紫金港校区附近。");
  }

  function handleCoordinateSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const viewer = viewerRef.current;
    const parsedCoordinate = parseLongitudeLatitude(coordinateInput);

    if (!viewer) {
      return;
    }

    if (!parsedCoordinate) {
      setErrorMessage("请输入有效经纬度，格式为：经度, 纬度。");
      return;
    }

    focusSurfaceCoordinate(
      viewer,
      parsedCoordinate.longitude,
      parsedCoordinate.latitude,
    );
    setErrorMessage("");
    setMessage(
      `已移动到 ${formatSurfaceNumber(parsedCoordinate.longitude, 6)}, ${formatSurfaceNumber(
        parsedCoordinate.latitude,
        6,
      )}。`,
    );
  }

  async function handleToggleOsmBuildings(): Promise<void> {
    const viewer = viewerRef.current;

    if (!viewer || osmBuildingsStatus === "loading") {
      return;
    }

    if (osmBuildingsRef.current) {
      viewer.scene.primitives.remove(osmBuildingsRef.current);
      osmBuildingsRef.current = null;
      setOsmBuildingsStatus("off");
      setMessage("OSM 建筑已关闭，当前仅显示底图和地形。");
      return;
    }

    if (!hasToken) {
      setOsmBuildingsStatus("error");
      setErrorMessage("需要先配置 Cesium ion token 才能加载 OSM 建筑。");
      return;
    }

    try {
      setOsmBuildingsStatus("loading");
      setErrorMessage("");
      setMessage("正在加载 OSM 建筑。");

      const buildings = await createOsmBuildings();

      if (viewerRef.current !== viewer || viewer.isDestroyed()) {
        return;
      }

      viewer.scene.primitives.add(buildings);
      osmBuildingsRef.current = buildings;
      setOsmBuildingsStatus("on");
      setMessage("OSM 建筑已加载，单击建筑表面也会记录控制点。");
    } catch (error) {
      setOsmBuildingsStatus("error");
      setErrorMessage(error instanceof Error ? error.message : String(error));
      setMessage("OSM 建筑加载失败。");
    }
  }

  function handleFlyToPoint(point: SurfaceControlPoint): void {
    const viewer = viewerRef.current;

    if (!viewer) {
      return;
    }

    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(
        point.longitude,
        point.latitude,
        Math.max(point.height + 600, 600),
      ),
      orientation: {
        heading: CesiumMath.toRadians(0),
        pitch: CesiumMath.toRadians(-55),
        roll: 0,
      },
      duration: 0.6,
    });
    setActivePointId(point.id);
  }

  function handleRemovePoint(pointId: string): void {
    const nextPoints = surfacePoints.filter((point) => point.id !== pointId);

    setSurfacePoints(nextPoints);

    if (activePointId === pointId) {
      setActivePointId(
        nextPoints.length > 0 ? nextPoints[nextPoints.length - 1].id : null,
      );
    }

    setErrorMessage("");
    setMessage(`${pointId} 已删除。`);
  }

  function handleClearPoints(): void {
    setSurfacePoints([]);
    setActivePointId(null);
    nextSurfacePointIndexRef.current = 1;
    setErrorMessage("");
    setMessage("地表控制点已清空。");
  }

  function handleNoteChange(pointId: string, note: string): void {
    setSurfacePoints((currentPoints) =>
      currentPoints.map((point) =>
        point.id === pointId ? { ...point, note } : point,
      ),
    );
  }

  function handleExportJson(): void {
    if (surfacePoints.length === 0) {
      setErrorMessage("至少需要一个地表控制点才能导出 JSON。");
      return;
    }

    const payload = buildSurfaceExportJson(surfacePoints);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    downloadJson(`surface-control-points-${timestamp}.json`, payload);
    setErrorMessage("");
    setMessage(`已导出 ${surfacePoints.length} 个地表控制点。`);
  }

  return (
    <>
      <div className="control-point-search__subheader">
        <div>
          <p className="workspace__eyebrow">Cesium Globe Viewer</p>
          <h3>地表控制点测定</h3>
        </div>
        <div className="control-point-search__subheader-actions">
          {modeSwitch}
          <span
            className={`status-pill status-pill--${osmStatusClass[osmBuildingsStatus]}`}
          >
            {osmStatusText[osmBuildingsStatus]}
          </span>
        </div>
      </div>

      <div className="control-point-search__surface-actions">
        <button
          className="secondary-button"
          type="button"
          onClick={handleResetView}
        >
          重置视角
        </button>
        <button
          className="primary-button"
          type="button"
          onClick={() => void handleToggleOsmBuildings()}
          disabled={osmBuildingsStatus === "loading"}
        >
          {osmBuildingsRef.current ? "关闭 OSM 建筑" : "加载 OSM 建筑"}
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={handleClearPoints}
          disabled={surfacePoints.length === 0}
        >
          清空控制点
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={handleExportJson}
          disabled={surfacePoints.length === 0}
        >
          导出 JSON
        </button>
      </div>

      <div className="control-point-search__main control-point-search__main--surface">
        <div className="control-point-search__viewer">
          <div
            className="control-point-search__cesium-container"
            ref={containerRef}
          />
          <form
            className="control-point-search__map-search"
            onSubmit={handleCoordinateSubmit}
          >
            <input
              value={coordinateInput}
              onChange={(event) => setCoordinateInput(event.target.value)}
              placeholder="经度, 纬度"
              aria-label="经纬度快速定位"
            />
            <button className="primary-button" type="submit">
              定位
            </button>
          </form>
        </div>
        <aside className="control-point-search__panel">
          {!hasToken ? (
            <p className="runtime-warning">
              当前未配置 Cesium ion token，无法加载官方底图、世界地形和 OSM
              建筑；配置 token 后可完整使用地表拾取。
            </p>
          ) : null}

          <dl className="control-point-search__details">
            <div>
              <dt>默认区域</dt>
              <dd>浙江大学紫金港校区附近</dd>
            </div>
            <div>
              <dt>OSM 建筑</dt>
              <dd>{osmStatusText[osmBuildingsStatus]}</dd>
            </div>
            <div>
              <dt>已记录</dt>
              <dd>{surfacePoints.length} 个地表控制点</dd>
            </div>
          </dl>

          {errorMessage ? <p className="error-message">{errorMessage}</p> : null}

          <div className="control-point-search__active">
            <h3>当前地表点</h3>
            {activePoint ? (
              <dl>
                <div>
                  <dt>ID</dt>
                  <dd>{activePoint.id}</dd>
                </div>
                <div>
                  <dt>经度</dt>
                  <dd>{formatSurfaceNumber(activePoint.longitude, 7)}</dd>
                </div>
                <div>
                  <dt>纬度</dt>
                  <dd>{formatSurfaceNumber(activePoint.latitude, 7)}</dd>
                </div>
              </dl>
            ) : (
              <p>未选择</p>
            )}
          </div>

          <div className="control-point-search__list">
            {surfacePoints.length === 0 ? (
              <p className="control-point-search__empty">
                暂无地表控制点。单击地表或已加载建筑即可新增。
              </p>
            ) : (
              surfacePoints.map((point) => {
                const isActive = point.id === activePointId;

                return (
                  <article
                    className={`control-point-search__item${
                      isActive ? " control-point-search__item--active" : ""
                    }`}
                    key={point.id}
                  >
                    <button
                      className="control-point-search__item-header"
                      type="button"
                      onClick={() => setActivePointId(point.id)}
                    >
                      <strong>{point.id}</strong>
                      <span className="control-point-search__point-status control-point-search__point-status--success">
                        已记录
                      </span>
                    </button>

                    <dl className="control-point-search__coords">
                      <div>
                        <dt>Lon</dt>
                        <dd>{formatSurfaceNumber(point.longitude, 7)}</dd>
                      </div>
                      <div>
                        <dt>Lat</dt>
                        <dd>{formatSurfaceNumber(point.latitude, 7)}</dd>
                      </div>
                      <div>
                        <dt>H</dt>
                        <dd>{formatSurfaceNumber(point.height, 3)}</dd>
                      </div>
                      <div>
                        <dt>ECEF Z</dt>
                        <dd>{formatSurfaceNumber(point.ecef.z, 3)}</dd>
                      </div>
                    </dl>

                    <label className="control-point-search__note">
                      <span>备注</span>
                      <input
                        value={point.note}
                        onChange={(event) =>
                          handleNoteChange(point.id, event.target.value)
                        }
                      />
                    </label>

                    <div className="control-point-search__item-actions control-point-search__item-actions--surface">
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => handleFlyToPoint(point)}
                      >
                        定位
                      </button>
                      <button
                        className="secondary-button control-point-search__danger"
                        type="button"
                        onClick={() => handleRemovePoint(point.id)}
                      >
                        删除
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </aside>
      </div>

      <footer className="control-point-search__status">
        <span>{message}</span>
        <span>
          坐标模式：经纬度 + 高程 + ECEF · 已记录 {surfacePoints.length}
        </span>
      </footer>
    </>
  );
}
