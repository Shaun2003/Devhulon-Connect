"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { toBusiness, applyReviewRatings, type Business, type RatingAgg } from "@/data/businesses";
import { isOpenNow } from "@/lib/utils";
import { hasCap, normalizePlanId, planRank } from "@/lib/plans";
import { useRealtime, useReviewRatings, subscribeBusinessesByCategory, listenerHint, BUSINESS_FEED_LIMIT, type RealtimeError } from "@/lib/realtime";
import ComparisonTable from "@/components/ComparisonTable";
import BusinessCard from "@/components/BusinessCard";
import { BusinessProfileSkeleton } from "@/components/LoadingSkeletons";
import { KIcon } from "@/lib/icons";
import { isFirebaseConfigured } from "@/lib/firebase";

type SortKey = "recommended" | "rating" | "reviews" | "name";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "recommended", label: "Recommended" },
  { key: "rating", label: "Highest rated" },
  { key: "reviews", label: "Most reviewed" },
  { key: "name", label: "A–Z" },
];

/** Quality + relevance score (§49: plan boosts relevance, never replaces it). */
function score(b: Business): number {
  const planId = normalizePlanId(b.plan);
  const plan = hasCap(planId, "priorityPlacement") ? planRank(planId) * 6 : 0;
  const featured = b.featured === true ? 8 : 0;
  return (b.verified ? 20 : 0) + plan + featured + b.rating * 5 + Math.min(b.reviewCount, 100) * 0.1;
}

/**
 * The realtime listener failed, but the page still shows the server-rendered
 * list — so this is a warning, never a blocker. Surfacing `listenerHint` keeps
 * the "why is nothing updating" answer on the page instead of only in the
 * console.
 */
function ListenerError({ error }: { error: RealtimeError }) {
  return (
    <p className="text-xs font-bold text-[#a36508] bg-[#fff4d6] rounded-2xl px-4 py-3">
      Live updates are paused — {listenerHint(error)} Showing the listings loaded when this page opened.
    </p>
  );
}

/**
 * Client island for the /services/[slug] page — realtime listings, plus the
 * filtering & sorting toolbar over them.
 *
 * REALTIME, not a snapshot: `items` is the server-rendered list (so crawlers
 * and the first paint see real pros), and the Firestore `onSnapshot` listener
 * takes over from there. A seller who lists in this category, or edits their
 * own listing, now appears/updates without a reload. The server list is kept as
 * the fallback until the first snapshot arrives and if the listener is blocked
 * by rules, so the page is never blank.
 */
