/**
 * Plan compatibility layer.
 *
 * The plan model now lives in `@/lib/plans` (Starter / Professional / Business,
 * monthly + annual, 7-day trial, lead allowances). This module is the bridge for
 * the components written against the old FREE / PRO / PREMIUM model, so they keep
 * compiling and — more importantly — keep the *same tier semantics*:
 *
 *   free    → Starter      (now with a 7-day trial instead of a permanent free tier)
 *   pro     → Professional (R199 → R399)
 *   premium → Business     (R499 → R799)
 *
 * ⚠️ IMPORTANT: `subscribeSeller` used to write `subscriptions/{uid}` directly
 * from the browser, which let any signed-in user grant themselves the top plan
 * for free. It now calls `/api/billing/checkout`, where a verified server resolves
 * the price and the payment provider is the only thing that can activate a plan.
 * The client cannot upgrade itself any more.
 *
 * New code should import from `@/lib/plans` directly.
 */

import { auth } from "./firebase";
import {
  CAP_LABEL,
  CAP_MIN_PLAN,
  PLANS,
  PLAN_RANK,
  formatZAR,
  getPlan,
  hasCap,
  normalizePlanId,
  planRank,
  type BillingPeriod,
  type Capability,
  type PlanConfig,
  type PlanId,
} from "./plans";

export {
  CAP_LABEL,
  CAP_MIN_PLAN,
  PLANS,
  PLAN_RANK,
  hasCap,
  planRank,
  type Capability,
  type PlanConfig,
  type PlanId,
};

/** Legacy ids still present in existing Firestore documents. */
export type LegacyPlan = "free" | "pro" | "premium";

/**
 * Union of current and legacy ids. Components that read `business.plan` (which
 * may be any of these) can keep using `Plan` without a migration.
 */
export type Plan = PlanId | LegacyPlan;

export type PlanMeta = PlanConfig;

/** Former currency helper — kept so existing imports don't break. */
export const RANDS = formatZAR;

export function isLegacyPlan(p: string | null | undefined): p is LegacyPlan {
  return p === "free" || p === "pro" || p === "premium";
}

export type CheckoutResult = {
  ok: boolean;
  plan: PlanId;
  /** Hosted checkout URL to send the browser to. */
  url?: string;
  /** True when the 7-day trial was started instead of a payment. */
  trial?: boolean;
  demo?: boolean;
  message?: string;
};

/** Read the caller's Firebase ID token for authenticated API calls. */
async function idToken(): Promise<string | null> {
  const user = auth?.currentUser;
  if (!user) return null;
  return user.getIdToken();
}

async function billingFetch(path: string, init: RequestInit & { token: string }): Promise<Response> {
  const { token, ...rest } = init;
  return fetch(path, {
    ...rest,
    headers: { ...(rest.headers ?? {}), Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
}

/**
 * Start an upgrade for the signed-in seller.
 *
 * - Legacy "free" → starts the 7-day trial via the server.
 * - Paid plans → creates a hosted checkout and returns its `url` for redirect.
 *
 * The second parameter is accepted and ignored: it used to be the owner uid taken
 * from the client. The server now derives the uid from the ID token instead.
 */
export async function subscribeSeller(
  plan: Plan,
  _legacyOwnerUid?: string,
  opts?: { period?: BillingPeriod; onboarding?: boolean }
): Promise<CheckoutResult> {
  const planId = normalizePlanId(plan);
  const period: BillingPeriod = opts?.period === "annual" ? "annual" : "monthly";

  const token = await idToken();
  if (!token) throw new Error("Sign in to choose a plan.");

  // Legacy "free" mapped to Starter's trial rather than a permanent free tier.
  if (plan === "free") {
    const res = await billingFetch("/api/billing", {
      method: "POST",
      token,
      body: JSON.stringify({ action: "start-trial", onboarding: Boolean(opts?.onboarding) }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    if (json.ok) {
      const name = getPlan(planId)?.name ?? "Starter";
      return { ok: true, plan: planId, trial: true, message: `Your ${name} trial has started — 7 days free.` };
    }
    return { ok: false, plan: planId, message: json.error ?? "Could not start the trial." };
  }

  const res = await billingFetch("/api/billing/checkout", {
    method: "POST",
    token,
    body: JSON.stringify({ planId, period, onboarding: Boolean(opts?.onboarding) }),
  });
  const json = (await res.json()) as { ok?: boolean; url?: string; error?: string };
  if (!res.ok || !json.ok || !json.url) {
    return { ok: false, plan: planId, message: json.error ?? "Could not start checkout." };
  }
  return { ok: true, plan: planId, url: json.url };
}

/** Confirm a payment after returning from the provider (Paystack redirect flow). */
export async function verifyCheckout(reference: string): Promise<{ ok: boolean; pending?: boolean; message?: string }> {
  const token = await idToken();
  if (!token) throw new Error("Sign in first.");
  const res = await billingFetch("/api/billing", {
    method: "POST",
    token,
    body: JSON.stringify({ action: "verify", reference }),
  });
  const json = (await res.json()) as { ok?: boolean; pending?: boolean; error?: string };
  return { ok: Boolean(json.ok), pending: json.pending, message: json.error };
}

/** Cancel (keeps access until the period ends unless `immediate`). */
export async function cancelSellerSubscription(immediate = false): Promise<{ ok: boolean; message?: string }> {
  const token = await idToken();
  if (!token) throw new Error("Sign in first.");
  const res = await billingFetch("/api/billing", {
    method: "POST",
    token,
    body: JSON.stringify({ action: "cancel", immediate }),
  });
  const json = (await res.json()) as { ok?: boolean; error?: string };
  return { ok: Boolean(json.ok), message: json.error };
}

/** Undo a pending cancellation. */
export async function resumeSellerSubscription(): Promise<{ ok: boolean; message?: string }> {
  const token = await idToken();
  if (!token) throw new Error("Sign in first.");
  const res = await billingFetch("/api/billing", {
    method: "POST",
    token,
    body: JSON.stringify({ action: "resume" }),
  });
  const json = (await res.json()) as { ok?: boolean; error?: string };
  return { ok: Boolean(json.ok), message: json.error };
}