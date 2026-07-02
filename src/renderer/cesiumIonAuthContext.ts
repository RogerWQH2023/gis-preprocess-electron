import { createContext, useContext } from "react";

export interface CesiumIonAuthContextValue {
  token: string;
  hasToken: boolean;
  applyToken: (token: string) => void;
  clearToken: () => void;
}

export const CesiumIonAuthContext =
  createContext<CesiumIonAuthContextValue | null>(null);

export function useCesiumIonAuth(): CesiumIonAuthContextValue {
  const context = useContext(CesiumIonAuthContext);

  if (!context) {
    throw new Error("useCesiumIonAuth 必须在 CesiumIonAuthProvider 内使用。");
  }

  return context;
}
