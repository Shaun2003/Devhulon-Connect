import type { Firestore } from "firebase-admin/firestore";
import { LEAD_OPEN_EXPIRY_DAYS } from "@/lib/legal";
import { isOlderThan, nowIso, OPEN_STATUSES } from "./retention";

export type SweepResult = {
  expired: number;
  stoodDown: number;
  redacted: number;
  quotesRedacted: number;
  analyticsDeleted: number;
  rateLimitsDeleted: number;
  scanned: number;
  errors: string[];
};

/**
 * Close open requests nobody answered, and stand the sellers down.
 *
 * This is as much a PRODUCT fix as a legal one: a seller should not be carrying a
 * request from six months ago that can never be won, and a buyer should not have
 * an open request sitting in matched inboxes indefinitely.
 *
 * Best-effort per document BY DESIGN: if one request fails we still close the rest,
 * because a sweep that aborts on the first error would never clear its backlog.
 */
export async function expireStaleRequests(
  db: Firestore,
  now: Date = new Date()
): Promise<Pick<SweepResult, "expired" | "stoodDown" | "errors">> {
  const errors: string[] = [];
  const expired: string[] = [];

  for (const status of OPEN_STATUSES) {
    try {
      // Single indexed equality only — see the note at the top of retention.ts on
      // why a date range query is unsafe against this collection.
      const snap = await db.collection("leads").where("status", "==", status).limit(500).get();
      const batch = db.batch();
      let queued = 0;

      for (const doc of snap.docs) {
        const lead = doc.data() as { createdAt?: unknown };
        if (!isOlderThan(lead.createdAt, LEAD_OPEN_EXPIRY_DAYS, now)) continue;
        expired.push(doc.id);
        batch.set(
          doc.ref,
          { status: "expired", lostReason: "request_closed", updatedAt: nowIso() },
          { merge: true }
        );
        queued++;
      }
      if (queued) await batch.commit();
    } catch (e) {
      errors.push(`expire:${status}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Stand the sellers down using the SAME shape as a lost-to-competition lead, so
  // the dashboard and analytics need no special case for expiry: one code path,
  // one notification shape, one meaning — "no action needed".
  let stoodDown = 0;
  for (const requestId of expired) {
    try {
      await standDownSiblings(db, requestId, now);
      stoodDown++;
    } catch (e) {
      errors.push(`standdown:${requestId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { expired: expired.length, stoodDown, errors };
}

export async function pruneAggregateData(
  db: Firestore,
  now: Date = new Date(),
): Promise<Pick<SweepResult, "analyticsDeleted" | "rateLimitsDeleted" | "errors">> {
  const analyticsCutoff = new Date(now.getTime() - 400 * 86_400_000).toISOString().slice(0, 10);
  const rateLimitCutoff = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const errors: string[] = [];

  async function prune(collection: string, field: string, cutoff: string): Promise<number> {
    let deleted = 0;
    for (let page = 0; page < 10; page++) {
      try {
        const snapshot = await db.collection(collection).where(field, "<", cutoff).limit(500).get();
        if (snapshot.empty) break;
        const batch = db.batch();
        for (const doc of snapshot.docs) batch.delete(doc.ref);
        await batch.commit();
        deleted += snapshot.size;
      } catch (error) {
        errors.push(`${collection}: ${error instanceof Error ? error.message : String(error)}`);
        break;
      }
    }
    return deleted;
  }

  const [analyticsDeleted, rateLimitsDeleted] = await Promise.all([
    prune("analytics_daily", "day", analyticsCutoff),
    prune("rate_limits", "updatedAt", rateLimitCutoff),
  ]);
  return { analyticsDeleted, rateLimitsDeleted, errors };
}

async function standDownSiblings(db: Firestore, requestId: string, now: Date) {
  const at = now.toISOString();
  const siblings = await db.collection("leads").where("requestId", "==", requestId).limit(20).get();

  for (const doc of siblings.docs) {
    if (doc.id === requestId) continue;
    const lead = doc.data() as { ownerUid?: string; status?: string };
    if (lead.status === "won" || lead.status === "lost" || lead.status === "expired") continue;
    await doc.ref.set(
      { status: "lost", lostReason: "request_closed", lostAt: at, updatedAt: at },
      { merge: true }
    );
    if (lead.ownerUid) {
      await db.collection("notifications").add({
        toUid: lead.ownerUid,
        type: "lead-lost",
        message: "This request expired without a quote, so it has been closed. No action needed.",
        leadId: doc.id,
        href: "/dashboard",
        read: false,
        createdAt: at,
      });
    }
  }
}