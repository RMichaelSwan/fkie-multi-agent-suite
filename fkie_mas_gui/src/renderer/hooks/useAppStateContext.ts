import { useContext } from "react";

import { AppStateContext, IAppStateContext } from "@/renderer/context/AppStateContext";

/**
 * Direct access to the full AppState context API.
 */
export function useAppStateContext(): IAppStateContext {
  const context = useContext(AppStateContext);

  if (!context) {
    throw new Error("useAppStateContext must be used inside AppStateProvider");
  }

  return context;
}
