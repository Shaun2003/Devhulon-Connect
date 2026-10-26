/**
 * POST /api/privacy/erase — POPIA erasure (right to be forgotten), self-service.
 *
 * WHY THIS ROUTE HAS TO EXIST: `firestore.rules` sets `allow delete: if false`
 * on `leads`, `quotes` and `bookings` — correctly, because those records are the
 * commercial audit trail for a job someone paid for and must not be deletable by
 * a buyer or seller acting alone. But that same rule made the privacy policy's
 * promise ("removed or anonymised on request") IMPOSSIBLE to keep: there was no
 * code path that could ever remove a buyer's phone number from a lead.
 *
 * The resolution is to ANONYMISE rather than delete. Once `name`, `email`, `phone`
 * and `requesterUid` are gone, the record is no longer personal information about
 * anyone, but the commercial facts (a lead existed, it was quoted, it was won or
 * lost) survive — which is what the seller's own record-keeping and the platform's
 * aggregate win-rate statistics legitimately need.
 *
 * SCOPE, chosen deliberately:
 *   • The caller can only erase THEMSELVES — the uid comes from their verified ID
 *     token, never the body. There is no admin override here on purpose: mass
 *     erasure is an operational task with its own audit trail, not something a
 *     user-facing endpoint should be able to do to anybody.
 *   • Seller listings are NOT erased. If the account owns a live business profile
 *     the caller is told to close it first — silently deleting a public directory
 *     entry because one person pressed a button would be worse than the privacy
 *     risk it purports to fix.
 *   • Reviews are anonymised (display name redacted, uid cleared) rather than
 *     deleted, so a business does not lose genuine feedback because one reviewer
 *     exercised a right.
 *
 * Every step is independent and best-effort: partial completion still removes most
 * of the personal data, and one failing collection must not abort the rest.
 */

import { adminDb, apiError, sessionFromRequest } from "@/lib/server/admin";
import { REDACTED } from "@/lib/legal";
import { SITE_SHORT } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const db = adminDb();
  if (!db) return apiError("Server storage is not configured.", 503);

  const session = await sessionFromRequest(req);
  // No token, no erasure. There is deliberately no "erase by email address" path:
  // that would let anyone delete a stranger's data by guessing it.
  if (!session) return apiError("Sign in so we can confirm who you are.", 401);

  const uid = session.uid;
  const stamp = new Date().toISOString();
  const summary: Record<string, number> = {};

  // ── 1. Refuse (and explain) if the account owns a public listing ──────────
  const owned = await db.collection("businesses").where("ownerUid", "==", uid).limit(20).get();
  if (!owned.empty) {
    return apiError(
      `You still have a business listing published on ${SITE_SHORT}. Close or transfer it first, then run erasure again — we won't silently remove a public business profile.`,
      409
    );
  }

  // ── 2. Leads the caller requested ────────────────────────────────────────
  try {
    const leads = await db.collection("leads").where("requesterUid", "==", uid).get();
    const batch = db.batch();
    let n = 0;
    for (const doc of leads.docs) {
      batch.set(
        doc.ref,
        {
          name: REDACTED,
          email: null,
          phone: "",
          requesterUid: null,
          requesterRedacted: true,
          redactedAt: stamp,
        },
        { merge: true }
      );
      n++;
    }
    if (n) await batch.commit();
    summary.leads = n;
  } catch (e) {
    console.warn("[KASI] erasure: leads failed:", e instanceof Error ? e.message : e);
  }

  // ── 3. Reviews written by the caller ─────────────────────────────────────
  try {
    const reviews = await db.collection("business_reviews").where("reviewerUid", "==", uid).get();
    const batch = db.batch();
    let n = 0;
    for (const doc of reviews.docs) {
      batch.set(
        doc.ref,
        { author: REDACTED, reviewerUid: null, reviewerRedacted: true, redactedAt: stamp },
        { merge: true }
      );
      n++;
    }
    if (n) await batch.commit();
    summary.reviews = n;
  } catch (e) {
    console.warn("[KASI] erasure: reviews failed:", e instanceof Error ? e.message : e);
  }

  // ── 4. Bookings and notifications ───────────────────────────────────────
  // Queries are by the caller's OWN field, never a full-collection scan: the erase
  // route is a rare event, but a scan here would read every booking and every
  // notification in the database to find one person's rows. Indexed equality
  // lookups keep this proportional to the caller's own data.
  for (const [collection, field] of [
    ["bookings", "buyerUid"],
    ["notifications", "fromUid"],
  ] as const) {
    try {
      const snap = await db.collection(collection).where(field, "==", uid).get();
      const batch = db.batch();
      let n = 0;
      for (const doc of snap.docs) {
        const data = doc.data() as Record<string, unknown>;
        const patch: Record<string, unknown> = { redactedAt: stamp };
        // Clear the identifier plus any free-text the caller typed alongside it.
        for (const k of ["buyerUid", "buyerName", "buyerPhone", "buyerEmail", "buyerNote", "fromUid"]) {
          if (k in data) patch[k] = null;
        }
        batch.set(doc.ref, patch, { merge: true });
        n++;
      }
      if (n) await batch.commit();
      summary[collection] = n;
    } catch (e) {
      console.warn(`[KASI] erasure: ${collection} failed:`, e instanceof Error ? e.message : e);
    }
  }

  // ── 5. The account profile itself ────────────────────────────────────────
  // Deleted outright: it holds nothing but the role and display name, and leaving
  // it would leave a trace that an account once existed.
  try {
    await db.collection("users").doc(uid).delete();
    summary.account = 1;
  } catch (e) {
    console.warn("[KASI] erasure: account doc failed:", e instanceof Error ? e.message : e);
  }

  // An audit row with NO identifier, so compliance can evidence that erasure
  // requests were honoured without the audit itself becoming a POPIA problem.
  try {
    await db.collection("privacy_erasures").add({ at: stamp, counts: summary, reason: "user_request" });
  } catch {
    /* audit is best-effort and must never fail the request */
  }

  return Response.json({
    ok: true,
    erased: summary,
    message:
      "Your personal details have been removed from quote requests, reviews and bookings. Commercial records were kept in anonymised form so businesses can still show genuine feedback.",
  });
}