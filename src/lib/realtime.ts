import { useEffect, useRef, useState } from "react";
import {
  collection, query, where, limit, onSnapshot, doc, orderBy,
  type DocumentData,
  type QueryConstraint,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "./firebase";
import { aggregateReviewRatings, type RatingAgg } from "@/data/businesses";
import { byNewest, byOldest } from "./messages";
import { tierForLead, LEAD_TIER_CREDITS, type LeadPreview } from "@/lib/credits";

/** Realtime subscriptions — Firestore is realtime by default via onSnapshot. No SQL needed. */

type Unsub = () => void;
type RowsCb<T> = (rows: T[]) => void;
export type RealtimeError = { message: string };

export function useRealtime<T>(
  subscribe: (cb: RowsCb<T>, onError?: (e: RealtimeError) => void) => Unsub,
  fallback: T[] = [],
  deps: unknown[] = []
) {
  const [rows, setRows] = useState<T[]>(fallback);
  const [snapshotKey, setSnapshotKey] = useState<string | null>(null);
  const [errorState, setErrorState] = useState<{ key: string; error: RealtimeError } | null>(null);
  const subRef = useRef(subscribe);
  const key = JSON.stringify(deps);
  useEffect(() => {
    subRef.current = subscribe;
  });
  useEffect(() => {
    const current = subRef.current;
    let alive = true;
    const unsub = current(
      (r) => {
        if (!alive) return;
        setRows(r);
        setSnapshotKey(key);
        setErrorState(null);
      },
      (e) => {
        if (!alive) return;
        setErrorState({ key, error: e });
      }
    );
    return () => { alive = false; unsub(); };
  }, [key]);
  return {
    rows,
    live: snapshotKey === key,
    error: errorState?.key === key ? errorState.error : null,
  };
}

function subCol<T extends DocumentData>(
  col: string,
  constraintsParams: Parameters<typeof query>[1][],
  cb: (rows: (T & { id: string })[]) => void,
  onError?: (e: RealtimeError) => void
) {
  if (!db || !isFirebaseConfigured) {
    onError?.({ message: "firebase-not-configured" });
    return () => {};
  }
  const q = query(collection(db, col), ...constraintsParams);
  return onSnapshot(
    q,
    (snap) => {
      cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as T) })));
    },
    (err) => {
      console.warn(`[KASI] realtime ${col} failed:`, err.message);
      onError?.({ message: err.message });
    }
  );
}

/** Friendly, actionable hint when a listener fails. */
export function listenerHint(err: { message?: string } | null): string {
  if (!err) return "";
  const m = err.message ?? "";
  if (/firebase-not-configured/i.test(m)) return "Add NEXT_PUBLIC_FIREBASE_* to .env.local and restart to go live.";
  if (/permission|PERMISSION/i.test(m)) return "Firestore rules are blocking this feed — publish the latest firestore.rules (repo root) in Firebase Console → Firestore → Rules, then reload.";
  if (/index|FAILED_PRECONDITION/i.test(m)) return "Needs a Firestore composite index — click the link in the browser console error.";
  return m;
}

/**
 * How many review documents the public rating feed streams at once.
 *
 * Ratings are derived from the reviews themselves (see `aggregateReviewRatings`)
 * because the denormalised `businesses.rating` cache is not reliably writable.
 * A cap is unavoidable for an unfiltered collection read; 300 matches the REST
 * reader's single page, so the server render and the live feed agree on exactly
 * which reviews count and a page can never disagree with itself.
 */
export const REVIEW_FEED_LIMIT = 300;

/**
 * Live rating aggregates for every business, as one lookup map.
 *
 * Emits `{ [businessId]: { rating, reviewCount } }` so a listing surface can
 * overlay true ratings onto whatever it has already loaded. Without this, any
 * page that did not itself query `business_reviews` rendered the stale cache —
 * which is why a business with two 5★ reviews showed "no reviews yet" on the
 * service pages while its own profile showed the stars.
 */
export function subscribeReviewRatings(
  cb: (agg: Record<string, RatingAgg>) => void,
  onError?: (e: RealtimeError) => void
) {
  return subCol("business_reviews", [limit(REVIEW_FEED_LIMIT)], (rows) =>
    cb(aggregateReviewRatings(rows as unknown as Record<string, unknown>[])), onError
  );
}

/**
 * Live rating aggregates, ready to overlay onto a listing array.
 *
 * A dedicated hook rather than `useRealtime`, because that one is array-shaped
 * (`T[]`) while a rating aggregate is a single lookup MAP — reusing it would
 * either force a wrapper type or reintroduce the object-in-an-array confusion
 * this replaces.
 *
 * `{}` is the honest starting value: it overlays nothing, so a listing keeps
 * whatever it was rendered with until the first snapshot lands (and for good if
 * the listener is blocked, since an empty map changes nothing).
 */
