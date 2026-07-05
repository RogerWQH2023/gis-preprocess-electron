export function getPathFileName(filePath: string): string {
  // 仅用于界面展示，兼容 Windows 与类 Unix 路径分隔符。
  return filePath.split(/[\\/]/).filter(Boolean).pop() ?? filePath;
}

export function getPathStem(filePath: string): string {
  const fileName = getPathFileName(filePath);
  const safeName = fileName.replace(/[<>:"/\\|?*]/g, "_").trim();

  return safeName || "osgb-model";
}

export function joinPreviewPath(parentDir: string, childName: string): string {
  const normalizedParent = parentDir.replace(/[\\/]+$/, "");
  const separator = normalizedParent.includes("\\") ? "\\" : "/";

  return `${normalizedParent}${separator}${childName}`;
}
