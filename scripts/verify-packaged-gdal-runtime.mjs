import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const REQUIRED_NODE_ABI = "127";

// 禁止 CommonJS 依赖解析到 app.asar.unpacked 之外，避免开发机 node_modules 掩盖漏包。
const MODULE_BOUNDARY_LAUNCHER = String.raw`
const Module = require("node:module");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const unpackedRoot = path.resolve(process.argv[1]);
const workerPath = path.resolve(process.argv[2]);
const unpackedPrefix = unpackedRoot.endsWith(path.sep)
  ? unpackedRoot
  : unpackedRoot + path.sep;
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function (request, parent, isMain, options) {
  const resolved = originalResolveFilename.call(
    this,
    request,
    parent,
    isMain,
    options
  );

  if (
    path.isAbsolute(resolved) &&
    resolved !== unpackedRoot &&
    !resolved.startsWith(unpackedPrefix)
  ) {
    throw new Error(
      "打包依赖越界：" + request + " 被解析到 " + resolved
    );
  }

  return resolved;
};

import(pathToFileURL(workerPath).href).catch((error) => {
  process.stderr.write(String(error?.stack || error));
  process.exitCode = 1;
});
`;

function parseWorkerOutput(stdout) {
  let conversionResult = null;

  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    const message = JSON.parse(line);
    if (message.type === "error") {
      throw new Error(message.error?.message || "GDAL worker 返回未知错误。");
    }
    if (message.type === "result") {
      conversionResult = message.result;
    }
  }

  return conversionResult;
}

export default async function verifyPackagedGdalRuntime(context) {
  if (context.electronPlatformName !== "win32") {
    return;
  }

  const resourcesPath = path.join(context.appOutDir, "resources");
  const unpackedRoot = path.join(resourcesPath, "app.asar.unpacked");
  const nodeExecutable = path.join(resourcesPath, "gdal-node", "node.exe");
  const workerPath = path.join(
    unpackedRoot,
    "dist",
    "main",
    "tools",
    "bip-to-cogtiff",
    "worker.js"
  );
  const testDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "gis-gdal-package-test-")
  );

  try {
    const inputPath = path.join(testDirectory, "sample.bip");
    const headerPath = path.join(testDirectory, "sample.hdr");
    const outputDirectory = path.join(testDirectory, "output");
    const outputPath = path.join(outputDirectory, "sample-cog.tif");

    fs.writeFileSync(inputPath, Buffer.from([1, 2, 3, 4]));
    fs.writeFileSync(
      headerPath,
      [
        "ENVI",
        "samples = 2",
        "lines = 2",
        "bands = 1",
        "header offset = 0",
        "file type = ENVI Standard",
        "data type = 1",
        "interleave = bip",
        "byte order = 0",
        "map info = {Geographic Lat/Lon, 1, 1, 120, 30, 0.01, 0.01, WGS-84, units=Degrees}",
        'coordinate system string = {GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]}',
        "",
      ].join("\n"),
      "utf8"
    );
    fs.mkdirSync(outputDirectory);

    const childEnvironment = { ...process.env };
    delete childEnvironment.NODE_OPTIONS;
    delete childEnvironment.NODE_PATH;
    childEnvironment.BIP_TO_COGTIFF_REQUIRED_NODE_ABI = REQUIRED_NODE_ABI;
    childEnvironment.PATH = path.join(
      process.env.SystemRoot || "C:\\Windows",
      "System32"
    );

    const child = spawnSync(
      nodeExecutable,
      ["-e", MODULE_BOUNDARY_LAUNCHER, unpackedRoot, workerPath],
      {
        cwd: testDirectory,
        env: childEnvironment,
        input: JSON.stringify({
          inputPath,
          outputDirectory,
          outputFileName: path.basename(outputPath),
          overwrite: true,
        }),
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
        windowsHide: true,
      }
    );

    if (child.error) {
      throw child.error;
    }
    if (child.status !== 0) {
      throw new Error(
        `GDAL worker 退出码 ${child.status ?? "unknown"}。\n${child.stderr || child.stdout}`
      );
    }

    const result = parseWorkerOutput(child.stdout);
    const outputStat = fs.statSync(outputPath);
    if (!result || outputStat.size === 0) {
      throw new Error("GDAL worker 未生成有效的 COGTiff。");
    }

    process.stdout.write(
      `[gdal-runtime] 打包隔离验证通过：GDAL ${result.metadata?.gdalVersion || "unknown"}，COGTiff ${outputStat.size} bytes。\n`
    );
  } finally {
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
}