export function useReviewRatings() {
  const [agg, setAgg] = useState<Record<string, RatingAgg>>({});
  const [error, setError] = useState<RealtimeError | null>(null);
  useEffect(() => subscribeReviewRatings(setAgg, setError), []);
  return { ratings: agg, error };
}

export function subscribeReviews(businessId: string, cb: (rows: { id: string; author: string; rating: number; body: string; createdAt?: unknown }[]) => void, onError?: (e: RealtimeError) => void) {
  // Index-free: single equality, client-side sort (works on free Spark, no composite index).
  return subCol("business_reviews", [where("businessId", "==", businessId), limit(20)], (rows) =>
    cb([...rows as { id: string; author: string; rating: number; body: string; createdAt?: unknown }[]].sort(createdDesc)), onError
  );
}

/** Sort Firestore docs newest-first without needing an orderBy index. */
function createdDesc(a: { createdAt?: unknown }, b: { createdAt?: unknown }): number {
  const ta = tsMilli(a.createdAt);
  const tb = tsMilli(b.createdAt);
  return tb - ta;
}

/**
 * Coerce any stored timestamp to epoch ms: a Firestore Timestamp (has
 * `toMillis`), a `{ seconds }` object, an ISO string or a number. Returns 0 when
 * it cannot be parsed.
 *
 * Exported because the trap is subtle and silent: `new Date(String(timestamp))`
 * stringifies a Firestore Timestamp to "[object Object]" → Invalid Date, which
 * breaks date rendering AND any client-side sort built on it without throwing.
 *
 * This app stores timestamps inconsistently, so prefer this helper over parsing
 * by hand. Verified field types: leads.createdAt is a real Timestamp (written by
 * the client SDK via serverTimestamp), while users.createdAt,
 * payments.createdAt/paidAt and subscriptions.current_period_end/trial_ends_at
 * are ISO strings (written by the REST route handlers), and the seeder uses a
 * third name, created_at.
 */
export function tsMilli(v: unknown): number {
  if (!v) return 0;
  if (typeof v === "object" && v !== null && "toMillis" in v && typeof (v as { toMillis: unknown }).toMillis === "function") {
    try { return (v as { toMillis: () => number }).toMillis(); } catch { return 0; }
  }
  if (typeof v === "object" && v !== null && "seconds" in v) {
    const s = Number((v as { seconds?: unknown }).seconds ?? 0);
    return Number.isFinite(s) ? s * 1000 : 0;
  }
  if (typeof v === "string" || typeof v === "number") {
    const t = new Date(v).getTime();
    return Number.isFinite(t) ? t : 0;
  }
  return 0;
}

export function subscribeMyBusinesses(ownerUid: string, cb: (rows: DocumentData[]) => void, onError?: (e: RealtimeError) => void) {
  return subCol("businesses", [where("ownerUid", "==", ownerUid), limit(50)], cb, onError);
}

export function subscribeMyTeamMemberships(memberUid: string, cb: (rows: DocumentData[]) => void, onError?: (e: RealtimeError) => void) {
  return subCol("team_memberships", [where("memberUid", "==", memberUid)], cb, onError);
}

export function subscribeBusinessesForOwners(ownerUids: string[], cb: (rows: DocumentData[]) => void, onError?: (e: RealtimeError) => void) {
  if (!db || !isFirebaseConfigured) {
    onError?.({ message: "firebase-not-configured" });
    return () => {};
  }
  const rowsByOwner = new Map<string, DocumentData[]>();
  const unsubs = [...new Set(ownerUids.filter(Boolean))].map((ownerUid) =>
    onSnapshot(
      query(collection(db!, "businesses"), where("ownerUid", "==", ownerUid), limit(50)),
      (snap) => {
        rowsByOwner.set(ownerUid, snap.docs.map((item) => ({ id: item.id, ...(item.data() as DocumentData) })));
        cb([...rowsByOwner.values()].flat());
      },
      (error) => {
        console.warn("[KASI] realtime team businesses failed:", error.message);
        onError?.({ message: error.message });
      },
    ),
  );
  cb([]);
  return () => unsubs.forEach((unsubscribe) => unsubscribe());
}

export function subscribeLeadsInbox(ownerUid: string, cb: (rows: DocumentData[]) => void, onError?: (e: RealtimeError) => void) {
  // Keep the server query equality-only; sorting locally avoids a composite index.
  return subCol("leads", [where("ownerUid", "==", ownerUid)], (rows) =>
    cb([...rows].sort(createdDesc as (a: DocumentData, b: DocumentData) => number)), onError
  );
}

