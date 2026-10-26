/**
 * Admin-configurable plan settings (master spec §21) — TRUSTED SERVER SIDE.
 *
 * Why this exists: §21 requires prices and limits to be changeable without
 * rewriting (or redeploying) the application. `lib/plans.ts` holds the built-in
 * defaults; this module loads an admin's overrides from the `subscription_plans`
 * collection and installs them into that module at runtime.
 *
 * Split of responsibilities:
 *   • `defaults`  — built-in, compiled, always authoritative fallback
 *   • `overrides` — admin data; may be empty, partial or junk → merged defensively
 *   • writing     — Admin SDK only. Clients can read the collection but never
 *                   write it (see firestore.rules), so a seller cannot grant
 *                   themselves the Business plan's limits.
 *
 * Everything is cached briefly because these values are read on nearly every
 * request; the TTL bounds how long an admin's edit takes to go live without
 * adding a Firestore read to each request.
 */

import { adminDb } from "./admin";
import {
  PLANS,
  applyPlanOverrides,
  defaultPlan,
  mergePlan,
  type PlanConfig,
  type PlanId,
  type PlanOverride,
} from "@/lib/plans";

export const PLAN_IDS: PlanId[] = ["starter", "professional", "business"];

/** How long a loaded config is reused before the next Firestore read. */
const CACHE_MS = 60_000;

type OverrideMap = Partial<Record<PlanId, PlanOverride>>;

let cached: OverrideMap = {};
let cachedAt = 0;
/** De-duplicates concurrent cold starts so N parallel requests cause 1 read. */
let inflight: Promise<OverrideMap> | null = null;

const isPlanId = (v: unknown): v is PlanId =>
  typeof v === "string" && (PLAN_IDS as string[]).includes(v);

/** Keep only finite, non-negative numbers. */
function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined;
}

function str(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t.slice(0, max) : undefined;
}

/**
 * Reduce whatever is stored at `subscription_plans/{id}` to a known-safe override.
 * Unknown keys are dropped rather than copied through, so a hand-edited or
 * corrupted document cannot inject arbitrary fields into a PlanConfig.
 */
export function coercePlanOverride(raw: unknown): PlanOverride | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const out: PlanOverride = {};

  const name = str(r.name, 40);
  if (name) out.name = name;
  const blurb = str(r.blurb, 200);
  if (blurb) out.blurb = blurb;

  const monthly = num(r.monthly);
  if (monthly !== undefined) out.monthly = monthly;
  const annual = num(r.annual);
  if (annual !== undefined) out.annual = annual;
  const trialDays = num(r.trialDays);
  if (trialDays !== undefined) out.trialDays = trialDays;

  if (typeof r.popular === "boolean") out.popular = r.popular;
  if (typeof r.active === "boolean") out.active = r.active;

  if (r.limits && typeof r.limits === "object") {
    const l = r.limits as Record<string, unknown>;
    const limits: NonNullable<PlanOverride["limits"]> = {};
    // null is meaningful here (unlimited) so it must be preserved.
    for (const key of ["services", "portfolio", "leadsPerMonth", "locations", "teamMembers"] as const) {
      const v = l[key];
      if (v === null) limits[key] = null;
      else if (typeof v === "number" && Number.isFinite(v) && v >= 0) limits[key] = Math.floor(v);
    }
    if (Object.keys(limits).length) out.limits = limits;
  }

  if (Array.isArray(r.features)) {
    const features = r.features
      .filter((f): f is string => typeof f === "string" && Boolean(f.trim()))
      .map((f) => f.trim().slice(0, 90))
      .slice(0, 24);
    if (features.length) out.features = features;
  }

  return Object.keys(out).length ? out : null;
}

/** Read every plan override from Firestore. Never throws — bad data is skipped. */
async function fetchOverrides(): Promise<OverrideMap> {
  const db = adminDb();
  if (!db) return {};
  try {
    const snap = await db.collection("subscription_plans").get();
    const out: OverrideMap = {};
    snap.forEach((docSnap) => {
      if (!isPlanId(docSnap.id)) return;
      const clean = coercePlanOverride(docSnap.data());
      if (clean) out[docSnap.id] = clean;
    });
    return out;
  } catch {
    // A failed read must not break checkout — fall back to built-in defaults.
    return {};
  }
}

/**
 * Install admin overrides into `lib/plans.ts`. Call this ONCE at the top of every
 * route handler that reads plans (price, limits, entitlement) — the functions in
 * that module are synchronous by design, so the async load has to happen first.
 *
 * Cached for {@link CACHE_MS}; pass `force` after an admin write so the change is
 * live immediately instead of up to a minute later.
 */
export async function loadPlanConfig(force = false): Promise<OverrideMap> {
  if (!force) {
    const fresh = cachedAt > 0 && Date.now() - cachedAt < CACHE_MS;
    if (fresh) return cached;
    if (inflight) return inflight;
  }
  inflight = fetchOverrides()
    .then((map) => {
      applyPlanOverrides(map);
      cached = map;
      cachedAt = Date.now();
      inflight = null;
      return map;
    })
    .catch(() => {
      inflight = null;
      return cached;
    });
  return inflight;
}

/** Write (or clear) one plan's override. Admin-only — callers must check first. */
export async function savePlanOverride(id: PlanId, override: PlanOverride): Promise<void> {
  const db = adminDb();
  if (!db) throw new Error("Server storage is not configured.");
  await db.collection("subscription_plans").doc(id).set(
    { ...override, planId: id, updatedAt: new Date().toISOString() },
    { merge: true }
  );
  await loadPlanConfig(true);
}

/** Remove every admin override for a plan, restoring the built-in defaults. */
export async function resetPlanOverride(id: PlanId): Promise<void> {
  const db = adminDb();
  if (!db) throw new Error("Server storage is not configured.");
  await db.collection("subscription_plans").doc(id).delete();
  await loadPlanConfig(true);
}

/**
 * What the admin console renders: the effective (merged) plan, the built-in
 * default beside it so an admin can see what they changed and reset to, and
 * whether anything is overridden at all.
 */
export function planAdminSnapshot(): {
  id: PlanId;
  effective: PlanConfig;
  defaults: PlanConfig;
  overridden: boolean;
  active: boolean;
}[] {
  return PLAN_IDS.map((id) => {
    const defaults = defaultPlan(id) as PlanConfig;
    const effective = mergePlan(defaults, cached[id]);
    return {
      id,
      effective,
      defaults,
      overridden: Boolean(cached[id]),
      active: cached[id]?.active !== false,
    };
  });
}

/**
 * Overrides as the PUBLIC browser may see them.
 *
 * Prices are already public on the pricing page, so nothing here is sensitive —
 * but this is still an explicit allow-list of marketing/limit fields rather than
 * a passthrough, so the stored document can gain internal fields later without
 * them leaking to the client.
 */
export function publicPlanOverrides(): OverrideMap {
  const out: OverrideMap = {};
  for (const planId of PLAN_IDS) {
    const o = cached[planId];
    if (!o) continue;
    out[planId] = {
      name: o.name,
      blurb: o.blurb,
      monthly: o.monthly,
      annual: o.annual,
      trialDays: o.trialDays,
      popular: o.popular,
      active: o.active,
      limits: o.limits,
      features: o.features,
    };
  }
  return out;
}

/** Effective plans (definitions merged with admin overrides), hidden ones excluded. */
export function effectivePlans(): PlanConfig[] {
  return PLANS.filter((p) => cached[p.id]?.active !== false).map((p) => mergePlan(p, cached[p.id]));
}
