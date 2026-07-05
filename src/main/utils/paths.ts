import { app } from "electron";
import path from "node:path";

import { isDev } from "./env.js";

export function getAppIconPath(): string {
  if (isDev()) {
    return path.join(app.getAppPath(), "resources/icon.png");
  }

  return path.join(process.resourcesPath, "icon.png");
}

export function getPreloadPath(): string {
  return path.join(app.getAppPath(), "dist/main/preload.cjs");
}

export function getRendererIndexPath(): string {
  return path.join(app.getAppPath(), "dist/renderer/index.html");
}
