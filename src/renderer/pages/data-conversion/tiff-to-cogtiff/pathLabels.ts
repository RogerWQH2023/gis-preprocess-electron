export function getPathFileName(filePath: string): string {
  // 只用于前端展示，不访问真实文件系统；兼容 Windows 和类 Unix 分隔符。
  return filePath.split(/[\\/]/).filter(Boolean).pop() ?? filePath;
}

export function getPathStem(filePath: string): string {
  const fileName = getPathFileName(filePath);
  return fileName.replace(/\.[^.\\/]+$/i, "") || "result";
}

export function joinPreviewPath(parentDir: string, childName: string): string {
  const normalizedParent = parentDir.replace(/[\\/]+$/, "");
  const separator = normalizedParent.includes("\\") ? "\\" : "/";

  return `${normalizedParent}${separator}${childName}`;
}
