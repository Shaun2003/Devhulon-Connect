/**
 * Contact grants — the server-only record of WHO may START a conversation
 * with a buyer (`contact_grants/{sellerUid}`).
 *
 * Why this exists: every lead doc carries `requesterUid`, so before this
 * collection a seller could read the buyer's uid off their own lead copy and
 * open a thread with `ensureConversation` without ever spending a credit.
 * firestore.rules now gates conversation CREATE for seller-role callers on
 * this row (`contactGranted()`), making pay-per-contact enforced at the
 * messaging layer — not just at the reveal.
 *
 * Shape: ONE doc per seller with a `grantedTo` array, not one doc per pair:
 *   • the rules read rule is then `request.auth.uid == sellerUid` — a pure
 *     path compare that never touches `resource.data`, so it cannot error on
 *     a missing document (the gate behaves identically under either possible
 *     rules-engine interpretation of exists()/get() target-rule semantics);
 *   • `FieldValue.arrayUnion` makes concurrent grants idempotent — two
 *     unlocks racing cannot lose one another's write;
 *   • a seller's whole grant history sits in one document they may read.
 *
 * Written from exactly two places, both Trusted Server:
 *   • `unlockLeadContact` (src/lib/server/credits.ts) — paid with credits;
 *   • `awardQuote` (src/lib/server/award.ts) — paid by the buyer accepting.
 */

import { FieldValue, type Firestore } from "firebase-admin/firestore";

export type GrantVia = "unlock" | "award";

/** Idempotent: grants the seller the right to open threads with `buyerUid`. */
export async function grantContact(
  db: Firestore,
  sellerUid: string,
  buyerUid: string,
  meta: { leadId?: string | null; via: GrantVia }
): Promise<void> {
  if (!sellerUid || !buyerUid || sellerUid === buyerUid) return;
  const now = new Date().toISOString();
  await db.collection("contact_grants").doc(sellerUid).set(
    {
      sellerUid,
      grantedTo: FieldValue.arrayUnion(buyerUid),
      // Provenance for support ("why can this seller message that buyer?") —
      // last grant wins; the full trail lives in credit_ledger / lead_unlocks.
      lastGrant: { buyerUid, leadId: meta.leadId ?? null, via: meta.via, at: now },
      updatedAt: now,
    },
    { merge: true }
  );
}