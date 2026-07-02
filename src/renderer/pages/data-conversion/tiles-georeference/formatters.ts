import type { Vector3 } from "./similarityTransform";

export function formatNumber(value: number, significantDigits = 16): string {
  const normalizedValue = Math.abs(value) < 1e-12 ? 0 : value;

  return Number(normalizedValue.toPrecision(significantDigits)).toString();
}

export function formatMetric(value: number): string {
  if (Math.abs(value) >= 1000) {
    return formatNumber(value, 12);
  }

  return Number(value.toFixed(6)).toString();
}

export function formatVector(vector: Vector3): string {
  return vector.map((value) => formatMetric(value)).join(", ");
}

export function formatTransformJson(matrixColumnMajor: number[]): string {
  const formattedValues = matrixColumnMajor.map((value) => formatNumber(value));

  return [
    `"transform": [`,
    `  ${formattedValues.slice(0, 4).join(", ")},`,
    `  ${formattedValues.slice(4, 8).join(", ")},`,
    `  ${formattedValues.slice(8, 12).join(", ")},`,
    `  ${formattedValues.slice(12, 16).join(", ")}`,
    `]`,
  ].join("\n");
}
