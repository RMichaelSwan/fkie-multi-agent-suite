import { useCallback, useEffect, useMemo, useRef } from "react";

import { useAppState } from "@/renderer/hooks/useAppState";
import { useAppStateContext } from "@/renderer/hooks/useAppStateContext";
import { JSONValue, TRosMessageStruct } from "@/types";

/* ======================== Types =========================== */

export type TMsgHistoryEntry = {
  messageType: string;
  id: number;
  name: string;
  favorite: boolean;
  rate?: string;
  skw?: boolean;
  data: TRosMessageStruct;
  createdAt: number;
};

/** Legacy format stored in localStorage under "MessageStruct:history" */
type LegacyHistoryItem = {
  id: number;
  rate: string;
  skw: boolean;
  msg: TRosMessageStruct;
};

export interface MsgHistoryActions {
  /** Visible entries for this messageType (sorted, limited to maxEntries). */
  entries: TMsgHistoryEntry[];
  /** Add a new entry. ID is auto-generated. Oldest non-favorites are trimmed at DB_MAX_MSGS. */
  addEntry: (entry: Omit<TMsgHistoryEntry, "id">) => void;
  /** Update name or favorite flag of an entry. */
  updateMeta: (id: number, updates: { name?: string; favorite?: boolean }) => void;
  /** Delete a single entry by ID. */
  deleteEntry: (id: number) => void;
  /** Delete all non-favorite entries. */
  deleteNonFavorites: () => void;
  /** Current max visible entries. */
  maxEntries: number;
  /** Update the max visible entries (persisted). */
  setMaxEntries: (max: number) => void;
}

/* ======================== Constants =========================== */

const NAMESPACE = "messages";
const DEFAULT_MAX = 5;
/** Hard limit of entries stored per messageType in DB. */
export const DB_MAX_MSGS = 10;

/* ======================== Module-level migration state =========================== */

/**
 * Tracks whether the one-time localStorage migration has been performed.
 * Module-level so it runs exactly once across all hook instances.
 */
let legacyMigrationDone = false;

/* ======================== Hook =========================== */

/**
 * Self-contained hook for message publish history.
 * No context/provider needed — uses AppState directly.
 *
 * Storage layout:
 * - `messages:max-entries` → number (shared max visible entries)
 * - `messages:history:{messageType}` → TMsgHistoryEntry[] (per type)
 *
 * On first use, automatically migrates:
 * - localStorage "MessageStruct:history" (old format: { [type]: THistoryItem[] })
 * - Old MsgHistoryDB IndexedDB (if exists)
 *
 * @param messageType - The ROS message type (e.g. "std_msgs/msg/String")
 *
 * @example
 * const { entries, addEntry, updateMeta, deleteEntry, maxEntries, setMaxEntries } =
 *   useMsgHistory("geometry_msgs/msg/Twist");
 */
