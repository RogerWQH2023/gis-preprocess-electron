import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Cesium3DTileset,
  Matrix4,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
} from "cesium";

import {
  buildExportJson,
  createControlPointId,
  downloadJson,
  formatNumber,
  getControlPointStatus,
  getControlPointStatusClass,
  readErrorMessage,
  recomputeControlPoint,
  statusPillClass,
  statusText,
} from "./controlPointModelUtils";
import {
  createModelViewer,
  createObservation,
  renderControlPointMarkers,
} from "./cesiumModelViewer";
import {
  createDefaultNavigation,
  focusTileset,
  moveLocalCameraTarget,
  rotateLocalCamera,
  setLocalDefaultView,
  shouldIgnoreKeyboardEvent,
  zoomLocalCamera,
} from "./localCameraNavigation";

import type { Viewer as CesiumViewer } from "cesium";
import type {
  ControlPoint,
  LoadedTilesetInfo,
  LoadStatus,
  LocalCameraNavigation,
} from "./types";

type ModelControlPointMeasurementProps = {
  modeSwitch: ReactNode;
};

export function ModelControlPointMeasurement({
  modeSwitch,
}: ModelControlPointMeasurementProps) {
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
  const [hiddenControlPointIds, setHiddenControlPointIds] = useState<
    Set<string>
  >(new Set());
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

    const viewer = createModelViewer(containerRef.current);
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

        rotateLocalCamera(viewer, navigation, deltaX, deltaY);
      },
      ScreenSpaceEventType.MOUSE_MOVE,
    );

    handler.setInputAction((delta: number) => {
      zoomLocalCamera(viewer, cameraNavigationRef.current, delta);
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

    const handleKeyDown = (event: KeyboardEvent) => {
      if (shouldIgnoreKeyboardEvent(event)) {
        return;
      }

      const key = event.key.toLowerCase();
      const navigation = cameraNavigationRef.current;

      if (key === "w") {
        event.preventDefault();
        moveLocalCameraTarget(viewer, navigation, 0, 1);
      } else if (key === "s") {
        event.preventDefault();
        moveLocalCameraTarget(viewer, navigation, 0, -1);
      } else if (key === "a") {
        event.preventDefault();
        moveLocalCameraTarget(viewer, navigation, -1, 0);
      } else if (key === "d") {
        event.preventDefault();
        moveLocalCameraTarget(viewer, navigation, 1, 0);
      } else {
        return;
      }

      if (!event.repeat) {
        setMessage("视角中心已移动，滚轮将围绕新的中心缩放。");
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
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

    renderControlPointMarkers(
      viewer,
      markerIdsRef.current,
      controlPoints,
      hiddenControlPointIds,
    );
  }, [controlPoints, hiddenControlPointIds]);

  async function loadTileset(
    url: string,
    info?: Partial<LoadedTilesetInfo>,
  ): Promise<void> {
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
      setHiddenControlPointIds(new Set());

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

    const viewer = viewerRef.current;
    const markerId = `control-point-marker-${pointId}`;

    if (viewer) {
      viewer.entities.removeById(markerId);
    }

    markerIdsRef.current.delete(markerId);
    setHiddenControlPointIds((currentIds) => {
      const nextIds = new Set(currentIds);

      nextIds.delete(pointId);
      return nextIds;
    });
  }

  function handleClearObservations(pointId: string): void {
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
    setHiddenControlPointIds((currentIds) => {
      const nextIds = new Set(currentIds);

      nextIds.delete(pointId);
      return nextIds;
    });
  }

  function handleUndoLastObservation(pointId: string): void {
    const targetPoint = controlPoints.find((point) => point.id === pointId);

    if (!targetPoint || targetPoint.observations.length === 0) {
      return;
    }

    setControlPoints((currentPoints) =>
      currentPoints.map((point) => {
        if (point.id !== pointId) {
          return point;
        }

        return recomputeControlPoint(point, point.observations.slice(0, -1));
      }),
    );
    if (targetPoint.observations.length <= 2) {
      setHiddenControlPointIds((currentIds) => {
        const nextIds = new Set(currentIds);

        nextIds.delete(pointId);
        return nextIds;
      });
    }
    setErrorMessage("");
    setMessage(`${pointId} 已撤销上一条观测。`);
  }

  function handleToggleControlPointVisibility(point: ControlPoint): void {
    if (!point.local) {
      return;
    }

    setActiveControlPointId(point.id);
    setHiddenControlPointIds((currentIds) => {
      const nextIds = new Set(currentIds);

      if (nextIds.has(point.id)) {
        nextIds.delete(point.id);
      } else {
        nextIds.add(point.id);
      }

      return nextIds;
    });
    setErrorMessage("");
    setMessage(
      hiddenControlPointIds.has(point.id)
        ? `${point.id} 已显示。`
        : `${point.id} 已隐藏，可继续添加观测。`,
    );
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

    downloadJson(`model-control-points-${timestamp}.json`, payload);
    setErrorMessage("");
    setMessage(`已导出 ${exportableCount} 个控制点。`);
  }

  return (
    <>
      <div className="control-point-search__subheader">
        <div>
          <p className="workspace__eyebrow">Cesium Local Viewer</p>
          <h3>模型控制点测定</h3>
        </div>
        <div className="control-point-search__subheader-actions">
          {modeSwitch}
          <span
            className={`status-pill status-pill--${statusPillClass[status]}`}
          >
            {statusText[status]}
          </span>
        </div>
      </div>

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
                <dd>
                  {exportableCount} / {controlPoints.length}
                </dd>
              </div>
            </dl>
          ) : null}

          {errorMessage ? <p className="error-message">{errorMessage}</p> : null}

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
              <p className="control-point-search__empty">暂无控制点。</p>
            ) : (
              controlPoints.map((point) => {
                const isActive = point.id === activeControlPointId;
                const isHidden = hiddenControlPointIds.has(point.id);
                const pointStatusClass = getControlPointStatusClass(
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
                        className={`control-point-search__point-status control-point-search__point-status--${pointStatusClass}`}
                      >
                        {getControlPointStatus(point, modelRadius)}
                      </span>
                    </button>

                    <dl className="control-point-search__coords">
                      <div>
                        <dt>X</dt>
                        <dd>{point.local ? formatNumber(point.local.x) : "-"}</dd>
                      </div>
                      <div>
                        <dt>Y</dt>
                        <dd>{point.local ? formatNumber(point.local.y) : "-"}</dd>
                      </div>
                      <div>
                        <dt>Z</dt>
                        <dd>{point.local ? formatNumber(point.local.z) : "-"}</dd>
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
                        onClick={() => handleToggleControlPointVisibility(point)}
                        disabled={!point.local}
                      >
                        {isHidden ? "显示点" : "隐藏点"}
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
    </>
  );
}
