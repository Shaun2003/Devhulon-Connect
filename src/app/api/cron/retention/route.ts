/**
 * GET /api/cron/retention — enforce the retention and expiry windows the privacy
 * policy publishes.
 *
 * The policy states two hard numbers (180 days for quote requests, 30 for an
 * unanswered open request). Until this route existed those were only prose, which
 * made the published policy false: nothing ever deleted or closed anything on a
 * schedule. This is the enforcement.
 *
 * SECURED BY `CRON_SECRET`, compared in constant time. Vercel Cron sends
 * `Authorization: Bearer $CRON_SECRET` automatically when the env var is set, and
 * the same header lets an operator trigger a backfill by hand. Without the secret
 * configured the route refuses to run rather than defaulting to open — an
 * unauthenticated endpoint that deletes user data is exactly the kind of thing
 * that must never exist.
 *
 * Idempotent and incremental by design: every pass skips work it has already done,
 * so running it twice is harmless and running it daily drains a backlog safely.
 */

import { adminDb, apiError } from "@/lib/server/admin";
import { runRetentionSweep } from "@/lib/server/retention-redact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Vercel must never cache this: it is an action, not data. */
export const revalidate = 0;

/** Length-safe constant-time compare. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function handle(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  // Fail CLOSED. An unset secret means nobody can prove they are the cron.
  if (!secret) {
    console.error("[KASI] retention: CRON_SECRET is not set — refusing to run.");
    return apiError("Retention sweep is not configured.", 503);
  }

  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!safeEqual(token, secret)) return apiError("Unauthorized.", 401);

  const db = adminDb();
  if (!db) return apiError("Server storage is not configured.", 503);

  try {
    const result = await runRetentionSweep(db);
    // Log a one-line summary so a silent cron failure is visible in the platform
    // logs rather than discovered months later during an audit.
    console.log(
      `[KASI] retention sweep: expired=${result.expired} stoodDown=${result.stoodDown} ` +
        `redacted=${result.redacted} quotes=${result.quotesRedacted} scanned=${result.scanned} ` +
        `analyticsDeleted=${result.analyticsDeleted} rateLimitsDeleted=${result.rateLimitsDeleted} ` +
        `errors=${result.errors.length}`
    );
    // Always 200 when the sweep ran — a partial sweep is not a request failure,
    // and a non-2xx would make the platform flag the cron as broken.
    return Response.json({ ok: result.errors.length === 0, ...result });
  } catch (e) {
    console.error("[KASI] retention sweep failed:", e);
    return apiError("Retention sweep failed.", 500);
  }
}

export const GET = handle;
/** POST as well, so the cron can be triggered manually from a scheduler or curl. */
export const POST = handle;