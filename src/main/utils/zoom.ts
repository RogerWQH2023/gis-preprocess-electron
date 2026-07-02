import type { BrowserWindow, Input } from "electron";

const ZOOM_SHORTCUT_KEYS = new Set([
  "+",
  "=",
  "-",
  "_",
  "0",
  "numadd",
  "numsub",
]);

const ZOOM_SHORTCUT_CODES = new Set([
  "equal",
  "minus",
  "digit0",
  "numpadadd",
  "numpadsubtract",
  "numpad0",
]);

function isZoomShortcut(input: Input): boolean {
  if (!input.control && !input.meta) {
    return false;
  }

  const key = input.key.toLowerCase();
  const code = input.code.toLowerCase();

  return ZOOM_SHORTCUT_KEYS.has(key) || ZOOM_SHORTCUT_CODES.has(code);
}

export function lockWindowZoom(browserWindow: BrowserWindow): void {
  const { webContents } = browserWindow;

  const resetZoom = () => {
    webContents.setZoomFactor(1);
    void webContents.setVisualZoomLevelLimits(1, 1);
  };

  webContents.on("did-finish-load", resetZoom);

  webContents.on("zoom-changed", (event) => {
    event.preventDefault();
    resetZoom();
  });

  webContents.on("before-input-event", (event, input) => {
    if (isZoomShortcut(input)) {
      event.preventDefault();
      resetZoom();
    }
  });
}

