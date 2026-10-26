/**
 * Subscription service — the ONLY writer of `subscriptions/{uid}`.
 *
 * Every write here runs on the trusted server via the Admin SDK. The browser can
 * read its own subscription doc (so dashboards stay realtime) but can no longer
 * write it, which is what closes the "self-upgrade to Business for free" hole in
 * the original rules (master spec §24).
 *
 * Document shape at `subscriptions/{uid}` (kept flat so Firestore rules and the
 * realtime listeners stay simple):
 *
 *   ownerUid              string   mirrored from the doc id for collection queries
 *   plan                  PlanId   "starter" | "professional" | "business"
 *   subscription_status   string   trialing | active | past_due | canceled | expired
 *   billing_period        string   monthly | annual
 *   trial_started_at      string   ISO, set once, never reset
 *   trial_ends_at         string   ISO
 *   trial_used            boolean  one trial per account, enforced here
 *   current_period_start  string   ISO
 *   current_period_end    string   ISO
 *   current_period_end_at timestamp  server-enforced expiry for Firestore rules
 *   lead_limit            number|null  snapshot of the plan allowance
 *   leads_used            number   reset when the period rolls over
 *   leads_period_key      string   the period the counter belongs to
 *   provider              string   paystack | yoco | none
 *   provider_ref          string   provider subscription/plan code
 *   cancel_at_period_end  boolean
 *   updatedAt / createdAt string   ISO
 */

import { adminDb } from "./admin";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { nextMonthlyCreditAt } from "@/lib/credit-schedule";
import {
  TRIAL_DAYS,
  daysUntil,
  getPlan,
  hasCap,
  limitsFor,
  normalizePlanId,
  periodDays,
  priceFor,
  type BillingPeriod,
  type PlanId,
  type SubscriptionStatus,
} from "@/lib/plans";
import { loadPlanConfig } from "./plan-config";

export type SubscriptionDoc = {
  ownerUid?: string;
  plan?: string;
  subscription_status?: string;
  status?: string;
  billing_period?: string;
  trial_started_at?: string | null;
  trial_ends_at?: string | null;
  trial_used?: boolean;
  current_period_start?: string | null;
  current_period_end?: string | null;
  current_period_end_at?: Timestamp;
  lead_limit?: number | null;
  leads_used?: number;
  leads_period_key?: string | null;
  provider?: string;
  provider_ref?: string | null;
  cancel_at_period_end?: boolean;
  included_credits_next_at?: string | null;
  included_credits_plan?: PlanId;
  included_credits_anchor_day?: number;
  updatedAt?: string;
  createdAt?: string;
};

const nowIso = () => new Date().toISOString();
const addDaysIso = (days: number, from: Date = new Date()) =>
  new Date(from.getTime() + days * 86_400_000).toISOString();
const periodEndTimestamp = (value: string | null | undefined) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? Timestamp.fromDate(date) : null;
};

async function syncBusinessPlan(db: Firestore, uid: string, planId: PlanId): Promise<void> {
  const [businesses, deals, events] = await Promise.all([
    db.collection("businesses").where("ownerUid", "==", uid).get(),
    hasCap(planId, "featuredDeals") ? Promise.resolve(null) : db.collection("deals").where("createdBy", "==", uid).get(),
    hasCap(planId, "featuredEvents") ? Promise.resolve(null) : db.collection("events").where("createdBy", "==", uid).get(),
  ]);
  const updates = [
    ...businesses.docs.map((doc) => ({
      ref: doc.ref,
      fields: { plan: planId, ...(!hasCap(planId, "featuredProfile") ? { featured: false } : {}) },
    })),
    ...(deals?.docs ?? []).map((doc) => ({ ref: doc.ref, fields: { featured: false } })),
    ...(events?.docs ?? []).map((doc) => ({ ref: doc.ref, fields: { featured: false } })),
  ];
  for (let offset = 0; offset < updates.length; offset += 450) {
    const batch = db.batch();
    for (const update of updates.slice(offset, offset + 450)) {
      batch.set(update.ref, { ...update.fields, updatedAt: nowIso() }, { merge: true });
    }
    await batch.commit();
  }
}

/**
 * Read the raw subscription doc, or null when the seller has never subscribed.
 *
 * Loads the admin plan overrides FIRST: `entitlementFrom()` reads `limitsFor()`
 * synchronously from `lib/plans.ts`, so without this an admin price/limit change
 * would never reach an entitlement check. This is the choke point every
 * server-side gate goes through (portfolio, service areas, billing).
 */