export function subscribeMyClaims(uid: string, cb: (rows: DocumentData[]) => void, onError?: (e: RealtimeError) => void) {
  return subCol("business_claims", [where("claimantUid", "==", uid), limit(50)], (rows) =>
    cb([...rows].sort(createdDesc as (a: DocumentData, b: DocumentData) => number)), onError
  );
}

export function subscribeMySubscription(uid: string, cb: (rows: DocumentData[]) => void, onError?: (e: RealtimeError) => void) {
  if (!db || !isFirebaseConfigured || !uid) {
    onError?.({ message: !uid ? "missing-uid" : "firebase-not-configured" });
    return () => {};
  }
  // Doc listener, NOT where("ownerUid","==",uid): subscriptions/{uid} rule is
  // `allow read: if isMe(uid)` (doc-id check), which can never prove a
  // field-filtered list query — that listener always fails permission-denied.
  return onSnapshot(
    doc(db, "subscriptions", uid),
    (snap) => cb(snap.exists() ? [{ id: snap.id, ...(snap.data() as DocumentData) }] : []),
    (err) => {
      console.warn("[KASI] subscribeMySubscription failed:", err.message);
      onError?.({ message: err.message });
    }
  );
}

export function subscribeBusinessesByCity(citySlug: string, cb: (rows: DocumentData[]) => void, onError?: (e: RealtimeError) => void) {
  return subCol("businesses", [where("citySlug", "==", citySlug), limit(200)], (rows) =>
    cb([...rows].sort((a, b) => Number(b.rating ?? 0) - Number(a.rating ?? 0))), onError
  );
}

/**
 * All businesses, best-rated first (homepage "Popular near you").
 *
 * `status` is an admin-console argument. The verification queue filters on
 * `verified`, but it cannot do so IN THE QUERY even though `allow read: if true`
 * on businesses would permit it: `verified` is frequently ABSENT rather than
 * `false` (only createBusiness writes `verified: false`; the seeded and
 * hand-written docs omit the field) and a Firestore equality never matches a
 * missing field — so `where("verified", "==", false)` would silently drop exactly
 * the listings that need verifying. Filtering client-side over this capped slice
 * is therefore deliberate, and the console reports hitting the cap. Pinning
 * `status == 'live'` keeps rejected listings from consuming the 200 slots.
 * Public callers omit `status`.
 */
export function subscribeTopBusinesses(
  cb: (rows: DocumentData[]) => void,
  onError?: (e: RealtimeError) => void,
  status?: string
) {
  const constraints: QueryConstraint[] = status
    ? [where("status", "==", status), limit(BUSINESS_FEED_LIMIT)]
    : [limit(BUSINESS_FEED_LIMIT)];
  return subCol("businesses", constraints, (rows) =>
    cb([...rows].sort((a, b) => Number(b.rating ?? 0) - Number(a.rating ?? 0))), onError
  );
}

/**
 * Every listing in ONE category, best-rated first — the /services/[slug] feed.
 *
 * A single equality filter, so it needs no composite index (works on the free
 * Spark plan). `status` is deliberately NOT part of the query: it is frequently
 * ABSENT rather than "live" (only some writers set it) and a Firestore
 * equality never matches a missing field, so `where("status","==","live")`
 * would hide exactly the listings this page exists to show. Pending and
 * rejected rows are dropped client-side instead, mirroring the server reader.
 */
export function subscribeBusinessesByCategory(
  categorySlug: string,
  cb: (rows: DocumentData[]) => void,
  onError?: (e: RealtimeError) => void
) {
  if (!categorySlug) {
    onError?.({ message: "missing-category" });
    return () => {};
  }
  return subCol(
    "businesses",
    [where("categorySlug", "==", categorySlug), limit(BUSINESS_FEED_LIMIT)],
    (rows) =>
      cb(
        rows
          .filter((r) => String(r.status ?? "live") === "live")
          .sort((a, b) => Number(b.rating ?? 0) - Number(a.rating ?? 0))
      ),
    onError
  );
}

