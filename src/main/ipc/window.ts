import { BrowserWindow, ipcMain } from "electron";

import type { IpcMainEvent, IpcMainInvokeEvent } from "electron";

const CHANNELS = {
  minimize: "window:minimize",
  toggleMaximize: "window:toggle-maximize",
  close: "window:close",
  openDevTools: "window:open-devtools",
  isMaximized: "window:is-maximized",
  maximizedChange: "window:maximized-change",
} as const;

type MainWindowGetter = () => BrowserWindow | null;

let hasRegisteredWindowIpc = false;

function resolveWindow(
  event: IpcMainEvent | IpcMainInvokeEvent,
  getMainWindow: MainWindowGetter
): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender) ?? getMainWindow();
}

function sendMaximizedState(browserWindow: BrowserWindow): void {
  browserWindow.webContents.send(
    CHANNELS.maximizedChange,
    browserWindow.isMaximized()
  );
}

export function bindWindowStateEvents(browserWindow: BrowserWindow): void {
  browserWindow.on("maximize", () => sendMaximizedState(browserWindow));
  browserWindow.on("unmaximize", () => sendMaximizedState(browserWindow));
}

export function registerWindowIpc(getMainWindow: MainWindowGetter): void {
  if (hasRegisteredWindowIpc) {
    return;
  }

  hasRegisteredWindowIpc = true;

  ipcMain.on(CHANNELS.minimize, (event) => {
    resolveWindow(event, getMainWindow)?.minimize();
  });

  ipcMain.on(CHANNELS.close, (event) => {
    resolveWindow(event, getMainWindow)?.close();
  });

  ipcMain.on(CHANNELS.openDevTools, (event) => {
    const browserWindow = resolveWindow(event, getMainWindow);
    if (!browserWindow?.webContents.isDevToolsOpened()) {
      browserWindow?.webContents.openDevTools({ mode: "detach" });
    }
  });

  ipcMain.handle(CHANNELS.toggleMaximize, (event) => {
    const browserWindow = resolveWindow(event, getMainWindow);
    if (!browserWindow) {
      return false;
    }

    if (browserWindow.isMaximized()) {
      browserWindow.unmaximize();
    } else {
      browserWindow.maximize();
    }

    return browserWindow.isMaximized();
  });

  ipcMain.handle(CHANNELS.isMaximized, (event) => {
    return resolveWindow(event, getMainWindow)?.isMaximized() ?? false;
  });
}

