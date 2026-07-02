import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import cesium from "vite-plugin-cesium";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 渲染进程配置：主进程不交给 Vite 打包，保持与参考项目一致的独立编译模式。
export default defineConfig({
  plugins: [react(), cesium()],
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
