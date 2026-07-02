import { app } from "electron";
import path from "node:path";

export function getPreloadPath(): string {
  return path.join(app.getAppPath(), "dist/main/preload.cjs");
}

export function getRendererIndexPath(): string {
  return path.join(app.getAppPath(), "dist/renderer/index.html");
}

