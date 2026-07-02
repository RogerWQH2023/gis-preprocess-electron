import {
  createControlPointRowFromValues,
  MIN_POINT_COUNT,
  type ControlPointRow,
  type CoordinateInput,
} from "./controlPointRows";
import { formatNumber } from "./formatters";
import type { Vector3 } from "./similarityTransform";

export type GeodeticAxis = "longitude" | "latitude" | "height";
export type GeodeticDatum = "wgs84" | "cgcs2000";

export interface GeodeticInput {
  longitude: string;
  latitude: string;
  height: string;
}

export interface GeodeticPointRow {
  id: string;
  model: CoordinateInput;
  geodetic: GeodeticInput;
}

export const GEODETIC_AXES: GeodeticAxis[] = [
  "longitude",
  "latitude",
  "height",
];

export const GEODETIC_AXIS_LABELS: Record<GeodeticAxis, string> = {
  longitude: "经度 °",
  latitude: "纬度 °",
  height: "高程 m",
};

export const GEODETIC_DATUM_LABELS: Record<GeodeticDatum, string> = {
  wgs84: "WGS84",
  cgcs2000: "CGCS2000",
};

const ELLIPSOID_PARAMETERS: Record<
  GeodeticDatum,
  { semiMajorAxis: number; inverseFlattening: number }
> = {
  wgs84: {
    semiMajorAxis: 6378137,
    inverseFlattening: 298.257223563,
  },
  cgcs2000: {
    semiMajorAxis: 6378137,
    inverseFlattening: 298.257222101,
  },
};

let nextGeodeticPointId = 1;

function createEmptyCoordinate(): CoordinateInput {
  return { x: "", y: "", z: "" };
}

function createEmptyGeodeticInput(): GeodeticInput {
  return { longitude: "", latitude: "", height: "" };
}

export function createGeodeticPointRow(): GeodeticPointRow {
  return {
    id: `geodetic-point-${nextGeodeticPointId++}`,
    model: createEmptyCoordinate(),
    geodetic: createEmptyGeodeticInput(),
  };
}

export function createInitialGeodeticRows(): GeodeticPointRow[] {
  return Array.from({ length: MIN_POINT_COUNT }, createGeodeticPointRow);
}

function parseNumber(value: string, fieldName: string): number {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    throw new Error(`${fieldName} 不能为空`);
  }

  const parsedValue = Number(trimmedValue);

  if (!Number.isFinite(parsedValue)) {
    throw new Error(`${fieldName} 不是有效数字`);
  }

  return parsedValue;
}

function parseModelCoordinate(row: GeodeticPointRow, label: string): Vector3 {
  return [
    parseNumber(row.model.x, `${label} 模型坐标 X`),
    parseNumber(row.model.y, `${label} 模型坐标 Y`),
    parseNumber(row.model.z, `${label} 模型坐标 Z`),
  ];
}

function parseGeodeticInput(row: GeodeticPointRow, label: string): {
  longitude: number;
  latitude: number;
  height: number;
} {
  const longitude = parseNumber(row.geodetic.longitude, `${label} 经度`);
  const latitude = parseNumber(row.geodetic.latitude, `${label} 纬度`);
  const height = parseNumber(row.geodetic.height, `${label} 高程`);

  if (longitude < -180 || longitude > 180) {
    throw new Error(`${label} 经度应在 -180 到 180 度之间`);
  }

  if (latitude < -90 || latitude > 90) {
    throw new Error(`${label} 纬度应在 -90 到 90 度之间`);
  }

  return { longitude, latitude, height };
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function geodeticToEcef(
  longitudeDegrees: number,
  latitudeDegrees: number,
  height: number,
  datum: GeodeticDatum,
): Vector3 {
  const ellipsoid = ELLIPSOID_PARAMETERS[datum];
  const flattening = 1 / ellipsoid.inverseFlattening;
  const firstEccentricitySquared = flattening * (2 - flattening);
  const longitudeRadians = degreesToRadians(longitudeDegrees);
  const latitudeRadians = degreesToRadians(latitudeDegrees);
  const sinLatitude = Math.sin(latitudeRadians);
  const cosLatitude = Math.cos(latitudeRadians);
  const cosLongitude = Math.cos(longitudeRadians);
  const sinLongitude = Math.sin(longitudeRadians);

  // 卯酉圈曲率半径 N：把椭球面上的经纬度转换到三维直角坐标时需要它。
  const primeVerticalRadius =
    ellipsoid.semiMajorAxis /
    Math.sqrt(1 - firstEccentricitySquared * sinLatitude ** 2);

  // 经纬高转地心地固坐标 ECEF，也就是 Cesium Cartesian3 的 XYZ；不同基准面只改变椭球参数。
  const x = (primeVerticalRadius + height) * cosLatitude * cosLongitude;
  const y = (primeVerticalRadius + height) * cosLatitude * sinLongitude;
  const z =
    (primeVerticalRadius * (1 - firstEccentricitySquared) + height) *
    sinLatitude;

  return [x, y, z];
}

function vectorToCoordinateInput(vector: Vector3): CoordinateInput {
  return {
    x: formatNumber(vector[0], 16),
    y: formatNumber(vector[1], 16),
    z: formatNumber(vector[2], 16),
  };
}

export function convertGeodeticRowsToControlPointRows(
  rows: GeodeticPointRow[],
  datum: GeodeticDatum,
): ControlPointRow[] {
  if (rows.length < MIN_POINT_COUNT) {
    throw new Error(`至少需要 ${MIN_POINT_COUNT} 对控制点`);
  }

  return rows.map((row, index) => {
    const label = `点 ${index + 1}`;
    const model = parseModelCoordinate(row, label);
    const geodetic = parseGeodeticInput(row, label);
    const earth = geodeticToEcef(
      geodetic.longitude,
      geodetic.latitude,
      geodetic.height,
      datum,
    );

    return createControlPointRowFromValues(
      vectorToCoordinateInput(model),
      vectorToCoordinateInput(earth),
    );
  });
}
