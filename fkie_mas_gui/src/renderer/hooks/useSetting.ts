import { ISettingsContext, SettingsContext } from "@/renderer/context/SettingsContext";
import { JSONValue } from "@/types";
import { useCallback, useContext } from "react";

export function useSetting<T extends JSONValue>(key: string): [T, (value: T) => void] {
  const settingsCtx = useContext(SettingsContext) as ISettingsContext;

  const value = settingsCtx.get(key) as T;

  const setValue = useCallback(
    (newValue: T) => {
      settingsCtx.set(key, newValue);
    },
    [settingsCtx, key]
  );

  return [value, setValue];
}
