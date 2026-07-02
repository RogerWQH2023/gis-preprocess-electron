export {};

declare global {
  interface Window {
    electronAPI?: {
      runtime: {
        platform: NodeJS.Platform;
        isElectron: true;
      };
      window: {
        minimize: () => void;
        close: () => void;
        openDevTools: () => void;
        toggleMaximize: () => Promise<boolean>;
        isMaximized: () => Promise<boolean>;
        onMaximizedChange: (
          callback: (isMaximized: boolean) => void
        ) => () => void;
      };
    };
  }
}

