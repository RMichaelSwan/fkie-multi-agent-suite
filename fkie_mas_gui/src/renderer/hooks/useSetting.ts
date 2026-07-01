import { useCallback, useContext } from "react";

import { ISettingsContext, SettingsContext } from "@/renderer/context/SettingsContext";
import { JSONValue } from "@/types";

export interface UseSettingOptions {
  debounce?: boolean;
  debounceMs?: number;
}

/**
 * Typed access to a single setting.
 * Returns [value, setValue, resetToDefault].
 */
export function useSetting<T extends JSONValue>(
  key: string,
  options?: UseSettingOptions
): [T, (value: T) => void, () => void] {
  const ctx = useContext(SettingsContext) as ISettingsContext;
  const value = ctx.get(key) as T;

  const setValue = useCallback(
    (v: T) => {
      if (options?.debounce) {
        ctx.setDebounced(key, v, options.debounceMs);
      } else {
        ctx.set(key, v);
      }
    },
    [ctx, key, options?.debounce, options?.debounceMs]
  );

  const reset = useCallback(() => ctx.resetToDefault(key), [ctx, key]);

  return [value, setValue, reset];
}
