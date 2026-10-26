/**
 * POST /api/quotes/award — buyer accepts a quote; every rival on the same
 * request is stood down in the same operation.
 *
 * Replaces the client-side `decideQuote`, which could only mark the winner's own
 * copy of the lead. That left the other sellers' leads stuck at "quoted" forever,
 * so they kept chasing a job that was already won and their monthly lead
 * allowance was spent for nothing. See lib/server/award.ts for the full story.
 *
 * The buyer's uid comes from their verified ID token — never from the body.
 */

import { adminDb, apiError, sessionFromRequest } from "@/lib/server/admin";
import { awardQuote } from "@/lib/server/award";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const db = adminDb();
  if (!db) return apiError("Server storage is not configured.", 503);

  const session = await sessionFromRequest(req);
  if (!session) return apiError("Sign in to accept a quote.", 401);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const quoteId = String(body.quoteId ?? "").trim();
  if (!quoteId) return apiError("Missing the quote id.");

  const result = await awardQuote(db, {
    quoteId,
    requestId: typeof body.requestId === "string" ? body.requestId : undefined,
    buyerUid: session.uid,
  });

  if (!result.ok) {
    // 409 = the request was already awarded, so the client can explain that
    // rather than showing a generic failure.
    return apiError(result.error, result.error.includes("already") ? 409 : 400);
  }

  return Response.json({ ok: true, requestId: result.requestId });
}