# GIS 数据预处理教学应用

面向“GIS 专业实践”课程 WebGIS 数据预处理环节的 Electron 桌面应用。项目把三维场景数据和高光谱栅格数据发布到 WebGIS 前的关键步骤集中到一个本地可视化工作台中，帮助学生完成格式转换、空间配准、结果检查和 Cesium 加载验证。

当前应用主要服务于教学实验，不是通用生产级 GIS 平台。核心目标是让学生理解数据为什么需要预处理、预处理参数如何影响 WebGIS 加载效果，以及如何检查转换结果是否具备正确的文件结构、空间参考和交互查询能力。

## 功能概览

| 功能 | 输入 | 输出 / 结果 | 说明 |
| --- | --- | --- | --- |
| 倾斜摄影 OSGB 转 3D Tiles | 含 `metadata.xml` 的 OSGB 根目录 | `tileset.json` 和瓦片目录 | 调用本地 `3dtile.exe`，支持标准 `Data/` 结构和平铺 `Block` 结构 |
| 3DGS PLY 转 3D Tiles | 3D Gaussian Splatting `.ply` | `tileset.json`、`tiles/`、`build_summary.json` | 支持 GraphDECO 和 KHR Native 输入约定，可设置内存预算 |
| 控制点测定 | 3D Tiles 模型、Cesium 地表或建筑 | 模型控制点 / 地表控制点 JSON | 支持忽略或加载 `root.transform`，区分原始模型坐标和场景坐标 |
| 3D Tiles 地理配准 | 模型 XYZ 与 Cesium ECEF XYZ 控制点对 | 可写入 `tileset.json` 的 4x4 `transform` | 基于三维相似变换估计尺度、旋转和平移，并输出残差统计 |
| BIP 转 COGTiff | ENVI `.bip` 与配套 `.hdr` | Cloud Optimized GeoTIFF | 可设置压缩、块大小、BigTIFF、交错方式、目标空间参考和四至范围 |
| 3D Tiles 加载测试 | 本地 `tileset.json` | Cesium 预览效果 | 用于检查瓦片加载、模型位置、尺度和空间配准效果 |
| COGTiff 加载测试 | 本地 `.tif` / `.tiff` | Cesium 影像图层、波段渲染、像元查询 | 支持单波段色带、多波段 RGB 和点击查询所有波段值 |

## 应用导航

应用左侧导航分为两组：

- 数据转换工作台：`倾斜摄影 OSGB 转 3DTiles`、`3DGS PLY 转 3D Tiles`、`控制点测定`、`3DGS 3DTiles 地理配准`、`BIP 转 COGTiff`
- 数据显示效果测试：`3D Tiles 测试`、`COGTiff 测试`

这些页面对应一次完整的 WebGIS 数据准备流程：先把原始三维模型和高光谱影像转换为浏览器友好的格式，再通过控制点和预览页面检查数据能否在 Cesium 场景中正确加载。

## 环境要求

- 操作系统：推荐 Windows x64。当前 OSGB 转换器位于 `native-bin/win32-x64`，暂只按 Windows x64 路径配置。
- Node.js（仅开发和打包需要）：项目通过 `.npmrc` 固定 `use-node-version=22.16.0`，用于匹配 `gdal-async` 的 Node ABI 127 原生绑定。
- 包管理器：`pnpm@10.32.1`，已在 `package.json` 中声明。
- 学生机：运行打包产物不需要另行安装 Node.js 或 pnpm；Node 22.16.0 会随应用一同分发。
- Cesium ion token：可选。未配置 token 时，3D Tiles 和 COGTiff 本地加载仍可使用；官方底图、世界地形和 OSM 建筑需要配置 token。
- 数据路径：OSGB 转换器对中文路径或包含空格的路径可能不稳定，教学数据建议放在纯英文路径中。

## 快速开始

```bash
pnpm install
pnpm dev
```

`pnpm dev` 会同时启动 Vite 渲染进程和 Electron 主进程。不要只运行 `pnpm dev:electron`，除非已经有 Vite 服务运行在 `http://127.0.0.1:5173`，否则 Electron 会等待渲染进程服务。

