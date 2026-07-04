import { useEffect, useMemo, useRef, useState } from "react";

import { getPathFileName, getPathStem, joinPreviewPath } from "./pathLabels";

type ToolStatus = "idle" | "ready" | "validating" | "running" | "success" | "error";
type ConversionLog = {
  taskId: string;
  level: "info" | "success" | "warning" | "error";
  message: string;
  createdAt: string;
};
type ValidationResult = {
  ok: boolean;
  inputDir: string;
  layout: "data-directory" | "flat-blocks" | null;
  adapterRequired: boolean;
  metadataPath: string | null;
  dataDir: string | null;
  rootOsgbFiles: string[];
  dataOsgbFiles: string[];
  detectedOsgbFiles: string[];
  blockDirs: string[];
  warnings: string[];
  errors: string[];
};
type ConversionResult = {
  outputDir: string;
  tilesetPath: string;
  converterPath: string;
  converterInputDir: string;
  usedWorkspaceAdapter: boolean;
  validation: ValidationResult;
};

const MAX_LOG_ITEMS = 120;
const statusText: Record<ToolStatus, string> = {
  idle: "等待选择",
  ready: "准备就绪",
  validating: "校验中",
  running: "转换中",
  success: "已完成",
  error: "转换失败",
};

function createTaskId(): string {
  // 每个转换任务使用独立 ID，确保日志只回流到当前页面。
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatValidationSummary(validation: ValidationResult): string {
  if (validation.ok) {
    return validation.warnings.length > 0
      ? `通过，${validation.warnings.length} 条提醒`
      : "通过";
  }

  return `未通过，${validation.errors.length} 个问题`;
}

function formatLayoutLabel(layout: ValidationResult["layout"]): string {
  if (layout === "data-directory") {
    return "标准 Data 结构";
  }

  if (layout === "flat-blocks") {
    return "平铺 Block 结构";
  }

  return "未识别";
}

export function ObgsTo3dTilesPage() {
  const converterApi = window.electronAPI?.tools.obgsTo3dTiles ?? null;
  const activeTaskIdRef = useRef<string | null>(null);
  const [inputDir, setInputDir] = useState("");
  const [outputParentDir, setOutputParentDir] = useState("");
  const [status, setStatus] = useState<ToolStatus>("idle");
  const [logs, setLogs] = useState<ConversionLog[]>([]);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const isBusy = status === "running" || status === "validating";
  const canValidate = Boolean(converterApi) && inputDir.length > 0 && !isBusy;
  const canConvert =
    Boolean(converterApi) &&
    inputDir.length > 0 &&
    outputParentDir.length > 0 &&
    !isBusy;

  const outputPreview = useMemo(() => {
    if (!inputDir || !outputParentDir) {
      return "";
    }

    return joinPreviewPath(outputParentDir, `${getPathStem(inputDir)}-3dtiles`);
  }, [inputDir, outputParentDir]);

  const validationMessages = useMemo(() => {
    if (!validation) {
      return [];
    }

    return [...validation.errors, ...validation.warnings];
  }, [validation]);

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

  async function handleSelectInputDirectory(): Promise<void> {
    if (!converterApi) {
      return;
    }

    try {
      const selection = await converterApi.selectInputDirectory();
      if (selection.canceled) {
        return;
      }

      setInputDir(selection.path);
      setValidation(null);
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
      setStatus(inputDir ? "ready" : "idle");
    } catch (error) {
      setStatus("error");
      setErrorMessage(readErrorMessage(error));
    }
  }

  async function handleValidate(): Promise<void> {
    if (!converterApi || !canValidate) {
      return;
    }

    setStatus("validating");
    setErrorMessage("");
    setResult(null);

    try {
      const nextValidation = await converterApi.validate(inputDir);
      setValidation(nextValidation);
      setStatus(nextValidation.ok ? "ready" : "error");
      setErrorMessage(nextValidation.ok ? "" : nextValidation.errors.join("；"));
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
        inputDir,
        outputParentDir,
      });

      setValidation(conversionResult.validation);
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
    <section
      className="converter-panel converter-panel--wide"
      aria-labelledby="obgs-title"
    >
      <div className="converter-panel__header">
        <div>
          <p className="workspace__eyebrow">工具 02</p>
          <h2 id="obgs-title">倾斜摄影 OBGS 转 3DTiles</h2>
        </div>
        <span className={`status-pill status-pill--${status === "validating" ? "running" : status}`}>
          {statusText[status]}
        </span>
      </div>

      {!converterApi ? (
        <p className="runtime-warning">请在 Electron 桌面环境中运行本工具。</p>
      ) : null}

      <div className="converter-form">
        <div className="field-group">
          <label className="field-label">输入 OBGS 根目录</label>
          <div className="path-row">
            <button
              className="action-button"
              type="button"
              onClick={handleSelectInputDirectory}
              disabled={!converterApi || isBusy}
            >
              选择目录
            </button>
            <code className="path-value">
              {inputDir ? getPathFileName(inputDir) : "未选择"}
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
              disabled={!converterApi || isBusy}
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

        <div className="converter-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={handleValidate}
            disabled={!canValidate}
          >
            校验目录
          </button>
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
            disabled={!result || isBusy}
          >
            打开输出目录
          </button>
        </div>
      </div>

      {errorMessage ? <p className="error-message">{errorMessage}</p> : null}

      {validationMessages.length > 0 && !errorMessage ? (
        <p className="runtime-warning">{validationMessages.join("；")}</p>
      ) : null}

      {validation ? (
        <dl className="result-grid">
          <div>
            <dt>目录校验</dt>
            <dd>{formatValidationSummary(validation)}</dd>
          </div>
          <div>
            <dt>目录结构</dt>
            <dd>{formatLayoutLabel(validation.layout)}</dd>
          </div>
          <div>
            <dt>自动适配</dt>
            <dd>{validation.adapterRequired ? "需要，转换时自动处理" : "不需要"}</dd>
          </div>
          <div>
            <dt>metadata.xml</dt>
            <dd>{validation.metadataPath ? validation.metadataPath : "未发现"}</dd>
          </div>
          <div>
            <dt>Data 目录</dt>
            <dd>
              {validation.dataDir
                ? validation.dataDir
                : validation.adapterRequired
                  ? "转换时自动创建"
                  : "未发现"}
            </dd>
          </div>
          <div>
            <dt>已发现 OSGB</dt>
            <dd>{validation.detectedOsgbFiles.length.toLocaleString()} 个</dd>
          </div>
          <div>
            <dt>分块目录</dt>
            <dd>{validation.blockDirs.length.toLocaleString()} 个</dd>
          </div>
        </dl>
      ) : null}

      {result ? (
        <dl className="result-grid">
          <div>
            <dt>输出目录</dt>
            <dd>{result.outputDir}</dd>
          </div>
          <div>
            <dt>tileset.json</dt>
            <dd>{result.tilesetPath}</dd>
          </div>
          <div>
            <dt>转换程序</dt>
            <dd>{result.converterPath}</dd>
          </div>
          <div>
            <dt>转换输入</dt>
            <dd>
              {result.usedWorkspaceAdapter
                ? "临时 Data 适配目录"
                : result.converterInputDir}
            </dd>
          </div>
          <div>
            <dt>输入目录</dt>
            <dd>{inputDir}</dd>
          </div>
        </dl>
      ) : null}

      <div className="log-panel" aria-live="polite">
        {logs.length > 0 ? (
          logs.map((log, index) => (
            <p
              className={`log-line log-line--${log.level}`}
              key={`${log.createdAt}-${index}`}
            >
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
