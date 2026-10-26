const MAX_SHARD_BYTES = 700_000;
const MAX_SHARD_ROWS = 200;

export function sellerPoolShardId(generation: string, index: number): string {
  return `snapshot_${generation}_${String(index).padStart(4, "0")}`;
}

export function splitSellerPoolShards(
  rows: Record<string, unknown>[],
): Record<string, unknown>[][] | null {
  const shards: Record<string, unknown>[][] = [];
  let current: Record<string, unknown>[] = [];

  for (const row of rows) {
    const candidate = [...current, row];
    if (
      candidate.length > MAX_SHARD_ROWS ||
      Buffer.byteLength(JSON.stringify({ businesses: candidate }), "utf8") > MAX_SHARD_BYTES
    ) {
      if (current.length === 0) return null;
      shards.push(current);
      current = [row];
      if (Buffer.byteLength(JSON.stringify({ businesses: current }), "utf8") > MAX_SHARD_BYTES) {
        return null;
      }
    } else {
      current = candidate;
    }
  }
  if (current.length) shards.push(current);
  return shards;
}

export function sellerPoolShardSizeBytes(rows: Record<string, unknown>[]): number {
  return Buffer.byteLength(JSON.stringify({ businesses: rows }), "utf8");
}