export function useMsgHistory(messageType: string): MsgHistoryActions {
  const appStateCtx = useAppStateContext();

  /* ================ One-time legacy migration ================ */

  const migrationRunning = useRef(false);

  useEffect(() => {
    if (legacyMigrationDone || migrationRunning.current) return;
    if (!appStateCtx.isReady) return;
    migrationRunning.current = true;

    void migrateLegacyData().then(() => {
      legacyMigrationDone = true;
      migrationRunning.current = false;
    });
  }, [appStateCtx.isReady]);

  async function migrateLegacyData(): Promise<void> {
    // 1. Migrate from localStorage "MessageStruct:history"
    migrateFromLocalStorage();

    // 2. Migrate from old MsgHistoryDB IndexedDB
    await migrateFromOldDB();
  }

  function migrateFromLocalStorage(): void {
    const LS_KEY = "MessageStruct:history";
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return;

    try {
      let parsed = JSON.parse(raw);

      // Handle useLocalStorage wrapper format: { version?, value }
      if (typeof parsed === "object" && parsed !== null && "value" in parsed) {
        parsed = parsed.value;
      }

      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return;

      const legacyMap = parsed as Record<string, LegacyHistoryItem[]>;

      for (const [msgType, items] of Object.entries(legacyMap)) {
        if (!Array.isArray(items) || items.length === 0) continue;

        const key = `history:${msgType}`;
        const existing = appStateCtx.get(NAMESPACE, key);

        // Only migrate if target is empty
        if (existing && Array.isArray(existing) && (existing as unknown[]).length > 0) continue;

        // Convert legacy items to new format
        const entries: TMsgHistoryEntry[] = items.map((item, idx) => ({
          messageType: msgType,
          id: item.id ?? idx + 1,
          name: "",
          favorite: false,
          rate: item.rate ?? "1",
          skw: item.skw ?? true,
          data: item.msg,
          createdAt: Date.now(),
        }));

        appStateCtx.set(NAMESPACE, key, entries as unknown as JSONValue, 1);
      }

      // Remove old localStorage entry
      window.localStorage.removeItem(LS_KEY);
      console.info("[useMsgHistory] Migrated localStorage 'MessageStruct:history' and removed it.");
    } catch (error) {
      console.warn("[useMsgHistory] Failed to migrate localStorage history:", error);
    }
  }

  async function migrateFromOldDB(): Promise<void> {
    try {
      const databases = await indexedDB.databases();
      if (!databases.some((db) => db.name === "MsgHistoryDB")) return;

      const { openDB } = await import("idb");
      const oldDb = await openDB("MsgHistoryDB", 1);
      const tx = oldDb.transaction("history", "readonly");

      const allEntries: TMsgHistoryEntry[] = [];
      let cursor = await tx.store.openCursor();
      while (cursor) {
        allEntries.push(cursor.value as TMsgHistoryEntry);
        cursor = await cursor.continue();
      }

      if (allEntries.length > 0) {
        // Group by messageType
        const byType: Record<string, TMsgHistoryEntry[]> = {};
        for (const entry of allEntries) {
          if (!byType[entry.messageType]) byType[entry.messageType] = [];
          byType[entry.messageType].push(entry);
        }

        for (const [msgType, entries] of Object.entries(byType)) {
          const key = `history:${msgType}`;
          const existing = appStateCtx.get(NAMESPACE, key);

          // Only migrate if target is empty
          if (existing && Array.isArray(existing) && (existing as unknown[]).length > 0) continue;

          appStateCtx.set(NAMESPACE, key, entries as unknown as JSONValue, 1);
        }
      }

      oldDb.close();
      await indexedDB.deleteDatabase("MsgHistoryDB");
      console.info("[useMsgHistory] Migrated old MsgHistoryDB and deleted it.");
    } catch (error) {
      console.warn("[useMsgHistory] Failed to migrate old MsgHistoryDB:", error);
    }
  }

  /* ================ Max entries (shared across all types) ================ */

  const { value: maxEntries, set: setMaxEntries } = useAppState<number>(NAMESPACE, "max-entries", DEFAULT_MAX, {
    version: 1,
    migrateFrom: { localStorageKey: "MessageHistory:maxEntries" },
  });

  /* ================ Entries for this messageType ================ */

  const { value: allEntries, set: setAllEntries } = useAppState<TMsgHistoryEntry[]>(
    NAMESPACE,
    `history:${messageType}`,
    [],
    { version: 1 }
  );

  /* ================ Sorted + limited for display ================ */

  const entries = useMemo((): TMsgHistoryEntry[] => {
    const sorted = [...allEntries].sort((a, b) => {
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
      return b.id - a.id;
    });
    return sorted.slice(0, maxEntries);
  }, [allEntries, maxEntries]);

  /* ================ Add ================ */

  const addEntry = useCallback(
    (entryWithoutId: Omit<TMsgHistoryEntry, "id">): void => {
      setAllEntries((prev) => {
        const maxId = prev.reduce((max, e) => Math.max(max, e.id), 0);
        const newEntry: TMsgHistoryEntry = { ...entryWithoutId, id: maxId + 1 };
        const all = [...prev, newEntry];

        // Sort for trimming: non-favorites first, oldest first
        all.sort((a, b) => {
          if (a.favorite !== b.favorite) return a.favorite ? 1 : -1;
          return a.id - b.id;
        });

        // Trim to hard limit
        while (all.length > DB_MAX_MSGS) {
          all.shift();
        }

        return all;
      });
    },
    [setAllEntries]
  );

  /* ================ Update metadata ================ */

  const updateMeta = useCallback(
    (id: number, updates: { name?: string; favorite?: boolean }): void => {
      setAllEntries((prev) => {
        const idx = prev.findIndex((e) => e.id === id);
        if (idx === -1) return prev;

        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          ...(updates.name !== undefined && { name: updates.name }),
          ...(updates.favorite !== undefined && { favorite: updates.favorite }),
        };
        return updated;
      });
    },
    [setAllEntries]
  );

  /* ================ Delete ================ */

  const deleteEntry = useCallback(
    (id: number): void => {
      setAllEntries((prev) => prev.filter((e) => e.id !== id));
    },
    [setAllEntries]
  );

  /* ================ Delete non-favorites ================ */

  const deleteNonFavorites = useCallback((): void => {
    setAllEntries((prev) => prev.filter((e) => e.favorite));
  }, [setAllEntries]);

  /* ================ Return ================ */

  return {
    entries,
    addEntry,
    updateMeta,
    deleteEntry,
    deleteNonFavorites,
    maxEntries,
    setMaxEntries,
  };
}
