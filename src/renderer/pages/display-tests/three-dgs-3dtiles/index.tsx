import { useEffect, useRef, useState } from "react";
import {
  Cartesian3,
  Cesium3DTileset,
  ImageryLayer,
  Ion,
  Terrain,
  Viewer,
  type Viewer as CesiumViewer,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";

import { useCesiumIonAuth } from "../../../cesiumIonAuthContext";
import { loadCesium3DTileset, removeCesium3DTileset } from "./loadTileset";

type LoadStatus = "idle" | "loading" | "loaded" | "error";

type LoadedTilesetInfo = {
  name: string;
  path: string;
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

export function ThreeDgsTilesTestPage() {
  const { token, hasToken } = useCesiumIonAuth();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<CesiumViewer | null>(null);
  const tilesetRef = useRef<Cesium3DTileset | null>(null);
  const previewApi = window.electronAPI?.tools.threeDgsTiles ?? null;
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [loadedTileset, setLoadedTileset] = useState<LoadedTilesetInfo | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!containerRef.current || viewerRef.current) {
      return;
    }

    setLoadedTileset(null);
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

    // 无 token 时不调用 Cesium ion 官方资源，只保留基础球体和本地 3D Tiles 加载。
    setDefaultView(viewer);
    viewerRef.current = viewer;

    return () => {
      tilesetRef.current = null;
      if (viewerRef.current) {
        viewerRef.current.destroy();
      }
      viewerRef.current = null;
    };
  }, [hasToken, token]);

  async function handleSelectAndLoadTileset(): Promise<void> {
    if (!previewApi || !viewerRef.current) {
      return;
    }

    try {
      const selection = await previewApi.selectTileset();

      if (selection.canceled) {
        return;
      }

      const viewer = viewerRef.current;

      setStatus("loading");
      setLoadedTileset(null);
      setErrorMessage("");

      if (tilesetRef.current) {
        removeCesium3DTileset(viewer, tilesetRef.current);
        tilesetRef.current = null;
      }

      const tileset = await loadCesium3DTileset(viewer, selection.url);

      tilesetRef.current = tileset;
      setLoadedTileset({ name: selection.name, path: selection.path });
      setStatus("loaded");
      await viewer.zoomTo(tileset);
    } catch (error) {
      setStatus("error");
      setErrorMessage(readErrorMessage(error));
    }
  }

  function handleClearTileset(): void {
    const viewer = viewerRef.current;

    if (!viewer || !tilesetRef.current) {
      return;
    }

    removeCesium3DTileset(viewer, tilesetRef.current);
    tilesetRef.current = null;
    setLoadedTileset(null);
    setStatus("idle");
    setErrorMessage("");
    setDefaultView(viewer);
  }

  return (
    <section
      className="cesium-test-page"
      aria-labelledby="three-dgs-test-title"
    >
      <div className="cesium-stage">
        <div className="cesium-stage__viewer" ref={containerRef} />
        <div className="cesium-stage__panel">
          <div className="cesium-stage__panel-header">
            <div>
              <p className="workspace__eyebrow">Cesium 1.143.0</p>
              <h2 id="three-dgs-test-title">3DGS 3D Tiles 预览</h2>
            </div>
            <span
              className={`status-pill status-pill--${statusPillClass[status]}`}
            >
              {statusText[status]}
            </span>
          </div>

          {!previewApi ? (
            <p className="runtime-warning">
              请在 Electron 桌面环境中运行本工具。
            </p>
          ) : null}

          <div className="converter-actions">
            <button
              className="primary-button"
              type="button"
              onClick={handleSelectAndLoadTileset}
              disabled={!previewApi || status === "loading"}
            >
              选择并加载 tileset.json
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={handleClearTileset}
              disabled={!loadedTileset || status === "loading"}
            >
              清除模型
            </button>
          </div>

          <p className="cesium-stage__note">
            课程作业默认做法：把 3D Tiles 目录放进 public，例如
            public/3dtiles/demo/tileset.json，代码里直接加载
            /3dtiles/demo/tileset.json。本页面的文件选择只服务于 Electron
            桌面演示。只有侧边栏填入 Cesium ion token 后，本页才会请求官方底图和地形。
          </p>

          {loadedTileset ? (
            <dl className="cesium-stage__details">
              <div>
                <dt>模型</dt>
                <dd>{loadedTileset.name}</dd>
              </div>
              <div>
                <dt>路径</dt>
                <dd>{loadedTileset.path}</dd>
              </div>
            </dl>
          ) : null}

          {errorMessage ? (
            <p className="error-message">{errorMessage}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
