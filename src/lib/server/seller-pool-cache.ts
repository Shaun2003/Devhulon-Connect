/**
 * Seller-pool cache — TRUSTED SERVER ONLY.
 *
 * WHY THIS EXISTS: `allocateBroadcastLeads` called `loadSellerPool()` on every
 * single POST /api/leads, which meant every buyer request re-read the ENTIRE
 * businesses collection plus the entire reviews collection over the REST API.
 * At a few hundred listings that is already slow; at a few thousand it is the
 * bottleneck, and Firestore bills every document read.
 *
 * THREE properties, each solving a DIFFERENT failure mode. A plain
 * `if (cached) return cached` would only fix one of them:
 *
 *   1. TTL          — bounds staleness. A newly-listed pro becomes matchable.
 *   2. SINGLE-FLIGHT — the thundering herd. Without it, ten buyers posting at
 *      once all miss an empty cache and all fire the same expensive read; the
 *      cache makes nine of them wait on one in-flight promise instead. This is the
 *      part that actually survives a traffic spike.
 *   3. STALE-WHILE-REVALIDATE — a cold or expired cache must never BLOCK a buyer.
 *      If we have anything at all, serve it immediately and refresh in the
 *      background. Only a genuinely empty cache waits.
 *
 * HONEST LIMITATION: this is a PROCESS-LOCAL cache, so on Vercel each warm
 * serverless instance holds its own copy. That is a real improvement (most traffic
 * hits a warm instance, and single-flight collapses the herd per instance) but it
 * is NOT a shared cache. If the collection grows past a few thousand documents,
 * replace this with a materialised `seller_index` document in Firestore — see the
 * note at the bottom of this file.
 */

import type { Business } from "@/data/businesses";

/** How long a fresh pool is served before a background refresh. */
const FRESH_MS = 60_000;
/** How long a stale pool may still be served while refreshing. */
const MAX_STALE_MS = 10 * 60_000;

/**
 * Per-call overrides for the TTL windows.
 *
 * Exists so the stale-while-revalidate path is TESTABLE. The behaviour cannot be
 * exercised any other way: FRESH_MS is 60 seconds, so a verification script would
 * otherwise have to sleep a minute to reach the stale branch, or — far worse —
 * "pass" by never entering it at all. Defaulted in production, overridden only by
 * the checks.
 */
export type CacheWindows = { freshMs?: number; maxStaleMs?: number };

type Entry<T> = { value: T; loadedAt: number };

let cached: Entry<Business[]> | null = null;
/** The in-flight refresh, so concurrent callers share one fetch. */
let inFlight: Promise<Business[]> | null = null;

/** Test seam: drop the cache so the next call refetches. */
export function __resetSellerPoolCache() {
  cached = null;
  inFlight = null;
}

/** Cached snapshot of the pool, for admin/debug output. Never mutates state. */
export function sellerPoolCacheInfo() {
  return {
    loaded: cached !== null,
    ageMs: cached ? Date.now() - cached.loadedAt : null,
    size: cached?.value.length ?? 0,
    refreshing: inFlight !== null,
  };
}

/**
 * Get the seller pool, refreshing at most once per TTL and collapsing
 * concurrent refreshes into a single fetch.
 *
 * `load` must be a cheap-to-call loader returning the full pool.
 */
export async function withSellerPoolCache(
  load: () => Promise<Business[]>,
  windows: CacheWindows = {}
): Promise<Business[]> {
  const now = Date.now();
  const freshMs = windows.freshMs ?? FRESH_MS;
  const maxStaleMs = windows.maxStaleMs ?? MAX_STALE_MS;

  // 1. Fresh — serve directly.
  if (cached && now - cached.loadedAt < freshMs) return cached.value;

  // 2. Stale but usable — serve immediately, refresh behind the caller. A buyer
  //    waiting on a slow refresh is worse than a buyer seeing a pro who listed
  //    two minutes ago.
  if (cached && now - cached.loadedAt < maxStaleMs) {
    void refresh(load);
    return cached.value;
  }

  // 3. Cold or long-expired — wait, but only ONE fetch happens.
  return refresh(load);
}

/** Run `load` at most once concurrently, and cache whatever it produced. */
function refresh(load: () => Promise<Business[]>): Promise<Business[]> {
  if (inFlight) return inFlight;

  const run = (async () => {
    try {
      const value = await load();
      cached = { value, loadedAt: Date.now() };
      return value;
    } finally {
      // Clear on BOTH paths. A rejected load must not leave a poisoned promise
      // that every later request awaits forever.
      inFlight = null;
    }
  })();

  inFlight = run;
  return run;
}