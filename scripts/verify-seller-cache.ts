/**
 * Verifies the seller-pool cache's three load-bearing behaviours (TRUSTED SERVER ONLY).
 *
 * Run: node --experimental-strip-types scripts/verify-seller-cache.ts
 *
 * TTL, single-flight and stale-while-revalidate each fix a DIFFERENT failure, and
 * a cache that gets only one of them still falls over under load:
 *   • TTL alone            → a stale pro stays unmatched, but is bounded.
 *   • TTL + no single-flight → a traffic spike makes every concurrent caller miss
 *                            and fire the same expensive read. This is the one that
 *                            matters at scale, so it is asserted directly.
 *   • no stale-while-revalidate → every request on an expired cache blocks on the
 *                            refresh, so one slow read stalls all buyers.
 *
 * The module holds state at module scope, so this drives it through the real
 * exported function rather than a copy.
 */

import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";

register(pathToFileURL(path.resolve(import.meta.dirname, "./alias-hook.mjs")));

const { withSellerPoolCache, __resetSellerPoolCache, sellerPoolCacheInfo } = await import(
  "../src/lib/server/seller-pool-cache.ts"
);

let failures = 0;
const check = (name: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`}`);
};

/** A loader that counts calls and resolves after a controllable delay. */
function makeLoader(delayMs = 0) {
  const state = { calls: 0 };
  const load = async () => {
    state.calls++;
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    return [{ id: `biz-${state.calls}` }] as never[];
  };
  // Read `loader.calls`, never destructure it: destructuring a getter captures the
  // value at that instant (0), so the counter would never appear to move.
  return { load, state };
}

/* ── 1. TTL: a warm cache must not refetch ────────────────────────────────── */
{
  __resetSellerPoolCache();
  const loader = makeLoader();
  await withSellerPoolCache(loader.load);
  check("first call populates the cache (1 load)", loader.state.calls, 1);
  await withSellerPoolCache(loader.load);
  await withSellerPoolCache(loader.load);
  check("two more warm calls do NOT reload", loader.state.calls, 1);
  check("cache reports loaded", sellerPoolCacheInfo().loaded, true);
  check("cache reports the pool size", sellerPoolCacheInfo().size, 1);
}

/* ── 2. Single-flight: the thundering herd ────────────────────────────────── */
{
  __resetSellerPoolCache();
  // A deliberately SLOW loader: without single-flight, every one of these would
  // miss the (empty) cache and start its own read.
  const loader = makeLoader(40);
  const results = await Promise.all([
    withSellerPoolCache(loader.load),
    withSellerPoolCache(loader.load),
    withSellerPoolCache(loader.load),
    withSellerPoolCache(loader.load),
    withSellerPoolCache(loader.load),
  ]);
  check("5 concurrent cold callers trigger only ONE load", loader.state.calls, 1);
  check("all concurrent callers get the same pool", results.every((r) => r === results[0]), true);
}

/* ── 3. Stale-while-revalidate: a buyer is never blocked ──────────────────── */
{
  __resetSellerPoolCache();
  // TTL windows shortened so the stale branch is reachable. Production defaults
  // are 60s / 10min; sleeping that long would let this "pass" by never entering
  // the code path it is meant to cover.
  const W = { freshMs: 20, maxStaleMs: 10_000 };
  const first = makeLoader(1);
  await withSellerPoolCache(first.load, W);

  const loader = makeLoader(200);
  await new Promise((r) => setTimeout(r, 40)); // let it cross the fresh window

  const t0 = Date.now();
  const served = await withSellerPoolCache(loader.load, W);
  const elapsed = Date.now() - t0;

  check("stale call returns immediately, not after the slow reload", elapsed < 100, true);
  check("stale call still returns the previous pool", served.length, 1);
  check("stale call scheduled exactly one background refresh", loader.state.calls, 1);
  check("refresh is in flight while serving stale", sellerPoolCacheInfo().refreshing, true);

  // Let the background refresh land, then confirm the new pool takes over.
  await new Promise((r) => setTimeout(r, 260));
  check("background refresh completes and clears the in-flight flag", sellerPoolCacheInfo().refreshing, false);
  check("background refresh updated the pool", sellerPoolCacheInfo().size, 1);
}

/* ── 4. A failed load must not poison the cache ───────────────────────────── */
{
  __resetSellerPoolCache();
  let attempt = 0;
  const flaky = async () => {
    attempt++;
    if (attempt === 1) throw new Error("network down");
    return [{ id: "biz-ok" }] as never[];
  };

  // First call rejects; the in-flight promise must be cleared, not left cached.
  let threw = false;
  try {
    await withSellerPoolCache(flaky);
  } catch {
    threw = true;
  }
  check("a failed load propagates its error to the caller", threw, true);
  check("a failed load does NOT mark the cache as loaded", sellerPoolCacheInfo().loaded, false);
  check("a failed load clears the in-flight flag (no poisoned promise)", sellerPoolCacheInfo().refreshing, false);

  // The next call must retry rather than await the dead promise forever.
  const recovered = await withSellerPoolCache(flaky);
  check("a later call retries and succeeds", recovered.length, 1);
  check("recovery took exactly two attempts", attempt, 2);
}

console.log(failures === 0 ? "\nAll seller-pool cache checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);