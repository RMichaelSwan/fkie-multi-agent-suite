import { Dispatch, SetStateAction, useCallback, useEffect, useRef, useState } from "react";
import useEventListener from "./useEventListener";

declare global {
  interface WindowEventMap {
    "local-storage": CustomEvent;
  }
}

/**
 *  Example usage:
  const [layoutJsonString, setLayoutJsonString] = useLocalStorage<string, string>(
    storageKey,
    "",
    {
      version: 3,
      migrate: (oldValue, oldVersion) => {
        try {
          const oldLayout = JSON.parse(oldValue);

          // oldVersion === undefined → legacy (stored as plain string)
          // oldVersion === 1 / 2 → previously wrapped formats
          if (oldVersion === undefined) {
            // migrate from very old format
          } else if (oldVersion === 1) {
            // migrate from v1 → v3
          } else if (oldVersion === 2) {
            // migrate from v2 → v3
          }

          const newLayout = {
            ...oldLayout,
            // your migration logic here
          };

          return JSON.stringify(newLayout);
        } catch {
          // On failure, fall back to initialValue
          return undefined;
        }
      },
    }
  );
 */

type SetValue<T> = Dispatch<SetStateAction<T>>;

type UseLocalStorageOptions<T, TOld = unknown> = {
  /**
   * Current schema/version for the stored value.
   */
  version?: number | string;

  /**
   * Called when:
   * - the stored version does not match the current version, or
   * - a legacy value (without version wrapper) is found.
   *
   * oldVersion is:
   * - the stored version for wrapped values
   * - undefined for legacy values stored without version wrapper
   *
   * If it returns undefined, initialValue will be used instead.
   */
  migrate?: (oldValue: TOld, oldVersion: number | string | undefined) => T | undefined;
};

type StoredValue<T> = {
  version?: number | string;
  value: T;
};

// A wrapper for JSON.parse() to support "undefined" value
function parseJSON<T>(value: string | null): T | undefined {
  try {
    return value === "undefined" ? undefined : JSON.parse(value || "");
  } catch {
    console.error("parsing error on", { value });
    return undefined;
  }
}

function isStoredValue(value: unknown): value is StoredValue<unknown> {
  return typeof value === "object" && value !== null && "value" in value;
}

export default function useLocalStorage<T, TOld = unknown>(
  key: string,
  initialValue: T,
  options?: UseLocalStorageOptions<T, TOld>
): [T, SetValue<T>] {
  const { version, migrate } = options || {};

  // Freeze the initial value like useState does: only first render wins
  const initialRef = useRef<T>(initialValue);

  // Keep latest migrate function in a ref so readValue can be stable
  const migrateRef = useRef<UseLocalStorageOptions<T, TOld>["migrate"] | undefined>(migrate);

  useEffect(() => {
    migrateRef.current = migrate;
  }, [migrate]);

  const readValue = useCallback((): T => {
    // Avoid issues during SSR
    if (typeof window === "undefined") {
      return initialRef.current;
    }

    try {
      const item = window.localStorage.getItem(key);
      if (item == null) return initialRef.current;

      const parsed = parseJSON<unknown>(item);

      // If no versioning is configured, behave like the original hook
      if (version === undefined) {
        return (parsed as T) ?? initialRef.current;
      }

      const migrateFn = migrateRef.current;

      // New format: { version?, value }
      if (isStoredValue(parsed)) {
        const stored = parsed as StoredValue<unknown>;
        const storedVersion = stored.version;

        // Version matches → return as is
        if (storedVersion === version) {
          return (stored.value as T) ?? initialRef.current;
        }

        // Version does not match → try migration
        if (migrateFn) {
          const migrated = migrateFn(stored.value as TOld, storedVersion);
          if (migrated !== undefined) {
            const wrapped: StoredValue<T> = { version, value: migrated };
            window.localStorage.setItem(key, JSON.stringify(wrapped));
            return migrated;
          }
        }

        // Migration not provided or failed → reset
        window.localStorage.removeItem(key);
        return initialRef.current;
      }

      // Legacy format: value stored directly, without version wrapper
      if (migrateFn) {
        const migrated = migrateFn(parsed as TOld, undefined);
        if (migrated !== undefined) {
          const wrapped: StoredValue<T> = { version, value: migrated };
          window.localStorage.setItem(key, JSON.stringify(wrapped));
          return migrated;
        }
      }

      // Legacy value and no migration → reset to initial
      window.localStorage.removeItem(key);
      return initialRef.current;
    } catch (error) {
      const msg = `Error reading localStorage key "${key}": ${error}`;
      console.warn(msg);
      return initialRef.current;
    }
  }, [key, version]); // independent of initialValue + migrate

  const [storedValue, setStoredValue] = useState<T>(() => readValue());

  const setValueRef = useRef<SetValue<T>>();

  setValueRef.current = (value): void => {
    // Avoid issues during SSR
    if (typeof window === "undefined") {
      const msg = `Tried setting localStorage key "${key}" even though environment is not a client`;
      console.warn(msg);
      return;
    }

    try {
      // Support functional updates (same API as useState)
      const newValue = value instanceof Function ? value(storedValue) : value;

      // With version configured, always wrap the value
      const toStore = version === undefined ? newValue : ({ version, value: newValue } as StoredValue<T>);

      window.localStorage.setItem(key, JSON.stringify(toStore));
      setStoredValue(newValue);

      // Notify other hook instances
      const keyEvent = new CustomEvent("local-storage", { detail: key });
      window.dispatchEvent(keyEvent);
    } catch (error) {
      const msg = `Error setting localStorage key "${key}": ${error}`;
      console.warn(msg);
    }
  };

  const setValue: SetValue<T> = useCallback((value) => setValueRef.current?.(value), []);

  // Re-read from localStorage when key or version changes
  useEffect(() => {
    setStoredValue(readValue());
  }, [readValue]);

  const handleStorageChange = useCallback(
    (data: CustomEvent) => {
      if (data.detail === key) {
        setStoredValue(readValue());
        data.stopPropagation();
      }
    },
    [key, readValue]
  );

  // Custom event, fired when this hook writes to localStorage
  useEventListener("local-storage", handleStorageChange);

  return [storedValue, setValue];
}
