import { useEffect, useMemo, useRef, useState } from "react";

import { formatBytes, summarizeSrs } from "./formatters";
import { getPathFileName, getPathStem, joinPreviewPath } from "./pathLabels";

type ToolStatus = "idle" | "ready" | "running" | "success" | "error";
type Compression = "DEFLATE" | "LZW" | "ZSTD";
type Predictor = "AUTO" | "STANDARD" | "FLOATING_POINT" | "NO";
type BigTiff = "YES" | "IF_NEEDED" | "IF_SAFER" | "NO";
type Interleave = "BAND" | "PIXEL";
type BoundsKey = "xmin" | "ymax" | "xmax" | "ymin";

type BoundsInput = Record<BoundsKey, string>;

type ConversionLog = {
  taskId: string;
  level: "info" | "success" | "warning" | "error";
  message: string;
  createdAt: string;
};

type ConversionResult = {
  outputPath: string;
  outputDirectory: string;
  outputSizeBytes: number;
  hdrPath: string | null;
  hasHdr: boolean;
  metadata: {
    driver: string;
    width: number;
    height: number;
    bandCount: number;
    dataType: string | null;
    srsWkt: string | null;
    gdalVersion: string;
  };
};

const MAX_LOG_ITEMS = 100;
const statusText: Record<ToolStatus, string> = {
  idle: "等待选择",
  ready: "准备就绪",
  running: "转换中",
  success: "已完成",
  error: "转换失败",
};

const emptyBounds: BoundsInput = {
  xmin: "",
  ymax: "",
  xmax: "",
  ymin: "",
};

