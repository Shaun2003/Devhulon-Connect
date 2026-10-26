/**
 * GET /api/cron/plan-credits — replenish monthly plan credit allowances.
 *
 * Secured by CRON_SECRET. Each seller's wallet, ledger entry and next grant
 * date are updated in one transaction, so retries cannot duplicate credits.
 */

import { adminDb, apiError } from "@/lib/server/admin";
import { grantDuePlanCredits } from "@/lib/server/credits";
import { loadPlanConfig } from "@/lib/server/plan-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function handle(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret) {
    console.error("[KASI] plan credits: CRON_SECRET is not set — refusing to run.");
    return apiError("Plan credit replenishment is not configured.", 503);
  }

  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!safeEqual(token, secret)) return apiError("Unauthorized.", 401);
  if (!adminDb()) return apiError("Server storage is not configured.", 503);

  try {
    await loadPlanConfig();
    const result = await grantDuePlanCredits();
    console.log(
      `[KASI] plan credit replenishment: scanned=${result.scanned} ` +
      `granted=${result.granted} skipped=${result.skipped} errors=${result.errors.length}`
    );
    return Response.json({ ok: result.errors.length === 0, ...result });
  } catch (error) {
    console.error("[KASI] plan credit replenishment failed:", error);
    return apiError("Plan credit replenishment failed.", 500);
  }
}

export const GET = handle;
export const POST = handle;
