import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Cartesian2,
  Cartesian3,
  Cesium3DTileset,
  Color,
  LabelStyle,
  Matrix4,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  VerticalOrigin,
  Viewer,
  type Viewer as CesiumViewer,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";

import {
  intersectRaysLeastSquares,
  type LocalVector3,
  type RayObservation,
} from "./rayIntersection";
import "./styles.css";

type LoadStatus = "idle" | "loading" | "loaded" | "error";

type LoadedTilesetInfo = {
  name: string;
  path: string;
  url: string;
};

type ControlPoint = {
  id: string;
  note: string;
  observations: RayObservation[];
  local: LocalVector3 | null;
  error: number | null;
  confirmed: boolean;
};

type LocalCameraNavigation = {
  target: Cartesian3;
  radius: number;
  distance: number;
  minDistance: number;
  maxDistance: number;
  yaw: number;
  pitch: number;
  isDragging: boolean;
  dragMoved: boolean;
  suppressNextClick: boolean;
};

const DEFAULT_CAMERA_YAW = 0;
const DEFAULT_CAMERA_PITCH = Math.atan2(0.8, 2.5);
const MIN_CAMERA_PITCH = -Math.PI * 0.48;
const MAX_CAMERA_PITCH = Math.PI * 0.48;

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

function formatNumber(value: number, fractionDigits = 3): string {
  return Number.isFinite(value) ? value.toFixed(fractionDigits) : "-";
}

function createControlPointId(index: number): string {
  return `GCP_${String(index).padStart(3, "0")}`;
}

function toLocalVector3(value: Cartesian3): LocalVector3 {
  return {
    x: value.x,
    y: value.y,
    z: value.z,
  };
}

function toCartesian3(value: LocalVector3): Cartesian3 {
  return new Cartesian3(value.x, value.y, value.z);
}

function createObservationId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function createObservation(viewer: CesiumViewer, position: Cartesian2) {
  const ray = viewer.camera.getPickRay(position);

  if (!ray) {
    return null;
  }

  const direction = Cartesian3.normalize(ray.direction, new Cartesian3());

  return {
    id: createObservationId(),
    origin: toLocalVector3(ray.origin),
    direction: toLocalVector3(direction),
    createdAt: new Date().toISOString(),
  };
}

function createViewer(container: HTMLDivElement): CesiumViewer {
  const viewer = new Viewer(container, {
    animation: false,
    baseLayerPicker: false,
    fullscreenButton: false,
    geocoder: false,
    globe: false,
    homeButton: false,
    infoBox: false,
    navigationHelpButton: false,
    scene3DOnly: true,
    sceneModePicker: false,
    selectionIndicator: false,
    timeline: false,
  });

  viewer.scene.backgroundColor = Color.fromCssColorString("#151922");
  if (viewer.scene.skyBox) {
    viewer.scene.skyBox.show = false;
  }

  if (viewer.scene.skyAtmosphere) {
    viewer.scene.skyAtmosphere.show = false;
  }

  if (viewer.scene.sun) {
    viewer.scene.sun.show = false;
  }

  if (viewer.scene.moon) {
    viewer.scene.moon.show = false;
  }
  viewer.scene.fog.enabled = false;

  const cameraController = viewer.scene.screenSpaceCameraController;

  cameraController.enableRotate = false;
  cameraController.enableTranslate = false;
  cameraController.enableZoom = false;
  cameraController.enableTilt = false;
  cameraController.enableLook = false;
  cameraController.enableCollisionDetection = false;
  viewer.camera.constrainedAxis = undefined;

  return viewer;
}

