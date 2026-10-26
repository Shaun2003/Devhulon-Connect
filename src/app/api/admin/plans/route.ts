/**
 * /api/admin/plans — admin management of subscription pricing & limits (§21).
 *
 *   GET     → effective plans, built-in defaults and which fields are overridden
 *   PUT     { planId, ...override } → save (prices, limits, trial, copy, active)
 *   DELETE  ?planId=<id>            → reset that plan to its built-in defaults
 *
 * Admin-only via `adminFromRequest`, which checks the SAME `admins/{uid}` registry
 * the client security rules use — so console access and API access cannot drift.
 *
 * What is NOT writable here, by design: plan **ids** and `capabilities`. Both are
 * structural — `CAP_MIN_PLAN` and `PLAN_RANK` are computed from them once at import
 * and drive every feature gate, so letting an admin invent a tier or move a
 * capability would corrupt upgrade logic instead of reconfiguring pricing.
 */

import { adminDb, adminFromRequest, apiError } from "@/lib/server/admin";
import {
  PLAN_IDS,
  coercePlanOverride,
  loadPlanConfig,
  planAdminSnapshot,
  resetPlanOverride,
  savePlanOverride,
} from "@/lib/server/plan-config";
import type { PlanId } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isPlanId = (v: unknown): v is PlanId =>
  typeof v === "string" && (PLAN_IDS as string[]).includes(v);

async function requireAdmin(req: Request) {
  if (!adminDb()) return apiError("Server storage is not configured.", 503);
  const admin = await adminFromRequest(req);
  if (!admin) return apiError("Admins only.", 403);
  return null;
}

export async function GET(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  await loadPlanConfig();
  return Response.json({ ok: true, plans: planAdminSnapshot() }, { headers: { "cache-control": "no-store" } });
}

export async function PUT(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const planId = body.planId;
  if (!isPlanId(planId)) return apiError("Choose a valid plan to update.");

  await loadPlanConfig();
  // `coercePlanOverride` is the same allow-list the loader uses on read, so what
  // an admin saves is exactly what will be loaded back — no field survives a
  // write that would be discarded on the way in.
  const override = coercePlanOverride(body);
  if (!override) return apiError("Nothing to save — change at least one value.");

  try {
    await savePlanOverride(planId, override);
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Could not save the plan.", 500);
  }
  return Response.json({ ok: true, plans: planAdminSnapshot() });
}

export async function DELETE(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  const planId = new URL(req.url).searchParams.get("planId");
  if (!isPlanId(planId)) return apiError("Choose a valid plan to reset.");

  try {
    await resetPlanOverride(planId);
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Could not reset the plan.", 500);
  }
  return Response.json({ ok: true, plans: planAdminSnapshot() });
}
