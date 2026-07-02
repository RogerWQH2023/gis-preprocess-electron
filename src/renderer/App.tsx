import { useEffect, useState } from "react";

import { WindowControls } from "./components/WindowControls";
import { ThreeDgsTilesConverter } from "./features/threeDgsTiles/ThreeDgsTilesConverter";

export default function App() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const windowApi = window.electronAPI?.window;
    if (!windowApi) {
      return;
    }

    void windowApi.isMaximized().then(setIsMaximized);
    return windowApi.onMaximizedChange(setIsMaximized);
  }, []);

  return (
    <div className="app-shell">
      <header className="app-titlebar">
        <div className="app-titlebar__brand">
          <span className="app-titlebar__mark" aria-hidden="true" />
          <span>GIS 数据预处理教学应用</span>
        </div>
        <WindowControls isMaximized={isMaximized} />
      </header>

      <main className="workspace">
        <section className="workspace__heading">
          <div>
            <p className="workspace__eyebrow">GIS 数据预处理</p>
            <h1>数据转换工作台</h1>
          </div>
          <span className="workspace__badge">Main IPC / Renderer Form</span>
        </section>

        <ThreeDgsTilesConverter />
      </main>
    </div>
  );
}
