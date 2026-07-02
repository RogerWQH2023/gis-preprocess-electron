# 3DGS PLY 转 3D Tiles 工具说明

本目录实现的是“3DGS PLY 转 3D Tiles”工具的渲染进程页面。它面向教学场景，主要用于演示：如何在 Electron 应用中由前台选择本地数据文件，再交给主进程调用 Node.js 数据处理库完成格式转换。

## 工具目标

3D Gaussian Splatting 常见训练结果会保存为 `.ply` 文件。PLY 适合存储点、属性和高斯参数，但 WebGIS 场景通常更需要能被三维地图或三维瓦片加载器按需调度的数据组织方式。

本工具的目标就是把一个 3DGS PLY 文件转换成 3D Tiles 数据集。转换完成后，输出目录中会包含：

```text
tileset.json
build_summary.json
tiles/
```

其中 `tileset.json` 是 3D Tiles 的入口文件，`tiles/` 目录保存分层后的瓦片内容，`build_summary.json` 保存转换过程的统计信息和参数记录。

## 基本原理

3DGS PLY 文件可以理解为“一整包高斯点数据”。每个高斯点不仅有位置，还会包含颜色、透明度、缩放、旋转和球谐系数等属性。直接把整个 PLY 丢给前端渲染，在数据量较大时不利于加载、调度和渐进显示。

3D Tiles 的思路是把空间数据组织成瓦片树。浏览器或三维地图引擎可以根据视角和距离选择加载哪些瓦片，而不是一次性加载全部数据。这样更适合大数据量三维场景。

本工具的转换过程可以概括为：

```text
读取 PLY -> 解析 3DGS 属性 -> 建立瓦片层级 -> 写出 GLB/SPZ 瓦片 -> 生成 tileset.json
```

当前版本只做基础格式转换，不做地理配准。也就是说，它不会在这里设置 WGS84 坐标、ENU 变换或自定义 root transform。

## 使用的核心库

主进程中使用的核心库是：

```text
3dgs-ply-3dtiles-converter
```

这个库的作用是把 GraphDECO 或 KHR Native 约定的 Gaussian Splatting PLY 文件转换为 3D Tiles。它会解析 PLY 中的高斯属性，生成 `tileset.json`，并把瓦片内容写成带 SPZ 压缩 Gaussian Splatting 数据的 GLB 文件。

在本项目中，库调用放在主进程的工具封装中：

```text
src/main/tools/three-dgs-tiles/converter.ts
```

渲染进程页面不直接调用该库，因为渲染进程默认不开放 Node.js 文件系统能力。这样做符合 Electron 的安全边界，也方便学生理解 Main、Preload、Renderer 的职责分工。

## Electron 技术路径

本工具采用以下调用链路：

```text
Renderer 页面
  -> Preload 暴露安全 API
  -> IPC 通道
  -> Main 主进程
  -> 3dgs-ply-3dtiles-converter
  -> 本地输出 3D Tiles 文件
```

各层职责如下：

| 层级 | 职责 |
| --- | --- |
| Renderer | 展示表单、选择参数、显示状态和日志 |
| Preload | 向页面暴露受控的 `window.electronAPI` 能力 |
| IPC | 接收页面请求，做参数校验和任务转发 |
| Main Tool | 调用 Node.js 转换库，处理本地文件和输出目录 |

这种拆分方式适合后续继续接入更多数据处理工具。新的工具可以复用同样思路：页面负责交互，IPC 负责通信，Main Tool 负责真实处理逻辑。

## 页面参数说明

### 输入 PLY 文件

选择需要转换的 `.ply` 文件。该文件应包含 3D Gaussian Splatting 所需的字段，例如位置、颜色、透明度、缩放和旋转等。

### 输出位置

选择一个输出父目录。程序不会直接把文件散落在该目录中，而是自动创建：

```text
原文件名-3dtiles
```

作为实际输出目录。这样可以避免误清空或覆盖用户选择的父目录。

### 输入约定

`GraphDECO` 是默认选项，适合常见 3DGS 训练流程导出的 PLY。它会把透明度按 GraphDECO 的方式解码，并按 GraphDECO 的四元数顺序解释旋转字段。

`KHR Native` 适合已经按照 KHR Gaussian Splatting 相关约定整理过的 PLY。它对透明度和四元数顺序的解释方式不同。

不确定文件来源时，通常先使用 `GraphDECO`。

### 内存预算 GB

传给转换库的内存预算参数。较大的 PLY 文件可能需要更高的内存预算，但实际值应结合本机内存设置。

## 使用流程

1. 点击“选择 PLY”，选择本地 3DGS PLY 文件。
2. 点击“选择目录”，选择输出父目录。
3. 根据数据来源选择 `GraphDECO` 或 `KHR Native`。
4. 根据数据规模调整内存预算。
5. 点击“开始转换”。
6. 在日志区域查看转换进度和错误信息。
7. 转换完成后点击“打开输出目录”查看结果文件。

## 当前功能边界

当前工具只完成最基础的 PLY 到 3D Tiles 转换。以下能力暂未接入：

- WGS84 坐标定位
- root transform 设置
- Cesium 或其他三维视图预览
- 批量转换
- 转换任务取消和队列管理

这些功能可以作为后续教学实验逐步扩展。
