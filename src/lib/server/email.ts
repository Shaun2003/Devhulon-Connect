/**
 * Email delivery — TRUSTED SERVER ONLY (Resend HTTP API).
 *
 * Why this exists: every marketplace event already drops an in-app
 * notification, but buyers and sellers who are not looking at the site miss
 * them. Email closes the loop for both sides:
 *
 *   SELLER emails: new lead, quote declined, booking requested/cancelled,
 *     listing verified/unverified, new review
 *   BUYER emails:  request accepted/declined, new quote, quote withdrawn,
 *     booking confirmed/moved/completed/cancelled, review replied,
 *     quote accepted (job awarded)
 *
 * Design rules:
 *   • NEVER throw — email is always best-effort. A Resend outage must not
 *     fail a lead, award or booking. Every send is wrapped and logged.
 *   • NEVER send without RESEND_API_KEY — the module degrades to a log line
 *     so local dev and CI work with zero config.
 *   • Recipients are resolved SERVER-SIDE from the uid via Admin Auth
 *     (getUser) — the browser never supplies an email address, so nobody can
 *     redirect someone else's mail.
 *   • Bodies are plain-text, POPIA-light: no phone numbers, no personal data
 *     beyond names the recipient already knows.
 */

import { Resend } from "resend";
import { after } from "next/server";
import { adminAuth } from "./admin";
import { SITE_URL, SITE_SHORT, CONTACT_EMAIL } from "@/lib/site";

const RESEND_KEY = process.env.RESEND_API_KEY ?? "";
const FROM = process.env.EMAIL_FROM ?? `notifications@${siteHost()}`;

function siteHost(): string {
  try {
    return new URL(SITE_URL).hostname;
  } catch {
    return "devhulonconnect.co.za";
  }
}

/** True when live delivery is possible. */
export const isEmailConfigured = Boolean(RESEND_KEY);

let client: Resend | null = null;
function resend(): Resend | null {
  if (!RESEND_KEY) return null;
  if (!client) client = new Resend(RESEND_KEY);
  return client;
}

export type EmailKind =
  | "lead-new"            // → seller: a buyer request landed in your inbox
  | "lead-accepted"       // → buyer: a pro accepted your request
  | "lead-declined"       // → buyer: a pro declined (others may still reply)
  | "quote-new"           // → buyer: a seller sent you a quote
  | "quote-accepted"      // → seller: your quote won 🎉
  | "quote-declined"      // → seller: buyer declined your quote
  | "quote-withdrawn"     // → buyer: a seller withdrew their quote
  | "booking-new"         // → seller: new booking request
  | "booking-update"      // → buyer: booking confirmed/moved/completed/no-show/cancelled
  | "booking-cancelled"   // → seller: buyer cancelled
  | "review-new"          // → seller: new review on your listing
  | "review-replied"      // → buyer: business replied to your review
  | "listing-verified"    // → seller: Verified badge granted
  | "listing-unverified"  // → seller: badge revoked / re-verification needed
  | "claim-update"        // → seller: listing claim approved/rejected
  | "team-invitation"     // → seller: added to a Business plan team
  | "message-new";        // → either: new chat message

export type EmailPayload = {
  toUid: string;
  kind: EmailKind;
  subject: string;
  heading: string;
  body: string;
  ctaLabel?: string;
  ctaHref?: string;
};

/**
 * Resolve a user's email from their uid via Admin Auth.
 * Returns null for anonymous / missing users — caller skips silently.
 */
export async function emailForUid(uid: string): Promise<string | null> {
  if (!uid) return null;
  const auth = adminAuth();
  if (!auth) return null;
  try {
    const user = await auth.getUser(uid);
    return user.email ?? null;
  } catch {
    return null;
  }
}

function renderText(p: EmailPayload): string {
  const lines = [p.heading, "", p.body];
  if (p.ctaHref) {
    lines.push("", `${p.ctaLabel ?? "Open"}: ${SITE_URL}${p.ctaHref}`);
  }
  lines.push("", `— ${SITE_SHORT}`, `Questions? Reply to ${CONTACT_EMAIL}`);
  return lines.join("\n");
}

/**
 * Send one templated email. Best-effort: resolves the address, sends via
 * Resend, logs + swallows every failure. Returns true when handed to Resend.
 */
export async function sendEmail(p: EmailPayload): Promise<boolean> {
  const to = await emailForUid(p.toUid);
  if (!to) return false;
  const svc = resend();
  if (!svc) {
    console.log(`[KASI] email (dry-run, no RESEND_API_KEY) kind=${p.kind} to=${to} subject=${p.subject}`);
    return false;
  }
  try {
    await svc.emails.send({
      from: FROM,
      to,
      subject: p.subject,
      text: renderText(p),
    });
    return true;
  } catch (err) {
    console.warn(`[KASI] email send failed kind=${p.kind} to=${to}:`, err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Fire-and-forget wrapper — use at call sites so email never blocks.
 *
 * On serverless hosts a bare un-awaited promise can be frozen the moment the
 * response is sent, silently dropping the email. Next's `after()` keeps the
 * invocation alive until the send settles. Outside a request scope (scripts,
 * tests) `after()` throws, so we fall back to a plain detached promise.
 */
export function queueEmail(p: EmailPayload): void {
  const job = sendEmail(p).catch(() => false);
  try {
    after(() => job);
  } catch {
    void job;
  }
}
