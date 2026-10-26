/**
 * Rate limiting — TRUSTED SERVER ONLY.
 *
 * Why this module exists: the plan allowance (`consumeLeadOpportunity`) limits
 * how many leads a SELLER receives, but nothing limited how many requests a
 * BUYER could make. Without a limit, one signed-in user could call
 * POST /api/leads in a loop; each call consumes one lead credit from up to
 * `MAX_FANOUT` *different* sellers. That drains the entire seller base's
 * monthly allowance in minutes, which makes "5 leads a month" untrue for
 * everyone else. Two limits protect the marketplace:
 *
 *   • per-account  — stops one buyer draining many sellers
 *   • per-IP       — stops the same drain from many throwaway accounts
 *
 * Counters live in Firestore and are incremented inside a transaction, so the
 * limit holds across concurrent requests AND across serverless instances (a
 * Vercel function has no shared memory, so an in-process Map would be useless).
 *
 * FAIL-OPEN BY DESIGN: if the counter write fails we allow the request and log.
 * A Firestore hiccup must never take the marketplace down; the plan allowance is
 * still the hard backstop, since it runs separately and atomically.
 */

import { adminDb } from "./admin";

export type RateLimitVerdict =
  | { ok: true; remaining: number }
  | { ok: false; remaining: 0; retryAfterSeconds: number };

/**
 * Product limits, declared here so they are tunable in one place.
 *
 * The broadcast cap is deliberately the tightest: one broadcast spends a credit
 * on EVERY seller it matches, so it is the most expensive call by a factor of
 * `MAX_FANOUT`. Direct requests hit exactly one seller, so they are cheaper and
 * get a looser cap.
 */
export const RATE_LIMITS = {
  /** Buyer broadcasts — the expensive one (spends a credit per matched seller). */
  leadBroadcast: { limit: 10, windowMs: 86_400_000 }, // 10 / day per account
  /** Buyer requests aimed at one named business. */
  leadDirect: { limit: 20, windowMs: 86_400_000 }, // 20 / day per account
  /** Buyer open (unaddressed) requests. */
  leadOpen: { limit: 10, windowMs: 86_400_000 }, // 10 / day per account
  /** Seller claiming open requests. */
  leadClaim: { limit: 30, windowMs: 3_600_000 }, // 30 / hour per account
  /** Notification emails, per sending account — stops using us as a mail cannon. */
  emailNotify: { limit: 60, windowMs: 3_600_000 }, // 60 / hour per sender
  /** Indexed seller candidate lookups, per IP. */
  sellerSearch: { limit: 120, windowMs: 3_600_000 }, // 120 / hour per IP
  /** Chat-message emails, per sender→recipient pair — one nudge per 15 minutes. */
  emailMessage: { limit: 1, windowMs: 900_000 },
  /** Every lead-creating call, per IP — catches the throwaway-account sweep. */
  leadByIp: { limit: 60, windowMs: 3_600_000 }, // 60 / hour per IP
  /**
   * Client error reports, per IP. Looser than the lead limits on purpose — a
   * broken deploy can legitimately produce hundreds of reports in a minute and the
   * point is to CAPTURE them, not to drop them. Still bounded so the endpoint
   * cannot be used as a free write amplifier.
   */
  errorReport: { limit: 60, windowMs: 3_600_000 }, // 60 / hour per IP
  /** Aggregate page and funnel events; raw event data is never stored per caller. */
  analyticsEvent: { limit: 60, windowMs: 3_600_000 }, // 60 / hour per IP
} as const;

export type RateLimitName = keyof typeof RATE_LIMITS;

/**
 * Best-effort client IP.
 *
 * On Vercel (and any proxy) `x-forwarded-for` is a comma-separated chain, the
 * first entry being the original client. Behind a proxy without that header we
 * fall back to a constant, which still rate-limits — just more conservatively,
 * because those callers share one bucket.
 */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  const first = fwd.split(",")[0]?.trim();
  if (first) return first;
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Consume one unit from a fixed-window counter, atomically.
 *
 * Fixed windows rather than sliding: one document read + one write per call, no
 * query, and a burst that straddles a boundary is bounded by 2× the limit rather
 * than unbounded. That is an acceptable trade for a marketplace lead cap.
 */
export async function consumeRateLimit(
  name: RateLimitName,
  id: string
): Promise<RateLimitVerdict> {
  const db = adminDb();
  const { limit, windowMs } = RATE_LIMITS[name];
  if (!db) return { ok: true, remaining: limit }; // unconfigured server: not our call to block

  const bucket = Math.floor(Date.now() / windowMs);
  const retryAfterSeconds = Math.max(1, Math.ceil(((bucket + 1) * windowMs - Date.now()) / 1000));

  try {
    return await db.runTransaction(async (tx) => {
      const ref = db.collection("rate_limits").doc(`${name}_${id}_${bucket}`);
      const snap = await tx.get(ref);
      const count = snap.exists ? Number((snap.data() as { count?: number })?.count ?? 0) : 0;

      if (count >= limit) return { ok: false as const, remaining: 0, retryAfterSeconds };

      tx.set(
        ref,
        { count: count + 1, limit, scope: name, subject: id, bucket, updatedAt: new Date().toISOString() },
        { merge: true }
      );
      return { ok: true as const, remaining: limit - count - 1 };
    });
  } catch (err) {
    // Fail open — a counter outage must not block real buyers. The seller's plan
    // allowance still applies independently.
    console.warn(`[KASI] rate limit "${name}" failed open:`, err instanceof Error ? err.message : err);
    return { ok: true, remaining: 0 };
  }
}

/**
 * Enforce the per-account AND per-IP limits for a lead-creating request.
 * Returns a ready-to-return 429 Response, or null when the caller may proceed.
 */
export async function guardLeadRequest(
  req: Request,
  name: RateLimitName,
  uid: string | null
): Promise<Response | null> {
  const checks: [RateLimitName, string][] = [[name, uid ?? `anon_${clientIp(req)}`], ["leadByIp", clientIp(req)]];

  for (const [scope, id] of checks) {
    const verdict = await consumeRateLimit(scope, id);
    if (!verdict.ok) {
      const mins = Math.ceil(verdict.retryAfterSeconds / 60);
      return Response.json(
        {
          ok: false,
          error: `You've made a lot of requests recently. Please try again in ${mins < 60 ? `${mins} min` : `${Math.ceil(mins / 60)} hr`}.`,
        },
        { status: 429, headers: { "Retry-After": String(verdict.retryAfterSeconds) } }
      );
    }
  }
  return null;
}