export async function readSubscription(uid: string): Promise<SubscriptionDoc | null> {
  const db = adminDb();
  if (!db) return null;
  await loadPlanConfig();
  const ref = db.collection("subscriptions").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const doc = snap.data() as SubscriptionDoc;
  if (doc.current_period_end_at || !doc.current_period_end) return doc;
  const end = periodEndTimestamp(doc.current_period_end);
  if (!end) return doc;
  await ref.set({ current_period_end_at: end }, { merge: true });
  return { ...doc, current_period_end_at: end };
}

/** Coerce a stored status to a known value. */
function normalizeStatus(raw: unknown, plan: PlanId, periodEnd?: string | null): SubscriptionStatus {
  const s = typeof raw === "string" ? raw.toLowerCase() : "";
  if (s === "trialing" || s === "active" || s === "past_due" || s === "canceled" || s === "expired") return s;
  // Legacy docs only wrote `status: "active"`.
  if (s === "active" || s === "") {
    if (periodEnd && new Date(periodEnd).getTime() < Date.now()) return "expired";
    return "active";
  }
  void plan;
  return "expired";
}

/** Anything the UI needs to render plan state, trial countdown and allowances. */
export type Entitlement = {
  plan: PlanId;
  status: SubscriptionStatus;
  /** True when the seller may use paid features right now. */
  entitled: boolean;
  isTrial: boolean;
  trialDaysLeft: number;
  periodEnd: string | null;
  leadLimit: number | null;
  leadsUsed: number;
  leadsRemaining: number | null;
  leadLimitReached: boolean;
  cancelAtPeriodEnd: boolean;
  billingPeriod: BillingPeriod;
  raw: SubscriptionDoc | null;
};

/**
 * Resolve everything an entitlement check needs from one subscription doc.
 * Pure function of the doc + the clock, so client and server agree.
 */
export function entitlementFrom(doc: SubscriptionDoc | null): Entitlement {
  const plan = normalizePlanId(doc?.plan ?? null);
  const billingPeriod: BillingPeriod = doc?.billing_period === "annual" ? "annual" : "monthly";
  const periodEnd = doc?.current_period_end ?? null;
  const normalizedStatus = normalizeStatus(doc?.subscription_status ?? doc?.status, plan, periodEnd);
  const status = normalizedStatus === "canceled"
    && doc?.cancel_at_period_end === true
    && Boolean(periodEnd && Date.parse(periodEnd) > Date.now())
    ? "active"
    : normalizedStatus;

  const isTrial = status === "trialing";
  const trialDaysLeft = isTrial ? daysUntil(doc?.trial_ends_at ?? periodEnd) : 0;
  // Trialing, active, past_due (grace period) and cancel-at-period-end all keep
  // access until the period actually lapses.
  const entitled =
    (status === "active" || status === "trialing" || status === "past_due") &&
    (!periodEnd || new Date(periodEnd).getTime() > Date.now());

  const leadLimit = typeof doc?.lead_limit === "number" ? doc.lead_limit : limitsFor(plan).leadsPerMonth;
  const leadsUsed = typeof doc?.leads_used === "number" ? doc.leads_used : 0;
  const leadsRemaining = leadLimit === null ? null : Math.max(0, leadLimit - leadsUsed);

  return {
    plan,
    status,
    entitled,
    isTrial,
    trialDaysLeft,
    periodEnd,
    leadLimit,
    leadsUsed,
    leadsRemaining,
    leadLimitReached: leadLimit !== null && leadsUsed >= leadLimit,
    cancelAtPeriodEnd: Boolean(doc?.cancel_at_period_end),
    billingPeriod,
    raw: doc,
  };
}

/** Convenience: resolve entitlement straight from a uid. */
export async function entitlementFor(uid: string): Promise<Entitlement> {
  return entitlementFrom(await readSubscription(uid));
}

/** Public price lookup used by checkout so the server never trusts a client amount. */
export function serverPrice(planId: PlanId, period: BillingPeriod): number {
  const plan = getPlan(planId);
  if (!plan) throw new Error("Unknown plan.");
  return priceFor(plan, period);
}

export { TRIAL_DAYS, periodDays, addDaysIso, nowIso };