function createCameraOrientation(destination: Cartesian3, target: Cartesian3) {
  const direction = Cartesian3.normalize(
    Cartesian3.subtract(target, destination, new Cartesian3()),
    new Cartesian3(),
  );
  let right = Cartesian3.cross(direction, Cartesian3.UNIT_Z, new Cartesian3());

  if (Cartesian3.magnitudeSquared(right) < 1e-8) {
    right = Cartesian3.cross(direction, Cartesian3.UNIT_X, right);
  }

  Cartesian3.normalize(right, right);

  const up = Cartesian3.normalize(
    Cartesian3.cross(right, direction, new Cartesian3()),
    new Cartesian3(),
  );

  return { direction, up };
}

function createDefaultNavigation(): LocalCameraNavigation {
  return {
    target: Cartesian3.clone(Cartesian3.ZERO),
    radius: 50,
    distance: 135,
    minDistance: 1,
    maxDistance: 50_000,
    yaw: DEFAULT_CAMERA_YAW,
    pitch: DEFAULT_CAMERA_PITCH,
    isDragging: false,
    dragMoved: false,
    suppressNextClick: false,
  };
}

function configureCameraFrustum(
  viewer: CesiumViewer,
  radius: number,
  distance: number,
): void {
  viewer.camera.frustum.near = Math.max(radius * 0.0005, 0.001);
  viewer.camera.frustum.far = Math.max(radius * 100, distance + radius * 20);
}

function applyLocalCamera(
  viewer: CesiumViewer,
  navigation: LocalCameraNavigation,
): void {
  const horizontalDistance = navigation.distance * Math.cos(navigation.pitch);
  const offset = new Cartesian3(
    horizontalDistance * Math.sin(navigation.yaw),
    -horizontalDistance * Math.cos(navigation.yaw),
    navigation.distance * Math.sin(navigation.pitch),
  );
  const destination = Cartesian3.add(
    navigation.target,
    offset,
    new Cartesian3(),
  );

  viewer.camera.setView({
    destination,
    orientation: createCameraOrientation(destination, navigation.target),
  });

  configureCameraFrustum(viewer, navigation.radius, navigation.distance);
  viewer.scene.requestRender();
}

function resetLocalNavigation(
  viewer: CesiumViewer,
  navigation: LocalCameraNavigation,
  target: Cartesian3,
  radius: number,
): void {
  const normalizedRadius = Math.max(radius, 1);

  navigation.target = Cartesian3.clone(target);
  navigation.radius = normalizedRadius;
  navigation.distance = normalizedRadius * 2.65;
  navigation.minDistance = Math.max(normalizedRadius * 0.08, 0.01);
  navigation.maxDistance = normalizedRadius * 80;
  navigation.yaw = DEFAULT_CAMERA_YAW;
  navigation.pitch = DEFAULT_CAMERA_PITCH;
  navigation.isDragging = false;
  navigation.dragMoved = false;
  navigation.suppressNextClick = false;

  applyLocalCamera(viewer, navigation);
}

function setLocalDefaultView(
  viewer: CesiumViewer,
  navigation: LocalCameraNavigation,
): void {
  resetLocalNavigation(viewer, navigation, Cartesian3.ZERO, 50);
}

function focusTileset(
  viewer: CesiumViewer,
  tileset: Cesium3DTileset,
  navigation: LocalCameraNavigation,
): void {
  const { center, radius } = tileset.boundingSphere;

  resetLocalNavigation(viewer, navigation, center, radius);
}

function focusControlPoint(
  viewer: CesiumViewer,
  navigation: LocalCameraNavigation,
  point: LocalVector3,
  modelRadius: number,
): void {
  const normalizedRadius = Math.max(modelRadius, 1);

  navigation.target = toCartesian3(point);
  navigation.radius = normalizedRadius;
  navigation.distance = clamp(
    Math.max(normalizedRadius * 0.35, navigation.minDistance * 2),
    navigation.minDistance,
    navigation.maxDistance,
  );
  navigation.isDragging = false;
  navigation.dragMoved = false;
  navigation.suppressNextClick = false;

  applyLocalCamera(viewer, navigation);
}

