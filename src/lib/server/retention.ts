/**
 * Retention helpers shared by the sweep — TRUSTED SERVER ONLY.
 *
 * WHY THE DATE IS EVALUATED IN CODE AND NEVER IN A FIRESTORE QUERY:
 * `createdAt` is a MIXED type across this dataset. The server routes write an ISO
 * string; older client-side writes used `serverTimestamp()`, so the collection
 * holds both Firestore Timestamps and plain strings. A Firestore range query
 * (`createdAt <= X`) orders and filters BY TYPE FIRST, so across that mix it will
 * silently return nothing — or everything — with no error. Every age check here
 * therefore runs through `toMillis`, which handles Timestamp / Date / ISO string /
 * epoch, and queries are made only on a single indexed field (`status`) or by
 * paging `__name__`.
 */

import { toMillis } from "@/lib/analytics";

const DAY = 86_400_000;

/** Lead statuses that mean "still live, nobody has won it". */
export const OPEN_STATUSES = ["new", "viewed", "broadcast"] as const;

export const nowIso = () => new Date().toISOString();

/** True when a lead document is older than `days`. Unknown timestamps → false. */
export function isOlderThan(createdAt: unknown, days: number, now: Date = new Date()): boolean {
  const ms = toMillis(createdAt);
  // A document with no usable timestamp cannot be judged. Guessing would risk
  // closing somebody's live lead, so we leave it alone and let a human decide.
  if (!ms) return false;
  return ms < now.getTime() - days * DAY;
}

/** Days until a lead passes the retention window (used in admin-facing copy). */
export function retentionDaysRemaining(createdAt: unknown, total: number, now: Date = new Date()): number {
  const ms = toMillis(createdAt);
  if (!ms) return total;
  return Math.max(0, Math.ceil((ms + total * DAY - now.getTime()) / DAY));
}