/** Result shape shared by every mutation so route handlers can respond uniformly. */
export type MutationResult =
  | { ok: true; entitlement: Entitlement }
  | { ok: false; error: string; entitlement?: Entitlement };

/** Period key used to detect month rollover for the lead counter. */
const periodKey = (periodEnd: string | null | undefined) =>
  periodEnd ? periodEnd.slice(0, 10) : null;

/**
 * Start the 7-day Starter trial (spec §22). One per account, ever.
 *
 * Idempotent: calling twice returns the live trial rather than extending it, so a
 * seller cannot farm unlimited free months by re-hitting the endpoint.
 */
export async function startTrial(uid: string, planId: PlanId = "starter"): Promise<MutationResult> {
  const db = adminDb();
  if (!db) return { ok: false, error: "Server billing is not configured." };
  // Admin-configurable trial length (§21) — must be loaded before getPlan().
  await loadPlanConfig();

  const ref = db.collection("subscriptions").doc(uid);
  const existing = await ref.get();
  const doc = (existing.exists ? existing.data() : null) as SubscriptionDoc | null;

  if (doc?.trial_used) {
    // Already trialled — return the current state untouched.
    return { ok: false, error: "trial-already-used", entitlement: entitlementFrom(doc) };
  }
  if (doc && normalizeStatus(doc.subscription_status ?? doc.status, planId, doc.current_period_end) === "active") {
    return { ok: false, error: "already-subscribed", entitlement: entitlementFrom(doc) };
  }

  const plan = getPlan(planId);
  if (!plan) return { ok: false, error: "Unknown plan." };

  const start = nowIso();
  const end = addDaysIso(plan.trialDays ?? TRIAL_DAYS);
  const patch: SubscriptionDoc = {
    ownerUid: uid,
    plan: planId,
    subscription_status: "trialing",
    status: "trialing",
    billing_period: "monthly",
    trial_started_at: start,
    trial_ends_at: end,
    trial_used: true,
    current_period_start: start,
    current_period_end: end,
    current_period_end_at: periodEndTimestamp(end) ?? undefined,
    lead_limit: plan.limits.leadsPerMonth,
    leads_used: 0,
    leads_period_key: periodKey(end),
    provider: "none",
    provider_ref: null,
    cancel_at_period_end: false,
    createdAt: doc?.createdAt ?? start,
    updatedAt: start,
  };

  await ref.set(patch, { merge: true });
  return { ok: true, entitlement: entitlementFrom(patch) };
}

/**
 * Activate (or renew) a paid subscription after a VERIFIED provider payment.
 * Called from the webhook route and from checkout verification — never by the client.
 */
