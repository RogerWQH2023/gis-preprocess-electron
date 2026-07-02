import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  HeadingPitchRange,
  ImageryLayer,
  Matrix4,
  Math as CesiumMath,
  Terrain,
  Viewer,
  createOsmBuildingsAsync,
  defined,
  VerticalOrigin,
} from "cesium";

import type {
  Cesium3DTileset,
  Viewer as CesiumViewer,
} from "cesium";
import type { SurfaceControlPoint } from "./surfaceTypes";

export function formatSurfaceNumber(value: number, digits = 6): string {
  return Number.isFinite(value) ? value.toFixed(digits) : "-";
}

export function createSurfacePointId(index: number): string {
  return `SGCP_${String(index).padStart(3, "0")}`;
}

export function createSurfaceViewer(
  container: HTMLDivElement,
  hasToken: boolean,
): CesiumViewer {
  const viewer = new Viewer(container, {
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

  viewer.scene.globe.depthTestAgainstTerrain = true;
  return viewer;
}

export function setSurfaceDefaultView(viewer: CesiumViewer): void {
  focusSurfaceCoordinate(viewer, 120.0863, 30.3089, 4200);
}

export function focusSurfaceCoordinate(
  viewer: CesiumViewer,
  longitude: number,
  latitude: number,
  range = 2200,
): void {
  const target = Cartesian3.fromDegrees(longitude, latitude, 20);

  // 以目标经纬度为视角中心，拉开距离后俯视，避免初始画面过近看不到周边范围。
  viewer.camera.lookAt(
    target,
    new HeadingPitchRange(
      CesiumMath.toRadians(0),
      CesiumMath.toRadians(-48),
      range,
    ),
  );
  viewer.camera.lookAtTransform(Matrix4.IDENTITY);
  viewer.scene.requestRender();
}

export async function createOsmBuildings(): Promise<Cesium3DTileset> {
  return createOsmBuildingsAsync();
}

export function getPickedCartesian(
  viewer: CesiumViewer,
  screenPosition: Cartesian2,
): Cartesian3 | undefined {
  const { scene } = viewer;

  if (scene.pickPositionSupported) {
    const picked = scene.pickPosition(screenPosition);

    if (defined(picked)) {
      return picked;
    }
  }

  const ray = viewer.camera.getPickRay(screenPosition);

  if (!defined(ray)) {
    return undefined;
  }

  return scene.globe.pick(ray, scene);
}

export function createSurfaceControlPoint(
  id: string,
  position: Cartesian3,
): SurfaceControlPoint {
  const cartographic = Cartographic.fromCartesian(position);
  const longitude = CesiumMath.toDegrees(cartographic.longitude);
  const latitude = CesiumMath.toDegrees(cartographic.latitude);
  const height = cartographic.height;

  return {
    id,
    position: Cartesian3.clone(position),
    longitude,
    latitude,
    height,
    ecef: {
      x: position.x,
      y: position.y,
      z: position.z,
    },
    note: "",
    createdAt: new Date().toISOString(),
  };
}

export function createSurfaceMarkerLabel(point: SurfaceControlPoint): string {
  return [
    `lon: ${formatSurfaceNumber(point.longitude, 7)}`,
    `lat: ${formatSurfaceNumber(point.latitude, 7)}`,
    `h: ${formatSurfaceNumber(point.height, 2)} m`,
  ].join("\n");
}

export function renderSurfaceMarkers(
  viewer: CesiumViewer,
  markerIds: Set<string>,
  points: SurfaceControlPoint[],
): void {
  for (const markerId of markerIds) {
    viewer.entities.removeById(markerId);
  }

  markerIds.clear();

  for (const point of points) {
    const markerId = `surface-control-point-marker-${point.id}`;

    viewer.entities.add({
      id: markerId,
      position: point.position,
      point: {
        pixelSize: 9,
        color: Color.RED,
        outlineColor: Color.WHITE,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: `${point.id}\n${createSurfaceMarkerLabel(point)}`,
        font: "13px sans-serif",
        pixelOffset: new Cartesian2(0, -24),
        showBackground: true,
        verticalOrigin: VerticalOrigin.BOTTOM,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
    markerIds.add(markerId);
  }
}

export function buildSurfaceExportJson(points: SurfaceControlPoint[]) {
  return {
    coordinateMode: "geodetic",
    source: "cesium_surface",
    generatedAt: new Date().toISOString(),
    points: points.map((point) => ({
      id: point.id,
      longitude: point.longitude,
      latitude: point.latitude,
      height: point.height,
      ecef: point.ecef,
      note: point.note,
      createdAt: point.createdAt,
    })),
  };
}
