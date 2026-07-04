const plannedOutputItems = [
  { label: "输入类型", value: "倾斜摄影 OBGS 数据目录" },
  { label: "输出入口", value: "tileset.json" },
  { label: "输出内容", value: "3DTiles 瓦片目录" },
  { label: "功能状态", value: "转换模块待接入" },
] as const;

export function ObgsTo3dTilesPage() {
  return (
    <section
      className="converter-panel converter-panel--wide"
      aria-labelledby="obgs-title"
    >
      <div className="converter-panel__header">
        <div>
          <p className="workspace__eyebrow">工具 02</p>
          <h2 id="obgs-title">倾斜摄影 OBGS 转 3DTiles</h2>
        </div>
        <span className="status-pill status-pill--idle">待接入</span>
      </div>

      <div className="converter-form">
        <div className="field-group">
          <label className="field-label">输入 OBGS 数据目录</label>
          <div className="path-row">
            <button className="action-button" type="button" disabled>
              选择目录
            </button>
            <code className="path-value">未选择</code>
          </div>
        </div>

        <div className="field-group">
          <label className="field-label">输出位置</label>
          <div className="path-row">
            <button className="action-button" type="button" disabled>
              选择目录
            </button>
            <code className="path-value">未选择</code>
          </div>
          <p className="output-preview">生成目录：等待选择输入与输出位置</p>
        </div>

        <div className="option-grid">
          <div className="field-group">
            <label className="field-label">输入数据组织</label>
            <div className="segmented-control">
              <button type="button" aria-pressed={true} disabled>
                单模型目录
              </button>
              <button type="button" aria-pressed={false} disabled>
                批量目录
              </button>
            </div>
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="obgs-memory-budget">
              内存预算 GB
            </label>
            <input
              id="obgs-memory-budget"
              className="number-input"
              type="number"
              min="0.5"
              step="0.5"
              value={4}
              readOnly
              disabled
            />
          </div>
        </div>

        <div className="option-grid">
          <div className="field-group">
            <label className="field-label">输出瓦片格式</label>
            <div className="segmented-control">
              <button type="button" aria-pressed={true} disabled>
                3DTiles
              </button>
              <button type="button" aria-pressed={false} disabled>
                3DTiles + 纹理
              </button>
            </div>
          </div>

          <div className="field-group">
            <label className="field-label">坐标处理</label>
            <div className="segmented-control">
              <button type="button" aria-pressed={true} disabled>
                保持原始坐标
              </button>
              <button type="button" aria-pressed={false} disabled>
                地理配准后处理
              </button>
            </div>
          </div>
        </div>

        <div className="converter-actions">
          <button className="primary-button" type="button" disabled>
            开始转换
          </button>
          <button className="secondary-button" type="button" disabled>
            打开输出目录
          </button>
        </div>
      </div>

      <dl className="result-grid">
        {plannedOutputItems.map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>

      <div className="log-panel" aria-live="polite">
        <p className="log-line log-line--empty">等待任务日志</p>
      </div>
    </section>
  );
}
