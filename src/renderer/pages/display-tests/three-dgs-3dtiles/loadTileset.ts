import { Cesium3DTileset, type Viewer } from "cesium";

export async function loadCesium3DTileset(
  viewer: Viewer,
  tilesetUrl: string,
): Promise<Cesium3DTileset> {
  // 这是加载 3D Tiles 的最小核心代码：给出 tileset.json 的 URL，创建 tileset 并加入场景。
  const tileset = await Cesium3DTileset.fromUrl(tilesetUrl);

  viewer.scene.primitives.add(tileset);
  return tileset;
}

export function removeCesium3DTileset(
  viewer: Viewer,
  tileset: Cesium3DTileset,
): void {
  viewer.scene.primitives.remove(tileset);
}
