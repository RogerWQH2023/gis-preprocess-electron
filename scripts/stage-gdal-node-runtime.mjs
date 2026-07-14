import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const REQUIRED_NODE_VERSION = "v22.16.0";
const REQUIRED_NODE_ABI = "127";
const REQUIRED_PLATFORM = "win32";
const REQUIRED_ARCH = "x64";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const outputDirectory = path.join(projectRoot, "dist", "runtime", "gdal-node");
const require = createRequire(import.meta.url);

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}必须为 ${expected}，当前为 ${actual}。`);
  }
}

async function stageRuntime() {
  assertEqual(process.version, REQUIRED_NODE_VERSION, "GDAL worker Node 版本");
  assertEqual(process.versions.modules, REQUIRED_NODE_ABI, "GDAL worker Node ABI");
  assertEqual(process.platform, REQUIRED_PLATFORM, "GDAL worker 构建平台");
  assertEqual(process.arch, REQUIRED_ARCH, "GDAL worker 构建架构");

  // 打包前直接加载一次原生模块，避免把缺失或 ABI 不匹配的绑定分发给学生。
  const gdal = require("gdal-async");
  if (typeof gdal.version !== "string" || gdal.version.length === 0) {
    throw new Error("gdal-async 已加载，但未返回有效的 GDAL 版本。");
  }

  const nodeLicensePath = path.join(path.dirname(process.execPath), "LICENSE");
  await fs.access(nodeLicensePath);
  await fs.rm(outputDirectory, { recursive: true, force: true });
  await fs.mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    fs.copyFile(process.execPath, path.join(outputDirectory, "node.exe")),
    fs.copyFile(nodeLicensePath, path.join(outputDirectory, "LICENSE.node.txt")),
  ]);

  console.log(
    `[gdal-runtime] 已暂存 ${process.version} / ABI ${process.versions.modules} / GDAL ${gdal.version}。`
  );
}

stageRuntime().catch((error) => {
  console.error("[gdal-runtime] 暂存失败：", error);
  process.exitCode = 1;
});
