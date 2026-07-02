export const RENDERER_DEV_SERVER_URL = "http://127.0.0.1:5173";

export function isDev(): boolean {
  return process.env.NODE_ENV === "development";
}

