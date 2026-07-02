import { BrowserWindow, dialog, ipcMain, net, protocol } from "electron";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type {
  IpcMainInvokeEvent,
  OpenDialogOptions,
  OpenDialogReturnValue,
} from "electron";

const LOCAL_TILES_SCHEME = "gis-tiles";

const CHANNELS = {
  selectTileset: "three-dgs-tiles-preview:select-tileset",
} as const;

type MainWindowGetter = () => BrowserWindow | null;

type SelectTilesetResult =
  | { canceled: true }
  | {
      canceled: false;
      path: string;
      name: string;
      url: string;
    };

const tilesetRoots = new Map<string, string>();
let hasRegisteredPreviewIpc = false;
let hasHandledLocalTilesProtocol = false;

export function registerLocalTilesProtocolScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: LOCAL_TILES_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}

function resolveWindow(
  event: IpcMainInvokeEvent,
  getMainWindow: MainWindowGetter
): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender) ?? getMainWindow();
}

async function showOpenDialog(
  browserWindow: BrowserWindow | null,
  options: OpenDialogOptions
): Promise<OpenDialogReturnValue> {
  return browserWindow
    ? dialog.showOpenDialog(browserWindow, options)
    : dialog.showOpenDialog(options);
}

function createTilesetUrl(token: string): string {
  return `${LOCAL_TILES_SCHEME}://local/${token}/tileset.json`;
}

function resolveLocalTilesPath(requestUrl: string): string {
  const url = new URL(requestUrl);
  const pathSegments = url.pathname
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => decodeURIComponent(segment));
  const token = pathSegments.shift();

  if (!token) {
    throw new Error("缺少 3D Tiles 访问令牌。");
  }

  const rootDirectory = tilesetRoots.get(token);

  if (!rootDirectory) {
    throw new Error("3D Tiles 访问令牌已失效。");
  }

  const requestedRelativePath = pathSegments.join(path.sep);
  const requestedPath = path.resolve(rootDirectory, requestedRelativePath);
  const relativeToRoot = path.relative(rootDirectory, requestedPath);

  // 只允许读取被选择 tileset.json 所在目录及其子目录，避免 ../ 越界访问。
  if (
    relativeToRoot.startsWith("..") ||
    path.isAbsolute(relativeToRoot) ||
    relativeToRoot.length === 0
  ) {
    if (relativeToRoot.length !== 0) {
      throw new Error("3D Tiles 资源路径越界。");
    }
  }

  return requestedPath;
}

function registerLocalTilesProtocolHandler(): void {
  if (hasHandledLocalTilesProtocol) {
    return;
  }

  hasHandledLocalTilesProtocol = true;

  protocol.handle(LOCAL_TILES_SCHEME, async (request) => {
    try {
      const filePath = resolveLocalTilesPath(request.url);

      return net.fetch(pathToFileURL(filePath).toString());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      return new Response(message, { status: 404 });
    }
  });
}

export function registerThreeDgsTilesPreviewIpc(
  getMainWindow: MainWindowGetter
): void {
  if (hasRegisteredPreviewIpc) {
    return;
  }

  hasRegisteredPreviewIpc = true;
  registerLocalTilesProtocolHandler();

  ipcMain.handle(
    CHANNELS.selectTileset,
    async (event): Promise<SelectTilesetResult> => {
      const browserWindow = resolveWindow(event, getMainWindow);
      const result = await showOpenDialog(browserWindow, {
        title: "选择 3D Tiles tileset.json",
        properties: ["openFile"],
        filters: [
          { name: "tileset.json", extensions: ["json"] },
          { name: "所有文件", extensions: ["*"] },
        ],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true };
      }

      const selectedPath = result.filePaths[0];
      const token = randomUUID();

      tilesetRoots.set(token, path.dirname(selectedPath));

      return {
        canceled: false,
        path: selectedPath,
        name: path.basename(selectedPath),
        url: createTilesetUrl(token),
      };
    }
  );
}
