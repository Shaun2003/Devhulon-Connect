/**
 * POST /api/billing/checkout
 *
 * The only way a seller can start a paid subscription. Deliberately strict:
 *   • the caller is identified by their VERIFIED Firebase ID token, not a body field
 *   • the amount is resolved server-side from plans.ts, so a tampered client cannot
 *     buy the Business plan for R1
 *   • a `payments` record is written first, so the webhook has an auditable trail
 *
 * Returns { url } — the hosted checkout page. The browser only ever redirects.
 */

import { randomUUID } from "node:crypto";
import { adminDb, apiError, sessionFromRequest } from "@/lib/server/admin";
import { activeProvider, isPaymentsConfigured, startCheckout, ZAR } from "@/lib/server/payments";
import { getPlan, priceFor, type BillingPeriod, type PlanId } from "@/lib/plans";
import { loadPlanConfig } from "@/lib/server/plan-config";
import { entitlementFrom, readSubscription } from "@/lib/server/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PLAN_IDS: PlanId[] = ["starter", "professional", "business"];

export async function POST(req: Request) {
  const db = adminDb();
  if (!db) return apiError("Server billing is not configured.", 503);

  const session = await sessionFromRequest(req);
  if (!session) return apiError("Sign in to continue.", 401);

  if (!isPaymentsConfigured()) {
    return apiError(
      "Card payments are not switched on yet. Set PAYMENT_PROVIDER plus its secret key to enable checkout.",
      503
    );
  }

  let body: { planId?: string; period?: string; onboarding?: boolean };
  try {
    body = (await req.json()) as { planId?: string; period?: string; onboarding?: boolean };
  } catch {
    return apiError("Invalid request body.");
  }

  if (body.onboarding === true && !session.emailVerified) {
    return apiError("Verify your email address before choosing a seller plan.", 403);
  }

  const planId = body.planId as PlanId;
  if (!PLAN_IDS.includes(planId)) return apiError("Choose a valid plan.");

  const period: BillingPeriod = body.period === "annual" ? "annual" : "monthly";
  // Admin-set prices/limits must be loaded before the amount is resolved, or
  // /pricing would display the new price while checkout charged the old one.
  await loadPlanConfig();
  const plan = getPlan(planId);
  if (!plan) return apiError("Choose a valid plan.");

  const current = entitlementFrom(await readSubscription(session.uid));
  if (current.entitled && current.plan === planId) {
    return Response.json(
      { ok: false, error: `Your ${plan.name} subscription is already active. You can choose this plan again after its current period ends.` },
      { status: 409 }
    );
  }

  // Server-side price. Never read an amount from the request.
  const rands = priceFor(plan, period);
  const reference = `kasi-${randomUUID()}`;
  const provider = activeProvider();

  const origin = new URL(req.url).origin;
  const callbackUrl = body.onboarding
    ? `${origin}/register-seller?billing=return&reference=${encodeURIComponent(reference)}`
    : `${origin}/dashboard?billing=return&reference=${encodeURIComponent(reference)}`;

  // Audit trail first — the webhook resolves the plan from this record, so a
  // forged webhook body alone cannot grant anything.
  await db.collection("payments").doc(reference).set({
    reference,
    ownerUid: session.uid,
    email: session.email,
    planId,
    period,
    amount: rands,
    amountCents: ZAR(rands),
    currency: "ZAR",
    status: "pending",
    provider,
    providerRef: null,
    createdAt: new Date().toISOString(),
  });

  try {
    const checkout = await startCheckout({
      uid: session.uid,
      email: session.email ?? `${session.uid}@kasi.local`,
      planId,
      period,
      amountCents: ZAR(rands),
      reference,
      callbackUrl,
    });

    await db.collection("payments").doc(reference).set(
      { providerRef: checkout.accessCode ?? null, providerUrl: checkout.url, updatedAt: new Date().toISOString() },
      { merge: true }
    );

    return Response.json({ ok: true, url: checkout.url, reference, provider: checkout.provider });
  } catch (err) {
    await db.collection("payments").doc(reference).set(
      { status: "failed", failureReason: err instanceof Error ? err.message : "checkout-failed", updatedAt: new Date().toISOString() },
      { merge: true }
    );
    return apiError(err instanceof Error ? err.message : "Could not start checkout.", 502);
  }
}
