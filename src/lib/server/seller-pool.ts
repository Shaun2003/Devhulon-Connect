/**
 * Seller pool loader — TRUSTED SERVER ONLY.
 *
 * LIVES HERE, not in `lib/matching.ts`, because that module is also in the BROWSER
 * bundle (`FindProClient` imports `matchPros`, `ListBusinessSeller` imports
 * `signupGroups`). The loader needs the server-only REST reader and the
 * process-local cache, so importing it from a shared module would drag server
 * code into browsers. The pure ranking stays in `matching.ts` precisely so the
 * server render and the browser can rank identically and never disagree.
 *
 * This is the ONLY source of sellers. There is no bundled sample data, so a pro
 * who signs up through /list-business is immediately matchable and a buyer is
 * never shown a placeholder they might try to call.
 *
 * PAGINATED: `fetchPublicCollection` returns a single 300-document page. Using it
 * here made every seller past that page permanently UNMATCHABLE, with the buyer
 * told "no pros match that yet" — a silent, invisible correctness failure that
 * appears the moment the marketplace passes ~300 listings. `fetchAllPublicDocuments`
 * follows `pageToken` so matching sees everything.
 *
 * CACHED: called once per buyer request from `allocateBroadcastLeads`, so without
 * a cache every POST re-read the whole businesses AND reviews collections. See
 * `seller-pool-cache.ts` for the TTL / single-flight / stale-while-revalidate
 * behaviour and the documented limitation of a process-local cache on Vercel.
 */

import { applyReviewRatings, toBusiness, type Business } from "@/data/businesses";
import { canReadFirestoreRest, fetchAllPublicDocuments, fetchReviewRatings } from "@/lib/firestore-rest";
import { withSellerPoolCache } from "./seller-pool-cache";
import { withSharedPoolCache, buildSharedPoolSnapshot, sharedPoolStatusInfo } from "./shared-seller-pool";

/** No bundled sellers: an empty pool means "nothing is matchable right now". */
const NO_SELLERS: Business[] = [];

/**
 * Shared (cross-instance) layer.
 *
 * The process-local cache is fast and correct, but on Vercel every warm instance
 * keeps its own copy — so a cold instance pays a full collection read on its first
 * request. This layer stores the rendered pool in Firestore, which every instance
 * shares, so at most ONE rebuild happens per TTL window regardless of how many
 * instances are serving.
 *
 * Degrades safely by design: if the shared snapshot is missing, unreadable or
 * simply not built yet, this returns null and we fall through to the normal
 * paginated read. Nothing about the marketplace depends on the cache existing.
 */
async function loadSharedPool(): Promise<Business[] | null> {
  return withSharedPoolCache(() => buildSharedPoolSnapshot());
}

/**
 * The live seller catalogue, straight from Firestore.
 *
 * This is the ONLY source of sellers. There is no bundled sample data any more,
 * so a pro who signs up through /list-business is immediately matchable and a
 * buyer is never shown a placeholder they might try to call.
 *
 * PAGINATED: `fetchPublicCollection` returns a single 300-document page. Using it
 * here made every seller past that page permanently UNMATCHABLE, with the buyer
 * told "no pros match that yet" — a silent, invisible correctness failure that
 * appears the moment the marketplace passes ~300 listings.
 * `fetchAllPublicDocuments` follows `pageToken` so matching sees everything.
 *
 * CACHED twice over: a process-local TTL cache in front (sub-millisecond, no
 * network) and a shared Firestore snapshot behind it (so concurrent cold instances
 * collapse onto one rebuild). See `seller-pool-cache.ts` and `shared-seller-pool.ts`.
 */
export async function loadSellerPool(): Promise<Business[]> {
  if (!canReadFirestoreRest) return NO_SELLERS;

  // 1. Process-local, warmed from the shared snapshot when one exists.
  const local = await withSellerPoolCache(async () => {
    const shared = await loadSharedPool();
    if (shared && shared.length > 0) return shared;
    return buildFromSource();
  });
  if (local.length > 0) return local;

  // 2. Cold with no shared snapshot — read the source directly rather than
  //    caching an empty pool, which would then stick for the whole TTL.
  return buildFromSource();
}

/** Build the pool from Firestore, reading every page of businesses + ratings. */
async function buildFromSource(): Promise<Business[]> {
  try {
    const [live, ratings] = await Promise.all([
      fetchAllPublicDocuments("businesses"),
      fetchReviewRatings(),
    ]);

    const out: Business[] = [];
    for (const row of live) {
      const id = String(row.id ?? "");
      if (!id) continue;
      // Pending/rejected listings stay out of the marketplace.
      if (String(row.status ?? "live") !== "live") continue;
      out.push(toBusiness(id, row));
    }
    // Match ranking weights rating, so it needs the real aggregate — otherwise a
    // well-reviewed pro is ranked as if nobody had ever used them.
    return applyReviewRatings(out, ratings);
  } catch {
    // Realtime unavailable — return nothing rather than show something wrong.
    return NO_SELLERS;
  }
}

/** True when the shared snapshot layer is available (Admin SDK configured). */
export function sharedPoolStatus() {
  return sharedPoolStatusInfo();
}