function createTaskId(): string {
  // 每次转换生成独立任务 ID，避免日志在多次运行之间串台。
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function makeFallbackOutputFileName(inputPath: string): string {
  return `${getPathStem(inputPath)}-cog.tif`;
}

function parseBoundsInput(boundsInput: BoundsInput) {
  const bounds = {
    xmin: Number(boundsInput.xmin),
    ymax: Number(boundsInput.ymax),
    xmax: Number(boundsInput.xmax),
    ymin: Number(boundsInput.ymin),
  };

  if (
    !Number.isFinite(bounds.xmin) ||
    !Number.isFinite(bounds.ymax) ||
    !Number.isFinite(bounds.xmax) ||
    !Number.isFinite(bounds.ymin)
  ) {
    throw new Error("四至范围必须填写有效数字。");
  }

  if (bounds.xmin >= bounds.xmax || bounds.ymin >= bounds.ymax) {
    throw new Error("四至范围必须满足 xmin < xmax 且 ymin < ymax。");
  }

  return bounds;
}

export function TiffToCogTiffPage() {
  const converterApi = window.electronAPI?.tools.bipToCogTiff ?? null;
  const activeTaskIdRef = useRef<string | null>(null);
  const [inputPath, setInputPath] = useState("");
  const [inputHeader, setInputHeader] = useState<{
    hdrPath: string | null;
    hasHdr: boolean;
  } | null>(null);
  const [outputDirectory, setOutputDirectory] = useState("");
  const [outputFileName, setOutputFileName] = useState("");
  const [tmpDir, setTmpDir] = useState("");
  const [compression, setCompression] = useState<Compression>("DEFLATE");
  const [predictor, setPredictor] = useState<Predictor>("AUTO");
  const [bigTiff, setBigTiff] = useState<BigTiff>("YES");
  const [interleave, setInterleave] = useState<Interleave>("BAND");
  const [blockSize, setBlockSize] = useState(512);
  const [overwrite, setOverwrite] = useState(true);
  const [srs, setSrs] = useState("");
  const [boundsEnabled, setBoundsEnabled] = useState(false);
  const [boundsInput, setBoundsInput] = useState<BoundsInput>(emptyBounds);
  const [status, setStatus] = useState<ToolStatus>("idle");
  const [logs, setLogs] = useState<ConversionLog[]>([]);
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const canConvert =
    Boolean(converterApi) &&
    inputPath.length > 0 &&
    outputDirectory.length > 0 &&
    outputFileName.trim().length > 0 &&
    status !== "running";

  const outputPreview = useMemo(() => {
    if (!outputDirectory) {
      return "";
    }

    const previewFileName =
      outputFileName.trim() || makeFallbackOutputFileName(inputPath);
    return joinPreviewPath(outputDirectory, previewFileName);
  }, [inputPath, outputDirectory, outputFileName]);

  useEffect(() => {
    if (!converterApi) {
      return;
    }

    return converterApi.onConversionLog((log) => {
      // 只接收当前转换任务的日志，防止旧任务回调污染界面。
      if (log.taskId !== activeTaskIdRef.current) {
        return;
      }

      setLogs((currentLogs) => [...currentLogs, log].slice(-MAX_LOG_ITEMS));
    });
  }, [converterApi]);

  function resetRunState(nextStatus: ToolStatus): void {
    setResult(null);
    setErrorMessage("");
    setLogs([]);
    setStatus(nextStatus);
  }

  async function handleSelectBipFile(): Promise<void> {
    if (!converterApi) {
      return;
    }

    try {
      const selection = await converterApi.selectBipFile();
      if (selection.canceled) {
        return;
      }

      setInputPath(selection.path);
      setInputHeader({
        hdrPath: selection.hdrPath,
        hasHdr: selection.hasHdr,
      });
      setOutputFileName(selection.defaultOutputFileName);
      resetRunState(outputDirectory ? "ready" : "idle");
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

      setOutputDirectory(selection.path);
      resetRunState(inputPath ? "ready" : "idle");
    } catch (error) {
      setStatus("error");
      setErrorMessage(readErrorMessage(error));
    }
  }

  async function handleSelectTempDirectory(): Promise<void> {
    if (!converterApi) {
      return;
    }

    try {
      const selection = await converterApi.selectTempDirectory();
      if (selection.canceled) {
        return;
      }

      setTmpDir(selection.path);
      setErrorMessage("");
    } catch (error) {
      setStatus("error");
      setErrorMessage(readErrorMessage(error));
    }
  }

  async function handleConvert(): Promise<void> {
    if (!converterApi || !canConvert) {
      return;
    }

    let bounds = null;
    try {
      bounds = boundsEnabled ? parseBoundsInput(boundsInput) : null;
    } catch (error) {
      setStatus("error");
      setErrorMessage(readErrorMessage(error));
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
        outputDirectory,
        outputFileName: outputFileName.trim(),
        tmpDir: tmpDir.trim() || undefined,
        srs: srs.trim() || undefined,
        bounds,
        overwrite,
        options: {
          compression,
          predictor,
          blockSize,
          bigTiff,
          interleave,
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
      await converterApi.revealOutputDirectory(result.outputDirectory);
    } catch (error) {
      setStatus("error");
      setErrorMessage(readErrorMessage(error));
    }
  }

  function handleBoundsInputChange(key: BoundsKey, value: string): void {
    setBoundsInput((currentBounds) => ({
      ...currentBounds,
      [key]: value,
    }));
  }

  return (
    <section
      className="converter-panel converter-panel--wide"
      aria-labelledby="bip-cogtiff-title"
    >
      <div className="converter-panel__header">
        <div>
          <p className="workspace__eyebrow">工具 04</p>
          <h2 id="bip-cogtiff-title">BIP 转 COGTiff</h2>
        </div>
        <span className={`status-pill status-pill--${status}`}>
          {statusText[status]}
        </span>
      </div>

      {!converterApi ? (
        <p className="runtime-warning">请在 Electron 桌面环境中运行本工具。</p>
      ) : null}

      {inputHeader && !inputHeader.hasHdr ? (
        <p className="runtime-warning">
          未找到配套 HDR：{inputHeader.hdrPath ?? `${inputPath}.hdr`}
        </p>
      ) : null}

      <div className="converter-form">
        <div className="field-group">
          <label className="field-label">输入 BIP 文件</label>
          <div className="path-row">
            <button
              className="action-button"
              type="button"
              onClick={handleSelectBipFile}
              disabled={!converterApi || status === "running"}
            >
              选择 BIP
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
              {outputDirectory ? outputDirectory : "未选择"}
            </code>
          </div>
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor="cogtiff-output-name">
            输出文件名
          </label>
          <input
            id="cogtiff-output-name"
            className="text-input"
            type="text"
            value={outputFileName}
            onChange={(event) => setOutputFileName(event.target.value)}
            disabled={status === "running"}
          />
          {outputPreview ? (
            <p className="output-preview">生成文件：{outputPreview}</p>
          ) : null}
        </div>

        <div className="field-group">
          <label className="field-label">GDAL 临时目录</label>
          <div className="path-row">
            <button
              className="action-button"
              type="button"
              onClick={handleSelectTempDirectory}
              disabled={!converterApi || status === "running"}
            >
              选择目录
            </button>
            <code className="path-value">
              {tmpDir ? tmpDir : "默认输出目录"}
            </code>
          </div>
          {tmpDir ? (
            <div className="converter-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setTmpDir("")}
                disabled={status === "running"}
              >
                清除临时目录
              </button>
            </div>
          ) : null}
        </div>

        <div className="raster-option-grid">
          <div className="field-group">
            <label className="field-label" htmlFor="cogtiff-compression">
              压缩方式
            </label>
            <select
              id="cogtiff-compression"
              className="select-input"
              value={compression}
              onChange={(event) =>
                setCompression(event.target.value as Compression)
              }
              disabled={status === "running"}
            >
              <option value="DEFLATE">DEFLATE</option>
              <option value="LZW">LZW</option>
              <option value="ZSTD">ZSTD</option>
            </select>
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="cogtiff-predictor">
              Predictor
            </label>
            <select
              id="cogtiff-predictor"
              className="select-input"
              value={predictor}
              onChange={(event) => setPredictor(event.target.value as Predictor)}
              disabled={status === "running"}
            >
              <option value="AUTO">AUTO</option>
              <option value="STANDARD">STANDARD</option>
              <option value="FLOATING_POINT">FLOATING_POINT</option>
              <option value="NO">NO</option>
            </select>
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="cogtiff-block-size">
              块大小
            </label>
            <input
              id="cogtiff-block-size"
              className="number-input"
              type="number"
              min="128"
              max="4096"
              step="16"
              value={blockSize}
              onChange={(event) => {
                const nextValue = Number(event.target.value);
                if (Number.isFinite(nextValue)) {
                  setBlockSize(nextValue);
                }
              }}
              disabled={status === "running"}
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="cogtiff-bigtiff">
              BigTIFF
            </label>
            <select
              id="cogtiff-bigtiff"
              className="select-input"
              value={bigTiff}
              onChange={(event) => setBigTiff(event.target.value as BigTiff)}
              disabled={status === "running"}
            >
              <option value="YES">YES</option>
              <option value="IF_SAFER">IF_SAFER</option>
              <option value="IF_NEEDED">IF_NEEDED</option>
              <option value="NO">NO</option>
            </select>
          </div>
        </div>

        <div className="option-grid">
          <div className="field-group">
            <label className="field-label">COG 交错方式</label>
            <div className="segmented-control">
              <button
                type="button"
                aria-pressed={interleave === "BAND"}
                onClick={() => setInterleave("BAND")}
                disabled={status === "running"}
              >
                BAND
              </button>
              <button
                type="button"
                aria-pressed={interleave === "PIXEL"}
                onClick={() => setInterleave("PIXEL")}
                disabled={status === "running"}
              >
                PIXEL
              </button>
            </div>
          </div>

          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={overwrite}
              onChange={(event) => setOverwrite(event.target.checked)}
              disabled={status === "running"}
            />
            覆盖同名输出
          </label>
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor="cogtiff-srs">
            空间参考
          </label>
          <input
            id="cogtiff-srs"
            className="text-input"
            type="text"
            value={srs}
            onChange={(event) => setSrs(event.target.value)}
            placeholder="EPSG:4326"
            disabled={status === "running"}
          />
        </div>

        <label className="checkbox-field checkbox-field--standalone">
          <input
            type="checkbox"
            checked={boundsEnabled}
            onChange={(event) => setBoundsEnabled(event.target.checked)}
            disabled={status === "running"}
          />
          写入四至范围
        </label>

        {boundsEnabled ? (
          <div className="bounds-grid">
            {(["xmin", "ymax", "xmax", "ymin"] as const).map((key) => (
              <div className="field-group" key={key}>
                <label className="field-label" htmlFor={`bounds-${key}`}>
                  {key}
                </label>
                <input
                  id={`bounds-${key}`}
                  className="coordinate-input"
                  type="number"
                  value={boundsInput[key]}
                  onChange={(event) =>
                    handleBoundsInputChange(key, event.target.value)
                  }
                  disabled={status === "running"}
                />
              </div>
            ))}
          </div>
        ) : null}

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
        <dl className="result-grid result-grid--raster">
          <div>
            <dt>输出文件</dt>
            <dd>{result.outputPath}</dd>
          </div>
          <div>
            <dt>文件大小</dt>
            <dd>{formatBytes(result.outputSizeBytes)}</dd>
          </div>
          <div>
            <dt>栅格尺寸</dt>
            <dd>
              {result.metadata.width} x {result.metadata.height}
            </dd>
          </div>
          <div>
            <dt>波段数</dt>
            <dd>{result.metadata.bandCount.toLocaleString()}</dd>
          </div>
          <div>
            <dt>数据类型</dt>
            <dd>{result.metadata.dataType ?? "未知"}</dd>
          </div>
          <div>
            <dt>空间参考</dt>
            <dd>{summarizeSrs(result.metadata.srsWkt)}</dd>
          </div>
          <div>
            <dt>源驱动</dt>
            <dd>{result.metadata.driver}</dd>
          </div>
          <div>
            <dt>GDAL</dt>
            <dd>{result.metadata.gdalVersion}</dd>
          </div>
          <div>
            <dt>ENVI HDR</dt>
            <dd>
              {result.hasHdr
                ? result.hdrPath
                : result.hdrPath
                  ? `未找到：${result.hdrPath}`
                  : "未找到"}
            </dd>
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
