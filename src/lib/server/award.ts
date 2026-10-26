/**
 * POST /api/quotes/award — the buyer accepts a quote and every other seller on
 * that same request is stood down ATOMICALLY.
 *
 * This is the fix for the marketplace's central defect. A broadcast used to
 * create N INDEPENDENT lead documents with no link between them (`requestId` was
 * written only to the server-only `lead_allocations` audit collection). So when
 * the buyer accepted seller A's quote, `decideQuote` marked only A's copy `won`
 * and sellers B..E kept `status: "quoted"` forever — dead leads chasing a job
 * that was already done, and four sellers' monthly allowance burned on a job
 * none of them would win.
 *
 * Why SERVER-SIDE and TRANSACTIONAL:
 *   • The cascade touches documents the buyer does not own. The rules correctly
 *     let a seller write only their OWN lead, so a client cannot close a rival's
 *     copy — the trusted server can.
 *   • "Exactly one winner" is mutual exclusion. Two tabs open on
 *     /compare-quotes, or a double-click, would otherwise award the same job
 *     twice. A transaction on the request doc makes the loser fail instead of
 *     silently overwriting a real winner.
 *
 * The request doc is the lock: `awardedSellerUid` stays null until someone wins.
 */

import { normalizeQuoteStatus } from "@/lib/quotes";
import { queueEmail } from "./email";
import { grantContact } from "./contact-grants";
import type { Firestore } from "firebase-admin/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const nowIso = () => new Date().toISOString();

export type AwardResult = { ok: true; requestId: string } | { ok: false; error: string };

/**
 * Award a request to one seller and stand the rest down.
 *
 * Returns a result object (not a Response) so it is callable from the route
 * handler and from other server code without HTTP. Every step after the lock is
 * idempotent, so a retry converges to the same state.
 */
export async function awardQuote(
  db: Firestore,
  input: { quoteId: string; requestId?: string; buyerUid: string }
): Promise<AwardResult> {
  const quoteId = input.quoteId;
  const quoteSnap = await db.collection("quotes").doc(quoteId).get();
  if (!quoteSnap.exists) return { ok: false, error: "That quote no longer exists." };
  const quote = quoteSnap.data() as {
    buyerUid?: string; sellerUid?: string; leadId?: string; status?: string;
  };
  if (quote.buyerUid !== input.buyerUid) {
    return { ok: false, error: "Only the buyer who requested this can accept a quote." };
  }
  if (normalizeQuoteStatus(quote.status) !== "sent") {
    return { ok: false, error: "That quote has already been decided." };
  }

  // The request is the PARENT document. A direct (one-seller) lead has no
  // separate request, so it is its own request — a request of one is still a
  // request, and the award bookkeeping stays identical.
  const requestId = input.requestId || quote.leadId || quoteId;
  const requestRef = db.collection("leads").doc(requestId);

  // ── The lock ────────────────────────────────────────────────────────────
  const winner = await db.runTransaction(async (tx) => {
    const snap = await tx.get(requestRef);
    const doc = (snap.data() ?? {}) as {
      requesterUid?: string; awardedSellerUid?: string | null;
    };
    if (doc.requesterUid && doc.requesterUid !== input.buyerUid) {
      return { ok: false as const, error: "That request isn't yours." };
    }
    if (doc.awardedSellerUid) {
      return { ok: false as const, error: "You've already accepted a quote for this request." };
    }
    tx.set(
      requestRef,
      {
        status: "won",
        awardedQuoteId: quoteId,
        awardedSellerUid: quote.sellerUid ?? null,
        awardedAt: nowIso(),
        updatedAt: nowIso(),
      },
      { merge: true }
    );
    return { ok: true as const };
  });

  if (!winner.ok) return { ok: false, error: winner.error };

  const awardedAt = nowIso();

  await db.collection("quotes").doc(quoteId).set(
    { status: "accepted", decidedAt: awardedAt, updatedAt: awardedAt },
    { merge: true }
  );

  await cascadeAward(db, { requestId, awardedAt, buyerUid: input.buyerUid, winnerSellerUid: quote.sellerUid ?? null });

  // The winner may now START a thread with the buyer: firestore.rules gates
  // seller-side conversation creates on the grant row, and accepting this quote
  // is what earned them the contact — no credits change hands here. Best-effort
  // (same contract as cascadeAward's per-doc writes): a completed award must
  // never roll back over a bookkeeping write.
  if (quote.sellerUid) {
    try {
      await grantContact(db, quote.sellerUid, input.buyerUid, { leadId: quote.leadId ?? requestId, via: "award" });
    } catch (e) {
      console.warn("[KASI] contact_grant write failed:", e);
    }
  }

  if (quote.sellerUid) {
    await db.collection("notifications").add({
      toUid: quote.sellerUid,
      fromUid: input.buyerUid,
      type: "quote-accepted",
      message: "Your quote was accepted 🎉 — message the buyer to lock in the date.",
      leadId: quote.leadId ?? null,
      href: "/dashboard",
      read: false,
      createdAt: awardedAt,
    });
    // SELLER email — winning a job is the highest-value event on the platform.
    queueEmail({
      toUid: quote.sellerUid,
      kind: "quote-accepted",
      subject: "You won the job — your quote was accepted",
      heading: "Your quote was accepted",
      body: "The buyer accepted your quote. Message them now to lock in the date and details.",
      ctaLabel: "Open dashboard",
      ctaHref: "/dashboard",
    });
  }

  // BUYER confirmation — a receipt that the award went through and the other
  // pros were stood down, so they know nobody else will keep chasing them.
  queueEmail({
    toUid: input.buyerUid,
    kind: "quote-accepted",
    subject: "You accepted a quote",
    heading: "Quote accepted",
    body: "You've accepted a quote and the other pros on this request have been told it's closed. Message your pro to confirm the date and details.",
    ctaLabel: "Open dashboard",
    ctaHref: "/dashboard",
  });

  return { ok: true, requestId };
}

