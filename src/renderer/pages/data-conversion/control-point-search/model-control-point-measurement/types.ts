import type { Cartesian3 } from "cesium";

export type LoadStatus = "idle" | "loading" | "loaded" | "error";

export type TilesetTransformMode = "use" | "ignore";

export type LoadedTilesetInfo = {
  name: string;
  path: string;
  url: string;
  transformMode: TilesetTransformMode;
};

export type LocalVector3 = {
  x: number;
  y: number;
  z: number;
};

export type RayObservation = {
  id: string;
  origin: LocalVector3;
  direction: LocalVector3;
  createdAt: string;
};

export type ControlPoint = {
  id: string;
  note: string;
  observations: RayObservation[];
  local: LocalVector3 | null;
  error: number | null;
  confirmed: boolean;
};

export type LocalCameraNavigation = {
  target: Cartesian3;
  radius: number;
  distance: number;
  minDistance: number;
  maxDistance: number;
  yaw: number;
  pitch: number;
  isDragging: boolean;
  dragMoved: boolean;
  suppressNextClick: boolean;
};
