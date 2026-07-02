export function getPathFileName(filePath: string): string {
  // Windows 与类 Unix 路径分隔符都可能出现在用户选择结果中。
  return filePath.split(/[\\/]/).filter(Boolean).pop() ?? filePath;
}

export function getPathStem(filePath: string): string {
  const fileName = getPathFileName(filePath);

  // 当前工具只接收 PLY，移除扩展名后作为默认输出目录名的一部分。
  return fileName.replace(/\.ply$/i, "") || "tileset";
}

export function joinPreviewPath(parentDir: string, childName: string): string {
  const normalizedParent = parentDir.replace(/[\\/]+$/, "");
  const separator = normalizedParent.includes("\\") ? "\\" : "/";

  return `${normalizedParent}${separator}${childName}`;
}
