import { useEffect, useRef, useState } from "react";
import {
  Cartesian3,
  Cesium3DTileset,
  Color,
  HeadingPitchRange,
  Math as CesiumMath,
  Viewer,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";

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

function flyToDefaultView(viewer: Viewer): void {
  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(104, 32, 18_000_000),
    duration: 0.8,
  });
}

export function ThreeDgsTilesTestPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
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

    const viewer = new Viewer(containerRef.current, {
      animation: false,
      baseLayer: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      navigationHelpButton: false,
      sceneModePicker: false,
      selectionIndicator: false,
      timeline: false,
      shouldAnimate: true,
    });

    // 不依赖在线影像服务，直接用稳定底色突出 Cesium 地球本体。
    viewer.scene.globe.baseColor = Color.fromCssColorString("#2f6f9f");
    viewer.scene.globe.enableLighting = true;
    viewer.scene.globe.showGroundAtmosphere = true;
    if (viewer.scene.skyAtmosphere) {
      viewer.scene.skyAtmosphere.show = true;
    }
    viewer.scene.backgroundColor = Color.fromCssColorString("#07111f");
    flyToDefaultView(viewer);
    viewerRef.current = viewer;

    return () => {
      tilesetRef.current = null;
      viewerRef.current = null;
      viewer.destroy();
    };
  }, []);

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
        viewer.scene.primitives.remove(tilesetRef.current);
        tilesetRef.current = null;
      }

      const tileset = await Cesium3DTileset.fromUrl(selection.url);

      viewer.scene.primitives.add(tileset);
      tilesetRef.current = tileset;
      setLoadedTileset({ name: selection.name, path: selection.path });
      setStatus("loaded");
      await viewer.flyTo(tileset, {
        duration: 1.1,
        offset: new HeadingPitchRange(
          CesiumMath.toRadians(25),
          CesiumMath.toRadians(-28),
          0,
        ),
      });
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

    viewer.scene.primitives.remove(tilesetRef.current);
    tilesetRef.current = null;
    setLoadedTileset(null);
    setStatus("idle");
    setErrorMessage("");
    flyToDefaultView(viewer);
  }

  return (
    <section className="cesium-test-page" aria-labelledby="three-dgs-test-title">
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
            <p className="runtime-warning">请在 Electron 桌面环境中运行本工具。</p>
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
