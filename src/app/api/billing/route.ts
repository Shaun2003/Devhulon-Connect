/**
 * /api/billing
 *
 *    GET                       → the caller's own entitlement (plan, lead allowance,
 *                               lead allowance). Safe to call from the dashboard.
 *   POST { action: "activate-starter" | "cancel" | "resume" | "verify" }
 *
 * Every action is scoped to the verified caller's uid, so one seller can never
 * touch another seller's subscription.
 */

import { adminDb, apiError, sessionFromRequest } from "@/lib/server/admin";
import { activeProvider, verifyPaystackTransaction, ZAR } from "@/lib/server/payments";
import {
  activateSubscription,
  cancelSubscription,
  entitlementFor,
  readSubscription,
  activateStarter,
} from "@/lib/server/subscriptions";
import { getCreditPack } from "@/lib/credits";
import { grantCreditsForPurchase } from "@/lib/server/credits";
import { saveReusablePaystackAuthorization } from "@/lib/server/billing-renewals";
import type { BillingPeriod, PlanId } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await sessionFromRequest(req);
  if (!session) return apiError("Sign in to view your subscription.", 401);
  if (!adminDb()) return apiError("Server billing is not configured.", 503);
  return Response.json({ ok: true, entitlement: await entitlementFor(session.uid) });
}

export async function POST(req: Request) {
  const db = adminDb();
  if (!db) return apiError("Server billing is not configured.", 503);

  const session = await sessionFromRequest(req);
  if (!session) return apiError("Sign in to continue.", 401);

  let body: { action?: string; reference?: string; immediate?: boolean; onboarding?: boolean };
  try {
    body = (await req.json()) as { action?: string; reference?: string; immediate?: boolean; onboarding?: boolean };
  } catch {
    return apiError("Invalid request body.");
  }

  switch (body.action) {
    /* ── Starter is free and does not require payment checkout. ─────────── */
    case "activate-starter": {
      if (body.onboarding === true && !session.emailVerified) {
        return apiError("Verify your email address before activating your seller plan.", 403);
      }
      const res = await activateStarter(session.uid);
      if (!res.ok) {
        return Response.json(
          { ok: false, error: res.error, entitlement: res.entitlement ?? null },
          { status: 400 }
        );
      }
      return Response.json({ ok: true, entitlement: res.entitlement });
    }

    /* ── Cancel: keeps access until the paid period ends ─────────────────── */
    case "cancel": {
      const res = await cancelSubscription(session.uid, Boolean(body.immediate));
      if (!res.ok) return apiError(res.error, 400);
      return Response.json({ ok: true, entitlement: res.entitlement });
    }

    /* ── Undo a pending cancellation ─────────────────────────────────────── */
    case "resume": {
      const doc = await readSubscription(session.uid);
      if (!doc) return apiError("No subscription found.", 404);
      const ref = db.collection("subscriptions").doc(session.uid);
      await ref.set(
        {
          subscription_status: "active",
          status: "active",
          cancel_at_period_end: false,
          auto_renew: false,
          next_renewal_at: null,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      return Response.json({ ok: true, entitlement: await entitlementFor(session.uid) });
    }

    /* ── Confirm a payment after the browser returns from checkout ───────── */
    case "verify": {
      const reference = (body.reference ?? "").trim();
      if (!reference) return apiError("Missing payment reference.");

      const payRef = db.collection("payments").doc(reference);
      const snap = await payRef.get();
      if (!snap.exists) return apiError("Unknown payment reference.", 404);

      const payment = snap.data() as {
        ownerUid: string; planId: string; period: string; amountCents: number; status: string;
        kind?: string; packId?: string; provider?: string;
        autoRenew?: boolean;
      };
      // A seller may only confirm their own payment.
      if (payment.ownerUid !== session.uid) return apiError("Not your payment.", 403);

      if (payment.status === "paid") {
        if (payment.autoRenew === true && payment.provider === "paystack") {
          const verified = await verifyPaystackTransaction(reference);
          if (verified.ok && verified.amountCents === payment.amountCents && verified.authorizationPresent) {
            await saveReusablePaystackAuthorization(
              payment.ownerUid,
              reference,
              verified.customerEmail,
              verified.authorizationCode,
              verified.authorizationReusable === true
            );
          }
        }
        return Response.json({ ok: true, alreadyPaid: true, entitlement: await entitlementFor(session.uid) });
      }

      const provider = activeProvider();
      if (provider !== "paystack" || (payment.provider && payment.provider !== provider)) {
        // Yoco confirmation arrives via webhook; don't guess here.
        return Response.json({ ok: true, pending: true, entitlement: await entitlementFor(session.uid) });
      }

      const verified = await verifyPaystackTransaction(reference);
      if (!verified.ok) return apiError(`Payment not confirmed (${verified.reason}).`, 402);

      // Guard against a tampered/partial payment.
      if (verified.amountCents !== payment.amountCents) {
        await payRef.set({ status: "amount_mismatch", updatedAt: new Date().toISOString() }, { merge: true });
        return apiError("Paid amount does not match the plan price.", 402);
      }

      if (payment.kind === "credits") {
        const pack = getCreditPack(payment.packId ?? "");
        if (!pack || payment.amountCents !== ZAR(pack.price)) {
          await payRef.set({ status: "amount_mismatch", updatedAt: new Date().toISOString() }, { merge: true });
          return apiError("Credit pack does not match the recorded payment amount.", 402);
        }

        const granted = await grantCreditsForPurchase(session.uid, pack.id, reference);
        if (!granted.ok) return apiError(granted.error ?? "Could not grant purchased credits.", 500);
        await payRef.set({
          status: "paid",
          paidAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }, { merge: true });
        return Response.json({ ok: true, credited: true, balance: granted.balance });
      }

      const res = await activateSubscription({
        uid: payment.ownerUid,
        planId: payment.planId as PlanId,
        period: (payment.period === "annual" ? "annual" : "monthly") as BillingPeriod,
        provider: "paystack",
        paymentReference: reference,
        providerRef: null,
      });
      if (!res.ok) return apiError(res.error, 500);

      if (payment.autoRenew === true) {
        await saveReusablePaystackAuthorization(
          payment.ownerUid,
          reference,
          verified.customerEmail,
          verified.authorizationCode,
          verified.authorizationReusable === true
        );
      }

      return Response.json({ ok: true, entitlement: res.entitlement });
    }

    default:
      return apiError("Unknown action.");
  }
}
