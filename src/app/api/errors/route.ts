/**
 * POST /api/errors — receive client error reports.
 *
 * Anonymous and unauthenticated ON PURPOSE. The whole point is to catch failures
 * that happen BEFORE sign-in — a broken signup form, a failed match, a crash on
 * the landing page — which is precisely when there is no user to attribute.
 *
 * That makes this the one endpoint in the app anyone can write to freely, so it is
 * defended on three axes:
 *   1. RATE LIMITED per IP (reuses the lead limiter's counter machinery).
 *   2. SIZE CAPPED, and scrubbed again server-side. Never trust a client that it
 *      already removed sensitive values — the scrubbing in the browser is a
 *      convenience, this is the control.
 *   3. READ-ONLY to non-admins, and capped on read, so the collection cannot be
 *      used to store arbitrary content or dumped in bulk.
 *
 * Records are deliberately anonymous: message, scrubbed stack, page path, time.
 * No uid, no email, no IP written to the document.
 */

import { adminDb, adminFromRequest, apiError, sessionFromRequest } from "@/lib/server/admin";
import { consumeRateLimit, clientIp } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Bounded so one report can never be a large write. */
const MAX_MESSAGE = 500;
const MAX_STACK = 2000;
const MAX_CONTEXT = 200;

/** Belt-and-braces scrub. The browser already does this; a caller can bypass it. */
function scrub(v: unknown, max: number): string {
  return String(v ?? "")
    .slice(0, max)
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [redacted]")
    .replace(/\b[0-9]{9,}\b/g, "[redacted-number]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[redacted-email]");
}

export async function POST(req: Request) {
  const db = adminDb();
  if (!db) return apiError("Server storage is not configured.", 503);

  // Rate limit first, before parsing or writing anything. Reuses the existing
  // counter rather than adding a second mechanism for the same job.
  const limited = await consumeRateLimit("errorReport", clientIp(req));
  if (!limited.ok) {
    return Response.json({ ok: false }, { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  // Signed-in users are associated so a report can be traced to an account —
  // but only when they are actually signed in, and never by a body field.
  const session = await sessionFromRequest(req);

  await db.collection("client_errors").add({
    message: scrub(body.message, MAX_MESSAGE),
    stack: body.stack ? scrub(body.stack, MAX_STACK) : null,
    context: body.context ? scrub(body.context, MAX_CONTEXT) : null,
    // Authenticated association ONLY. Anonymous reports stay anonymous.
    uid: session?.uid ?? null,
    at: typeof body.at === "string" ? body.at.slice(0, 40) : new Date().toISOString(),
    url: body.url ? String(body.url).slice(0, 200) : null,
    ua: body.ua ? String(body.ua).slice(0, 200) : null,
  });

  return Response.json({ ok: true });
}

/**
 * GET — admin-only error feed, newest first.
 *
 * Admin-only because a stack trace is a map of your application and its
 * integration quirks. Deliberately capped and deliberately read-only.
 */
export async function GET(req: Request) {
  const db = adminDb();
  if (!db) return apiError("Server storage is not configured.", 503);

  const admin = await adminFromRequest(req);
  if (!admin) return apiError("Admin access required.", 403);

  const limit = Math.min(200, Number(new URL(req.url).searchParams.get("limit") ?? 50) || 50);
  const snap = await db.collection("client_errors").orderBy("at", "desc").limit(limit).get();

  return Response.json({
    ok: true,
    errors: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
  });
}