import { shell } from "electron";

import { isDev, RENDERER_DEV_SERVER_URL } from "./env.js";

import type { BrowserWindow } from "electron";

function isHttpUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

function isAllowedAppNavigation(url: string): boolean {
  if (isDev()) {
    return url.startsWith(RENDERER_DEV_SERVER_URL);
  }

  return url.startsWith("file://");
}

export function applyWindowSecurity(browserWindow: BrowserWindow): void {
  browserWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isHttpUrl(url)) {
      void shell.openExternal(url);
    }

    return { action: "deny" };
  });

  browserWindow.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedAppNavigation(url)) {
      event.preventDefault();
    }
  });
}

