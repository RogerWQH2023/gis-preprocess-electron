export function CogTiffTestPage() {
  // COGTiff 测试后续可能包含远程 HTTP Range 访问，本页先预留独立展示容器。
  return (
    <section className="placeholder-panel" aria-labelledby="cogtiff-test-title">
      <p className="workspace__eyebrow">预留界面</p>
      <h2 id="cogtiff-test-title">COGTiff测试</h2>
      <p className="placeholder-panel__summary">
        页面骨架已预留，可承载 COGTiff 加载、波段选择、地图叠加和影像访问性能检查。
      </p>
      <dl className="placeholder-grid">
        <div>
          <dt>测试数据</dt>
          <dd>本地或远程 COGTiff 文件</dd>
        </div>
        <div>
          <dt>测试视图</dt>
          <dd>地图底图、影像图层、波段组合</dd>
        </div>
        <div>
          <dt>测试输出</dt>
          <dd>加载耗时、瓦片请求、渲染状态</dd>
        </div>
      </dl>
    </section>
  );
}
