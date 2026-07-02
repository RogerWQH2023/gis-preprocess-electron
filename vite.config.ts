import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import type { PluginOption } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const cesiumPackageDirectory = path.dirname(
  require.resolve("cesium/package.json")
);
const cesiumBuildDirectory = path.join(
  cesiumPackageDirectory,
  "Build",
  "Cesium"
);
const cesiumStaticBase = "cesium";
const cesiumStaticDirectories = ["Assets", "ThirdParty", "Widgets", "Workers"];

function getContentType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case ".css":
      return "text/css";
    case ".js":
      return "text/javascript";
    case ".json":
      return "application/json";
    case ".wasm":
      return "application/wasm";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

function createCesiumStaticPlugin(): PluginOption {
  return {
    name: "copy-and-serve-cesium-static-assets",
    configureServer(server) {
      server.middlewares.use(`/${cesiumStaticBase}`, (request, response) => {
        const requestPath = decodeURIComponent(
          (request.url ?? "").split("?")[0] ?? ""
        );
        const normalizedRequestPath = requestPath
          .replace(/^\/+/, "")
          .replace(new RegExp(`^${cesiumStaticBase}/`), "");
        const filePath = path.resolve(
          cesiumBuildDirectory,
          normalizedRequestPath
        );
        const relativePath = path.relative(cesiumBuildDirectory, filePath);

        // 开发服务只允许访问 Cesium 构建目录内的静态资源，避免路径越界。
        if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
          response.statusCode = 403;
          response.end("Forbidden");
          return;
        }

        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          response.statusCode = 404;
          response.end("Not found");
          return;
        }

        response.setHeader("Content-Type", getContentType(filePath));
        fs.createReadStream(filePath).pipe(response);
      });
    },
    writeBundle() {
      const outputDirectory = path.resolve(
        __dirname,
        "dist",
        "renderer",
        cesiumStaticBase
      );

      for (const staticDirectory of cesiumStaticDirectories) {
        fs.cpSync(
          path.join(cesiumBuildDirectory, staticDirectory),
          path.join(outputDirectory, staticDirectory),
          { recursive: true }
        );
      }
    },
  };
}

// 渲染进程配置：主进程不交给 Vite 打包，保持与参考项目一致的独立编译模式。
export default defineConfig({
  plugins: [react(), createCesiumStaticPlugin()],
  define: {
    CESIUM_BASE_URL: JSON.stringify(`./${cesiumStaticBase}`),
  },
  base: "./",
  build: {
    outDir: "dist/renderer",
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src/renderer"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ["**/src/main/**", "**/dist/**", "**/node_modules/**"],
    },
  },
});
