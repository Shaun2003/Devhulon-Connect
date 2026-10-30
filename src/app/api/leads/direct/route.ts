/**
 * POST /api/leads/direct — a buyer requests a quote from ONE named business.
 *
 * Metered on the same allowance as broadcast matching. This path used to write
 * the lead straight from the browser, which left the last hole in the plan cap:
 * a seller could be handed unlimited leads simply by being the listing someone
 * clicked "Quote" on. Now every lead costs a credit, whichever door it arrives
 * through.
 */

import { adminDb, apiError, sessionFromRequest } from "@/lib/server/admin";
import { createDirectLead } from "@/lib/server/lead-allocation";
import { guardLeadRequest } from "@/lib/server/rate-limit";
import { validateBuyerLeadFields } from "@/lib/server/lead-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const db = adminDb();
  if (!db) return apiError("Server storage is not configured.", 503);

  const session = await sessionFromRequest(req);
  if (!session) return apiError("Sign in to request a quote so you can track the seller's reply.", 401);
  const requesterUid = session.uid;

  // One lead, one seller — cheaper than a broadcast, so a looser cap. Still
  // capped: without this a buyer could sweep every listing in the database and
  // exhaust each seller's monthly allowance one after another.
  const limited = await guardLeadRequest(req, "leadDirect", requesterUid);
  if (limited) return limited;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const validationError = validateBuyerLeadFields(body);
  if (validationError) return apiError(validationError, 400);

  const result = await createDirectLead({
    requesterUid,
    businessId: String(body.businessId ?? ""),
    need: typeof body.need === "string" ? body.need : undefined,
    suburb: typeof body.suburb === "string" ? body.suburb : undefined,
    name: typeof body.name === "string" ? body.name : undefined,
    email: typeof body.email === "string" ? body.email : undefined,
    phone: String(body.phone ?? ""),
    timeline: typeof body.timeline === "string" ? body.timeline : undefined,
    budget: body.budget,
    // Forwarded only so the server can record provenance; the server refuses the
    // request unless it is exactly true.
    consent: body.consent === true,
  });

  if (!result.ok) {
    const status =
      result.reason === "limit" || result.reason === "not-entitled" || result.reason === "no-subscription"
        ? 402
        : 400;
    return apiError(result.error, status);
  }

  return Response.json({ ok: true, id: result.leadId });
}
