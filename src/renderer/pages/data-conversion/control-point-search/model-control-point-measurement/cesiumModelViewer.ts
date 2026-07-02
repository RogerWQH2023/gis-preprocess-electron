import {
  Cartesian2,
  Cartesian3,
  Color,
  LabelStyle,
  VerticalOrigin,
  Viewer,
} from "cesium";

import { formatNumber } from "./controlPointModelUtils";

import type { Viewer as CesiumViewer } from "cesium";
import type { ControlPoint, LocalVector3, RayObservation } from "./types";

export function toLocalVector3(value: Cartesian3): LocalVector3 {
  return {
    x: value.x,
    y: value.y,
    z: value.z,
  };
}

export function toCartesian3(value: LocalVector3): Cartesian3 {
  return new Cartesian3(value.x, value.y, value.z);
}

function createObservationId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`;
}

export function createObservation(
  viewer: CesiumViewer,
  position: Cartesian2,
): RayObservation | null {
  const ray = viewer.camera.getPickRay(position);

  if (!ray) {
    return null;
  }

  const direction = Cartesian3.normalize(ray.direction, new Cartesian3());

  return {
    id: createObservationId(),
    origin: toLocalVector3(ray.origin),
    direction: toLocalVector3(direction),
    createdAt: new Date().toISOString(),
  };
}

export function createModelViewer(container: HTMLDivElement): CesiumViewer {
  const viewer = new Viewer(container, {
    animation: false,
    baseLayerPicker: false,
    fullscreenButton: false,
    geocoder: false,
    globe: false,
    homeButton: false,
    infoBox: false,
    navigationHelpButton: false,
    scene3DOnly: true,
    sceneModePicker: false,
    selectionIndicator: false,
    timeline: false,
  });

  viewer.scene.backgroundColor = Color.fromCssColorString("#151922");
  if (viewer.scene.skyBox) {
    viewer.scene.skyBox.show = false;
  }

  if (viewer.scene.skyAtmosphere) {
    viewer.scene.skyAtmosphere.show = false;
  }

  if (viewer.scene.sun) {
    viewer.scene.sun.show = false;
  }

  if (viewer.scene.moon) {
    viewer.scene.moon.show = false;
  }

  viewer.scene.fog.enabled = false;

  const cameraController = viewer.scene.screenSpaceCameraController;

  cameraController.enableRotate = false;
  cameraController.enableTranslate = false;
  cameraController.enableZoom = false;
  cameraController.enableTilt = false;
  cameraController.enableLook = false;
  cameraController.enableCollisionDetection = false;
  viewer.camera.constrainedAxis = undefined;

  return viewer;
}

export function renderControlPointMarkers(
  viewer: CesiumViewer,
  markerIds: Set<string>,
  controlPoints: ControlPoint[],
  hiddenControlPointIds: Set<string>,
): void {
  for (const markerId of markerIds) {
    viewer.entities.removeById(markerId);
  }

  markerIds.clear();

  for (const point of controlPoints) {
    if (!point.local || hiddenControlPointIds.has(point.id)) {
      continue;
    }

    const markerId = `control-point-marker-${point.id}`;
    const { x, y, z } = point.local;

    viewer.entities.add({
      id: markerId,
      position: toCartesian3(point.local),
      point: {
        pixelSize: 11,
        color: Color.fromCssColorString("#f03e3e"),
        outlineColor: Color.WHITE,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: `${point.id}\n${formatNumber(x)}, ${formatNumber(y)}, ${formatNumber(z)}`,
        font: "12px sans-serif",
        fillColor: Color.WHITE,
        outlineColor: Color.BLACK,
        outlineWidth: 3,
        style: LabelStyle.FILL_AND_OUTLINE,
        showBackground: true,
        backgroundColor: Color.fromCssColorString("#101828").withAlpha(0.82),
        verticalOrigin: VerticalOrigin.BOTTOM,
        pixelOffset: new Cartesian2(0, -16),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
    markerIds.add(markerId);
  }
}
