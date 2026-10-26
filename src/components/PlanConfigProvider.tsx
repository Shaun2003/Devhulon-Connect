"use client";

/**
 * Admin-configured plan overrides for the BROWSER (§21).
 *
 * `applyPlanOverrides()` in lib/plans.ts mutates a module-level map — installing
 * overrides is not a React state change, so on its own it would leave already
 * rendered prices showing the built-in defaults until a full reload. This provider
 * therefore keeps the overrides in state as well and exposes the recomputed plan
 * list through context, so any consumer that reads `usePlans()` re-renders with
 * the admin's prices the moment the fetch resolves.
 *
 * Server-rendered pages hydrate the same values independently (they await
 * `loadPlanConfig()`), so the two stay consistent.
 */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  activePlans,
  applyPlanOverrides,
  type PlanConfig,
  type PlanId,
  type PlanOverride,
} from "@/lib/plans";

type OverrideMap = Partial<Record<PlanId, PlanOverride>>;

type PlanConfigState = {
  /** Effective plans (overrides merged, hidden plans excluded). */
  plans: PlanConfig[];
  overrides: OverrideMap;
  /** False until the fetch settles — lets the UI avoid claiming values are admin-set. */
  ready: boolean;
};

const NO_OVERRIDES: OverrideMap = {};

const PlanConfigContext = createContext<PlanConfigState>({
  plans: activePlans(),
  overrides: NO_OVERRIDES,
  ready: false,
});

export function PlanConfigProvider({ children }: { children: ReactNode }) {
  const [overrides, setOverrides] = useState<OverrideMap>(NO_OVERRIDES);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/plans", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { overrides?: OverrideMap } | null) => {
        if (!alive) return;
        const next = data?.overrides && typeof data.overrides === "object" ? data.overrides : NO_OVERRIDES;
        // Install first, then publish via state — `activePlans()` below reads the
        // module map, so the order matters.
        applyPlanOverrides(next);
        setOverrides(next);
      })
      .catch(() => {
        /* Pricing is not worth breaking the page over — defaults already render. */
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const value = useMemo<PlanConfigState>(
    () => ({ plans: activePlans(), overrides, ready }),
    [overrides, ready]
  );

  return <PlanConfigContext.Provider value={value}>{children}</PlanConfigContext.Provider>;
}

/** Effective plan configs, re-rendering when admin overrides arrive. */
export function usePlans(): PlanConfig[] {
  return useContext(PlanConfigContext).plans;
}

/** Effective plans plus whether overrides are live (for "admin-configured" labels). */
export function usePlanConfigState(): PlanConfigState {
  return useContext(PlanConfigContext);
}
