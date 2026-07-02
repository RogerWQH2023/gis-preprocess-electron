export function ObliquePhotogrammetryTestPage() {
  // 倾斜摄影模型通常也是 3D Tiles 形态，先保留独立入口避免与 3DGS 测试混用。
  return (
    <section
      className="placeholder-panel placeholder-panel--wide"
      aria-labelledby="oblique-test-title"
    >
      <p className="workspace__eyebrow">预留界面</p>
      <h2 id="oblique-test-title">倾斜摄影模型测试</h2>
      <p className="placeholder-panel__summary">
        页面骨架已预留，可承载倾斜摄影模型加载、范围定位、层级细节和纹理效果检查。
      </p>
      <dl className="placeholder-grid">
        <div>
          <dt>测试数据</dt>
          <dd>倾斜摄影 3D Tiles 数据集</dd>
        </div>
        <div>
          <dt>测试视图</dt>
          <dd>模型浏览、包围盒、坐标定位</dd>
        </div>
        <div>
          <dt>测试输出</dt>
          <dd>加载状态、层级切换、显示质量记录</dd>
        </div>
      </dl>
    </section>
  );
}
