/**
 * POST /api/notifications/email — email the recipient of an in-app notification.
 *
 * Why this route exists: quote sent/withdrawn, bookings, reviews, replies, chat
 * messages and claim decisions are written to Firestore by the BROWSER
 * (`createNotification` in repo.ts). The browser must never choose an email
 * recipient or free-form subject, or this becomes an open mail relay. So the
 * client only says "notification X was just created"; everything that matters is
 * read back here from the trusted document:
 *
 *   • the caller must be the notification's `fromUid` (verified ID token),
 *   • the recipient is the document's `toUid` — never taken from the request,
 *   • only whitelisted `type`s are emailed, with server-owned subjects,
 *   • each notification is emailed at most once (`emailedAt` guard),
 *   • per-sender hourly cap, plus one chat-message email per sender→recipient
 *     pair per 15 minutes so a conversation doesn't send an email per line.
 *
 * Always answers 200 for "skipped" outcomes — email is best-effort and the
 * caller must never surface a failure to the user.
 */

import { adminDb, apiError, sessionFromRequest } from "@/lib/server/admin";
import { queueEmail, type EmailKind } from "@/lib/server/email";
import { consumeRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** type → how it is emailed. Anything not listed here is never emailed. */
const TEMPLATES: Record<string, { kind: EmailKind; subject: string; heading: string; cta: string }> = {
  lead: { kind: "lead-accepted", subject: "Update on your request", heading: "Update on your request", cta: "View request" },
  "lead-lost": { kind: "lead-declined", subject: "A request you were working on has closed", heading: "Request closed", cta: "Open dashboard" },
  "lead-unlocked": { kind: "lead-accepted", subject: "A professional can now contact you", heading: "Your request was unlocked", cta: "View request" },
  quote: { kind: "quote-new", subject: "Update on your quotes", heading: "Update on your quotes", cta: "Compare quotes" },
  "quote-declined": { kind: "quote-declined", subject: "A buyer declined your quote", heading: "Quote declined", cta: "Open dashboard" },
  "quote-accepted": { kind: "quote-accepted", subject: "You won the job — your quote was accepted", heading: "Your quote was accepted", cta: "Open dashboard" },
  booking: { kind: "booking-update", subject: "Update on your booking", heading: "Booking update", cta: "View booking" },
  review: { kind: "review-new", subject: "Activity on your review", heading: "Review update", cta: "View" },
  message: { kind: "message-new", subject: "You have a new message", heading: "New message", cta: "Read message" },
  claim: { kind: "claim-update", subject: "Update on your listing claim", heading: "Listing claim update", cta: "Open dashboard" },
};

/** Only same-site relative links may reach an email; anything else is dropped. */
function safeHref(href: unknown): string | undefined {
  const h = String(href ?? "");
  return h.startsWith("/") && !h.startsWith("//") ? h.slice(0, 200) : undefined;
}

export async function POST(req: Request) {
  const db = adminDb();
  if (!db) return apiError("Server storage is not configured.", 503);

  const session = await sessionFromRequest(req);
  if (!session) return apiError("Sign in first.", 401);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(body.notificationId ?? "").trim().slice(0, 64);
  if (!id) return apiError("Missing the notification id.");

  const ref = db.collection("notifications").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return Response.json({ ok: true, skipped: "missing" });

  const n = snap.data() as {
    toUid?: string; fromUid?: string | null; type?: string; message?: string; href?: string | null; emailedAt?: string;
  };

  // Only the author of the notification may trigger its email.
  if (!n.fromUid || n.fromUid !== session.uid) return apiError("Not allowed.", 403);
  if (!n.toUid || n.toUid === session.uid) return Response.json({ ok: true, skipped: "self" });
  if (n.emailedAt) return Response.json({ ok: true, skipped: "already-sent" });

  const tpl = TEMPLATES[String(n.type ?? "")];
  if (!tpl) return Response.json({ ok: true, skipped: "type" });

  const hourly = await consumeRateLimit("emailNotify", session.uid);
  if (!hourly.ok) return Response.json({ ok: true, skipped: "rate" });

  if (n.type === "message") {
    const pair = await consumeRateLimit("emailMessage", `${session.uid}_${n.toUid}`);
    if (!pair.ok) return Response.json({ ok: true, skipped: "message-throttle" });
  }

  // Claim before sending so a double-click or retry can't send twice.
  await ref.set({ emailedAt: new Date().toISOString() }, { merge: true });

  queueEmail({
    toUid: n.toUid,
    kind: tpl.kind,
    subject: tpl.subject,
    heading: tpl.heading,
    body: String(n.message ?? "").slice(0, 200),
    ctaLabel: tpl.cta,
    ctaHref: safeHref(n.href) ?? "/dashboard",
  });

  return Response.json({ ok: true });
}
