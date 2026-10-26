import assert from "node:assert/strict";
import {
  sellerPoolShardId,
  sellerPoolShardSizeBytes,
  splitSellerPoolShards,
} from "../src/lib/server/seller-pool-shards.ts";

const rows = Array.from({ length: 501 }, (_, index) => ({
  id: `business-${index}`,
  name: `Local service ${index}`,
  description: "A".repeat(900),
}));
const shards = splitSellerPoolShards(rows);

assert.ok(shards);
assert.equal(shards.flat().length, rows.length);
assert.ok(shards.every((shard) => shard.length <= 200));
assert.ok(shards.every((shard) => sellerPoolShardSizeBytes(shard) < 700_000));
assert.equal(sellerPoolShardId("generation", 3), "snapshot_generation_0003");
assert.equal(splitSellerPoolShards([{ id: "too-large", data: "x".repeat(700_000) }]), null);

console.log("All seller-pool shard checks passed.");
