/**
 * Retention redaction pass — TRUSTED SERVER ONLY.
 *
 * The companion to `retention-sweep.ts`. Split across two files only because both
 * passes together exceed a comfortable single-write size; they share the helpers
 * in `retention.ts` and the same idempotency contract.
 */

import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { LEAD_RETENTION_DAYS, REDACTED } from "@/lib/legal";
import { isOlderThan, nowIso } from "./retention";
import { expireStaleRequests, pruneAggregateData, type SweepResult } from "./retention-sweep";

/**
 * Strip personal fields from requests past the retention window.
 *
 * Paged by document id rather than queried by date, because `createdAt` is a mixed
 * type across the dataset (see retention.ts). `__name__` paging needs only the
 * default index, and redaction is idempotent, so re-reading an already-processed
 * document is cheap — which is what makes a bounded page-per-run design safe.
 */
export async function redactAgedRequests(
  db: Firestore,
  now: Date = new Date(),
  opts: { pageSize?: number; maxPages?: number } = {}
): Promise<Pick<SweepResult, "redacted" | "quotesRedacted" | "scanned" | "errors">> {
  const pageSize = opts.pageSize ?? 200;
  const maxPages = opts.maxPages ?? 5;
  const errors: string[] = [];
  let redacted = 0;
  let scanned = 0;
  let cursor: QueryDocumentSnapshot | null = null;

  for (let page = 0; page < maxPages; page++) {
    try {
      let q = db.collection("leads").orderBy("__name__").limit(pageSize);
      if (cursor) q = q.startAfter(cursor);
      const snap = await q.get();
      if (snap.empty) break;
      cursor = snap.docs[snap.docs.length - 1];

      const batch = db.batch();
      let queued = 0;

      for (const doc of snap.docs) {
        scanned++;
        const lead = doc.data() as { createdAt?: unknown; requesterRedacted?: boolean };
        // Already done. Skipping means a repeat run never touches a record, so an
        // operator correction applied after redaction is not silently undone.
        if (lead.requesterRedacted === true) continue;
        if (!isOlderThan(lead.createdAt, LEAD_RETENTION_DAYS, now)) continue;

        batch.set(
          doc.ref,
          {
            name: REDACTED,
            email: null,
            phone: "",
            requesterUid: null,
            requesterRedacted: true,
            redactedAt: nowIso(),
            // Why it was kept, on the record itself. "We had to keep this" and
            // "we chose to keep this" are different statements and a regulator
            // reading the document should be able to tell them apart.
            retentionReason: `anonymised after ${LEAD_RETENTION_DAYS} days`,
          },
          { merge: true }
        );
        redacted++;
        queued++;
      }
      if (queued) await batch.commit();
    } catch (e) {
      errors.push(`redact:page${page}: ${e instanceof Error ? e.message : String(e)}`);
      break;
    }
  }

  // Quotes are secondary: clear the pointer back to the buyer, keep the seller's
  // commercial offer. A quote is the seller's record of what they priced, not the
  // buyer's personal information.
  const quotesRedacted = await redactAgedQuotes(db, now);

  return { redacted, quotesRedacted, scanned, errors };
}

async function redactAgedQuotes(db: Firestore, now: Date): Promise<number> {
  let n = 0;
  try {
    const snap = await db.collection("quotes").where("buyerUid", "!=", null).limit(400).get();
    const batch = db.batch();
    let queued = 0;
    for (const doc of snap.docs) {
      const q = doc.data() as { createdAt?: unknown; buyerUid?: string; buyerRedacted?: boolean };
      if (q.buyerRedacted === true || !q.buyerUid) continue;
      if (!isOlderThan(q.createdAt, LEAD_RETENTION_DAYS, now)) continue;
      batch.set(doc.ref, { buyerUid: null, buyerRedacted: true, redactedAt: nowIso() }, { merge: true });
      n++;
      queued++;
    }
    if (queued) await batch.commit();
  } catch (e) {
    console.warn("[KASI] retention: quote redaction failed:", e instanceof Error ? e.message : e);
  }
  return n;
}

/**
 * Run all retention passes. Safe to invoke repeatedly — a daily cron, a manual curl during
 * an incident, or a backfill script all produce the same end state.
 */
export async function runRetentionSweep(
  db: Firestore,
  now: Date = new Date()
): Promise<SweepResult & { ranAt: string }> {
  const exp = await expireStaleRequests(db, now);
  const red = await redactAgedRequests(db, now);
  const pruned = await pruneAggregateData(db, now);
  return {
    ranAt: now.toISOString(),
    expired: exp.expired,
    stoodDown: exp.stoodDown,
    redacted: red.redacted,
    quotesRedacted: red.quotesRedacted,
    analyticsDeleted: pruned.analyticsDeleted,
    rateLimitsDeleted: pruned.rateLimitsDeleted,
    scanned: red.scanned,
    errors: [...exp.errors, ...red.errors, ...pruned.errors],
  };
}