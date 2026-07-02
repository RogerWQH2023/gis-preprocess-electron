import { useMemo, useState, type ReactNode } from "react";

import {
  CesiumIonAuthContext,
  type CesiumIonAuthContextValue,
} from "./cesiumIonAuthContext";

const CESIUM_ION_TOKEN_STORAGE_KEY = "gis-preprocess:cesium-ion-token";

function readStoredToken(): string {
  try {
    return localStorage.getItem(CESIUM_ION_TOKEN_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeStoredToken(token: string): void {
  localStorage.setItem(CESIUM_ION_TOKEN_STORAGE_KEY, token);
}

function removeStoredToken(): void {
  localStorage.removeItem(CESIUM_ION_TOKEN_STORAGE_KEY);
}

export function CesiumIonAuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(readStoredToken);
  const value = useMemo<CesiumIonAuthContextValue>(() => {
    return {
      token,
      hasToken: token.length > 0,
      applyToken: (nextToken: string) => {
        const trimmedToken = nextToken.trim();

        setToken(trimmedToken);
        if (trimmedToken.length > 0) {
          writeStoredToken(trimmedToken);
        } else {
          removeStoredToken();
        }
      },
      clearToken: () => {
        setToken("");
        removeStoredToken();
      },
    };
  }, [token]);

  return (
    <CesiumIonAuthContext.Provider value={value}>
      {children}
    </CesiumIonAuthContext.Provider>
  );
}