function recomputeControlPoint(
  point: ControlPoint,
  observations: RayObservation[],
): ControlPoint {
  const result = intersectRaysLeastSquares(observations);

  return {
    ...point,
    observations,
    local: result?.point ?? null,
    error: result?.meanError ?? null,
    confirmed: false,
  };
}

function getControlPointStatus(point: ControlPoint, modelRadius: number): string {
  if (point.confirmed) {
    return "已确认";
  }

  if (!point.local || point.error === null) {
    return "未完成";
  }

  const reviewThreshold = Math.max(modelRadius, 1) * 0.05;

  return point.error > reviewThreshold ? "需复核" : "已计算";
}

function getControlPointStatusClass(point: ControlPoint, modelRadius: number) {
  const status = getControlPointStatus(point, modelRadius);

  if (status === "已确认" || status === "已计算") {
    return "success";
  }

  if (status === "需复核") {
    return "warning";
  }

  return "idle";
}

function buildExportJson(
  loadedTileset: LoadedTilesetInfo | null,
  controlPoints: ControlPoint[],
) {
  return {
    coordinateMode: "local",
    source: "3dgs_3dtiles",
    generatedAt: new Date().toISOString(),
    tileset: loadedTileset,
    points: controlPoints
      .filter((point) => point.local)
      .map((point) => ({
        id: point.id,
        local: point.local
          ? [point.local.x, point.local.y, point.local.z]
          : [0, 0, 0],
        observations: point.observations.length,
        error: point.error,
        note: point.note,
      })),
  };
}

