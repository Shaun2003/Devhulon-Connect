/**
 * POST /api/admin/verify — grant or revoke a listing's Verified badge, WITH A RECORD.
 *
 * Replaces a client-side `updateDoc` that flipped a bare boolean. Three things
 * this route does that the browser could not:
 *
 *   1. Records PROVENANCE — the acting admin's uid comes from their verified ID
 *      token and is checked against `admins/{uid}` server-side. A client-side
 *      write could not guarantee who actually performed the check, which was the
 *      whole point of adding the record.
 *   2. Computes the EXPIRY server-side. A client could send any `expiresAt`; the
 *      window is policy, so it is decided here.
 *   3. Notifies the owner, which a bare boolean flip skipped.
 *
 * Admins may only verify a LISTING they have not been told anything about — the
 * method is an enum and the note is length-capped, so this endpoint records a
 * decision, it does not become a free-text dumping ground for personal data.
 */

import { adminDb, adminFromRequest, apiError } from "@/lib/server/admin";
import { queueEmail } from "@/lib/server/email";
import {
  buildVerificationRecord,
  VERIFICATION_METHODS,
  type VerificationMethod,
} from "@/lib/verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cleanStr = (v: unknown, max: number): string => String(v ?? "").trim().slice(0, max);

export async function POST(req: Request) {
  const db = adminDb();
  if (!db) return apiError("Server storage is not configured.", 503);

  // Same registry the client rules use, so the console and the API can never
  // disagree about who is an admin.
  const session = await adminFromRequest(req);
  if (!session) return apiError("Admin access required.", 403);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const businessId = cleanStr(body.businessId, 64);
  if (!businessId) return apiError("Missing the listing id.");

  const ref = db.collection("businesses").doc(businessId);
  const snap = await ref.get();
  if (!snap.exists) return apiError("That listing no longer exists.", 404);

  const revoking = body.verified === false;
  const now = new Date();

  if (revoking) {
    // Revocation clears the badge AND the record. Leaving an expired record behind
    // would let the UI show a verification date for a business we just unverified.
    await ref.set({ verified: false, verification: null, updatedAt: now.toISOString() }, { merge: true });

    const owner = String(snap.data()?.ownerUid ?? "");
    if (owner) {
      await db.collection("notifications").add({
        toUid: owner,
        fromUid: session.uid,
        type: "unverified",
        message: "Your listing needs re-verification — please check your contact details.",
        businessId,
        href: "/dashboard",
        read: false,
        createdAt: now.toISOString(),
      });
      queueEmail({
        toUid: owner,
        kind: "listing-unverified",
        subject: "Your listing needs re-verification",
        heading: "Re-verification needed",
        body: "Your listing's Verified badge was removed. Please check your contact details so we can verify it again.",
        ctaLabel: "Open dashboard",
        ctaHref: "/dashboard",
      });
    }
    return Response.json({ ok: true, verified: false });
  }

  const method = cleanStr(body.method, 20) as VerificationMethod;
  if (!VERIFICATION_METHODS.includes(method)) {
    return apiError("Choose how the business was verified.");
  }

  const record = buildVerificationRecord({
    verifiedBy: session.uid,
    method,
    notes: cleanStr(body.notes, 300) || undefined,
    now,
  });

  await ref.set(
    { verified: true, verification: record, updatedAt: now.toISOString() },
    { merge: true }
  );

  const owner = String(snap.data()?.ownerUid ?? "");
  if (owner) {
    await db.collection("notifications").add({
      toUid: owner,
      fromUid: session.uid,
      type: "verified",
      message: "Your listing passed verification ✓ It now shows the Verified badge.",
      businessId,
      href: "/dashboard",
      read: false,
      createdAt: now.toISOString(),
    });
    queueEmail({
      toUid: owner,
      kind: "listing-verified",
      subject: "Your listing is now Verified ✓",
      heading: "You're verified",
      body: "Your listing passed verification and now shows the Verified badge — buyers trust it more.",
      ctaLabel: "Open dashboard",
      ctaHref: "/dashboard",
    });
  }

  return Response.json({ ok: true, verified: true, verification: record });
}