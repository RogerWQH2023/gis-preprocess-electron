export function TiffToCogTiffPage() {
  // 栅格转换页面单独占位，便于后续接入 GDAL、瓦片金字塔和压缩配置。
  return (
    <section
      className="placeholder-panel placeholder-panel--wide"
      aria-labelledby="cog-converter-title"
    >
      <p className="workspace__eyebrow">预留界面</p>
      <h2 id="cog-converter-title">tiff 转 CogTiff</h2>
      <p className="placeholder-panel__summary">
        页面骨架已预留，可承载 GeoTIFF 选择、COG 参数配置、转换日志和结果目录管理。
      </p>
      <dl className="placeholder-grid">
        <div>
          <dt>输入数据</dt>
          <dd>单景或多景 TIFF / GeoTIFF</dd>
        </div>
        <div>
          <dt>核心参数</dt>
          <dd>压缩方式、重采样方式、金字塔层级</dd>
        </div>
        <div>
          <dt>输出结果</dt>
          <dd>符合云优化访问的 COGTiff 文件</dd>
        </div>
      </dl>
    </section>
  );
}
