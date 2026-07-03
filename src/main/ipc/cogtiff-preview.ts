import { BrowserWindow, dialog, ipcMain, protocol } from "electron";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

import type {
  IpcMainInvokeEvent,
  OpenDialogOptions,
  OpenDialogReturnValue,
} from "electron";

export const LOCAL_COGTIFF_SCHEME = "gis-cogtiff";
const CORS_RESPONSE_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range, Content-Type",
  "Access-Control-Expose-Headers":
    "Accept-Ranges, Content-Length, Content-Range, Content-Type",
} as const;

const CHANNELS = {
  selectCogTiff: "cogtiff-preview:select-cogtiff",
} as const;

type MainWindowGetter = () => BrowserWindow | null;

type SelectCogTiffResult =
  | { canceled: true }
  | {
      canceled: false;
      path: string;
      name: string;
      url: string;
      sizeBytes: number;
    };

type ByteRange = {
  start: number;
  end: number;
};

const cogTiffFiles = new Map<string, string>();
let hasRegisteredCogTiffIpc = false;
let hasHandledLocalCogTiffProtocol = false;

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

function createCogTiffUrl(token: string, fileName: string): string {
  return `${LOCAL_COGTIFF_SCHEME}://local/${token}/${encodeURIComponent(
    fileName
  )}`;
}

function resolveLocalCogTiffPath(requestUrl: string): string {
  const url = new URL(requestUrl);
  const pathSegments = url.pathname
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => decodeURIComponent(segment));
  const token = pathSegments.shift();

  if (!token) {
    throw new Error("缺少 COGTiff 访问令牌。");
  }

  const filePath = cogTiffFiles.get(token);

  if (!filePath) {
    throw new Error("COGTiff 访问令牌已失效。");
  }

  return filePath;
}

function parseByteRange(value: string | null, fileSize: number): ByteRange | null {
  if (!value) {
    return null;
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());

  if (!match) {
    throw new Error("Range 请求格式不正确。");
  }

  const [, startText, endText] = match;
  let start: number;
  let end: number;

  if (!startText && !endText) {
    throw new Error("Range 请求缺少起止字节。");
  }

  if (!startText) {
    const suffixLength = Number(endText);

    if (!Number.isInteger(suffixLength) || suffixLength <= 0) {
      throw new Error("Range 后缀长度不正确。");
    }

    start = Math.max(fileSize - suffixLength, 0);
    end = fileSize - 1;
  } else {
    start = Number(startText);
    end = endText ? Number(endText) : fileSize - 1;
  }

  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    start >= fileSize
  ) {
    throw new Error("Range 请求超出文件范围。");
  }

  return {
    start,
    end: Math.min(end, fileSize - 1),
  };
}

function createHeaders(
  fileSize: number,
  range: ByteRange | null
): Record<string, string> {
  const contentLength = range ? range.end - range.start + 1 : fileSize;
  const headers: Record<string, string> = {
    ...CORS_RESPONSE_HEADERS,
    "Accept-Ranges": "bytes",
    "Content-Length": String(contentLength),
    "Content-Type": "image/tiff",
  };

  if (range) {
    headers["Content-Range"] = `bytes ${range.start}-${range.end}/${fileSize}`;
  }

  return headers;
}

async function createCogTiffResponse(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: CORS_RESPONSE_HEADERS,
    });
  }

  const filePath = resolveLocalCogTiffPath(request.url);
  const fileStat = await stat(filePath);
  const range = parseByteRange(request.headers.get("range"), fileStat.size);
  const headers = createHeaders(fileStat.size, range);
  const status = range ? 206 : 200;

  if (request.method === "HEAD") {
    return new Response(null, { status, headers });
  }

  const stream = createReadStream(filePath, {
    start: range?.start,
    end: range?.end,
  });

  // Electron 的 protocol.handle 返回 Web Response；Node 文件流需要转成 Web ReadableStream。
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    status,
    headers,
  });
}

function registerLocalCogTiffProtocolHandler(): void {
  if (hasHandledLocalCogTiffProtocol) {
    return;
  }

  hasHandledLocalCogTiffProtocol = true;

  protocol.handle(LOCAL_COGTIFF_SCHEME, async (request) => {
    try {
      return await createCogTiffResponse(request);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      return new Response(message, {
        status: 404,
        headers: {
          ...CORS_RESPONSE_HEADERS,
          "Content-Type": "text/plain; charset=utf-8",
        },
      });
    }
  });
}

export function registerCogTiffPreviewIpc(
  getMainWindow: MainWindowGetter
): void {
  if (hasRegisteredCogTiffIpc) {
    return;
  }

  hasRegisteredCogTiffIpc = true;
  registerLocalCogTiffProtocolHandler();

  ipcMain.handle(
    CHANNELS.selectCogTiff,
    async (event): Promise<SelectCogTiffResult> => {
      const browserWindow = resolveWindow(event, getMainWindow);
      const result = await showOpenDialog(browserWindow, {
        title: "选择 COGTiff / GeoTIFF 文件",
        properties: ["openFile"],
        filters: [
          { name: "TIFF 文件", extensions: ["tif", "tiff"] },
          { name: "所有文件", extensions: ["*"] },
        ],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true };
      }

      const selectedPath = result.filePaths[0];
      const fileStat = await stat(selectedPath);
      const token = randomUUID();

      cogTiffFiles.set(token, selectedPath);

      return {
        canceled: false,
        path: selectedPath,
        name: path.basename(selectedPath),
        url: createCogTiffUrl(token, path.basename(selectedPath)),
        sizeBytes: fileStat.size,
      };
    }
  );
}
