"use client";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useRealtime, subscribeSavedItems, SAVED_ITEMS_LIMIT, type RealtimeError } from "@/lib/realtime";

type Row = Record<string, unknown>;

type SavedCtx = {
  /** `${itemType}__${itemId}` keys for everything the signed-in user has saved. */
  keys: Set<string>;
  isSaved: (type: string, id: string) => boolean;
  count: number;
  /** Raw docs, newest first — the buyer dashboard renders straight from these. */
  rows: Row[];
  live: boolean;
  error: RealtimeError | null;
  /** True when the listener hit `SAVED_ITEMS_LIMIT` — older saves are not loaded. */
  truncated: boolean;
};

const Ctx = createContext<SavedCtx>({
  keys: new Set(),
  isSaved: () => false,
  count: 0,
  rows: [],
  live: false,
  error: null,
  truncated: false,
});

/**
 * One `saved_items` listener for the whole app (§19). Every save toggle on every
 * feed reads from this set, so a page full of cards costs a single listener
 * instead of one per card — and a save made on /deals shows up instantly in the
 * buyer dashboard without a reload.
 */
export function SavedItemsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid ?? "";

  const saved = useRealtime<Row>(
    (cb, onErr) => (uid ? subscribeSavedItems(uid, cb as never, onErr) : () => {}),
    [],
    [uid]
  );

  const keys = useMemo(
    () => new Set(saved.rows.map((r) => `${String(r.itemType ?? "")}__${String(r.itemId ?? "")}`)),
    [saved.rows]
  );

  const value = useMemo<SavedCtx>(
    () => ({
      keys,
      isSaved: (type, id) => keys.has(`${type}__${id}`),
      count: keys.size,
      rows: saved.rows,
      live: saved.live,
      error: saved.error,
      truncated: saved.rows.length >= SAVED_ITEMS_LIMIT,
    }),
    [keys, saved.rows, saved.live, saved.error]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSavedItems = () => useContext(Ctx);
