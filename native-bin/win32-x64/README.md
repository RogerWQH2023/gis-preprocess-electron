# Windows x64 OBGS/OSGB 转换程序

将 `fanvanzh/3dtiles` Windows x64 包解压到本目录，保持原包结构不变：

```text
native-bin/
  win32-x64/
    3dtile.exe
    gdal_data/
    osgPlugins-3.4.0/
    *.dll
```

开发环境会直接调用 `3dtile.exe`。打包时 `electron-builder` 会把 `native-bin` 复制到应用资源目录下的 `bin`。

工具页面支持两类 OSGB 数据目录：

```text
model_root/
  metadata.xml
  Data/
    Block.osgb
    Block***/
```

以及常见的平铺结构：

```text
model_root/
  metadata.xml
  Block.osgb
  BlockABA/
  BlockABX/
```

平铺结构会在转换时自动创建临时 `Data` 适配目录，不会移动或修改原始数据。
