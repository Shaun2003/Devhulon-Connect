/**
 * POST /api/leads/unlock — a seller spends credits to reveal a buyer's contact.
 *
 * The money path. Everything the spec requires is enforced on the trusted server
 * (see lib/server/credits.unlockLeadContact):
 *   • the seller is authenticated by their ID token (never a body uid),
 *   • the price is recomputed from the stored lead (never trusted from client),
 *   • the deduction + unlock guard run in ONE transaction, so a double-click or
 *     a retry can never charge twice,
 *   • the contact is returned ONLY on success, and a conversation is opened.
 *
 * 402 = insufficient credits or Starter opportunity cap reached.
 * 404 = the lead is gone. 409 = already unlocked (returned idempotently).
 */

import { adminDb, apiError, sessionFromRequest } from "@/lib/server/admin";
import { unlockLeadContact } from "@/lib/server/credits";
import { guardLeadRequest } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const db = adminDb();
  if (!db) return apiError("Server storage is not configured.", 503);

  const session = await sessionFromRequest(req);
  if (!session) return apiError("Sign in to unlock a request.", 401);

  // Unlocking spends credits, so it is a metered action — rate-limited like a
  // claim to stop a script burning a seller's balance (or spamming buyers).
  const limited = await guardLeadRequest(req, "leadClaim", session.uid);
  if (limited) return limited;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const leadId = String(body.leadId ?? "").trim();
  if (!leadId) return apiError("Missing the request id.");

  const result = await unlockLeadContact(session.uid, leadId);

  if (!result.ok) {
    const status = result.reason === "insufficient" || result.reason === "limit"
      ? 402
      : result.reason === "not-found" ? 404 : 400;
    return apiError(result.error, status);
  }

  return Response.json({
    ok: true,
    credits: result.credits,
    balance: result.balance,
    conversationId: result.conversationId,
    already: result.already ?? false,
    contact: result.contact,
  });
}
