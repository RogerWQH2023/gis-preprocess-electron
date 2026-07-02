# GIS 数据预处理教学应用

本项目是一个面向“GIS 专业实践”教学场景的 Electron 桌面应用基础框架。项目目标是为学生提供一个本地化、可视化的数据预处理工作台：前台负责参数输入、任务配置和结果展示，主进程负责调用 Node.js 环境中的 GIS 数据处理库执行本机计算。

## 项目目标

- 搭建一个可长期扩展的 Electron + Vite + React + TypeScript 项目骨架。
- 将渲染进程和主进程职责分离，避免前台直接暴露 Node.js 能力。
- 为后续接入矢量、栅格、坐标转换、格式转换、裁剪、重投影等 GIS 数据预处理流程预留结构。
- 提供适合教学使用的中文注释和 UTF-8 编码约定，降低学生阅读和二次开发成本。

## 当前进展

- 已完成基础工程初始化，包含 `package.json`、Vite、TypeScript、ESLint、electron-builder 和 pnpm 配置。
- 已完成 Electron 主进程入口，支持开发环境加载 Vite 服务、生产环境加载本地构建文件。
- 已完成 `preload.cts` 安全桥接，只向渲染进程暴露受控的 `window.electronAPI`。
- 已完成无边框窗口和基础窗口控制，包括最小化、最大化/还原、关闭和开发者工具入口。
- 已完成缩放锁定逻辑，包括禁用触控板捏合缩放、锁定缩放比例、拦截 `Ctrl/Cmd + +/-/0` 快捷键和关闭默认菜单。
- 已集成 3DGS PLY 转 3D Tiles 基础转换工具，支持选择本地 `.ply` 文件并在主进程调用 Node.js 转换库生成 `tileset.json`。
- 已完成转换工具的 Main 服务、IPC 桥接和 React 前台表单拆分，方便后续按同样结构继续接入更多数据处理工具。
- 已验证通过 `pnpm typecheck`、`pnpm lint` 和 `pnpm build`。

## 技术栈说明

- Electron：桌面应用运行时，主进程用于本机文件访问和后续 GIS 数据处理任务调度。
- Vite：渲染进程开发服务器和生产构建工具。
- React：前台交互界面框架。
- TypeScript：统一主进程、预加载脚本和渲染进程的类型约束。
- ESLint：基础代码质量检查。
- electron-builder：后续用于 Windows、macOS、Linux 应用打包。
- pnpm：统一使用 pnpm 11 作为依赖管理工具，已配置构建脚本审批项。
- 3DGS-PLY-3DTiles-Converter：首个接入的数据处理库，用于将 Gaussian Splatting PLY 转为 3D Tiles。

## 目录结构

```text
src/main             Electron 主进程代码
src/main/preload.cts 预加载脚本，负责安全暴露 IPC 能力
src/main/ipc         主进程 IPC 模块
src/main/tools       主进程数据处理工具封装
src/main/utils       主进程工具函数，包括路径、安全和缩放控制
src/renderer         React 渲染进程代码
src/renderer/features 渲染进程业务功能模块
resources            后续放置图标、示例资源等静态文件
```

## 常用命令

```bash
pnpm install
pnpm dev
pnpm dev:main
pnpm typecheck
pnpm lint
pnpm build
```

## 开发启动说明

- 推荐使用 `pnpm dev` 启动开发环境，它会同时启动 Vite 渲染进程和 Electron 主进程。
- `pnpm dev:main` 也可以直接启动完整开发环境，适合只记一个 Electron 启动命令时使用。
- `pnpm dev:renderer` 只启动浏览器端 Vite 服务。
- `pnpm dev:electron` 只启动 Electron，适合确认 `http://127.0.0.1:5173` 已经有 Vite 服务在运行时使用。
- 如果只运行旧版的主进程等待命令而没有启动 Vite，程序会停在等待 `127.0.0.1:5173` 的阶段，看起来像没有任何反应。
- 如果终端环境中残留 `ELECTRON_RUN_AS_NODE`，Electron 会按 Node.js 模式运行而不会创建窗口；项目启动器会在拉起 Electron 前清除该变量。

## 打包说明

- `pnpm build:app` 会先执行完整前后端构建，再通过 `electron-builder` 生成 Windows x64 便携版程序。
- 当前 `pnpm-workspace.yaml` 使用 `overrides` 将 `@electron/get` 固定到 `3.1.0`。这是为了避免 `electron-builder 26.15.x` 的内部依赖落到缺少 `ElectronDownloadCacheMode` 的 `@electron/get 3.0.0`，导致打包时报 `Cannot read properties of undefined (reading 'ReadWrite')`。
- Windows 打包配置使用本地 `node_modules/electron/dist` 作为 `electronDist`，避免打包阶段重复从 GitHub 下载 Electron zip。
- `scripts/run-electron-builder.mjs` 会为打包阶段设置 Electron 和 electron-builder 二进制镜像，减少国内网络访问 GitHub release 超时的问题。
- 使用本地 `electronDist` 时，`scripts/cleanup-electron-dist.cjs` 会在打包过程中移除 Electron 默认模板文件，避免 `default_app.asar` 混入最终产物。

## 后续开发建议

- 在 `src/main/ipc` 中新增数据处理 IPC 模块，统一封装前台可调用的本机处理能力。
- 在 `src/main` 中逐步接入 GIS 相关 Node.js 库，优先保证处理函数可独立测试。
- 在 `src/renderer` 中新增参数表单、任务队列、日志输出和结果文件管理界面。
- 保持中文注释使用 UTF-8 编码，避免 Windows 环境下出现乱码。
