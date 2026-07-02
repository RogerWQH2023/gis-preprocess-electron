interface WindowControlsProps {
  isMaximized: boolean;
}

export function WindowControls({ isMaximized }: WindowControlsProps) {
  const windowApi = window.electronAPI?.window;
  const disabled = !windowApi;

  return (
    <div className="window-controls" aria-label="窗口控制">
      <button
        type="button"
        className="window-control"
        aria-label="最小化窗口"
        disabled={disabled}
        onClick={() => windowApi?.minimize()}
      >
        <span aria-hidden="true">-</span>
      </button>
      <button
        type="button"
        className="window-control"
        aria-label={isMaximized ? "还原窗口" : "最大化窗口"}
        disabled={disabled}
        onClick={() => {
          void windowApi?.toggleMaximize();
        }}
      >
        <span aria-hidden="true">{isMaximized ? "❐" : "□"}</span>
      </button>
      <button
        type="button"
        className="window-control window-control--danger"
        aria-label="关闭窗口"
        disabled={disabled}
        onClick={() => windowApi?.close()}
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}

