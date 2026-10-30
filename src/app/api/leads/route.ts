/**
 * POST /api/leads — the ONLY route a buyer request now travels through.
 *
 * Delivery used to happen in the browser (`matchProRequest`), which meant the
 * seller's plan allowance was never consulted: the correct limiter
 * (`consumeLeadOpportunity`) existed on the server but nothing called it, so a
 * seller at 5/5 — or on no plan at all — kept receiving leads.
 *
 * Matching + allocation now happen server-side (see lib/server/lead-allocation),
 * so the cap is enforced atomically and independently of the client.
 *
 * The caller is identified by their verified ID token, never a body field.
 */

import { adminDb, apiError, sessionFromRequest } from "@/lib/server/admin";
import { allocateBroadcastLeads, MAX_FANOUT } from "@/lib/server/lead-allocation";
import { guardLeadRequest } from "@/lib/server/rate-limit";
import { validateBuyerLeadFields } from "@/lib/server/lead-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const db = adminDb();
  if (!db) return apiError("Server storage is not configured.", 503);

  const session = await sessionFromRequest(req);
  if (!session) return apiError("Sign in to post a request.", 401);

  // A broadcast spends a lead credit on EVERY seller it matches, so it is the
  // most expensive call on the site by a factor of the fan-out. It is therefore
  // the tightest limit we have — see RATE_LIMITS.leadBroadcast.
  const limited = await guardLeadRequest(req, "leadBroadcast", session.uid);
  if (limited) return limited;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const validationError = validateBuyerLeadFields(body, true);
  if (validationError) return apiError(validationError, 400);

  const result = await allocateBroadcastLeads({
    requesterUid: session.uid,
    need: String(body.need ?? ""),
    place: typeof body.place === "string" ? body.place : undefined,
    categorySlug: typeof body.categorySlug === "string" ? body.categorySlug : undefined,
    serviceGroupSlug: typeof body.serviceGroupSlug === "string" ? body.serviceGroupSlug : undefined,
    name: typeof body.name === "string" ? body.name : undefined,
    email: typeof body.email === "string" ? body.email : undefined,
    phone: String(body.phone ?? ""),
    timeline: typeof body.timeline === "string" ? body.timeline : undefined,
    budget: body.budget,
    maxSellers: typeof body.maxSellers === "number" ? body.maxSellers : undefined,
    // Forwarded so lib/server/lead-allocation can record consent provenance. It is
    // NOT trusted as evidence — the server refuses the request when this is not
    // exactly true.
    consent: body.consent === true,
  });

  if (!result.ok) return apiError(result.error, 400);

  return Response.json({
    ok: true,
    requestId: result.requestId,
    // The buyer only ever learns the COUNT actually served — naming the sellers
    // who were blocked would leak their billing state to strangers.
    matched: result.allocated.length,
    limited: result.skipped.filter((s) => s.reason === "limit").length,
    allBlocked: result.allBlocked,
    // Echoed back so the client can state the true ceiling rather than promising
    // "we'll alert everyone" — the number the buyer sees must be the number the
    // server was actually willing to spend.
    maxSellers: Math.min(MAX_FANOUT, Math.max(1, Math.floor(Number(body.maxSellers) || 3))),
  });
}
