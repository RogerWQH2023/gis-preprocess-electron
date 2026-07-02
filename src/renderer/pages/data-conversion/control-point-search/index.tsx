import { useState } from "react";
import "cesium/Build/Cesium/Widgets/widgets.css";

import { ModelControlPointMeasurement } from "./model-control-point-measurement/ModelControlPointMeasurement";
import { SurfaceControlPointMeasurement } from "./surface-control-point-measurement/SurfaceControlPointMeasurement";
import "./styles.css";

type MeasurementMode = "model" | "surface";

const modeLabels: Record<MeasurementMode, string> = {
  model: "模型控制点测定",
  surface: "地表控制点测定",
};

type MeasurementModeSwitchProps = {
  activeMode: MeasurementMode;
  onModeChange: (mode: MeasurementMode) => void;
};

function MeasurementModeSwitch({
  activeMode,
  onModeChange,
}: MeasurementModeSwitchProps) {
  return (
    <div
      className="control-point-search__mode-switch"
      role="tablist"
      aria-label="控制点测定模式"
    >
      {(["model", "surface"] as MeasurementMode[]).map((mode) => (
        <button
          aria-selected={activeMode === mode}
          className="control-point-search__mode-button"
          key={mode}
          onClick={() => onModeChange(mode)}
          role="tab"
          type="button"
        >
          {modeLabels[mode]}
        </button>
      ))}
    </div>
  );
}

export function ControlPointSearchPage() {
  const [activeMode, setActiveMode] = useState<MeasurementMode>("model");
  const modeSwitch = (
    <MeasurementModeSwitch
      activeMode={activeMode}
      onModeChange={setActiveMode}
    />
  );

  return (
    <section className="control-point-search" aria-label="控制点测定">
      <div className="control-point-search__shell">
        {activeMode === "model" ? (
          <ModelControlPointMeasurement modeSwitch={modeSwitch} />
        ) : (
          <SurfaceControlPointMeasurement modeSwitch={modeSwitch} />
        )}
      </div>
    </section>
  );
}