function downloadJson(fileName: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function ControlPointSearchPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<CesiumViewer | null>(null);
  const tilesetRef = useRef<Cesium3DTileset | null>(null);
  const activeControlPointIdRef = useRef<string | null>(null);
  const controlPointsRef = useRef<ControlPoint[]>([]);
  const markerIdsRef = useRef<Set<string>>(new Set());
  const cameraNavigationRef = useRef<LocalCameraNavigation>(
    createDefaultNavigation(),
  );
  const nextControlPointIndexRef = useRef(1);
  const previewApi = window.electronAPI?.tools.threeDgsTiles ?? null;

  const [tilesetUrl, setTilesetUrl] = useState("");
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [loadedTileset, setLoadedTileset] = useState<LoadedTilesetInfo | null>(
    null,
  );
  const [controlPoints, setControlPoints] = useState<ControlPoint[]>([]);
  const [activeControlPointId, setActiveControlPointId] = useState<
    string | null
  >(null);
  const [highlightedControlPointId, setHighlightedControlPointId] = useState<
    string | null
  >(null);
  const [modelRadius, setModelRadius] = useState(1);
  const [message, setMessage] = useState("局部坐标模式：XYZ 单位继承模型数据。");
  const [errorMessage, setErrorMessage] = useState("");

  const activeControlPoint = useMemo(
    () =>
      controlPoints.find((point) => point.id === activeControlPointId) ?? null,
    [activeControlPointId, controlPoints],
  );
  const exportableCount = useMemo(
    () => controlPoints.filter((point) => point.local).length,
    [controlPoints],
  );

  useEffect(() => {
    activeControlPointIdRef.current = activeControlPointId;
  }, [activeControlPointId]);

  useEffect(() => {
    controlPointsRef.current = controlPoints;
  }, [controlPoints]);

  useEffect(() => {
    if (!containerRef.current || viewerRef.current) {
      return;
    }

    const viewer = createViewer(containerRef.current);
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);

    setLocalDefaultView(viewer, cameraNavigationRef.current);
    viewerRef.current = viewer;

    handler.setInputAction(() => {
      const navigation = cameraNavigationRef.current;

      navigation.isDragging = true;
      navigation.dragMoved = false;
      navigation.suppressNextClick = false;
    }, ScreenSpaceEventType.LEFT_DOWN);

    handler.setInputAction(() => {
      const navigation = cameraNavigationRef.current;

      navigation.isDragging = false;
      navigation.suppressNextClick = navigation.dragMoved;
    }, ScreenSpaceEventType.LEFT_UP);

    handler.setInputAction(
      (movement: ScreenSpaceEventHandler.MotionEvent) => {
        const navigation = cameraNavigationRef.current;

        if (!navigation.isDragging) {
          return;
        }

        const deltaX = movement.endPosition.x - movement.startPosition.x;
        const deltaY = movement.endPosition.y - movement.startPosition.y;

        if (Math.hypot(deltaX, deltaY) > 1) {
          navigation.dragMoved = true;
        }

        navigation.yaw -= deltaX * 0.006;
        navigation.pitch = clamp(
          navigation.pitch + deltaY * 0.006,
          MIN_CAMERA_PITCH,
          MAX_CAMERA_PITCH,
        );

        applyLocalCamera(viewer, navigation);
      },
      ScreenSpaceEventType.MOUSE_MOVE,
    );

    handler.setInputAction((delta: number) => {
      const navigation = cameraNavigationRef.current;

      navigation.distance = clamp(
        navigation.distance * Math.exp(-delta * 0.001),
        navigation.minDistance,
        navigation.maxDistance,
      );

      applyLocalCamera(viewer, navigation);
    }, ScreenSpaceEventType.WHEEL);

    handler.setInputAction(
      (movement: ScreenSpaceEventHandler.PositionedEvent) => {
        const navigation = cameraNavigationRef.current;
        const currentPointId = activeControlPointIdRef.current;

        if (navigation.suppressNextClick) {
          navigation.suppressNextClick = false;
          return;
        }

        if (!tilesetRef.current) {
          setMessage("请先加载 3D Tiles 模型。");
          return;
        }

        if (!currentPointId) {
          setMessage("请先新建或选择一个控制点。");
          return;
        }

        const currentPoint = controlPointsRef.current.find(
          (point) => point.id === currentPointId,
        );

        if (currentPoint?.confirmed) {
          setMessage(`${currentPointId} 已确认，取消确认后才能新增观测。`);
          return;
        }

        const observation = createObservation(viewer, movement.position);

        if (!observation) {
          setMessage("当前点击位置无法生成相机射线。");
          return;
        }

        setControlPoints((currentPoints) =>
          currentPoints.map((point) => {
            if (point.id !== currentPointId) {
              return point;
            }

            return recomputeControlPoint(point, [
              ...point.observations,
              observation,
            ]);
          }),
        );
        setErrorMessage("");
        setMessage(`${currentPointId} 已记录新的观测射线。`);
      },
      ScreenSpaceEventType.LEFT_CLICK,
    );

    return () => {
      handler.destroy();
      tilesetRef.current = null;
      if (!viewer.isDestroyed()) {
        viewer.destroy();
      }
      viewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;

    if (!viewer) {
      return;
    }

    for (const markerId of markerIdsRef.current) {
      viewer.entities.removeById(markerId);
    }

    markerIdsRef.current.clear();

    for (const point of controlPoints) {
      if (!point.local) {
        continue;
      }

      const markerId = `control-point-marker-${point.id}`;
      const { x, y, z } = point.local;
      const isHighlighted = point.id === highlightedControlPointId;

      viewer.entities.add({
        id: markerId,
        position: toCartesian3(point.local),
        point: {
          pixelSize: isHighlighted ? 17 : 11,
          color: isHighlighted
            ? Color.fromCssColorString("#ffd43b")
            : Color.fromCssColorString("#f03e3e"),
          outlineColor: isHighlighted
            ? Color.fromCssColorString("#172033")
            : Color.WHITE,
          outlineWidth: isHighlighted ? 3 : 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: `${point.id}${isHighlighted ? " · 显影" : ""}\n${formatNumber(x)}, ${formatNumber(y)}, ${formatNumber(z)}`,
          font: isHighlighted ? "700 13px sans-serif" : "12px sans-serif",
          fillColor: Color.WHITE,
          outlineColor: Color.BLACK,
          outlineWidth: 3,
          style: LabelStyle.FILL_AND_OUTLINE,
          showBackground: true,
          backgroundColor: Color.fromCssColorString(
            isHighlighted ? "#7a4f01" : "#101828",
          ).withAlpha(0.82),
          verticalOrigin: VerticalOrigin.BOTTOM,
          pixelOffset: new Cartesian2(0, isHighlighted ? -22 : -16),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      markerIdsRef.current.add(markerId);
    }
  }, [controlPoints, highlightedControlPointId]);

  async function loadTileset(url: string, info?: Partial<LoadedTilesetInfo>) {
    const viewer = viewerRef.current;
    const trimmedUrl = url.trim();

    if (!viewer || !trimmedUrl) {
      return;
    }

    try {
      setStatus("loading");
      setErrorMessage("");
      setMessage("正在加载 3D Tiles 模型。");

      if (tilesetRef.current) {
        viewer.scene.primitives.remove(tilesetRef.current);
        tilesetRef.current = null;
      }

      viewer.entities.removeAll();
      markerIdsRef.current.clear();
      nextControlPointIndexRef.current = 1;
      setControlPoints([]);
      setActiveControlPointId(null);
      setHighlightedControlPointId(null);

      const tileset = await Cesium3DTileset.fromUrl(trimmedUrl, {
        maximumScreenSpaceError: 8,
        skipLevelOfDetail: false,
      });

      tileset.modelMatrix = Matrix4.clone(Matrix4.IDENTITY);
      viewer.scene.primitives.add(tileset);
      tilesetRef.current = tileset;

      const radius = Math.max(tileset.boundingSphere.radius, 1);
      setModelRadius(radius);
      focusTileset(viewer, tileset, cameraNavigationRef.current);

      setLoadedTileset({
        name: info?.name ?? "tileset.json",
        path: info?.path ?? trimmedUrl,
        url: info?.url ?? trimmedUrl,
      });
      setStatus("loaded");
      setMessage("模型已加载，控制点坐标将按模型局部 XYZ 输出。");
    } catch (error) {
      setStatus("error");
      setLoadedTileset(null);
      setErrorMessage(readErrorMessage(error));
      setMessage("模型加载失败。");
    }
  }

  async function handleSelectAndLoadTileset(): Promise<void> {
    if (!previewApi) {
      return;
    }

    const selection = await previewApi.selectTileset();

    if (selection.canceled) {
      return;
    }

    setTilesetUrl(selection.url);
    await loadTileset(selection.url, {
      name: selection.name,
      path: selection.path,
      url: selection.url,
    });
  }

  function handleUrlSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void loadTileset(tilesetUrl);
  }

  function handleResetView(): void {
    const viewer = viewerRef.current;
    const tileset = tilesetRef.current;

    if (!viewer) {
      return;
    }

    if (tileset) {
      focusTileset(viewer, tileset, cameraNavigationRef.current);
    } else {
      setLocalDefaultView(viewer, cameraNavigationRef.current);
    }
  }

  function handleCreateControlPoint(): void {
    const pointId = createControlPointId(nextControlPointIndexRef.current);
    nextControlPointIndexRef.current += 1;

    setControlPoints((currentPoints) => [
      ...currentPoints,
      {
        id: pointId,
        note: "",
        observations: [],
        local: null,
        error: null,
        confirmed: false,
      },
    ]);
    setActiveControlPointId(pointId);
    setErrorMessage("");
    setMessage(`${pointId} 已创建。`);
  }

  function handleRemoveControlPoint(pointId: string): void {
    setControlPoints((currentPoints) =>
      currentPoints.filter((point) => point.id !== pointId),
    );

    if (activeControlPointId === pointId) {
      setActiveControlPointId(null);
    }

    if (highlightedControlPointId === pointId) {
      setHighlightedControlPointId(null);
    }

    const viewer = viewerRef.current;
    const markerId = `control-point-marker-${pointId}`;

    if (viewer) {
      viewer.entities.removeById(markerId);
    }

    markerIdsRef.current.delete(markerId);
  }

  function handleClearObservations(pointId: string): void {
    if (highlightedControlPointId === pointId) {
      setHighlightedControlPointId(null);
    }

    setControlPoints((currentPoints) =>
      currentPoints.map((point) =>
        point.id === pointId
          ? {
              ...point,
              observations: [],
              local: null,
              error: null,
              confirmed: false,
            }
          : point,
      ),
    );
  }

  function handleUndoLastObservation(pointId: string): void {
    const targetPoint = controlPoints.find((point) => point.id === pointId);

    if (!targetPoint || targetPoint.observations.length === 0) {
      return;
    }

    if (
      highlightedControlPointId === pointId &&
      targetPoint.observations.length <= 2
    ) {
      setHighlightedControlPointId(null);
    }

    setControlPoints((currentPoints) =>
      currentPoints.map((point) => {
        if (point.id !== pointId) {
          return point;
        }

        return recomputeControlPoint(point, point.observations.slice(0, -1));
      }),
    );
    setErrorMessage("");
    setMessage(`${pointId} 已撤销上一条观测。`);
  }

  function handleRevealControlPoint(point: ControlPoint): void {
    const viewer = viewerRef.current;

    if (!viewer || !point.local) {
      return;
    }

    setActiveControlPointId(point.id);
    setHighlightedControlPointId(point.id);
    focusControlPoint(
      viewer,
      cameraNavigationRef.current,
      point.local,
      modelRadius,
    );
    setErrorMessage("");
    setMessage(`${point.id} 已显影。`);
  }

  function handleToggleConfirmed(pointId: string): void {
    setControlPoints((currentPoints) =>
      currentPoints.map((point) =>
        point.id === pointId && point.local
          ? { ...point, confirmed: !point.confirmed }
          : point,
      ),
    );
  }

  function handleNoteChange(pointId: string, note: string): void {
    setControlPoints((currentPoints) =>
      currentPoints.map((point) =>
        point.id === pointId ? { ...point, note } : point,
      ),
    );
  }

  function handleExportJson(): void {
    if (exportableCount === 0) {
      setErrorMessage("至少需要一个已计算的控制点才能导出 JSON。");
      return;
    }

    const payload = buildExportJson(loadedTileset, controlPoints);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    downloadJson(`control-points-${timestamp}.json`, payload);
    setErrorMessage("");
    setMessage(`已导出 ${exportableCount} 个控制点。`);
  }

  return (
    <section
      className="control-point-search"
      aria-labelledby="control-point-search-title"
    >
      <div className="control-point-search__shell">
        <header className="control-point-search__toolbar">
          <div>
            <p className="workspace__eyebrow">Cesium Local Viewer</p>
            <h2 id="control-point-search-title">控制点寻找</h2>
          </div>
          <span
            className={`status-pill status-pill--${statusPillClass[status]}`}
          >
            {statusText[status]}
          </span>
        </header>

        <form
          className="control-point-search__load-row"
          onSubmit={handleUrlSubmit}
        >
          <input
            className="control-point-search__input"
            value={tilesetUrl}
            onChange={(event) => setTilesetUrl(event.target.value)}
            placeholder="/3dtiles/demo/tileset.json"
            disabled={status === "loading"}
            aria-label="tileset.json URL"
          />
          <button
            className="secondary-button"
            type="button"
            onClick={handleSelectAndLoadTileset}
            disabled={!previewApi || status === "loading"}
          >
            选择 tileset
          </button>
          <button
            className="primary-button"
            type="submit"
            disabled={!tilesetUrl.trim() || status === "loading"}
          >
            加载
          </button>
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
            onClick={handleCreateControlPoint}
            disabled={status !== "loaded"}
          >
            新建控制点
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={handleExportJson}
            disabled={exportableCount === 0}
          >
            导出 JSON
          </button>
        </form>

        <div className="control-point-search__main">
          <div className="control-point-search__viewer" ref={containerRef} />
          <aside className="control-point-search__panel">
            {!previewApi ? (
              <p className="runtime-warning">
                当前不在 Electron 桌面环境时，只能通过 URL 加载 tileset.json。
              </p>
            ) : null}

            {loadedTileset ? (
              <dl className="control-point-search__details">
                <div>
                  <dt>模型</dt>
                  <dd>{loadedTileset.name}</dd>
                </div>
                <div>
                  <dt>路径</dt>
                  <dd>{loadedTileset.path}</dd>
                </div>
                <div>
                  <dt>可导出</dt>
                  <dd>{exportableCount} / {controlPoints.length}</dd>
                </div>
              </dl>
            ) : null}

            {errorMessage ? (
              <p className="error-message">{errorMessage}</p>
            ) : null}

            <div className="control-point-search__active">
              <h3>当前控制点</h3>
              {activeControlPoint ? (
                <dl>
                  <div>
                    <dt>ID</dt>
                    <dd>{activeControlPoint.id}</dd>
                  </div>
                  <div>
                    <dt>观测</dt>
                    <dd>{activeControlPoint.observations.length}</dd>
                  </div>
                  <div>
                    <dt>误差</dt>
                    <dd>
                      {activeControlPoint.error === null
                        ? "-"
                        : formatNumber(activeControlPoint.error, 4)}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p>未选择</p>
              )}
            </div>

            <div className="control-point-search__list">
              {controlPoints.length === 0 ? (
                <p className="control-point-search__empty">
                  暂无控制点。
                </p>
              ) : (
                controlPoints.map((point) => {
                  const isActive = point.id === activeControlPointId;
                  const statusClass = getControlPointStatusClass(
                    point,
                    modelRadius,
                  );

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
                        onClick={() => setActiveControlPointId(point.id)}
                      >
                        <strong>{point.id}</strong>
                        <span
                          className={`control-point-search__point-status control-point-search__point-status--${statusClass}`}
                        >
                          {getControlPointStatus(point, modelRadius)}
                        </span>
                      </button>

                      <dl className="control-point-search__coords">
                        <div>
                          <dt>X</dt>
                          <dd>
                            {point.local ? formatNumber(point.local.x) : "-"}
                          </dd>
                        </div>
                        <div>
                          <dt>Y</dt>
                          <dd>
                            {point.local ? formatNumber(point.local.y) : "-"}
                          </dd>
                        </div>
                        <div>
                          <dt>Z</dt>
                          <dd>
                            {point.local ? formatNumber(point.local.z) : "-"}
                          </dd>
                        </div>
                        <div>
                          <dt>Obs</dt>
                          <dd>{point.observations.length}</dd>
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

                      <div className="control-point-search__item-actions">
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => handleRevealControlPoint(point)}
                          disabled={!point.local}
                        >
                          显影
                        </button>
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => handleUndoLastObservation(point.id)}
                          disabled={point.observations.length === 0}
                        >
                          撤销观测
                        </button>
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => handleToggleConfirmed(point.id)}
                          disabled={!point.local}
                        >
                          {point.confirmed ? "取消确认" : "确认"}
                        </button>
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => handleClearObservations(point.id)}
                          disabled={point.observations.length === 0}
                        >
                          清空观测
                        </button>
                        <button
                          className="secondary-button control-point-search__danger"
                          type="button"
                          onClick={() => handleRemoveControlPoint(point.id)}
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
            坐标模式：local XYZ · 已加载控制点 {controlPoints.length} · 已计算{" "}
            {exportableCount}
          </span>
        </footer>
      </div>
    </section>
  );
}
