import type { Cartesian3 } from "cesium";

export type SurfaceControlPoint = {
  id: string;
  position: Cartesian3;
  longitude: number;
  latitude: number;
  height: number;
  ecef: {
    x: number;
    y: number;
    z: number;
  };
  note: string;
  createdAt: string;
};

export type OsmBuildingsStatus = "off" | "loading" | "on" | "error";