export async function activateSubscription(input: {
  uid: string;
  planId: PlanId;
  period: BillingPeriod;
  provider: string;
  paymentReference: string;
  providerRef?: string | null;
}): Promise<MutationResult> {
  const db = adminDb();
  if (!db) return { ok: false, error: "Server billing is not configured." };
  // Lead allowance comes from the plan, which an admin may have reconfigured.
  await loadPlanConfig();

  const plan = getPlan(input.planId);
  if (!plan) return { ok: false, error: "Unknown plan." };

  const ref = db.collection("subscriptions").doc(input.uid);
  const paymentRef = db.collection("payments").doc(input.paymentReference);
  const walletRef = db.collection("wallets").doc(input.uid);
  const ledgerRef = db.collection("credit_ledger").doc(`plan_${input.paymentReference}`);

  const start = nowIso();
  const end = addDaysIso(periodDays(input.period));
  const result = await db.runTransaction(async (tx) => {
    const [subSnap, paymentSnap] = await Promise.all([tx.get(ref), tx.get(paymentRef)]);
    if (!paymentSnap.exists) return { ok: false as const, error: "Payment record not found." };

    const payment = paymentSnap.data() as {
      ownerUid?: string;
      planId?: string;
      period?: string;
      kind?: string;
      status?: string;
    };
    if (payment.ownerUid !== input.uid || payment.planId !== input.planId ||
        (payment.period === "annual" ? "annual" : "monthly") !== input.period || payment.kind === "credits") {
      return { ok: false as const, error: "Payment does not match this subscription." };
    }

    const doc = (subSnap.exists ? subSnap.data() : null) as SubscriptionDoc | null;
    if (payment.status === "paid") {
      if (!doc) return { ok: false as const, error: "Payment was processed but the subscription is missing." };
      return { ok: true as const, entitlement: entitlementFrom(doc) };
    }
    if (payment.status !== "pending") {
      return { ok: false as const, error: "This payment is no longer pending." };
    }

    const planChanged = doc?.plan != null && normalizePlanId(doc.plan) !== input.planId;
    const nextCreditAt = doc?.included_credits_next_at;
    const hasValidCreditSchedule =
      typeof nextCreditAt === "string" && Number.isFinite(Date.parse(nextCreditAt));
    const shouldGrantCredits =
      !hasValidCreditSchedule ||
      doc?.included_credits_plan !== input.planId ||
      !entitlementFrom(doc).entitled;
    const creditAnchorDay = shouldGrantCredits
      ? new Date(start).getUTCDate()
      : doc?.included_credits_anchor_day ?? new Date(nextCreditAt ?? start).getUTCDate();
    const walletSnap = shouldGrantCredits ? await tx.get(walletRef) : null;

    const patch: SubscriptionDoc = {
      ownerUid: input.uid,
      plan: input.planId,
      subscription_status: "active",
      status: "active",
      billing_period: input.period,
      current_period_start: start,
      current_period_end: end,
      current_period_end_at: periodEndTimestamp(end) ?? undefined,
      lead_limit: plan.limits.leadsPerMonth,
      leads_used: planChanged ? 0 : (doc?.leads_used ?? 0),
      leads_period_key: periodKey(end),
      provider: input.provider,
      provider_ref: input.providerRef ?? doc?.provider_ref ?? null,
      cancel_at_period_end: false,
      trial_started_at: doc?.trial_started_at ?? null,
      trial_ends_at: doc?.trial_ends_at ?? null,
      trial_used: doc?.trial_used ?? false,
      included_credits_next_at: shouldGrantCredits
        ? nextMonthlyCreditAt(new Date(start), creditAnchorDay)
        : nextCreditAt ?? null,
      included_credits_plan: input.planId,
      included_credits_anchor_day: creditAnchorDay,
      createdAt: doc?.createdAt ?? start,
      updatedAt: start,
    };

    tx.set(ref, patch, { merge: true });
    tx.set(paymentRef, {
      status: "paid",
      paidAt: start,
      providerRef: input.providerRef ?? null,
      updatedAt: start,
    }, { merge: true });

    if (shouldGrantCredits && walletSnap) {
      const wallet = (walletSnap.data() as {
        ownerUid?: string;
        balance?: number;
        lifetimeEarned?: number;
        lifetimeSpent?: number;
        createdAt?: string;
      } | undefined) ?? {};
      const balance = (wallet.balance ?? 0) + plan.includedCredits;
      tx.set(walletRef, {
        ownerUid: input.uid,
        balance,
        lifetimeEarned: (wallet.lifetimeEarned ?? 0) + plan.includedCredits,
        lifetimeSpent: wallet.lifetimeSpent ?? 0,
        createdAt: wallet.createdAt ?? start,
        updatedAt: start,
      });
      tx.set(ledgerRef, {
        id: ledgerRef.id,
        ownerUid: input.uid,
        type: "bonus",
        amount: plan.includedCredits,
        balanceAfter: balance,
        planId: input.planId,
        reference: input.paymentReference,
        note: `${plan.name} monthly plan credits`,
        createdAt: start,
      });
    }

    return { ok: true as const, entitlement: entitlementFrom(patch) };
  });
  if (!result.ok) return result;

  await syncBusinessPlan(db, input.uid, input.planId);
  return result;
}

/**
 * Cancel. Default behaviour keeps access until the paid period lapses
 * (`cancel_at_period_end`), which is what buyers expect and avoids pro-rata work.
 */
export async function cancelSubscription(uid: string, immediate = false): Promise<MutationResult> {
  const db = adminDb();
  if (!db) return { ok: false, error: "Server billing is not configured." };

  const ref = db.collection("subscriptions").doc(uid);
  const existing = await ref.get();
  if (!existing.exists) return { ok: false, error: "No subscription to cancel." };
  const doc = existing.data() as SubscriptionDoc;

  const now = nowIso();
  const patch: SubscriptionDoc = immediate
    ? {
        subscription_status: "canceled",
        status: "canceled",
        cancel_at_period_end: false,
        current_period_end: now,
        current_period_end_at: periodEndTimestamp(now) ?? undefined,
        updatedAt: now,
      }
    : {
        subscription_status: "canceled",
        status: "canceled",
        cancel_at_period_end: true, // keeps access until current_period_end
        current_period_end_at: periodEndTimestamp(doc.current_period_end) ?? undefined,
        updatedAt: now,
      };

  await ref.set(patch, { merge: true });
  if (immediate) await syncBusinessPlan(db, uid, "starter");
  return { ok: true, entitlement: entitlementFrom({ ...doc, ...patch }) };
}

