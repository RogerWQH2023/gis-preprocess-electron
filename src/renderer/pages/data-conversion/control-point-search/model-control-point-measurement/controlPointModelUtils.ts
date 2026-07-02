import { intersectRaysLeastSquares } from "./rayIntersection";

import type {
  ControlPoint,
  LoadedTilesetInfo,
  LoadStatus,
  RayObservation,
} from "./types";

export const statusText: Record<LoadStatus, string> = {
  idle: "待加载",
  loading: "加载中",
  loaded: "已加载",
  error: "加载失败",
};

export const statusPillClass: Record<LoadStatus, string> = {
  idle: "idle",
  loading: "running",
  loaded: "success",
  error: "error",
};

export function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function formatNumber(value: number, fractionDigits = 3): string {
  return Number.isFinite(value) ? value.toFixed(fractionDigits) : "-";
}

export function createControlPointId(index: number): string {
  return `GCP_${String(index).padStart(3, "0")}`;
}

export function recomputeControlPoint(
  point: ControlPoint,
  observations: RayObservation[],
): ControlPoint {
  const result = intersectRaysLeastSquares(observations);

  return {
    ...point,
    observations,
    local: result?.point ?? null,
    error: result?.meanError ?? null,
    confirmed: false,
  };
}

export function getControlPointStatus(
  point: ControlPoint,
  modelRadius: number,
): string {
  if (point.confirmed) {
    return "已确认";
  }

  if (!point.local || point.error === null) {
    return "未完成";
  }

  const reviewThreshold = Math.max(modelRadius, 1) * 0.05;

  return point.error > reviewThreshold ? "需复核" : "已计算";
}

export function getControlPointStatusClass(
  point: ControlPoint,
  modelRadius: number,
): string {
  const status = getControlPointStatus(point, modelRadius);

  if (status === "已确认" || status === "已计算") {
    return "success";
  }

  if (status === "需复核") {
    return "warning";
  }

  return "idle";
}

export function buildExportJson(
  loadedTileset: LoadedTilesetInfo | null,
  controlPoints: ControlPoint[],
) {
  return {
    coordinateMode: "local",
    source: "3dgs_3dtiles",
    generatedAt: new Date().toISOString(),
    tileset: loadedTileset,
    points: controlPoints
      .filter((point) => point.local)
      .map((point) => ({
        id: point.id,
        local: point.local
          ? [point.local.x, point.local.y, point.local.z]
          : [0, 0, 0],
        observations: point.observations.length,
        error: point.error,
        note: point.note,
      })),
  };
}

export function downloadJson(fileName: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
