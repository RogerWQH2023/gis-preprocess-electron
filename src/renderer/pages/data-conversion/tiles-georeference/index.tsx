import { useMemo, useState } from "react";

import {
  AXES,
  createControlPointRow,
  createInitialRows,
  MIN_POINT_COUNT,
  parsePointRows,
  type Axis,
  type ControlPointRow,
  type CoordinateGroup,
} from "./controlPointRows";
import {
  formatMetric,
  formatNumber,
  formatTransformJson,
  formatVector,
} from "./formatters";
import {
  convertGeodeticRowsToControlPointRows,
  createGeodeticPointRow,
  createInitialGeodeticRows,
  GEODETIC_AXES,
  GEODETIC_AXIS_LABELS,
  GEODETIC_DATUM_LABELS,
  type GeodeticDatum,
  type GeodeticAxis,
  type GeodeticPointRow,
} from "./geodeticInputRows";
import {
  estimateSimilarityTransform,
  type ParsedPointPair,
  type TransformResult,
} from "./similarityTransform";

type CalculationState =
  | { ok: true; pairs: ParsedPointPair[]; result: TransformResult }
  | { ok: false; message: string };
type ConversionMessage = { level: "success" | "error"; text: string };

export function ThreeDgsTilesGeoreferencePage() {
  const [geodeticRows, setGeodeticRows] = useState<GeodeticPointRow[]>(
    createInitialGeodeticRows,
  );
  const [geodeticDatum, setGeodeticDatum] =
    useState<GeodeticDatum>("wgs84");
  const [pointRows, setPointRows] = useState<ControlPointRow[]>(
    createInitialRows,
  );
  const [conversionMessage, setConversionMessage] =
    useState<ConversionMessage | null>(null);

  const calculation = useMemo<CalculationState>(() => {
    try {
      const pairs = parsePointRows(pointRows);
      const result = estimateSimilarityTransform(pairs);

      return { ok: true, pairs, result };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }, [pointRows]);

  const matrixText = calculation.ok
    ? formatTransformJson(calculation.result.matrixColumnMajor)
    : "";
  const status = calculation.ok ? "success" : "idle";

  function handleCoordinateChange(
    rowId: string,
    group: CoordinateGroup,
    axis: Axis,
    value: string,
  ): void {
    setPointRows((currentRows) =>
      currentRows.map((row) =>
        row.id === rowId
          ? {
              ...row,
              [group]: {
                ...row[group],
                [axis]: value,
              },
            }
          : row,
      ),
    );
  }

  function handleGeodeticModelChange(
    rowId: string,
    axis: Axis,
    value: string,
  ): void {
    setGeodeticRows((currentRows) =>
      currentRows.map((row) =>
        row.id === rowId
          ? {
              ...row,
              model: {
                ...row.model,
                [axis]: value,
              },
            }
          : row,
      ),
    );
  }

  function handleGeodeticInputChange(
    rowId: string,
    axis: GeodeticAxis,
    value: string,
  ): void {
    setGeodeticRows((currentRows) =>
      currentRows.map((row) =>
        row.id === rowId
          ? {
              ...row,
              geodetic: {
                ...row.geodetic,
                [axis]: value,
              },
            }
          : row,
      ),
    );
  }

  function handleAddGeodeticPoint(): void {
    setGeodeticRows((currentRows) => [
      ...currentRows,
      createGeodeticPointRow(),
    ]);
  }

  function handleRemoveGeodeticPoint(rowId: string): void {
    setGeodeticRows((currentRows) => {
      if (currentRows.length <= MIN_POINT_COUNT) {
        return currentRows;
      }

      return currentRows.filter((row) => row.id !== rowId);
    });
  }

  function handleConvertGeodeticRows(): void {
    try {
      const convertedRows = convertGeodeticRowsToControlPointRows(
        geodeticRows,
        geodeticDatum,
      );
      const datumLabel = GEODETIC_DATUM_LABELS[geodeticDatum];

      setPointRows(convertedRows);
      setConversionMessage({
        level: "success",
        text: `已按 ${datumLabel} 转换 ${convertedRows.length} 对控制点，并填入下方 XYZ 表。`,
      });
    } catch (error) {
      setConversionMessage({
        level: "error",
        text: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function handleAddPoint(): void {
    setPointRows((currentRows) => [...currentRows, createControlPointRow()]);
  }

  function handleRemovePoint(rowId: string): void {
    setPointRows((currentRows) => {
      if (currentRows.length <= MIN_POINT_COUNT) {
        return currentRows;
      }

      return currentRows.filter((row) => row.id !== rowId);
    });
  }

  return (
    <section className="converter-panel" aria-labelledby="georeference-title">
      <div className="converter-panel__header">
        <div>
          <p className="workspace__eyebrow">工具 02</p>
          <h2 id="georeference-title">3D Tiles 控制点配准矩阵计算</h2>
        </div>
        <span className={`status-pill status-pill--${status}`}>
          {calculation.ok ? "已计算" : "待输入"}
        </span>
      </div>

      <div className="converter-form">
        <div className="field-group">
          <label className="field-label">可选：经纬高输入转换</label>
          <div className="geodetic-converter-options">
            <div className="field-group">
              <label className="field-label">经纬高坐标基准</label>
              <div className="segmented-control">
                {(["wgs84", "cgcs2000"] satisfies GeodeticDatum[]).map(
                  (datum) => (
                    <button
                      type="button"
                      aria-pressed={geodeticDatum === datum}
                      key={datum}
                      onClick={() => setGeodeticDatum(datum)}
                    >
                      {GEODETIC_DATUM_LABELS[datum]}
                    </button>
                  ),
                )}
              </div>
            </div>
          </div>
          <div className="control-point-table-wrap">
            <table className="control-point-table">
              <thead>
                <tr>
                  <th rowSpan={2}>点号</th>
                  <th colSpan={3}>模型坐标 xyz</th>
                  <th colSpan={3}>经纬高</th>
                  <th rowSpan={2}>操作</th>
                </tr>
                <tr>
                  {AXES.map((axis) => (
                    <th key={`geodetic-model-${axis}`}>
                      {axis.toUpperCase()}
                    </th>
                  ))}
                  {GEODETIC_AXES.map((axis) => (
                    <th key={`geodetic-${axis}`}>
                      {GEODETIC_AXIS_LABELS[axis]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {geodeticRows.map((row, rowIndex) => (
                  <tr key={row.id}>
                    <th scope="row">{rowIndex + 1}</th>
                    {AXES.map((axis) => (
                      <td key={`${row.id}-model-${axis}`}>
                        <input
                          className="coordinate-input"
                          type="text"
                          inputMode="decimal"
                          value={row.model[axis]}
                          aria-label={`经纬高点 ${rowIndex + 1} 模型坐标 ${axis}`}
                          onChange={(event) =>
                            handleGeodeticModelChange(
                              row.id,
                              axis,
                              event.target.value,
                            )
                          }
                        />
                      </td>
                    ))}
                    {GEODETIC_AXES.map((axis) => (
                      <td key={`${row.id}-geodetic-${axis}`}>
                        <input
                          className="coordinate-input"
                          type="text"
                          inputMode="decimal"
                          value={row.geodetic[axis]}
                          aria-label={`经纬高点 ${rowIndex + 1} ${GEODETIC_AXIS_LABELS[axis]}`}
                          onChange={(event) =>
                            handleGeodeticInputChange(
                              row.id,
                              axis,
                              event.target.value,
                            )
                          }
                        />
                      </td>
                    ))}
                    <td>
                      <button
                        className="table-action-button"
                        type="button"
                        onClick={() => handleRemoveGeodeticPoint(row.id)}
                        disabled={geodeticRows.length <= MIN_POINT_COUNT}
                        aria-label={`删除经纬高点 ${rowIndex + 1}`}
                      >
                        −
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="converter-actions">
            <button
              className="primary-button"
              type="button"
              onClick={handleConvertGeodeticRows}
            >
              转换并填入 XYZ 表
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={handleAddGeodeticPoint}
            >
              + 添加经纬高点对
            </button>
          </div>
          {conversionMessage ? (
            <p
              className={`conversion-message conversion-message--${conversionMessage.level}`}
            >
              {conversionMessage.text}
            </p>
          ) : null}
        </div>

        <div className="field-group">
          <label className="field-label">XYZ 控制点对</label>
          <div className="control-point-table-wrap">
            <table className="control-point-table">
              <thead>
                <tr>
                  <th rowSpan={2}>点号</th>
                  <th colSpan={3}>模型坐标 xyz</th>
                  <th colSpan={3}>Cesium ECEF xyz</th>
                  <th rowSpan={2}>操作</th>
                </tr>
                <tr>
                  {AXES.map((axis) => (
                    <th key={`model-${axis}`}>{axis.toUpperCase()}</th>
                  ))}
                  {AXES.map((axis) => (
                    <th key={`earth-${axis}`}>{axis.toUpperCase()}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pointRows.map((row, rowIndex) => (
                  <tr key={row.id}>
                    <th scope="row">{rowIndex + 1}</th>
                    {AXES.map((axis) => (
                      <td key={`${row.id}-model-${axis}`}>
                        <input
                          className="coordinate-input"
                          type="text"
                          inputMode="decimal"
                          value={row.model[axis]}
                          aria-label={`点 ${rowIndex + 1} 模型坐标 ${axis}`}
                          onChange={(event) =>
                            handleCoordinateChange(
                              row.id,
                              "model",
                              axis,
                              event.target.value,
                            )
                          }
                        />
                      </td>
                    ))}
                    {AXES.map((axis) => (
                      <td key={`${row.id}-earth-${axis}`}>
                        <input
                          className="coordinate-input"
                          type="text"
                          inputMode="decimal"
                          value={row.earth[axis]}
                          aria-label={`点 ${rowIndex + 1} Cesium 坐标 ${axis}`}
                          onChange={(event) =>
                            handleCoordinateChange(
                              row.id,
                              "earth",
                              axis,
                              event.target.value,
                            )
                          }
                        />
                      </td>
                    ))}
                    <td>
                      <button
                        className="table-action-button"
                        type="button"
                        onClick={() => handleRemovePoint(row.id)}
                        disabled={pointRows.length <= MIN_POINT_COUNT}
                        aria-label={`删除点 ${rowIndex + 1}`}
                      >
                        −
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="converter-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={handleAddPoint}
            >
              + 添加点对
            </button>
          </div>
        </div>
      </div>

      {!calculation.ok ? (
        <p className="runtime-warning">{calculation.message}</p>
      ) : null}

      {calculation.ok ? (
        <>
          <dl className="result-grid georeference-metrics">
            <div>
              <dt>控制点数量</dt>
              <dd>{calculation.pairs.length}</dd>
            </div>
            <div>
              <dt>统一缩放 s</dt>
              <dd>{formatNumber(calculation.result.scale, 14)}</dd>
            </div>
            <div>
              <dt>平移 T</dt>
              <dd>{formatVector(calculation.result.translation)}</dd>
            </div>
            <div>
              <dt>RMS 残差</dt>
              <dd>{formatMetric(calculation.result.rmsError)} m</dd>
            </div>
            <div>
              <dt>平均残差</dt>
              <dd>{formatMetric(calculation.result.meanError)} m</dd>
            </div>
            <div>
              <dt>最大残差</dt>
              <dd>{formatMetric(calculation.result.maxError)} m</dd>
            </div>
          </dl>

          <div className="field-group">
            <label className="field-label" htmlFor="transform-json">
              tileset.json 可用 transform
            </label>
            <pre className="matrix-output" id="transform-json">
              <code>{matrixText}</code>
            </pre>
          </div>

          <div className="field-group">
            <label className="field-label">逐点残差</label>
            <div className="residual-table-wrap">
              <table className="residual-table">
                <thead>
                  <tr>
                    <th>点号</th>
                    <th>预测 Cesium XYZ</th>
                    <th>ΔX</th>
                    <th>ΔY</th>
                    <th>ΔZ</th>
                    <th>三维残差 m</th>
                  </tr>
                </thead>
                <tbody>
                  {calculation.result.residuals.map((residual) => (
                    <tr key={residual.id}>
                      <th scope="row">{residual.label}</th>
                      <td>{formatVector(residual.predicted)}</td>
                      <td>{formatMetric(residual.delta[0])}</td>
                      <td>{formatMetric(residual.delta[1])}</td>
                      <td>{formatMetric(residual.delta[2])}</td>
                      <td>{formatMetric(residual.distance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