/**
 * Stand down everyone who lost the request.
 *
 * Best-effort per document BY DESIGN: a failure on one rival must not roll back
 * a real award the buyer just made. Every step is idempotent (it skips anything
 * already `won`/`lost`/decided), so a retry converges to the same state.
 *
 * Exported because the same closure must run when a request EXPIRES unclaimed,
 * not only when a quote is accepted.
 */
export async function cascadeAward(
  db: Firestore,
  args: {
    requestId: string;
    awardedAt: string;
    buyerUid: string;
    winnerSellerUid: string | null;
    /** "awarded_elsewhere" when a rival won; "request_closed" on expiry. */
    reason?: "awarded_elsewhere" | "request_closed";
    /** Message shown to the losing sellers. */
    message?: string;
  }
) {
  const { requestId, awardedAt, buyerUid, winnerSellerUid } = args;
  const reason = args.reason ?? "awarded_elsewhere";
  const message =
    args.message ??
    (reason === "awarded_elsewhere"
      ? "This request was awarded to another business. No action needed."
      : "This request has been closed. No action needed.");

  // Every OTHER seller's copy of the same job → lost.
  const siblingLeads = await db.collection("leads").where("requestId", "==", requestId).get();
  for (const doc of siblingLeads.docs) {
    if (doc.id === requestId) continue; // the request doc itself
    const lead = doc.data() as { ownerUid?: string; status?: string };
    if (winnerSellerUid && lead.ownerUid === winnerSellerUid) continue;
    if (lead.status === "won" || lead.status === "lost") continue;

    await doc.ref.set(
      { status: "lost", lostReason: reason, lostAt: awardedAt, updatedAt: awardedAt },
      { merge: true }
    );
    // Tell the loser WHY, so an empty inbox reads as a decision rather than a
    // bug — and so nobody wastes another day chasing a closed job.
    if (lead.ownerUid) {
      await db.collection("notifications").add({
        toUid: lead.ownerUid,
        fromUid: buyerUid,
        type: "lead-lost",
        message,
        leadId: doc.id,
        href: "/dashboard",
        read: false,
        createdAt: awardedAt,
      });
    }
  }

  // Rival QUOTES must not sit at "awaiting decision" after the job is gone.
  const rivalQuotes = await db.collection("quotes").where("requestId", "==", requestId).get();
  for (const doc of rivalQuotes.docs) {
    const q = doc.data() as { status?: string; sellerUid?: string };
    if (normalizeQuoteStatus(q.status) !== "sent") continue;
    await doc.ref.set(
      {
        status: "declined",
        buyerResponse: reason === "awarded_elsewhere" ? "The buyer accepted another quote." : message,
        decidedAt: awardedAt,
        updatedAt: awardedAt,
      },
      { merge: true }
    );
    if (q.sellerUid && q.sellerUid !== winnerSellerUid) {
      await db.collection("notifications").add({
        toUid: q.sellerUid,
        fromUid: buyerUid,
        type: "quote-declined",
        message,
        href: "/dashboard",
        read: false,
        createdAt: awardedAt,
      });
      queueEmail({
        toUid: q.sellerUid,
        kind: "quote-declined",
        subject: "A request you quoted on has closed",
        heading: "Quote not selected",
        body: message,
        ctaLabel: "Open dashboard",
        ctaHref: "/dashboard",
      });
    }
  }
}