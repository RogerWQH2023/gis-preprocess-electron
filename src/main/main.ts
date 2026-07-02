import { app, BrowserWindow, Menu } from "electron";

import { bindWindowStateEvents, registerWindowIpc } from "./ipc/window.js";
import {
  applyWindowSecurity,
  getPreloadPath,
  getRendererIndexPath,
  isDev,
  lockWindowZoom,
  RENDERER_DEV_SERVER_URL,
} from "./utils/index.js";

// 需要在 app ready 之前关闭 Chromium 的触控板捏合缩放。
app.commandLine.appendSwitch("disable-pinch");

let mainWindow: BrowserWindow | null = null;

function createMainWindow(): BrowserWindow {
  const browserWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: "#f8fafc",
    webPreferences: {
      preload: getPreloadPath(),
      // 渲染进程不直接启用 Node.js；本机数据处理能力后续通过主进程 IPC 暴露。
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: true,
    },
  });

  lockWindowZoom(browserWindow);
  applyWindowSecurity(browserWindow);
  bindWindowStateEvents(browserWindow);

  browserWindow.once("ready-to-show", () => {
    browserWindow.show();
  });

  browserWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL) => {
      console.error(
        `[main] 页面加载失败：${validatedURL} (${errorCode}) ${errorDescription}`
      );

      // 即使页面加载失败也显示窗口，避免开发时 Electron 静默停在后台。
      if (!browserWindow.isVisible()) {
        browserWindow.show();
      }
    }
  );

  browserWindow.on("closed", () => {
    if (mainWindow === browserWindow) {
      mainWindow = null;
    }
  });

  if (isDev()) {
    void browserWindow.loadURL(
      process.env.ELECTRON_RENDERER_URL ?? RENDERER_DEV_SERVER_URL
    );
  } else {
    void browserWindow.loadFile(getRendererIndexPath());
  }

  return browserWindow;
}

async function bootstrap(): Promise<void> {
  await app.whenReady();

  // 关闭默认菜单，避免系统菜单里的缩放项绕过应用内控制。
  Menu.setApplicationMenu(null);

  registerWindowIpc(() => mainWindow);
  mainWindow = createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
}

void bootstrap();

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