export function subscribeBusinessById(businessId: string, cb: (row: DocumentData | null) => void, onError?: (e: RealtimeError) => void) {
  if (!db || !isFirebaseConfigured) {
    onError?.({ message: "firebase-not-configured" });
    return () => {};
  }
  return onSnapshot(
    doc(db, "businesses", businessId),
    (snap) => {
      cb(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    },
    (err) => {
      console.warn("[KASI] subscribeBusinessById failed:", err.message);
      onError?.({ message: err.message });
    }
  );
}

/**
 * Jobs / events / deals feeds.
 *
 * `status` is an admin-console argument: the moderation queue must see
 * `status == 'pending'`, and an unfiltered `limit(100)` cannot guarantee that —
 * pending posts beyond the slice would be invisible, so the queue would report
 * "nothing waiting" while they sat in the database. Public callers omit it and
 * keep the previous unfiltered behaviour.
 */
export function subscribeJobs(cb: (rows: DocumentData[]) => void, onError?: (e: RealtimeError) => void, status?: string) {
  return subCol("jobs", status ? [where("status", "==", status), limit(MODERATION_FEED_LIMIT)] : [limit(MODERATION_FEED_LIMIT)], cb, onError);
}

export function subscribeEvents(cb: (rows: DocumentData[]) => void, onError?: (e: RealtimeError) => void, status?: string) {
  return subCol("events", status ? [where("status", "==", status), limit(MODERATION_FEED_LIMIT)] : [limit(MODERATION_FEED_LIMIT)], cb, onError);
}

export function subscribeDeals(cb: (rows: DocumentData[]) => void, onError?: (e: RealtimeError) => void, status?: string) {
  return subCol("deals", status ? [where("status", "==", status), limit(MODERATION_FEED_LIMIT)] : [limit(MODERATION_FEED_LIMIT)], cb, onError);
}

export function subscribeArticles(cb: (rows: DocumentData[]) => void, onError?: (e: RealtimeError) => void) {
  return subCol("articles", [limit(100)], cb, onError);
}

/**
 * Seller-posted places.
 *
 * The public /places pages still render from the bundled catalogue in
 * `src/data/places.ts`, so this collection is empty until a Business-tier seller
 * publishes one. It is wired up now so the dashboard's "My posts" panel binds to
 * the same realtime source the `firestore.rules` `match /places` write rule
 * governs, instead of a second, divergent list.
 */
export function subscribePlaces(cb: (rows: DocumentData[]) => void, onError?: (e: RealtimeError) => void) {
  return subCol("places", [limit(100)], (rows) =>
    cb([...rows].sort(createdDesc as (a: DocumentData, b: DocumentData) => number)), onError
  );
}

/** Buyer's quote requests (leads where they are the requester). */
export function subscribeLeadsByRequester(uid: string, cb: (rows: DocumentData[]) => void, onError?: (e: RealtimeError) => void) {
  // Equality-only query avoids requiring a composite index; sort the buyer's
  // own complete result set locally.
  return subCol("leads", [where("requesterUid", "==", uid)], (rows) =>
    cb([...rows].filter((row) => row.hiddenFromBuyer !== true).sort(createdDesc as (a: DocumentData, b: DocumentData) => number)), onError
  );
}

/** Buyer's own reviews across the directory. */
export function subscribeReviewsByReviewer(uid: string, cb: (rows: DocumentData[]) => void, onError?: (e: RealtimeError) => void) {
  return subCol("business_reviews", [where("reviewerUid", "==", uid), limit(50)], (rows) =>
    cb([...rows].sort(createdDesc as (a: DocumentData, b: DocumentData) => number)), onError
  );
}

/** Buyer's saved businesses (favourites). */
export function subscribeFavorites(uid: string, cb: (rows: DocumentData[]) => void, onError?: (e: RealtimeError) => void) {
  return subCol("favorites", [where("ownerUid", "==", uid), limit(100)], (rows) =>
    cb([...rows].sort(createdDesc as (a: DocumentData, b: DocumentData) => number)), onError
  );
}

/**
 * Single saved-BUSINESS doc, driving the Save/Saved toggle on a listing.
 *
 * Reads `saved_items` with itemType "business" — the same collection
 * `toggleFavorite` writes and the header counter reads. Pointing this at the
 * legacy `favorites` collection is what made the button look dead after a save.
 */
export function subscribeFavoriteDoc(uid: string, businessId: string, cb: (row: DocumentData | null) => void, onError?: (e: RealtimeError) => void) {
  if (!db || !isFirebaseConfigured) {
    onError?.({ message: "firebase-not-configured" });
    return () => {};
  }
  return onSnapshot(
    doc(db, "saved_items", `${uid}__business__${businessId}`),
    (snap) => cb(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    (err) => {
      console.warn("[KASI] subscribeFavoriteDoc failed:", err.message);
      onError?.({ message: err.message });
    }
  );
}

/**
 * Realtime MARKETPLACE feed — the pay-per-contact preview.
 *
 * The open-pool query returns the RAW lead document, which may include legacy
 * contact fields. This listener projects each row to a contact-stripped shape
 * before it reaches the component.
 *
 * So this projects each open lead onto the contact-stripped `LeadPreview` shape
 * BEFORE it reaches the component. It is defence in depth: the server strips too
 * (lib/server/credits.listMarketplaceLeads), but the client must never even hold
 * the contact for a lead that has not been paid for.
 */
export function subscribeMarketplaceLeads(cb: (rows: LeadPreview[]) => void, onError?: (e: RealtimeError) => void) {
  // `status == "new"` (NOT `in ["new","open"]`): firestore.rules only allow the
  // open pool when `status == 'new' && ownerUid == null`, and a list query must
  // be statically provable against the rule — an `in` over two statuses cannot
  // be proven against a single-status clause, so Firestore rejects the WHOLE
  // query with permission-denied even when the rules are published. Every open
  // request is written with status "new" (see lead-allocation / leads/open), so
  // equality is both correct and provable.
  return subCol("leads", [where("status", "==", "new"), where("ownerUid", "==", null), limit(50)], (rows) =>
    cb(
      rows
        .filter((r) => !r.ownerUid)
        .sort(createdDesc as (a: DocumentData, b: DocumentData) => number)
        .map((r) => {
          const tier = tierForLead(r as Parameters<typeof tierForLead>[0]);
          return {
            id: String(r.id ?? ""),
            need: String(r.need ?? "Service request"),
            category: (r.category as string | null) ?? null,
            suburb: (r.suburb as string | null) ?? null,
            timeline: (r.timeline as string | null) ?? null,
            budget: typeof r.budget === "number" ? r.budget : null,
            tier,
            credits: LEAD_TIER_CREDITS[tier],
            createdAt: r.createdAt ?? null,
          };
        })
    ),
    onError
  );
}

/** Single live subscription doc for the signed-in user (plan/tier). */
export function subscribeMyPlan(uid: string, cb: (row: Record<string, unknown> | null) => void, onError?: (e: RealtimeError) => void) {
  if (!db || !isFirebaseConfigured) {
    onError?.({ message: "firebase-not-configured" });
    return () => {};
  }
  return onSnapshot(
    doc(db, "subscriptions", uid),
    (snap) => cb(snap.exists() ? snap.data() as Record<string, unknown> : null),
    (err) => {
      console.warn("[KASI] subscribeMyPlan failed:", err.message);
      onError?.({ message: err.message });
    }
  );
}

/**
 * Realtime credit wallet — `wallets/{uid}`. Kept as a single-doc listener (like
 * subscribeMyPlan) so the dashboard balance updates the instant a purchase lands
 * or a lead is unlocked, with no polling.
 */
export function subscribeMyWallet(uid: string, cb: (row: Record<string, unknown> | null) => void, onError?: (e: RealtimeError) => void) {
  if (!db || !isFirebaseConfigured) {
    onError?.({ message: "firebase-not-configured" });
    return () => {};
  }
  return onSnapshot(
    doc(db, "wallets", uid),
    (snap) => cb(snap.exists() ? { id: snap.id, ...(snap.data() as Record<string, unknown>) } : null),
    (err) => {
      console.warn("[KASI] subscribeMyWallet failed:", err.message);
      onError?.({ message: err.message });
    }
  );
}

/** Realtime credit ledger — every earn and spend, newest first. */
export function subscribeMyCreditLedger(uid: string, cb: (rows: DocumentData[]) => void, onError?: (e: RealtimeError) => void) {
  return subCol(
    "credit_ledger",
    [where("ownerUid", "==", uid), limit(30)],
    (rows) => cb(rows.sort((a, b) => createdDesc(
      { createdAt: a.createdAt },
      { createdAt: b.createdAt },
    ))),
    onError,
  );
}

/**
 * Realtime set of leads this seller has already unlocked.
 *
 * Feeds the "unlocked" badge on the marketplace feed so a seller never sees a
 * lead as still-locked after paying for it. The contact fields are NOT read here
 * (this listener only carries the unlock record); the revealed contact is shown
 * from the unlock response and the conversation.
 */
export function subscribeMyUnlockedLeads(uid: string, cb: (rows: DocumentData[]) => void, onError?: (e: RealtimeError) => void) {
  return subCol("lead_unlocks", [where("ownerUid", "==", uid), limit(300)], (rows) => cb(rows), onError);
}

/** Realtime bell — the signed-in user's notifications, newest first. */
export function subscribeNotifications(uid: string, cb: (rows: DocumentData[]) => void, onError?: (e: RealtimeError) => void) {
  return subCol("notifications", [where("toUid", "==", uid), limit(30)], (rows) =>
    cb([...rows].sort(createdDesc as (a: DocumentData, b: DocumentData) => number)), onError
  );
}

/** Buyer's saved searches (watchlists). */
export function subscribeSavedSearches(uid: string, cb: (rows: DocumentData[]) => void, onError?: (e: RealtimeError) => void) {
  return subCol("saved_searches", [where("ownerUid", "==", uid), limit(30)], (rows) =>
    cb([...rows].sort(createdDesc as (a: DocumentData, b: DocumentData) => number)), onError
  );
}

/**
 * Hard ceiling on how many saved rows stream at once. Sorted client-side on
 * purpose: `createdAt` is a serverTimestamp, so a doc still pending on the
 * server reads as null and an `orderBy("createdAt")` would drop it. Consumers
 * surface a notice when a user actually hits this ceiling rather than silently
 * hiding their oldest saves.
 */
export const SAVED_ITEMS_LIMIT = 500;

/** Buyer's saved items — deals, events, places, guides and jobs (§19). */
export function subscribeSavedItems(uid: string, cb: (rows: DocumentData[]) => void, onError?: (e: RealtimeError) => void) {
  return subCol("saved_items", [where("ownerUid", "==", uid), limit(SAVED_ITEMS_LIMIT)], (rows) =>
    cb([...rows].sort(createdDesc as (a: DocumentData, b: DocumentData) => number)), onError
  );
}

/** Ceiling applied to the reports + claims queues. */
export const ADMIN_QUEUE_LIMIT = 400;

/** Admin: open abuse reports (capped — the console warns at the cap). */
export function subscribeReports(cb: (rows: DocumentData[]) => void, onError?: (e: RealtimeError) => void) {
  return subCol("reports", [where("status", "==", "open"), limit(ADMIN_QUEUE_LIMIT)], (rows) =>
    cb([...rows].sort(createdDesc as (a: DocumentData, b: DocumentData) => number)), onError
  );
}

/** Admin: pending business claims (capped — the console warns at the cap). */
export function subscribeAllClaims(cb: (rows: DocumentData[]) => void, onError?: (e: RealtimeError) => void) {
  return subCol("business_claims", [where("status", "==", "pending"), limit(ADMIN_QUEUE_LIMIT)], (rows) =>
    cb([...rows].sort(createdDesc as (a: DocumentData, b: DocumentData) => number)), onError
  );
}

/** Whether the signed-in user is an admin (admins/{uid} exists). */
export function subscribeAdminDoc(uid: string, cb: (row: DocumentData | null) => void, onError?: (e: RealtimeError) => void) {
  if (!db || !isFirebaseConfigured) {
    onError?.({ message: "firebase-not-configured" });
    return () => {};
  }
  return onSnapshot(
    doc(db, "admins", uid),
    (snap) => cb(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    (err) => {
      console.warn("[KASI] subscribeAdminDoc failed:", err.message);
      onError?.({ message: err.message });
    }
  );
}

/* ── Quote engine (master spec §15–§17) ────────────────────────────────────
 * Every query carries the CALLER's own uid as an equality filter. Firestore
 * evaluates rules per document, so an unconstrained "all quotes for this lead"
 * list would be rejected outright instead of filtered — the uid is part of the
 * security model, not an optimisation.
 * ───────────────────────────────────────────────────────────────────────── */

/** Quotes a seller has sent, newest first. */
export function subscribeMyQuotes(uid: string, cb: (rows: DocumentData[]) => void, onError?: (e: RealtimeError) => void) {
  // Keep the server query equality-only; sorting locally avoids a composite index.
  return subCol("quotes", [where("sellerUid", "==", uid)], (rows) =>
    cb([...rows].sort(createdDesc as (a: DocumentData, b: DocumentData) => number)), onError
  );
}

/** Quotes a buyer has received across every request they've made. */
export function subscribeQuotesForBuyer(uid: string, cb: (rows: DocumentData[]) => void, onError?: (e: RealtimeError) => void) {
  // Equality-only query avoids a buyerUid + createdAt composite index.
  return subCol("quotes", [where("buyerUid", "==", uid)], (rows) =>
    cb([...rows].filter((row) => row.hiddenFromBuyer !== true).sort(createdDesc as (a: DocumentData, b: DocumentData) => number)), onError
  );
}

/** A seller's own listings — used to link a quote back to its public profile. */
export function subscribeBusinessesByOwner(ownerUid: string, cb: (rows: DocumentData[]) => void, onError?: (e: RealtimeError) => void) {
  return subCol("businesses", [where("ownerUid", "==", ownerUid), limit(20)], cb, onError);
}

/** Realtime status of the seller's submitted application (pending/approved/rejected). */
export function subscribeMyApplication(
  uid: string,
  cb: (row: DocumentData | null) => void,
  onError?: (e: RealtimeError) => void
) {
  if (!db || !isFirebaseConfigured || !uid) {
    onError?.({ message: !uid ? "missing-uid" : "firebase-not-configured" });
    return () => {};
  }
  return onSnapshot(
    doc(db, "seller_applications", uid),
    (snap) => cb(snap.exists() ? { id: snap.id, ...(snap.data() as DocumentData) } : null),
    (err) => {
      console.warn("[KASI] subscribeMyApplication failed:", err.message);
      onError?.({ message: err.message });
    }
  );
}

/** Realtime status of the seller's verification request (pending/approved/rejected).
 *  The seller sees the status flip live the moment an admin decides — same
 *  single-doc-per-uid pattern as the registration draft and application. */
export function subscribeMyVerificationRequest(
  uid: string,
  cb: (row: DocumentData | null) => void,
  onError?: (e: RealtimeError) => void
) {
  if (!db || !isFirebaseConfigured || !uid) {
    onError?.({ message: !uid ? "missing-uid" : "firebase-not-configured" });
    return () => {};
  }
  return onSnapshot(
    doc(db, "verification_requests", uid),
    (snap) => cb(snap.exists() ? { id: snap.id, ...(snap.data() as DocumentData) } : null),
    (err) => {
      console.warn("[KASI] subscribeMyVerificationRequest failed:", err.message);
      onError?.({ message: err.message });
    }
  );
}

/** One request document (lead) — the compare-quotes header + context. */
export function subscribeLeadDoc(leadId: string, cb: (row: DocumentData | null) => void, onError?: (e: RealtimeError) => void) {
  if (!db || !isFirebaseConfigured || !leadId) {
    onError?.({ message: "firebase-not-configured" });
    return () => {};
  }
  return onSnapshot(
    doc(db, "leads", leadId),
    (snap) => cb(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    (err) => {
      console.warn("[KASI] subscribeLeadDoc failed:", err.message);
      onError?.({ message: err.message });
    }
  );
}

/* ── Messaging (master spec §18) ───────────────────────────────────────────
 * Threads are queried with array-contains on `participants`, which is exactly
 * what the rules check — so the list is both cheap and provably safe. Message
 * reads are scoped to a single conversation path, where the rule's get() on the
 * parent is constant, making the query satisfiable.
 * ───────────────────────────────────────────────────────────────────────── */

function subNested<T extends DocumentData>(
  parentCol: string,
  parentId: string,
  childCol: string,
  constraintsParams: Parameters<typeof query>[1][],
  cb: (rows: (T & { id: string })[]) => void,
  onError?: (e: RealtimeError) => void
) {
  if (!db || !isFirebaseConfigured || !parentId) {
    onError?.({ message: "firebase-not-configured" });
    return () => {};
  }
  const q = query(collection(db, parentCol, parentId, childCol), ...constraintsParams);
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as T) }))),
    (err) => {
      console.warn(`[KASI] realtime ${parentCol}/${parentId}/${childCol} failed:`, err.message);
      onError?.({ message: err.message });
    }
  );
}

