import { useEffect, useState } from "react";

import { WindowControls } from "./components/WindowControls";

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
        <section className="workspace__hero">
          <p className="workspace__eyebrow">Electron / Vite / React / TS</p>
          <h1>数据预处理工作台</h1>
          <p>
            当前已完成基础应用壳。后续可在主进程接入 Node.js 数据处理库，
            并通过 IPC 向前台提供参数化处理能力。
          </p>
        </section>

        <section className="workspace__grid" aria-label="基础模块占位">
          <article className="module-panel">
            <span className="module-panel__label">Main</span>
            <h2>本机处理进程</h2>
            <p>面向文件读取、格式转换、空间计算等 Node.js 任务。</p>
          </article>
          <article className="module-panel">
            <span className="module-panel__label">Preload</span>
            <h2>安全桥接层</h2>
            <p>通过受控 API 暴露窗口控制和后续数据处理入口。</p>
          </article>
          <article className="module-panel">
            <span className="module-panel__label">Renderer</span>
            <h2>参数交互界面</h2>
            <p>用于课程实验中的参数填写、任务状态和结果展示。</p>
          </article>
        </section>
      </main>
    </div>
  );
}