/** Payment failed — keep access briefly while the provider retries (spec §25). */
export async function markPastDue(uid: string, providerRef?: string | null): Promise<MutationResult> {
  const db = adminDb();
  if (!db) return { ok: false, error: "Server billing is not configured." };
  const ref = db.collection("subscriptions").doc(uid);
  const existing = await ref.get();
  if (!existing.exists) return { ok: false, error: "Unknown subscription." };
  const doc = existing.data() as SubscriptionDoc;
  const patch: SubscriptionDoc = {
    subscription_status: "past_due",
    status: "past_due",
    provider_ref: providerRef ?? doc.provider_ref ?? null,
    updatedAt: nowIso(),
  };
  await ref.set(patch, { merge: true });
  return { ok: true, entitlement: entitlementFrom({ ...doc, ...patch }) };
}

/** Provider says access is over (subscription disabled/expired). */
export async function expireSubscription(uid: string): Promise<MutationResult> {
  const db = adminDb();
  if (!db) return { ok: false, error: "Server billing is not configured." };
  const ref = db.collection("subscriptions").doc(uid);
  const existing = await ref.get();
  if (!existing.exists) return { ok: false, error: "Unknown subscription." };
  const doc = existing.data() as SubscriptionDoc;
  const patch: SubscriptionDoc = {
    subscription_status: "expired",
    status: "expired",
    cancel_at_period_end: false,
    updatedAt: nowIso(),
  };
  await ref.set(patch, { merge: true });
  await syncBusinessPlan(db, uid, "starter");
  return { ok: true, entitlement: entitlementFrom({ ...doc, ...patch }) };
}

/**
 * Consume ONE lead opportunity (spec §48) — the heart of plan-based lead limits.
 *
 * Runs in a Firestore transaction so two simultaneous lead matches can never push
 * a seller past their allowance. Also rolls the counter over when the paid period
 * has lapsed, which is what makes "reset according to subscription billing period"
 * true without a cron job.
 *
 * Returns `limit` (not an exception) when the allowance is exhausted, so callers
 * can show the upgrade prompt required by spec §59 rather than silently dropping
 * the lead.
 */
export async function consumeLeadOpportunity(uid: string): Promise<
  | { ok: true; entitlement: Entitlement }
  | { ok: false; reason: "limit" | "not-entitled" | "no-subscription"; entitlement: Entitlement | null }
> {
  const db = adminDb();
  if (!db) return { ok: false, reason: "no-subscription", entitlement: null };

  const ref = db.collection("subscriptions").doc(uid);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: false as const, reason: "no-subscription" as const, entitlement: null };

    const doc = snap.data() as SubscriptionDoc;
    const ent = entitlementFrom(doc);

    if (!ent.entitled) return { ok: false as const, reason: "not-entitled" as const, entitlement: ent };

    // Period rollover: a fresh period gets a fresh allowance.
    const key = periodKey(ent.periodEnd);
    let used = ent.leadsUsed;
    const rolledOver = doc.leads_period_key !== key;
    if (rolledOver) used = 0;

    const limit = ent.leadLimit;
    if (limit !== null && used >= limit) {
      // Persist the rollover even when we reject, so next call is accurate.
      if (rolledOver) {
        tx.set(ref, { leads_used: used, leads_period_key: key, updatedAt: nowIso() }, { merge: true });
      }
      return { ok: false as const, reason: "limit" as const, entitlement: { ...ent, leadsUsed: used } };
    }

    const nextUsed = used + 1;
    tx.set(ref, { leads_used: nextUsed, leads_period_key: key, updatedAt: nowIso() }, { merge: true });

    return { ok: true as const, entitlement: { ...ent, leadsUsed: nextUsed, leadsRemaining: limit === null ? null : Math.max(0, limit - nextUsed) } };
  });
}