如果只需要启动浏览器端页面，可使用：

```bash
pnpm dev:renderer
```

注意：仅浏览器端页面无法访问 Electron 主进程提供的本地文件选择、转换任务和预览协议，数据转换工具应在 Electron 桌面环境中运行。

## 使用说明

### 1. 配置 Cesium ion token

应用侧边栏提供 Cesium ion token 输入状态。token 会保存在浏览器 `localStorage` 中，仅供当前应用加载 Cesium 官方底图、世界地形和 OSM Buildings 使用。

没有 token 时：

- 可以选择本地 `tileset.json` 进行 3D Tiles 预览。
- 可以选择本地 COGTiff 进行影像预览。
- 不能加载 Cesium 官方世界影像、世界地形和 OSM 建筑。

### 2. 倾斜摄影 OSGB 转 3D Tiles

1. 进入 `倾斜摄影 OSGB 转 3DTiles`。
2. 点击 `选择目录`，选择包含 `metadata.xml` 的 OSGB 根目录。
3. 点击 `校验目录`，确认是标准 `Data/` 结构或可自动适配的平铺 `Block` 结构。
4. 选择输出父目录。应用会创建 `输入目录名-3dtiles` 作为实际输出目录。
5. 点击 `开始转换`，等待本地转换器生成 `tileset.json`。
6. 转换完成后，可进入 `3D Tiles 测试` 页面选择生成的 `tileset.json` 检查加载效果。

支持的输入结构示例：

```text
model_root/
  metadata.xml
  Data/
    Block.osgb
    Block***/
```

```text
model_root/
  metadata.xml
  Block.osgb
  BlockABA/
  BlockABX/
```

平铺 `Block` 结构会在转换时创建临时 `Data` 适配目录，不会移动或修改原始数据。

### 3. 3DGS PLY 转 3D Tiles

1. 进入 `3DGS PLY 转 3D Tiles`。
2. 点击 `选择 PLY`，选择 3D Gaussian Splatting 训练结果中的 `.ply` 文件。
3. 选择输出父目录。应用会创建 `原文件名-3dtiles` 作为实际输出目录。
4. 选择输入约定：
   - `GraphDECO`：常见 3DGS 训练流程导出的 PLY。
   - `KHR Native`：已按 KHR Gaussian Splatting 约定整理的 PLY。
5. 设置内存预算。数据量较大时可适当提高，但不要超过本机可用内存。
6. 点击 `开始转换`，转换完成后检查 `tileset.json`、`tiles/` 和 `build_summary.json`。

3DGS PLY 转 3D Tiles 只完成格式转换，不自动完成地理配准。若原始 PLY 没有真实地理坐标，需要继续使用控制点测定和配准矩阵计算工具。

### 4. 控制点测定

进入 `控制点测定` 后，可在两个模式间切换：

- `模型控制点测定`：加载需要配准的 `tileset.json`，围绕同一个实体点从多个视角点击模型，通过多条相机射线最小二乘求交得到模型 XYZ。
- `地表控制点测定`：在 Cesium 地球、地形或 OSM 建筑上点击真实地物位置，记录经纬度、高程和 ECEF XYZ。

模型控制点测定中的 `加载 Transform` 开关非常关键：

- 关闭时，页面会临时忽略 `tileset.json` 的 `root.transform`，输出原始模型 XYZ。
- 开启时，页面会使用 `root.transform`，输出应用 transform 后的场景 XYZ。

同一张配准表中不要混用两种坐标来源。控制点建议选择 4 到 6 对，并尽量分布在模型不同位置，避免全部集中或近似共线。

### 5. 3D Tiles 地理配准

1. 进入 `3DGS 3DTiles 地理配准`。
2. 如果地表点是经纬高，先在 `经纬高输入转换` 中选择 `WGS84` 或 `CGCS2000`，把经纬高转换为 Cesium ECEF XYZ。
3. 在 `XYZ 控制点对` 表中填写模型坐标和对应的 Cesium ECEF 坐标。
4. 查看统一缩放 `s`、平移 `T`、RMS 残差、平均残差、最大残差和逐点残差。
5. 将输出的 `tileset.json 可用 transform` 写入目标数据集的 `root.transform`。

