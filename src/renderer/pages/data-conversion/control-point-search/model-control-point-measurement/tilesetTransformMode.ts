import { Matrix4, type Cesium3DTileset } from "cesium";

import type { TilesetTransformMode } from "./types";

export const transformModeText: Record<TilesetTransformMode, string> = {
  ignore: "不加载 Transform",
  use: "加载 Transform",
};

export const transformModeCoordinateText: Record<TilesetTransformMode, string> =
  {
    ignore: "原始模型 XYZ",
    use: "应用 Transform 后的场景 XYZ",
  };

export function applyTilesetTransformMode(
  tileset: Cesium3DTileset,
  mode: TilesetTransformMode,
): void {
  // modelMatrix 是额外施加在整个 tileset 上的矩阵。这里始终保持单位矩阵，
  // 避免本工具自身再叠加一层变换，便于学生理解数据来源。
  tileset.modelMatrix = Matrix4.clone(Matrix4.IDENTITY);

  if (mode === "use") {
    return;
  }

  // tileset.json 中 root.transform 会被 Cesium 读入 root tile 的 transform。
  // 若要临时查看模型原始坐标系，就把根 tile 的 transform 改成单位矩阵。
  // 这只影响当前页面内存中的 Cesium 对象，不会修改磁盘上的 tileset.json。
  tileset.root.transform = Matrix4.clone(Matrix4.IDENTITY);
}
