import { useEffect, useMemo, useRef, useState } from "react";

import { getPathFileName, getPathStem, joinPreviewPath } from "./pathLabels";

type ToolStatus = "idle" | "ready" | "running" | "success" | "error";
type InputConvention = "graphdeco" | "khr_native";
type ConversionLog = {
  taskId: string;
  level: "info" | "success" | "warning" | "error";
  message: string;
  createdAt: string;
};
type ConversionResult = {
  outputDir: string;
  tilesetPath: string;
  summaryPath: string;
  splatCount: number;
  shDegree: number;
};

const MAX_LOG_ITEMS = 80;
const statusText: Record<ToolStatus, string> = {
  idle: "等待选择",
  ready: "准备就绪",
  running: "转换中",
  success: "已完成",
  error: "转换失败",
};

function createTaskId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function ThreeDgsTilesConverter() {
  const converterApi = window.electronAPI?.tools.threeDgsTiles ?? null;
  const activeTaskIdRef = useRef<string | null>(null);
  const [inputPath, setInputPath] = useState("");
  const [outputParentDir, setOutputParentDir] = useState("");
  const [inputConvention, setInputConvention] =
    useState<InputConvention>("graphdeco");
  const [memoryBudgetGb, setMemoryBudgetGb] = useState(3);
  const [status, setStatus] = useState<ToolStatus>("idle");
  const [logs, setLogs] = useState<ConversionLog[]>([]);
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const canConvert =
    Boolean(converterApi) &&
    inputPath.length > 0 &&
    outputParentDir.length > 0 &&
    status !== "running";

  const outputPreview = useMemo(() => {
    if (!inputPath || !outputParentDir) {
      return "";
    }

    return joinPreviewPath(outputParentDir, `${getPathStem(inputPath)}-3dtiles`);
  }, [inputPath, outputParentDir]);

  useEffect(() => {
    if (!converterApi) {
      return;
    }

    return converterApi.onConversionLog((log) => {
      if (log.taskId !== activeTaskIdRef.current) {
        return;
      }

      setLogs((currentLogs) => [...currentLogs, log].slice(-MAX_LOG_ITEMS));
    });
  }, [converterApi]);

  async function handleSelectPlyFile(): Promise<void> {
    if (!converterApi) {
      return;
    }

    try {
      const selection = await converterApi.selectPlyFile();
      if (selection.canceled) {
        return;
      }

      setInputPath(selection.path);
      setResult(null);
      setErrorMessage("");
      setStatus(outputParentDir ? "ready" : "idle");
    } catch (error) {
      setStatus("error");
      setErrorMessage(readErrorMessage(error));
    }
  }

  async function handleSelectOutputDirectory(): Promise<void> {
    if (!converterApi) {
      return;
    }

    try {
      const selection = await converterApi.selectOutputDirectory();
      if (selection.canceled) {
        return;
      }

      setOutputParentDir(selection.path);
      setResult(null);
      setErrorMessage("");
      setStatus(inputPath ? "ready" : "idle");
    } catch (error) {
      setStatus("error");
      setErrorMessage(readErrorMessage(error));
    }
  }

  async function handleConvert(): Promise<void> {
    if (!converterApi || !canConvert) {
      return;
    }

    const taskId = createTaskId();
    activeTaskIdRef.current = taskId;
    setStatus("running");
    setLogs([]);
    setResult(null);
    setErrorMessage("");

    try {
      const conversionResult = await converterApi.convert({
        taskId,
        inputPath,
        outputParentDir,
        options: {
          inputConvention,
          memoryBudgetGb,
        },
      });

      setResult(conversionResult);
      setStatus("success");
    } catch (error) {
      setStatus("error");
      setErrorMessage(readErrorMessage(error));
    }
  }

  async function handleRevealOutputDirectory(): Promise<void> {
    if (!converterApi || !result) {
      return;
    }

    try {
      await converterApi.revealOutputDirectory(result.outputDir);
    } catch (error) {
      setStatus("error");
      setErrorMessage(readErrorMessage(error));
    }
  }

  return (
    <section className="converter-panel" aria-labelledby="three-dgs-title">
      <div className="converter-panel__header">
        <div>
          <p className="workspace__eyebrow">工具 01</p>
          <h2 id="three-dgs-title">3DGS PLY 转 3D Tiles</h2>
        </div>
        <span className={`status-pill status-pill--${status}`}>
          {statusText[status]}
        </span>
      </div>

      {!converterApi ? (
        <p className="runtime-warning">请在 Electron 桌面环境中运行本工具。</p>
      ) : null}

      <div className="converter-form">
        <div className="field-group">
          <label className="field-label">输入 PLY 文件</label>
          <div className="path-row">
            <button
              className="action-button"
              type="button"
              onClick={handleSelectPlyFile}
              disabled={!converterApi || status === "running"}
            >
              选择 PLY
            </button>
            <code className="path-value">
              {inputPath ? getPathFileName(inputPath) : "未选择"}
            </code>
          </div>
        </div>

        <div className="field-group">
          <label className="field-label">输出位置</label>
          <div className="path-row">
            <button
              className="action-button"
              type="button"
              onClick={handleSelectOutputDirectory}
              disabled={!converterApi || status === "running"}
            >
              选择目录
            </button>
            <code className="path-value">
              {outputParentDir ? outputParentDir : "未选择"}
            </code>
          </div>
          {outputPreview ? (
            <p className="output-preview">生成目录：{outputPreview}</p>
          ) : null}
        </div>

        <div className="option-grid">
          <div className="field-group">
            <label className="field-label">输入约定</label>
            <div className="segmented-control">
              <button
                type="button"
                aria-pressed={inputConvention === "graphdeco"}
                onClick={() => setInputConvention("graphdeco")}
                disabled={status === "running"}
              >
                GraphDECO
              </button>
              <button
                type="button"
                aria-pressed={inputConvention === "khr_native"}
                onClick={() => setInputConvention("khr_native")}
                disabled={status === "running"}
              >
                KHR Native
              </button>
            </div>
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="memory-budget">
              内存预算 GB
            </label>
            <input
              id="memory-budget"
              className="number-input"
              type="number"
              min="0.5"
              step="0.5"
              value={memoryBudgetGb}
              onChange={(event) => {
                const nextValue = Number(event.target.value);
                if (Number.isFinite(nextValue) && nextValue > 0) {
                  setMemoryBudgetGb(nextValue);
                }
              }}
              disabled={status === "running"}
            />
          </div>
        </div>

        <div className="converter-actions">
          <button
            className="primary-button"
            type="button"
            onClick={handleConvert}
            disabled={!canConvert}
          >
            开始转换
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={handleRevealOutputDirectory}
            disabled={!result || status === "running"}
          >
            打开输出目录
          </button>
        </div>
      </div>

      {errorMessage ? <p className="error-message">{errorMessage}</p> : null}

      {result ? (
        <dl className="result-grid">
          <div>
            <dt>Splats</dt>
            <dd>{result.splatCount.toLocaleString()}</dd>
          </div>
          <div>
            <dt>SH 阶数</dt>
            <dd>{result.shDegree}</dd>
          </div>
          <div>
            <dt>tileset.json</dt>
            <dd>{result.tilesetPath}</dd>
          </div>
          <div>
            <dt>build_summary.json</dt>
            <dd>{result.summaryPath}</dd>
          </div>
        </dl>
      ) : null}

      <div className="log-panel" aria-live="polite">
        {logs.length > 0 ? (
          logs.map((log, index) => (
            <p className={`log-line log-line--${log.level}`} key={`${log.createdAt}-${index}`}>
              <span>{new Date(log.createdAt).toLocaleTimeString()}</span>
              {log.message}
            </p>
          ))
        ) : (
          <p className="log-line log-line--empty">等待任务日志</p>
        )}
      </div>
    </section>
  );
}
