/** ── Seller verification requests (§8 Phase 1) ─────────────────────────────
 * Sellers request verification by submitting identity / business documents.
 * The request is reviewed by an admin who either approves (writes a
 * VerificationRecord to the business doc) or rejects with a note.
 *
 * Collections:
 *   verification_requests/{uid} — one doc per seller, status pending/approved/rejected
 *   business documents get `verified` + `verification` record on approval
 *
 * Writes happen on the server with the Admin SDK (the routes authenticate the
 * caller via their ID token before calling in). Firestore rules additionally
 * let the owner read their own row live — that is how the seller's dashboard
 * shows the status flipping the moment an admin decides.
 * ───────────────────────────────────────────────────────────────────────── */

import { adminDb } from "./admin";
import { queueEmail } from "./email";
import type { VerificationMethod } from "../verification";

export type VerificationRequestStatus = "pending" | "approved" | "rejected";

export type VerificationRequest = {
  uid: string;
  businessId: string;
  businessName: string;
  status: VerificationRequestStatus;
  method?: VerificationMethod;
  documents?: { idFront?: string; idBack?: string; proofAddress?: string };
  notes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
};

/** A seller requests verification for their business. */
export async function requestVerification(input: {
  uid: string;
  businessId: string;
  businessName: string;
  method: VerificationMethod;
  documents: { idFront?: string; idBack?: string; proofAddress?: string };
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const d = adminDb();
  if (!d) return { ok: false, error: "Server storage is not configured." };

  const ref = d.collection("verification_requests").doc(input.uid);
  const snap = await ref.get();
  if (snap.exists) {
    const existing = snap.data() as { status?: VerificationRequestStatus };
    if (existing.status === "pending") {
      return { ok: false, error: "A verification request is already under review." };
    }
  }

  const now = new Date().toISOString();
  await ref.set({
    uid: input.uid,
    businessId: input.businessId,
    businessName: input.businessName,
    status: "pending",
    method: input.method,
    documents: input.documents,
    createdAt: now,
    updatedAt: now,
  });

  return { ok: true };
}

/** Admin approves a verification request — writes the VerificationRecord to the business doc. */
export async function approveVerification(input: {
  uid: string;
  businessId: string;
  reviewedBy: string;
  method: VerificationMethod;
  notes?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const d = adminDb();
  if (!d) return { ok: false, error: "Server storage is not configured." };

  const reqSnap = await d.collection("verification_requests").doc(input.uid).get();
  if (!reqSnap.exists) return { ok: false, error: "No verification request found." };
  const req = reqSnap.data() as VerificationRequest;
  if (req.status !== "pending") return { ok: false, error: "Request already decided." };

  const now = new Date();
  const { buildVerificationRecord } = await import("../verification");
  const record = buildVerificationRecord({ verifiedBy: input.reviewedBy, method: input.method, notes: input.notes, now });

  await d.collection("businesses").doc(input.businessId).set(
    { verified: true, verification: record, updatedAt: now.toISOString() },
    { merge: true }
  );

  await d.collection("verification_requests").doc(input.uid).set(
    {
      status: "approved",
      reviewedBy: input.reviewedBy,
      reviewedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    { merge: true }
  );

  const owner = req.uid;
  await d.collection("notifications").add({
    toUid: owner,
    fromUid: input.reviewedBy,
    type: "verified",
    message: "Your listing passed verification ✓ It now shows the Verified badge.",
    businessId: input.businessId,
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

  return { ok: true };
}

/** Admin rejects a verification request with a note. */
export async function rejectVerification(input: {
  uid: string;
  businessId: string;
  reviewedBy: string;
  notes: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const d = adminDb();
  if (!d) return { ok: false, error: "Server storage is not configured." };

  const reqSnap = await d.collection("verification_requests").doc(input.uid).get();
  if (!reqSnap.exists) return { ok: false, error: "No verification request found." };
  const req = reqSnap.data() as VerificationRequest;
  if (req.status !== "pending") return { ok: false, error: "Request already decided." };

  const now = new Date().toISOString();
  await d.collection("verification_requests").doc(input.uid).set(
    {
      status: "rejected",
      reviewedBy: input.reviewedBy,
      reviewedAt: now,
      notes: input.notes,
      updatedAt: now,
    },
    { merge: true }
  );

  await d.collection("notifications").add({
    toUid: input.uid,
    fromUid: input.reviewedBy,
    type: "unverified",
    message: `Verification could not be completed: ${input.notes}`,
    businessId: input.businessId,
    href: "/dashboard",
    read: false,
    createdAt: now,
  });
  queueEmail({
    toUid: input.uid,
    kind: "listing-unverified",
    subject: "Verification needs more information",
    heading: "Verification returned",
    body: input.notes,
    ctaLabel: "Open dashboard",
    ctaHref: "/dashboard",
  });

  return { ok: true };
}

/** List all pending verification requests (admin queue). */
export async function listPendingVerificationRequests(): Promise<VerificationRequest[]> {
  const d = adminDb();
  if (!d) return [];
  const snap = await d.collection("verification_requests").where("status", "==", "pending").get();
  return snap.docs.map((d_) => ({ id: d_.id, ...(d_.data() as VerificationRequest) }));
}

/** Get a seller's own verification request. */
export async function getMyVerificationRequest(uid: string): Promise<VerificationRequest | null> {
  const d = adminDb();
  if (!d) return null;
  const snap = await d.collection("verification_requests").doc(uid).get();
  if (!snap.exists) return null;
  return snap.data() as VerificationRequest;
}