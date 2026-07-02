import type { ParsedPointPair, Vector3 } from "./similarityTransform";

export type Axis = "x" | "y" | "z";
export type CoordinateGroup = "model" | "earth";

export interface CoordinateInput {
  x: string;
  y: string;
  z: string;
}

export interface ControlPointRow {
  id: string;
  model: CoordinateInput;
  earth: CoordinateInput;
}

export const AXES: Axis[] = ["x", "y", "z"];
export const MIN_POINT_COUNT = 3;

let nextPointId = 1;

function createEmptyCoordinate(): CoordinateInput {
  return { x: "", y: "", z: "" };
}

export function createControlPointRow(): ControlPointRow {
  return {
    id: `control-point-${nextPointId++}`,
    model: createEmptyCoordinate(),
    earth: createEmptyCoordinate(),
  };
}

export function createControlPointRowFromValues(
  model: CoordinateInput,
  earth: CoordinateInput,
): ControlPointRow {
  return {
    id: `control-point-${nextPointId++}`,
    model,
    earth,
  };
}

export function createInitialRows(): ControlPointRow[] {
  return Array.from({ length: MIN_POINT_COUNT }, createControlPointRow);
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

function parseCoordinate(
  coordinate: CoordinateInput,
  label: string,
  groupName: string,
): Vector3 {
  return [
    parseNumber(coordinate.x, `${label} ${groupName} X`),
    parseNumber(coordinate.y, `${label} ${groupName} Y`),
    parseNumber(coordinate.z, `${label} ${groupName} Z`),
  ];
}

export function parsePointRows(rows: ControlPointRow[]): ParsedPointPair[] {
  if (rows.length < MIN_POINT_COUNT) {
    throw new Error(`至少需要 ${MIN_POINT_COUNT} 对控制点`);
  }

  return rows.map((row, index) => {
    const label = `点 ${index + 1}`;

    return {
      id: row.id,
      label,
      model: parseCoordinate(row.model, label, "模型坐标"),
      earth: parseCoordinate(row.earth, label, "Cesium 坐标"),
    };
  });
}
