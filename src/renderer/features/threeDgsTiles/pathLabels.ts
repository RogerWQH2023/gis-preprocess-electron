export function getPathFileName(filePath: string): string {
  return filePath.split(/[\\/]/).filter(Boolean).pop() ?? filePath;
}

export function getPathStem(filePath: string): string {
  const fileName = getPathFileName(filePath);
  return fileName.replace(/\.ply$/i, "") || "tileset";
}

export function joinPreviewPath(parentDir: string, childName: string): string {
  const normalizedParent = parentDir.replace(/[\\/]+$/, "");
  const separator = normalizedParent.includes("\\") ? "\\" : "/";

  return `${normalizedParent}${separator}${childName}`;
}