理论上至少需要 3 对非共线控制点。残差明显偏大的点应优先检查点号对应关系、点击位置、坐标基准和 Transform 模式是否一致。

### 6. BIP 转 COGTiff

1. 进入 `BIP 转 COGTiff`。
2. 点击 `选择 BIP`，选择 ENVI `.bip` 文件。应用会自动查找 `result.bip.hdr` 或 `result.hdr`。
3. 选择输出目录，并确认输出文件名。
4. 按需设置转换参数：
   - 压缩方式：`DEFLATE` 或 `LZW`
   - Predictor：`AUTO`、`STANDARD`、`FLOATING_POINT` 或 `NO`
   - 块大小：默认 `512`
   - BigTIFF：默认 `YES`
   - COG 交错方式：`BAND` 或 `PIXEL`
   - 目标空间参考：默认 `EPSG:4326`
5. 如果原始影像缺少完整地理范围，可勾选 `写入四至范围` 并填写 `xmin`、`ymin`、`xmax`、`ymax`。
6. 点击 `开始转换`，完成后检查输出文件大小、栅格尺寸、波段数、数据类型、空间参考和 GDAL 版本。

BIP 数据依赖 HDR 头文件解释行列数、波段数、数据类型和字节序。缺少 HDR 时，GDAL 可能无法正确读取源数据。

### 7. 加载与检查结果

`3D Tiles 测试` 页面用于检查三维数据：

- 选择并加载 `tileset.json`。
- 使用 `zoomTo` 查看模型位置、尺度和方向是否合理。
- 若模型明显偏移，优先检查控制点对应关系、矩阵写入位置和 transform 数组顺序。

`COGTiff 测试` 页面用于检查栅格数据：

- 选择并加载 `.tif` 或 `.tiff`。
- 单波段模式可选择波段、色带和值域。
- 多波段 RGB 模式可指定 R、G、B 三个不同波段。
- 加载后左键点击地图，页面会显示点击位置的像素坐标和所有波段值。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `pnpm install` | 安装依赖，并按 `.npmrc` 使用 Node 22.16.0 |
| `pnpm dev` | 启动 Vite 渲染进程和 Electron 主进程 |
| `pnpm dev:renderer` | 仅启动 Vite 渲染进程 |
| `pnpm dev:electron` | 仅启动 Electron，要求 Vite 已在 5173 端口运行 |
| `pnpm typecheck` | 执行 TypeScript 类型检查 |
| `pnpm lint` | 执行 ESLint 检查 |
| `pnpm build` | 构建主进程和渲染进程 |
| `pnpm build:app` | 构建并通过 electron-builder 生成 Windows x64 便携版 |

## 打包说明

```bash
pnpm build:app
```

打包产物输出到 `dist/app`。当前 `build:app` 脚本显式生成 Windows x64 便携版，且 OSGB 转换能力依赖 `native-bin/win32-x64` 下的原生程序和 DLL。

课堂分发时可直接使用 `dist/app/GIS Data Preprocess Teaching 0.1.0.exe`。如果需要分发 unpacked 版本，必须完整压缩 `dist/app/win-unpacked` 目录，不能只复制其中的主程序，否则 `resources/gdal-node` 和其他原生依赖会丢失。

项目打包配置中的几个关键点：

- `electronDist` 指向本地 `node_modules/electron/dist`，避免打包阶段重复下载 Electron。
- `npmRebuild: false` 用于避免把 `gdal-async` 重建为 Electron ABI 绑定。
- `stage:gdal-runtime` 会先校验当前运行时必须是 Node 22.16.0 / ABI 127，并实际加载一次 `gdal-async`；校验失败时会中止打包。
- BIP 转 COGTiff 的实际 GDAL 调用由 Node 22 worker 执行，以规避 Electron 36 在 Windows 下直接加载 `gdal-async` 原生绑定的 ABI 问题。该 Node 运行时会被复制到产物的 `resources/gdal-node/node.exe`，生产环境不会依赖学生机的 `PATH`。
- Node worker、`gdal-async`、`xmlbuilder2` 及其传递依赖位于 `resources/app.asar.unpacked`，供普通 Node 进程直接读取。
- electron-builder 的 `afterPack` 钩子会限制 worker 只能从 `app.asar.unpacked` 解析模块，并实际执行一次小型 BIP 转 COGTiff；漏打任何生产依赖都会中止打包。
- `native-bin` 会被复制到应用资源目录下的 `bin`，供打包后的 OSGB 转换功能调用。
- `scripts/run-electron-builder.mjs` 会设置 Electron 和 electron-builder 二进制镜像，降低国内网络环境下下载失败的概率。