export default function ServiceSearch({
  items,
  categoryName,
  categorySlug,
  initialRatings,
  initialCursor,
  initialHasMore,
  initialLoadError,
}: {
  items: Business[];
  categoryName: string;
  categorySlug: string;
  /** Server-derived rating aggregate, so the first paint is already correct. */
  initialRatings?: Record<string, RatingAgg> | null;
  initialCursor: string | null;
  initialHasMore: boolean;
  initialLoadError: string | null;
}) {
  const [sort, setSort] = useState<SortKey>("recommended");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [openOnly, setOpenOnly] = useState(false);
  const [additionalItems, setAdditionalItems] = useState<Business[]>([]);
  const [cursor, setCursor] = useState(initialCursor);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  const { rows, live, error } = useRealtime<Record<string, unknown>>(
    (cb, onErr) =>
      isFirebaseConfigured
        ? subscribeBusinessesByCategory(categorySlug, cb, onErr)
        : (onErr?.({ message: "firebase-not-configured" }), () => {}),
    [],
    [categorySlug]
  );
  // Raw Firestore documents are not `Business` — normalise before they reach
  // components that do `b.services.slice(...)` / `b.phone.replace(...)`.
  const businesses = useMemo(() => {
    const byId = new Map<string, Business>();
    for (const business of [...items, ...additionalItems]) byId.set(business.id, business);
    for (const row of rows) {
      const business = toBusiness(String(row.id ?? ""), row);
      if (String(row.status ?? "live") === "live") byId.set(business.id, business);
      else byId.delete(business.id);
    }
    return [...byId.values()];
  }, [rows, items, additionalItems]);

  /**
   * True ratings, live.
   *
   * `businesses.rating` is a denormalised cache that is not reliably writable,
   * so it can sit at 0 while real 5★ reviews exist — which rendered "no reviews
   * yet" here even though the business profile showed stars. Deriving the
   * aggregate from the review documents fixes the cards, the comparison table
   * and the sort order, and a brand-new review updates all three at once.
   */
  const { ratings: liveRatings } = useReviewRatings();
  const ratings = useMemo(
    () => (Object.keys(liveRatings).length > 0 ? liveRatings : initialRatings ?? {}),
    [liveRatings, initialRatings]
  );
  const withRatings = useMemo(
    () => applyReviewRatings(businesses, ratings),
    [businesses, ratings]
  );

  const list = useMemo(() => {
    let out = withRatings;
    if (verifiedOnly) out = out.filter((b) => b.verified);
    if (openOnly) out = out.filter((b) => isOpenNow(b.hours) !== false);
    const sorted = [...out];
    if (sort === "rating") sorted.sort((a, b) => b.rating - a.rating);
    else if (sort === "reviews") sorted.sort((a, b) => b.reviewCount - a.reviewCount);
    else if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else sorted.sort((a, b) => score(b) - score(a));
    return sorted;
  }, [withRatings, sort, verifiedOnly, openOnly]);
  const visibleError = pageError ?? (!live ? initialLoadError : null);

  const toggleCls = (on: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-extrabold transition border-2 ${
      on ? "bg-[#7ac142] border-[#7ac142] text-[#0b1e33]" : "border-[#d6e1ec] bg-white text-[#10243e] hover:border-[#7ac142]"
    }`;

  async function loadMore() {
    if (!hasMore || !cursor || loadingMore) return;
    setLoadingMore(true);
    setPageError(null);
    try {
      const params = new URLSearchParams({ category: categorySlug, cursor });
      const response = await fetch(`/api/public/businesses?${params.toString()}`);
      const result = (await response.json()) as {
        ok?: boolean;
        error?: string;
        businesses?: Record<string, unknown>[];
        nextCursor?: string | null;
        hasMore?: boolean;
      };
      if (!response.ok || !result.ok || !Array.isArray(result.businesses)) {
        throw new Error(result.error ?? "Could not load more businesses.");
      }
      setAdditionalItems((current) => [
        ...current,
        ...result.businesses!.map((row) => toBusiness(String(row.id ?? ""), row)),
      ]);
      setCursor(result.nextCursor ?? null);
      setHasMore(result.hasMore === true && Boolean(result.nextCursor));
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Could not load more businesses.");
    } finally {
      setLoadingMore(false);
    }
  }

  if (businesses.length === 0 && !live && !visibleError) {
    return (
      <div role="status" aria-label={`Loading ${categoryName.toLowerCase()} listings`} aria-busy="true" className="space-y-4">
        <span className="sr-only">Loading {categoryName.toLowerCase()} listings</span>
        <div className="grid min-w-0 grid-cols-1 items-start gap-3 sm:grid-cols-2">
          {[0, 1, 2].map((item) => <BusinessProfileSkeleton key={item} />)}
        </div>
      </div>
    );
  }

  if (businesses.length === 0) {
    return (
      <div className="hippo-card p-8 sm:p-12 text-center anim-rise">
        <span className="icon-3d icon-3d-sm mx-auto" aria-hidden="true"><KIcon name="search" size={24} /></span>
        <h2 className="text-xl font-black text-[#10243e] mt-4">
          {visibleError ? "Businesses couldn't be loaded" : `No ${categoryName.toLowerCase()} listed here yet`}
        </h2>
        <p
          role={visibleError ? "alert" : undefined}
          className={`text-sm mt-2 max-w-md mx-auto ${visibleError ? "text-red-700" : "text-[#1d3a5f]/70"}`}
        >
          {visibleError
            ? visibleError
            : "You can try a nearby service area, request a quote, or invite a local business to list."}
        </p>
        <div className="flex flex-wrap justify-center gap-2 mt-5">
          <Link href="/request-quote" className="btn-hippo text-sm">Request a free quote </Link>
          <Link href="/list-business" className="btn-navy text-sm">List your business</Link>
        </div>
        {error && <ListenerError error={error} />}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {visibleError && <p role="alert" className="text-xs font-bold text-red-700 bg-red-50 rounded-2xl px-4 py-3">{visibleError}</p>}
      {/* Toolbar */}
      <div className="hippo-card p-4 flex flex-wrap items-center gap-3">
        <p className="text-sm font-extrabold text-[#10243e] mr-auto" aria-live="polite">
          {list.length} {list.length === 1 ? "pro" : "pros"} found
          {list.length !== businesses.length && <span className="text-[#1d3a5f]/50 font-bold"> of {businesses.length}</span>}
        </p>
        <span
          className="chip-live"
          title={hasMore
            ? `The first ${BUSINESS_FEED_LIMIT} category listings update live; additional pages are loaded when requested.`
            : "Listings update automatically as sellers list and edit."}
        >
          {live ? "Live updates" : "Connecting…"}
        </span>
        <button onClick={() => setVerifiedOnly((v) => !v)} aria-pressed={verifiedOnly} className={toggleCls(verifiedOnly)}>
          <KIcon name="badgeCheck" size={14} /> Verified only
        </button>
        <button onClick={() => setOpenOnly((v) => !v)} aria-pressed={openOnly} className={toggleCls(openOnly)}>
          <KIcon name="clock" size={14} /> Open now
        </button>
        <div>
          <label htmlFor="svc-sort" className="sr-only">Sort professionals</label>
          <select
            id="svc-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-full border-2 border-[#d6e1ec] bg-white px-4 py-2 text-xs font-extrabold text-[#10243e] cursor-pointer hover:border-[#7ac142] focus:outline-none focus:ring-2 focus:ring-[#7ac142]"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <ListenerError error={error} />}

      {/* Side-by-side comparison (the USP) */}
      <section aria-labelledby="svc-compare-h">
        <h2 id="svc-compare-h" className="text-xl font-black text-[#10243e] tracking-tight mb-3">
          Compare {categoryName.toLowerCase()} side-by-side
        </h2>
        <ComparisonTable businesses={list} categoryName={categoryName} suburbName="your area" />
        {openOnly && (
          <p className="text-xs text-[#1d3a5f]/60 mt-2">
            Filtering by parsed opening hours (SAST) — listings with unclear hours stay visible.
          </p>
        )}
        {list.length === 0 && (
          <p className="text-sm text-[#1d3a5f]/60 mt-3">
            No pros match these filters —{" "}
            <button onClick={() => { setVerifiedOnly(false); setOpenOnly(false); }} className="underline font-bold text-[#558c2b]">
              reset filters
            </button>{" "}
            to see all {businesses.length}.
          </p>
        )}
      </section>

      {/* Full profile cards */}
      <section aria-labelledby="svc-profiles-h">
        <h2 id="svc-profiles-h" className="text-xl font-black text-[#10243e] tracking-tight mb-3">
          Full profiles <span className="text-[#1d3a5f]/50 font-bold">({list.length} shown)</span>
        </h2>
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 items-start">
          {list.map((b) => (
            <BusinessCard key={b.id} b={b} categoryName={categoryName} suburbName={b.suburbSlug.replace(/-/g, " ")} />
          ))}
          {loadingMore && [0, 1].map((item) => <BusinessProfileSkeleton key={`loading-${item}`} />)}
        </div>
        {hasMore && (
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="btn-navy text-sm disabled:opacity-60"
            >
              {loadingMore ? "Loading businesses…" : "Load more businesses"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
