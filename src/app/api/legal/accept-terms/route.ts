/**
 * POST /api/legal/accept-terms — record terms acceptance on the caller's account.
 *
 * WHY SERVER-SIDE: `users/{uid}` is client-writable (the rules let a user write
 * their own doc, which is what makes role selection work). If acceptance were
 * written from the browser, a forged record would be indistinguishable from a real
 * one — and the entire point of this record is to be evidence when someone
 * disputes having agreed. It is therefore written here, from the verified token,
 * and pinned in the rules so the client cannot move it afterwards.
 *
 * Idempotent per (uid, termsVersion): re-accepting after a terms change adds a
 * NEW acceptance rather than overwriting the old one, because the previous
 * agreement is historical evidence, not stale data to be refreshed.
 */

import { adminDb, apiError, sessionFromRequest } from "@/lib/server/admin";
import { CONSENT_VERSION, TERMS_VERSION } from "@/lib/legal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const db = adminDb();
  if (!db) return apiError("Server storage is not configured.", 503);

  const session = await sessionFromRequest(req);
  if (!session) return apiError("Sign in to accept the terms.", 401);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const role = body.role === "seller" ? "seller" : body.role === "buyer" ? "buyer" : null;
  if (!role) return apiError("Missing the account role.");

  const ref = db.collection("users").doc(session.uid);
  const snap = await ref.get();
  const now = new Date().toISOString();

  const acceptance = {
    termsAcceptedAt: now,
    termsVersion: TERMS_VERSION,
    consentVersion: CONSENT_VERSION,
    termsRole: role,
  };

  if (!snap.exists) {
    await ref.set({
      ...acceptance,
      // Established lazily here rather than at signup in the browser, so the
      // account row and its evidence are written together in one place.
      email: session.email ?? "",
      createdAt: now,
    });
  } else {
    // Preserve the ORIGINAL acceptance when it is for the same version — only a
    // genuine terms change adds a new record.
    const prev = snap.data() as { termsVersion?: string; termsAcceptedAt?: string; termsRole?: string };
    if (prev.termsVersion === TERMS_VERSION && prev.termsAcceptedAt && prev.termsRole === role) {
      return Response.json({
        ok: true,
        alreadyAccepted: true,
        termsAcceptedAt: prev.termsAcceptedAt,
        termsVersion: TERMS_VERSION,
      });
    }
    await ref.set(acceptance, { merge: true });
  }

  return Response.json({ ok: true, ...acceptance });
}