## 目录结构

```text
src/main                         Electron 主进程代码
src/main/preload.cts             预加载脚本，只暴露受控 IPC API
src/main/ipc                     主进程 IPC 注册与本地文件对话框
src/main/tools                   数据转换工具封装
src/main/utils                   路径、安全、缩放等主进程工具函数
src/renderer                     React 渲染进程代码
src/renderer/pages/data-conversion 数据转换和控制点页面
src/renderer/pages/display-tests Cesium 加载测试页面
native-bin                       Windows x64 原生转换程序及其运行依赖
resources                        应用图标等资源
scripts                          开发启动、打包和清理脚本
patches                          pnpm patch 文件
```

## 技术栈

| 技术 / 库 | 用途 |
| --- | --- |
| Electron | 桌面应用运行时、主进程文件访问、IPC 和本机任务调度 |
| Vite | React 渲染进程开发与生产构建 |
| React | 前端界面和交互状态管理 |
| TypeScript | 主进程、预加载脚本和渲染进程类型约束 |
| CesiumJS | 3D Tiles、地表控制点和 COGTiff 加载测试 |
| 3dgs-ply-3dtiles-converter | 将 3DGS PLY 转换为 3D Tiles |
| gdal-async / GDAL | 读取 ENVI BIP 并生成 COGTiff |
| geotiff.js | 读取 COGTiff 元数据和像元窗口 |
| tiff-imagery-provider | 将 TIFF/COGTiff 作为 Cesium 影像图层加载 |
| electron-builder | 桌面应用打包 |
| ESLint | 代码质量检查 |
| pnpm | 依赖管理和脚本运行 |

## 致谢与第三方项目

本项目的功能实现依赖以下开源项目和应用，在此致谢：

- [Electron](https://www.electronjs.org/)：提供跨平台桌面应用运行时。
- [Vite](https://vite.dev/) 和 [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react)：提供前端开发和构建能力。
- [React](https://react.dev/)：提供渲染进程界面框架。
- [TypeScript](https://www.typescriptlang.org/)：提供类型系统和编译能力。
- [CesiumJS](https://cesium.com/platform/cesiumjs/)：提供三维地球、3D Tiles 加载和地理空间可视化能力。
- [3DGS-PLY-3DTiles-Converter](https://github.com/WilliamLiu-1997/3DGS-PLY-3DTiles-Converter)：提供 3DGS PLY 到 3D Tiles 的转换能力。
- [gdal-async](https://github.com/mmomtchev/node-gdal-async) 和 [GDAL](https://gdal.org/)：提供栅格数据读取、转换和 COGTiff 生成能力。
- [geotiff.js](https://github.com/geotiffjs/geotiff.js)：提供 GeoTIFF/COGTiff 解析能力。
- [tiff-imagery-provider](https://github.com/hongfaqiu/tiff-imagery-provider)：提供 Cesium TIFF 影像图层加载能力。
- [vite-plugin-cesium](https://github.com/nshen/vite-plugin-cesium)：帮助在 Vite 项目中集成 Cesium 静态资源。
- [electron-builder](https://www.electron.build/)：提供 Electron 应用打包能力。
- [fanvanzh/3dtiles](https://github.com/fanvanzh/3dtiles)：`native-bin/win32-x64` 中的 OSGB 转换程序来源于该类 3D Tiles 转换工具链的 Windows x64 包结构。

## 许可证

本项目为课程教学专用项目，未采用开源许可证。仅在浙江大学地球科学学院“GIS实践”课程教学、实验和学习范围内使用。
