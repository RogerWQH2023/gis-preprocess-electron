import { Cartesian3 } from "cesium";

import type {
  Cesium3DTileset,
  Viewer as CesiumViewer,
} from "cesium";
import type { LocalCameraNavigation } from "./types";

const DEFAULT_CAMERA_YAW = 0;
const DEFAULT_CAMERA_PITCH = Math.atan2(0.8, 2.5);
const MIN_CAMERA_PITCH = -Math.PI * 0.48;
const MAX_CAMERA_PITCH = Math.PI * 0.48;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function shouldIgnoreKeyboardEvent(event: KeyboardEvent): boolean {
  if (event.altKey || event.ctrlKey || event.metaKey) {
    return true;
  }

  const target = event.target;

  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();

  return (
    target.isContentEditable ||
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select"
  );
}

export function createDefaultNavigation(): LocalCameraNavigation {
  return {
    target: Cartesian3.clone(Cartesian3.ZERO),
    radius: 50,
    distance: 135,
    minDistance: 1,
    maxDistance: 50_000,
    yaw: DEFAULT_CAMERA_YAW,
    pitch: DEFAULT_CAMERA_PITCH,
    isDragging: false,
    dragMoved: false,
    suppressNextClick: false,
  };
}

function createCameraOrientation(destination: Cartesian3, target: Cartesian3) {
  const direction = Cartesian3.normalize(
    Cartesian3.subtract(target, destination, new Cartesian3()),
    new Cartesian3(),
  );
  let right = Cartesian3.cross(direction, Cartesian3.UNIT_Z, new Cartesian3());

  if (Cartesian3.magnitudeSquared(right) < 1e-8) {
    right = Cartesian3.cross(direction, Cartesian3.UNIT_X, right);
  }

  Cartesian3.normalize(right, right);

  const up = Cartesian3.normalize(
    Cartesian3.cross(right, direction, new Cartesian3()),
    new Cartesian3(),
  );

  return { direction, up };
}

function configureCameraFrustum(
  viewer: CesiumViewer,
  radius: number,
  distance: number,
): void {
  viewer.camera.frustum.near = Math.max(radius * 0.0005, 0.001);
  viewer.camera.frustum.far = Math.max(radius * 100, distance + radius * 20);
}

export function applyLocalCamera(
  viewer: CesiumViewer,
  navigation: LocalCameraNavigation,
): void {
  const horizontalDistance = navigation.distance * Math.cos(navigation.pitch);
  const offset = new Cartesian3(
    horizontalDistance * Math.sin(navigation.yaw),
    -horizontalDistance * Math.cos(navigation.yaw),
    navigation.distance * Math.sin(navigation.pitch),
  );
  const destination = Cartesian3.add(
    navigation.target,
    offset,
    new Cartesian3(),
  );

  viewer.camera.setView({
    destination,
    orientation: createCameraOrientation(destination, navigation.target),
  });

  configureCameraFrustum(viewer, navigation.radius, navigation.distance);
  viewer.scene.requestRender();
}

function resetLocalNavigation(
  viewer: CesiumViewer,
  navigation: LocalCameraNavigation,
  target: Cartesian3,
  radius: number,
): void {
  const normalizedRadius = Math.max(radius, 1);

  navigation.target = Cartesian3.clone(target);
  navigation.radius = normalizedRadius;
  navigation.distance = normalizedRadius * 2.65;
  navigation.minDistance = Math.max(normalizedRadius * 0.08, 0.01);
  navigation.maxDistance = normalizedRadius * 80;
  navigation.yaw = DEFAULT_CAMERA_YAW;
  navigation.pitch = DEFAULT_CAMERA_PITCH;
  navigation.isDragging = false;
  navigation.dragMoved = false;
  navigation.suppressNextClick = false;

  applyLocalCamera(viewer, navigation);
}

export function setLocalDefaultView(
  viewer: CesiumViewer,
  navigation: LocalCameraNavigation,
): void {
  resetLocalNavigation(viewer, navigation, Cartesian3.ZERO, 50);
}

export function focusTileset(
  viewer: CesiumViewer,
  tileset: Cesium3DTileset,
  navigation: LocalCameraNavigation,
): void {
  const { center, radius } = tileset.boundingSphere;

  resetLocalNavigation(viewer, navigation, center, radius);
}

export function rotateLocalCamera(
  viewer: CesiumViewer,
  navigation: LocalCameraNavigation,
  deltaX: number,
  deltaY: number,
): void {
  navigation.yaw -= deltaX * 0.006;
  navigation.pitch = clamp(
    navigation.pitch + deltaY * 0.006,
    MIN_CAMERA_PITCH,
    MAX_CAMERA_PITCH,
  );

  applyLocalCamera(viewer, navigation);
}

export function zoomLocalCamera(
  viewer: CesiumViewer,
  navigation: LocalCameraNavigation,
  delta: number,
): void {
  navigation.distance = clamp(
    navigation.distance * Math.exp(-delta * 0.001),
    navigation.minDistance,
    navigation.maxDistance,
  );

  applyLocalCamera(viewer, navigation);
}

export function moveLocalCameraTarget(
  viewer: CesiumViewer,
  navigation: LocalCameraNavigation,
  horizontalDirection: number,
  verticalDirection: number,
): void {
  const step = Math.max(navigation.distance * 0.06, navigation.radius * 0.01);
  const horizontalOffset = Cartesian3.multiplyByScalar(
    viewer.camera.rightWC,
    horizontalDirection * step,
    new Cartesian3(),
  );
  const verticalOffset = Cartesian3.multiplyByScalar(
    viewer.camera.upWC,
    verticalDirection * step,
    new Cartesian3(),
  );
  const offset = Cartesian3.add(
    horizontalOffset,
    verticalOffset,
    new Cartesian3(),
  );

  navigation.target = Cartesian3.add(
    navigation.target,
    offset,
    new Cartesian3(),
  );
  navigation.isDragging = false;
  navigation.dragMoved = false;
  navigation.suppressNextClick = false;

  applyLocalCamera(viewer, navigation);
}
