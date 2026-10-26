/**
 * GET /api/plans — admin-configured plan overrides for the PUBLIC pricing UI.
 *
 * Public and unauthenticated on purpose: these are prices, limits and marketing
 * copy that already appear on /pricing, and the client needs them to render the
 * same numbers the server will charge. `publicPlanOverrides()` is an allow-list,
 * so any future internal field on `subscription_plans` cannot leak through here.
 *
 * The built-in defaults are deliberately NOT sent — the client already has them
 * compiled in (`lib/plans.ts`), so this payload is empty until an admin actually
 * changes something.
 */

import { loadPlanConfig, publicPlanOverrides } from "@/lib/server/plan-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  await loadPlanConfig();
  return Response.json(
    { ok: true, overrides: publicPlanOverrides() },
    { headers: { "cache-control": "no-store" } }
  );
}
