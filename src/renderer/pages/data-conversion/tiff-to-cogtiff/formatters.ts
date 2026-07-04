export function formatBytes(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
    return "未知";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = sizeBytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function summarizeSrs(wkt: string | null): string {
  if (!wkt) {
    return "未检测到";
  }

  const authorityMatch = /AUTHORITY\["EPSG","(\d+)"\]/.exec(wkt);
  if (authorityMatch) {
    return `EPSG:${authorityMatch[1]}`;
  }

  const nameMatch = /(?:PROJCRS|GEOGCRS|GEOGCS|PROJCS)\["([^"]+)"/.exec(wkt);
  return nameMatch?.[1] ?? "已包含空间参考";
}
