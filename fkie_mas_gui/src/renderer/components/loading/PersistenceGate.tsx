import React from "react";

import { useAppStateContext } from "@/renderer/hooks/useAppStateContext";
import { useSettingsContext } from "@/renderer/hooks/useSettingsContext";

interface PersistenceGateProps {
  children: React.ReactNode;
  /**
   * Optional loading indicator shown while DBs initialize.
   * Defaults to null (render nothing until ready).
   */
  fallback?: React.ReactNode;
}

/**
 * Blocks rendering of children until both Settings and AppState
 * databases are fully initialized and hydrated.
 *
 * Place this inside both providers but above any component
 * that uses useSetting or useAppState.
 *
 * @example
 * <SettingsProvider>
 *   <AppStateProvider>
 *     <PersistenceGate fallback={<SplashScreen />}>
 *       <App />
 *     </PersistenceGate>
 *   </AppStateProvider>
 * </SettingsProvider>
 */
export function PersistenceGate({ children, fallback = null }: PersistenceGateProps): React.ReactElement | null {
  const { isReady: settingsReady } = useSettingsContext();
  const { isReady: stateReady } = useAppStateContext();

  if (!settingsReady || !stateReady) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
