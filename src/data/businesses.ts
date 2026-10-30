/**
 * The shared shape of a business listing.
 *
 * There is deliberately NO bundled sample data here any more. Every listing now
 * comes from Firestore in real time, so a page can never show a placeholder a
 * buyer might actually try to call. The type lives here because both the
 * server readers (firestore-rest) and the realtime subscriptions produce it.
 */

import { readVerification, type VerificationRecord } from "@/lib/verification";
import { normalizePlanId } from "@/lib/plans";
export type Business = {
  id: string;
  name: string;
  categorySlug: string;
  suburbSlug: string;
  citySlug: string;
  hours: string;
  rating: number;
  reviewCount: number;
  services: string[];
  description: string;
  priceNote: string;
  verified?: boolean;
  /**
   * Provenance behind the badge — who checked, when, and by what method. Null on
   * listings verified before records existed, so the UI must degrade gracefully
   * rather than assume a record is present.
   */
  verification?: VerificationRecord | null;
  plan?: "starter" | "premium";
  featured?: boolean;
  photos?: string[];
  /** Cover image used for the profile hero and social cards. */
  coverImageUrl?: string;
  /**
   * The signed-in seller who owns this listing.
   *
   * First-class rather than an inline cast because lead DELIVERY needs it: the
   * server must know whose allowance to spend. Absent on unclaimed listings,
   * which is exactly why the allocator reports `no-owner` instead of silently
   * dropping them.
   */
  ownerUid?: string;
};

/** A raw `business_reviews` document, in either reader's decoded shape. */
export type ReviewRow = Record<string, unknown>;

/** The two numbers every listing surface displays. */
export type RatingAgg = { rating: number; reviewCount: number };

/** Coerce a Firestore number (integer/double/anything) to a finite number. */
function toNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Review documents → `{ [businessId]: { rating, reviewCount } }`.
 *
 * THIS is the source of truth for every rating shown on the site.
 *
 * `businesses.rating` / `businesses.reviewCount` are a denormalised cache meant
 * to be maintained by `recomputeBusinessRating`, but that write is gated on a
 * Firestore rule and has silently failed in practice — which is how a business
 * with two real 5★ reviews sat at `rating: 0` and rendered "no reviews yet" on
 * every page except its own profile. Deriving from the reviews themselves
 * makes the display correct regardless of whether the cache ever healed.
 *
 * Pure and dependency-free so the server REST reader and the browser
 * `onSnapshot` listener cannot disagree about what a rating is.
 *
 * `status` is treated as "live" when absent, matching every other reader here:
 * a Firestore equality never matches a missing field, so a strict check would
 * silently drop real reviews.
 */
export function aggregateReviewRatings(rows: ReviewRow[]): Record<string, RatingAgg> {
  const sums: Record<string, number> = {};
  const counts: Record<string, number> = {};

  for (const r of rows) {
    const id = String(r.businessId ?? "");
    if (!id) continue;
    if (String(r.status ?? "live") !== "live") continue;
    sums[id] = (sums[id] ?? 0) + toNumber(r.rating);
    counts[id] = (counts[id] ?? 0) + 1;
  }

  const out: Record<string, RatingAgg> = {};
  for (const id of Object.keys(counts)) {
    out[id] = {
      rating: Math.round((sums[id] / counts[id]) * 10) / 10,
      reviewCount: counts[id],
    };
  }
  return out;
}

/**
 * Overlay derived ratings onto listings.
 *
 * Only businesses that actually appear in the aggregate are touched. A missing
 * entry means either "no reviews" or "its reviews fell outside the page we
 * read" — and keeping the stored value is the honest choice in both cases,
 * where overwriting to 0 would invent a false "no reviews yet".
 *
 * Returns the input array untouched when there is nothing to apply, so callers
 * can pass a null aggregate straight through on a failed read.
 */
export function applyReviewRatings<T extends { id: string; rating: number; reviewCount: number }>(
  businesses: T[],
  agg: Record<string, RatingAgg> | null | undefined
): T[] {
  if (!agg) return businesses;
  let changed = false;
  const out = businesses.map((b) => {
    const a = agg[b.id];
    if (!a) return b;
    if (a.rating === b.rating && a.reviewCount === b.reviewCount) return b;
    changed = true;
    return { ...b, rating: a.rating, reviewCount: a.reviewCount };
  });
  return changed ? out : businesses;
}


/**
 * Firestore listing row → `Business`.
 *
 * Shared by EVERY reader of the `businesses` collection — the server REST
 * reader on the service pages and the realtime `onSnapshot` subscriptions —
 * so one listing can never be shaped two different ways depending on which
 * code path happened to produce it. The realtime feeds in particular hand raw
 * documents straight to components that read `b.services.slice(...)`, so every
 * public field has to be coerced here.
 */
export function toBusiness(id: string, r: Record<string, unknown>): Business {
  const plan = normalizePlanId(r.plan);
  return {
    id,
    name: String(r.name ?? "Local pro"),
    categorySlug: String(r.categorySlug ?? ""),
    suburbSlug: String(r.suburbSlug ?? ""),
    citySlug: String(r.citySlug ?? ""),
    hours: String(r.hours ?? ""),
    rating: Number(r.rating ?? 0) || 0,
    reviewCount: Number(r.reviewCount ?? 0) || 0,
    services: Array.isArray(r.services) ? r.services.map(String) : [],
    description: String(r.description ?? ""),
    priceNote: String(r.priceNote ?? ""),
    verified: r.verified === true,
    /**
     * Provenance behind the badge — who checked, when, and how. Null on listings
     * verified before this existed (or by the old claim path), which is exactly
     * why the UI must degrade gracefully rather than assume a record exists.
     */
    verification: readVerification(r.verification),
    plan,
    photos: Array.isArray(r.photos) ? r.photos.map(String) : undefined,
    coverImageUrl: typeof r.coverImageUrl === "string" && r.coverImageUrl ? r.coverImageUrl : undefined,
    ownerUid: typeof r.ownerUid === "string" && r.ownerUid ? r.ownerUid : undefined,
  };
}
