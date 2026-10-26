/**
 * POST /api/billing/webhook
 *
 * Receives Paystack/Yoco payment notifications and is the ONLY path that can turn
 * a payment into an active subscription. Three defences, all required:
 *
 *  1. The raw body is signature-verified against the provider's signing secret.
 *     (Raw text, not `req.json()` — re-serialising would change the bytes and
 *     break the HMAC.)
 *  2. The plan and user come from OUR `payments/{reference}` record, never from
 *     the payload, so a valid signature plus a doctored body still grants nothing.
 *  3. Activation is idempotent — providers retry, and re-activating would extend
 *     a period for free.
 *
 * Always returns 200 for events we don't act on, so the provider stops retrying.
 */

import { adminDb, apiError } from "@/lib/server/admin";
import { parseWebhookEvent, verifyWebhook } from "@/lib/server/payments";
import { activateSubscription, markPastDue } from "@/lib/server/subscriptions";
import { grantCreditsForPurchase } from "@/lib/server/credits";
import type { BillingPeriod, PlanId } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PaymentDoc = {
  ownerUid: string;
  planId: string;
  period: string;
  amountCents: number;
  status: string;
  /** "subscription" (default) or "credits" — a credit-pack top-up. */
  kind?: string;
  packId?: string;
  credits?: number;
};

export async function POST(req: Request) {
  const db = adminDb();
  if (!db) return apiError("Server billing is not configured.", 503);

  const raw = await req.text();

  const { ok, provider } = verifyWebhook(raw, req.headers);
  if (!ok || !provider) return apiError("Invalid signature.", 401);

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return apiError("Invalid JSON payload.");
  }

  const event = parseWebhookEvent(provider, body);

  if (event.type === "ignored") {
    return Response.json({ ok: true, ignored: event.reason });
  }

  if (event.type === "refunded") {
    // Record the refund; leave the subscription decision to an admin/ops action.
    if (event.reference) {
      await db.collection("payments").doc(event.reference).set(
        { status: "refunded", updatedAt: new Date().toISOString() },
        { merge: true }
      );
    }
    return Response.json({ ok: true, refunded: true });
  }

  if (!event.reference) return Response.json({ ok: true, ignored: "no-reference" });

  const payRef = db.collection("payments").doc(event.reference);
  const snap = await payRef.get();
  if (!snap.exists) {
    // Unknown reference — nothing legitimate to act on.
    return Response.json({ ok: true, ignored: "unknown-reference" });
  }
  const payment = snap.data() as PaymentDoc;

  if (event.type === "failed") {
    await payRef.set({ status: "failed", updatedAt: new Date().toISOString() }, { merge: true });
    await markPastDue(payment.ownerUid, event.providerRef ?? null);
    return Response.json({ ok: true, failed: true });
  }

  // ── paid ────────────────────────────────────────────────────────────────
  if (payment.status === "paid") {
    return Response.json({ ok: true, idempotent: true });
  }

  // A credit-pack purchase tops up the wallet; it does NOT touch the plan.
  // Same at-least-once discipline: the grant is keyed on the payment reference,
  // so a provider retry cannot mint the pack twice.
  if (payment.kind === "credits") {
    const granted = await grantCreditsForPurchase(payment.ownerUid, String(payment.packId ?? ""), event.reference);
    if (!granted.ok) return apiError(granted.error ?? "Could not grant credits.", 500);
    await payRef.set(
      { status: "paid", paidAt: new Date().toISOString(), providerRef: event.providerRef ?? null, updatedAt: new Date().toISOString() },
      { merge: true }
    );
    return Response.json({ ok: true, credited: true, balance: granted.balance, already: granted.already ?? false });
  }

  const result = await activateSubscription({
    uid: payment.ownerUid,
    planId: payment.planId as PlanId,
    period: (payment.period === "annual" ? "annual" : "monthly") as BillingPeriod,
    provider,
    paymentReference: event.reference,
    providerRef: event.providerRef ?? null,
  });

  if (!result.ok) return apiError(result.error, 500);

  return Response.json({
    ok: true,
    activated: true,
    plan: result.entitlement.plan,
    status: result.entitlement.status,
  });
}
