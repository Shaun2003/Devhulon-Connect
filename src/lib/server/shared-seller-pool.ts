/**
 * Shared seller-pool snapshot — TRUSTED SERVER ONLY.
 *
 * PROBLEM THIS SOLVES: `seller-pool-cache.ts` is process-local. On Vercel each
 * warm function instance holds its own copy, so a marketplace serving any real
 * traffic has N instances each paying a full paginated read of `businesses` and
 * `business_reviews` the first time they're hit. The local cache is fast and
 * correct, but it does not reduce COLD-START work, which is what actually scales
 * badly.
 *
 * THE FIX: store the rendered pool in Firestore, where every instance sees the
 * same document. Concurrent cold instances then collapse onto ONE rebuild per TTL
 * window instead of one each.
 *
 * Only matching fields are stored (see `PROJECTION`), and the shared snapshot is
 * split across bounded-size documents so it remains usable beyond the Firestore
 * 1 MiB per-document limit.
 */

import type { Business } from "@/data/businesses";
import type { Firestore } from "firebase-admin/firestore";
import { toBusiness, applyReviewRatings } from "@/data/businesses";
import { fetchAllPublicDocuments, fetchReviewRatings } from "@/lib/firestore-rest";
import { adminDb } from "./admin";
import { sellerPoolShardId, splitSellerPoolShards } from "./seller-pool-shards";

/** Single manifest id — it points at one immutable generation of shards. */
const SNAPSHOT_ID = "current";

/**
 * How often a rebuild is allowed. Shorter than the local cache's 60s freshness
 * window on purpose: this is the layer BEHIND the local cache, and it exists to
 * absorb cold starts, so it wants to be current without being chatty.
 */
const REBUILD_TTL_MS = 10 * 60_000;

/**
 * The fields matching actually reads.
 *
 * Storing whole business documents would blow the 1 MiB limit at a few hundred
 * listings and waste bytes on fields no ranking path touches (description text,
 * photo URLs, verification records). This projection is what `matchPros` scores
 * on, plus the contact fields the seller needs to answer a lead.
 */
const PROJECTION = [
  "name", "categorySlug", "suburbSlug", "citySlug", "phone", "whatsapp",
  "address", "hours", "rating", "reviewCount", "services", "description",
  "priceNote", "verified", "plan", "coverImageUrl", "ownerUid", "status",
] as const;

/** Freshness metadata the shared layer needs. */
type Snapshot = {
  builtAt: string;
  count: number;
  generation?: string;
  shardCount?: number;
  businesses?: unknown[];
};

function isFresh(builtAt: string | undefined, now: number): boolean {
  if (!builtAt) return false;
  const t = Date.parse(builtAt);
  return Number.isFinite(t) && now - t < REBUILD_TTL_MS;
}

async function readSnapshot(): Promise<Snapshot | null> {
  const db = adminDb();
  if (!db) return null;
  try {
    const snap = await db.collection("seller_pool").doc(SNAPSHOT_ID).get();
    if (!snap.exists) return null;
    return snap.data() as Snapshot;
  } catch {
    return null;
  }
}

/**
 * Return the shared pool, rebuilding only when the snapshot is missing or stale.
 *
 * Returns null when the shared layer is unavailable so the caller can fall back to
 * reading the source directly — the marketplace must never depend on this cache
 * existing.
 */
export async function withSharedPoolCache(
  build: () => Promise<Business[]>
): Promise<Business[] | null> {
  const db = adminDb();
  if (!db) return null;

  const existing = await readSnapshot();
  if (isFresh(existing?.builtAt, Date.now())) {
    try {
      const rows = existing!.generation && existing!.shardCount
        ? await readShards(db, existing!.generation, existing!.shardCount)
        : existing!.businesses ?? [];
      if (rows.length !== existing!.count) throw new Error("Seller-pool snapshot shard count mismatch.");
      return rows.map((row) =>
        toBusiness(String((row as { id?: string }).id ?? ""), row as Record<string, unknown>)
      );
    } catch {
      // A malformed snapshot must not break matching — fall through to a rebuild.
    }
  }

  try {
    const fresh = await build();
    if (fresh.length === 0) return null;

    const rows = fresh.map((b) => ({ id: b.id, ...pick(b) }));
    const generation = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const shards = splitSellerPoolShards(rows);
    if (!shards) {
      console.error("[KASI] seller_pool snapshot contains a row larger than the safe shard size.");
      return null;
    }
    const collection = db.collection("seller_pool");
    const batch = db.batch();
    shards.forEach((businesses, index) => {
      batch.set(collection.doc(sellerPoolShardId(generation, index)), {
        generation,
        index,
        businesses,
      });
    });
    await batch.commit();

    await collection.doc(SNAPSHOT_ID).set({
      builtAt: new Date().toISOString(),
      count: rows.length,
      generation,
      shardCount: shards.length,
    } satisfies Snapshot);
    if (existing?.generation) await removeGeneration(db, existing.generation);
    return fresh;
  } catch (e) {
    console.warn("[KASI] seller_pool rebuild failed:", e instanceof Error ? e.message : e);
    return null;
  }

  async function readShards(
    db: Firestore,
    generation: string,
    shardCount: number,
  ): Promise<unknown[]> {
    const refs = Array.from({ length: shardCount }, (_, index) =>
      db.collection("seller_pool").doc(sellerPoolShardId(generation, index))
    );
    const snapshots = [];
    for (let offset = 0; offset < refs.length; offset += 100) {
      snapshots.push(...await db.getAll(...refs.slice(offset, offset + 100)));
    }
    return snapshots.flatMap((snapshot) => {
      const data = snapshot.data() as { businesses?: unknown[] } | undefined;
      return Array.isArray(data?.businesses) ? data.businesses : [];
    });
  }

  async function removeGeneration(db: Firestore, generation: string): Promise<void> {
    try {
      const oldShards = await db.collection("seller_pool").where("generation", "==", generation).limit(400).get();
      if (oldShards.empty) return;
      const batch = db.batch();
      for (const shard of oldShards.docs) batch.delete(shard.ref);
      await batch.commit();
    } catch (error) {
      console.warn("[KASI] seller_pool old shard cleanup failed:", error instanceof Error ? error.message : error);
    }
  }
}

/** Keep only the fields matching reads, plus the id. */
function pick(b: Business): Record<string, unknown> {
  const src = b as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = { id: b.id };
  for (const k of PROJECTION) if (src[k] !== undefined) out[k] = src[k];
  return out;
}

/** Build the pool from source and (attempt to) publish it as the shared snapshot. */
export async function buildSharedPoolSnapshot(): Promise<Business[]> {
  const [live, ratings] = await Promise.all([
    fetchAllPublicDocuments("businesses"),
    fetchReviewRatings(),
  ]);
  const out: Business[] = [];
  for (const row of live) {
    const id = String(row.id ?? "");
    if (!id) continue;
    if (String(row.status ?? "live") !== "live") continue;
    out.push(toBusiness(id, row));
  }
  return applyReviewRatings(out, ratings);
}

/** Diagnostics for the admin view / debugging. */
export function sharedPoolStatusInfo(): { configured: boolean } {
  return { configured: Boolean(adminDb()) };
}