import { useEffect, useState, type ComponentType } from "react";

import { CesiumIonAuthProvider } from "./cesiumIonAuth";
import { CesiumIonAuthStatus } from "./components/CesiumIonAuthStatus";
import { WindowControls } from "./components/WindowControls";
import { ControlPointSearchPage } from "./pages/data-conversion/control-point-search";
import { PlyTo3dTilesPage } from "./pages/data-conversion/ply-to-3dtiles";
import { ThreeDgsTilesGeoreferencePage } from "./pages/data-conversion/tiles-georeference";
import { TiffToCogTiffPage } from "./pages/data-conversion/tiff-to-cogtiff";
import { CogTiffTestPage } from "./pages/display-tests/cogtiff";
import { ObliquePhotogrammetryTestPage } from "./pages/display-tests/oblique-photogrammetry";
import { ThreeDgsTilesTestPage } from "./pages/display-tests/three-dgs-3dtiles";

type PageId =
  | "ply-to-3dtiles"
  | "tiles-georeference"
  | "control-point-search"
  | "tiff-to-cogtiff"
  | "three-dgs-3dtiles-test"
  | "oblique-photogrammetry-test"
  | "cogtiff-test";

interface NavigationPage {
  id: PageId;
  title: string;
  eyebrow: string;
  badge: string;
  navMark: string;
  component: ComponentType;
}

interface NavigationGroup {
  title: string;
  items: PageId[];
}

// Renderer 页面注册表：侧边栏只负责切换 id，真正页面由这里统一映射。
const pageRegistry: Record<PageId, NavigationPage> = {
  "ply-to-3dtiles": {
    id: "ply-to-3dtiles",
    title: "3DGS PLY 转 3D Tiles",
    eyebrow: "数据转换工作台",
    badge: "Main IPC / Renderer Form",
    navMark: "转",
    component: PlyTo3dTilesPage,
  },
  "tiles-georeference": {
    id: "tiles-georeference",
    title: "3DGS 3DTiles 地理配准",
    eyebrow: "数据转换工作台",
    badge: "Renderer 计算器",
    navMark: "配",
    component: ThreeDgsTilesGeoreferencePage,
  },
  "control-point-search": {
    id: "control-point-search",
    title: "控制点测定",
    eyebrow: "数据转换工作台",
    badge: "Cesium 基础环境",
    navMark: "点",
    component: ControlPointSearchPage,
  },
  "tiff-to-cogtiff": {
    id: "tiff-to-cogtiff",
    title: "tiff 转 CogTiff",
    eyebrow: "数据转换工作台",
    badge: "预留页面",
    navMark: "栅",
    component: TiffToCogTiffPage,
  },
  "three-dgs-3dtiles-test": {
    id: "three-dgs-3dtiles-test",
    title: "3DGS 3DTiles测试",
    eyebrow: "数据显示效果测试",
    badge: "Cesium Viewer",
    navMark: "3D",
    component: ThreeDgsTilesTestPage,
  },
  "oblique-photogrammetry-test": {
    id: "oblique-photogrammetry-test",
    title: "倾斜摄影模型测试",
    eyebrow: "数据显示效果测试",
    badge: "预留页面",
    navMark: "倾",
    component: ObliquePhotogrammetryTestPage,
  },
  "cogtiff-test": {
    id: "cogtiff-test",
    title: "COGTiff测试",
    eyebrow: "数据显示效果测试",
    badge: "预留页面",
    navMark: "COG",
    component: CogTiffTestPage,
  },
};

// 侧边栏分组与用户需求保持一一对应，后续新增页面只需扩展这里和注册表。
const navigationGroups: NavigationGroup[] = [
  {
    title: "数据转换工作台",
    items: [
      "ply-to-3dtiles",
      "tiles-georeference",
      "control-point-search",
      "tiff-to-cogtiff",
    ],
  },
  {
    title: "数据显示效果测试",
    items: [
      "three-dgs-3dtiles-test",
      "oblique-photogrammetry-test",
      "cogtiff-test",
    ],
  },
];

export default function App() {
  const [isMaximized, setIsMaximized] = useState(false);
  const [activePageId, setActivePageId] = useState<PageId>("ply-to-3dtiles");
  const activePage = pageRegistry[activePageId];
  const ActivePage = activePage.component;

  useEffect(() => {
    const windowApi = window.electronAPI?.window;
    if (!windowApi) {
      return;
    }

    void windowApi.isMaximized().then(setIsMaximized);
    return windowApi.onMaximizedChange(setIsMaximized);
  }, []);

  return (
    <CesiumIonAuthProvider>
      <div className="app-shell">
      <header className="app-titlebar">
        <div className="app-titlebar__brand">
          <span className="app-titlebar__mark" aria-hidden="true" />
          <span>GIS 数据预处理教学应用</span>
        </div>
        <WindowControls isMaximized={isMaximized} />
      </header>

      <div className="app-body">
        <aside className="app-sidebar" aria-label="主界面导航">
          <div className="app-sidebar__header">
            <span className="app-sidebar__kicker">Renderer</span>
            <strong>功能导航</strong>
          </div>

          <nav className="sidebar-nav">
            {navigationGroups.map((group) => (
              <section className="sidebar-nav__group" key={group.title}>
                <h2>{group.title}</h2>
                <div className="sidebar-nav__items">
                  {group.items.map((pageId) => {
                    const page = pageRegistry[pageId];
                    const isActive = page.id === activePageId;

                    return (
                      <button
                        className="sidebar-nav__item"
                        type="button"
                        aria-current={isActive ? "page" : undefined}
                        key={page.id}
                        onClick={() => setActivePageId(page.id)}
                      >
                        <span className="sidebar-nav__mark" aria-hidden="true">
                          {page.navMark}
                        </span>
                        <span>{page.title}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </nav>

          <CesiumIonAuthStatus />
        </aside>

        <main className="workspace">
          <section className="workspace__heading">
            <div>
              <p className="workspace__eyebrow">{activePage.eyebrow}</p>
              <h1>{activePage.title}</h1>
            </div>
            <span className="workspace__badge">{activePage.badge}</span>
          </section>

          <ActivePage />
        </main>
      </div>
      </div>
    </CesiumIonAuthProvider>
  );
}
