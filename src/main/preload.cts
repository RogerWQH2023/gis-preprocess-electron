import { contextBridge, ipcRenderer } from "electron";

const CHANNELS = {
  minimize: "window:minimize",
  toggleMaximize: "window:toggle-maximize",
  close: "window:close",
  openDevTools: "window:open-devtools",
  isMaximized: "window:is-maximized",
  maximizedChange: "window:maximized-change",
} as const;

type RemoveListener = () => void;
type MaximizedChangeCallback = (isMaximized: boolean) => void;

const electronAPI = {
  runtime: {
    platform: process.platform,
    isElectron: true,
  },
  window: {
    minimize: () => ipcRenderer.send(CHANNELS.minimize),
    close: () => ipcRenderer.send(CHANNELS.close),
    openDevTools: () => ipcRenderer.send(CHANNELS.openDevTools),
    toggleMaximize: () =>
      ipcRenderer.invoke(CHANNELS.toggleMaximize) as Promise<boolean>,
    isMaximized: () =>
      ipcRenderer.invoke(CHANNELS.isMaximized) as Promise<boolean>,
    onMaximizedChange: (
      callback: MaximizedChangeCallback
    ): RemoveListener => {
      const listener = (_event: Electron.IpcRendererEvent, value: boolean) => {
        callback(value);
      };

      ipcRenderer.on(CHANNELS.maximizedChange, listener);

      // 返回取消监听函数，避免 React 组件卸载后仍保留事件监听。
      return () => {
        ipcRenderer.removeListener(CHANNELS.maximizedChange, listener);
      };
    },
  },
} as const;

// 只暴露受控 API，不把 ipcRenderer 或 Node.js 对象直接交给渲染进程。
contextBridge.exposeInMainWorld("electronAPI", electronAPI);

export type ElectronAPI = typeof electronAPI;

