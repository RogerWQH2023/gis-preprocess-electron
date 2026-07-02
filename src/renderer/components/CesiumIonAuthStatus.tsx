import { useState } from "react";

import { useCesiumIonAuth } from "../cesiumIonAuthContext";

export function CesiumIonAuthStatus() {
  const { token, hasToken, applyToken, clearToken } = useCesiumIonAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [draftToken, setDraftToken] = useState(token);

  function handleApplyToken(): void {
    applyToken(draftToken);
    setDraftToken(draftToken.trim());
    setIsOpen(false);
  }

  function handleClearToken(): void {
    clearToken();
    setDraftToken("");
    setIsOpen(false);
  }

  function handleTogglePanel(): void {
    setDraftToken(token);
    setIsOpen((currentValue) => !currentValue);
  }

  return (
    <section className="cesium-auth" aria-label="Cesium ion 授权">
      <button
        className="cesium-auth__summary"
        type="button"
        onClick={handleTogglePanel}
        aria-expanded={isOpen}
      >
        <span
          className={`cesium-auth__dot ${
            hasToken ? "cesium-auth__dot--active" : ""
          }`}
          aria-hidden="true"
        />
        <span>
          <strong>Cesium ion</strong>
          <small>{hasToken ? "已授权" : "未授权"}</small>
        </span>
      </button>

      {isOpen ? (
        <div className="cesium-auth__panel">
          <label className="field-label" htmlFor="cesium-ion-token">
            Access Token
          </label>
          <input
            id="cesium-ion-token"
            className="cesium-auth__input"
            type="password"
            value={draftToken}
            onChange={(event) => setDraftToken(event.target.value)}
            placeholder="粘贴自己的 Cesium ion token"
          />
          <div className="cesium-auth__actions">
            <button type="button" onClick={handleApplyToken}>
              应用
            </button>
            <button type="button" onClick={handleClearToken} disabled={!hasToken}>
              清除授权
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
