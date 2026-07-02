const fs = require("node:fs/promises");
const path = require("node:path");

exports.default = async function cleanupElectronDist(context) {
  const redundantFiles = [
    path.join(context.appOutDir, "resources", "default_app.asar"),
    path.join(context.appOutDir, "version"),
  ];

  await Promise.all(
    redundantFiles.map(async (file) => {
      // 使用本地 electronDist 时，electron-builder 不会自动清理这些 Electron 模板文件。
      await fs.rm(file, { force: true });
    })
  );
};