/** Every thread the caller is part of, most recently active first. */
export function subscribeMyConversations(uid: string, cb: (rows: DocumentData[]) => void, onError?: (e: RealtimeError) => void) {
  return subCol("conversations", [where("participants", "array-contains", uid), limit(50)], (rows) =>
    cb([...rows].sort(byNewest as (a: DocumentData, b: DocumentData) => number)), onError
  );
}

/** A single thread document (participants, status, last message). */
export function subscribeConversation(cid: string, cb: (row: DocumentData | null) => void, onError?: (e: RealtimeError) => void) {
  if (!db || !isFirebaseConfigured || !cid) {
    onError?.({ message: "firebase-not-configured" });
    return () => {};
  }
  return onSnapshot(
    doc(db, "conversations", cid),
    (snap) => cb(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    (err) => {
      console.warn("[KASI] subscribeConversation failed:", err.message);
      onError?.({ message: err.message });
    }
  );
}

/** Messages inside one thread, oldest first (chat order). */
export function subscribeMessages(cid: string, cb: (rows: DocumentData[]) => void, onError?: (e: RealtimeError) => void) {
  return subNested("conversations", cid, "messages", [orderBy("createdAt", "asc"), limit(200)], (rows) =>
    cb([...rows].sort(byOldest as (a: DocumentData, b: DocumentData) => number)), onError
  );
}

/* ── Portfolio (master spec §9 / §10) ─────────────────────────────────────
 * Portfolio items are public by design (they sell the seller on the public
 * profile), so both queries are index-free single equalities — no composite
 * index to build, works on the free Spark plan.
 * ───────────────────────────────────────────────────────────────────────── */

/** All work items for one public listing, newest first. */
export function subscribePortfolio(businessId: string, cb: (rows: DocumentData[]) => void, onError?: (e: RealtimeError) => void) {
  if (!businessId) return () => {};
  return subCol("portfolio", [where("businessId", "==", businessId), limit(200)], (rows) =>
    cb([...rows].sort(createdDesc as (a: DocumentData, b: DocumentData) => number)), onError
  );
}

/** Recent public work samples used to represent service groups on the homepage. */
export function subscribeRecentPortfolio(cb: (rows: DocumentData[]) => void, onError?: (e: RealtimeError) => void) {
  return subCol("portfolio", [orderBy("createdAt", "desc"), limit(500)], (rows) =>
    cb([...rows].sort(createdDesc as (a: DocumentData, b: DocumentData) => number)), onError
  );
}

/** Every portfolio item one seller owns, across all their listings. */
export function subscribePortfolioByOwner(ownerUid: string, cb: (rows: DocumentData[]) => void, onError?: (e: RealtimeError) => void) {
  if (!ownerUid) return () => {};
  return subCol("portfolio", [where("ownerUid", "==", ownerUid), limit(200)], (rows) =>
    cb([...rows].sort(createdDesc as (a: DocumentData, b: DocumentData) => number)), onError
  );
}

/* ── Bookings (master spec §39) ────────────────────────────────────────────
 * Each query carries the caller's uid as an equality so the participant-only
 * read rule stays satisfiable for list operations.
 * ───────────────────────────────────────────────────────────────────────── */

/** Bookings a buyer has made, newest first. */
export function subscribeBookingsByBuyer(uid: string, cb: (rows: DocumentData[]) => void, onError?: (e: RealtimeError) => void) {
  if (!uid) return () => {};
  return subCol("bookings", [where("buyerUid", "==", uid), limit(50)], (rows) =>
    cb([...rows].sort(createdDesc as (a: DocumentData, b: DocumentData) => number)), onError
  );
}

/** Bookings that landed in a seller's diary, newest first. */
export function subscribeBookingsBySeller(uid: string, cb: (rows: DocumentData[]) => void, onError?: (e: RealtimeError) => void) {
  if (!uid) return () => {};
  return subCol("bookings", [where("sellerUid", "==", uid), limit(50)], (rows) =>
    cb([...rows].sort(createdDesc as (a: DocumentData, b: DocumentData) => number)), onError
  );
}

/** The caller's payment records — billing history on the pricing page (§23). */
export function subscribeMyPayments(uid: string, cb: (rows: DocumentData[]) => void, onError?: (e: RealtimeError) => void) {
  if (!uid) return () => {};
  return subCol("payments", [where("ownerUid", "==", uid), limit(20)], (rows) =>
    cb([...rows].sort(createdDesc as (a: DocumentData, b: DocumentData) => number)), onError
  );
}

// ── Admin-wide feeds (§37). All are admin-only in firestore.rules. ──────────

/**
 * Hard ceiling on each admin-wide feed. Before this cap they were the only
 * queries in the app with no upper bound at all, so the console billed one read
 * per user / subscription / payment / lead on every visit — and every later
 * write to any of those collections re-delivered the whole result set. Consumers
 * surface a notice when a feed actually hits this ceiling, so oversight data is
 * never silently truncated.
 *
 * Deliberately no `orderBy`: the creation field is not consistent across doc
 * generations (`created_at` from the seeder vs `createdAt` from the app), docs
 * missing the field are EXCLUDED from an ordered query, and a pending
 * serverTimestamp is likewise absent until the write is acknowledged. So these
 * feeds take an arbitrary-but-bounded slice and sort it client-side — which is
 * why the console says "capped", not "newest".
 */
export const ADMIN_FEED_LIMIT = 300;

/**
 * Shared page sizes of the public feeds the admin queues slice. Exported so the
 * console can report truncation with the SAME numbers the query uses — a
 * hard-coded duplicate would drift and make the notice lie.
 */
export const BUSINESS_FEED_LIMIT = 200;
export const MODERATION_FEED_LIMIT = 100;


/** All user docs — admin console user/seller management (capped). */
export function subscribeAllUsers(
  cb: (rows: DocumentData[]) => void,
  onError?: (e: RealtimeError) => void
) {
  return subCol("users", [limit(ADMIN_FEED_LIMIT)], (rows) => cb([...rows].sort(createdDesc as (a: DocumentData, b: DocumentData) => number)), onError);
}

/** All subscription docs — admin subscription/payments oversight. */
export function subscribeAllSubscriptions(
  cb: (rows: DocumentData[]) => void,
  onError?: (e: RealtimeError) => void
) {
  return subCol("subscriptions", [limit(ADMIN_FEED_LIMIT)], (rows) => cb([...rows].sort(createdDesc as (a: DocumentData, b: DocumentData) => number)), onError);
}

/** All payment records — billing audit (admin console). */
export function subscribeAllPayments(
  cb: (rows: DocumentData[]) => void,
  onError?: (e: RealtimeError) => void
) {
  return subCol("payments", [limit(ADMIN_FEED_LIMIT)], (rows) => cb([...rows].sort(createdDesc as (a: DocumentData, b: DocumentData) => number)), onError);
}

/** All leads — admin lead oversight (admin read added to rules). */
export function subscribeAllLeads(
  cb: (rows: DocumentData[]) => void,
  onError?: (e: RealtimeError) => void
) {
  return subCol("leads", [limit(ADMIN_FEED_LIMIT)], (rows) => cb([...rows].sort(createdDesc as (a: DocumentData, b: DocumentData) => number)), onError);
}