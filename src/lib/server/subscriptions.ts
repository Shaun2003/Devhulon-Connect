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
 *   plan                  PlanId   "starter" | "premium"
 *   subscription_status   string   active | past_due | canceled | expired
 *   billing_period        string   monthly | annual
 *   trial_started_at      string   legacy trial metadata
 *   trial_ends_at         string   legacy trial metadata
 *   trial_used            boolean  legacy trial metadata
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
  auto_renew?: boolean;
  next_renewal_at?: string | null;
  renewal_attempts?: number;
  renewal_lock_until?: string | null;
  renewal_attempt_reference?: string | null;
  payment_reference?: string | null;
  renewal_amount_cents?: number | null;
  auto_renew_error?: string | null;
  included_credits_next_at?: string | null;
  included_credits_plan?: PlanId;
  included_credits_anchor_day?: number;
  starter_credits_granted?: boolean;
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

export async function syncBusinessPlan(db: Firestore, uid: string, planId: PlanId): Promise<void> {
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
  const storedPlan = normalizePlanId(doc?.plan ?? null);
  const billingPeriod: BillingPeriod = doc?.billing_period === "annual" ? "annual" : "monthly";
  const periodEnd = doc?.current_period_end ?? null;
  const normalizedStatus = normalizeStatus(doc?.subscription_status ?? doc?.status, storedPlan, periodEnd);
  const status = normalizedStatus === "canceled"
    && doc?.cancel_at_period_end === true
    && Boolean(periodEnd && Date.parse(periodEnd) > Date.now())
    ? "active"
    : normalizedStatus;

  const paidEntitled =
    storedPlan === "premium" &&
    (status === "active" || status === "trialing" || status === "past_due") &&
    (!periodEnd || new Date(periodEnd).getTime() > Date.now());
  const plan: PlanId = paidEntitled ? "premium" : "starter";
  const isTrial = paidEntitled && status === "trialing";
  const trialDaysLeft = isTrial ? daysUntil(doc?.trial_ends_at ?? periodEnd) : 0;
  const entitled = plan === "starter" || paidEntitled;

  const leadLimit = plan === "starter"
    ? limitsFor("starter").leadsPerMonth
    : typeof doc?.lead_limit === "number" ? doc.lead_limit : limitsFor(plan).leadsPerMonth;
  const leadsUsed = plan === storedPlan && typeof doc?.leads_used === "number" ? doc.leads_used : 0;
  const leadsRemaining = leadLimit === null ? null : Math.max(0, leadLimit - leadsUsed);

  return {
    plan,
    status: plan === "starter" ? "active" : status,
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

/**
 * Activate the permanent free Starter tier without a payment checkout.
 * The initial allocation is idempotent and existing legacy wallet balances are
 * preserved as purchased credits during the source split.
 */
export async function activateStarter(uid: string): Promise<MutationResult> {
  const db = adminDb();
  if (!db) return { ok: false, error: "Server billing is not configured." };
  await loadPlanConfig();

  const subscriptionRef = db.collection("subscriptions").doc(uid);
  const walletRef = db.collection("wallets").doc(uid);
  const now = new Date();
  const start = now.toISOString();
  const anchorDay = now.getUTCDate();
  const nextCreditAt = nextMonthlyCreditAt(now, anchorDay);
  const monthKey = start.slice(0, 10).replace(/-/g, "");
  const ledgerRef = db.collection("credit_ledger").doc(`starter_initial_${uid}_${monthKey}`);

  const result = await db.runTransaction(async (tx) => {
    const [subSnap, walletSnap, ledgerSnap] = await Promise.all([
      tx.get(subscriptionRef),
      tx.get(walletRef),
      tx.get(ledgerRef),
    ]);
    const existing = (subSnap.data() as SubscriptionDoc | undefined) ?? null;
    const existingEntitlement = entitlementFrom(existing);
    if (existingEntitlement.plan === "premium" && existingEntitlement.entitled) {
      return { ok: true as const, entitlement: existingEntitlement };
    }

    const wallet = (walletSnap.data() as {
      balance?: number;
      subscriptionBalance?: number;
      purchasedBalance?: number;
      subscriptionExpiresAt?: string | null;
      lifetimeEarned?: number;
      lifetimeSpent?: number;
      createdAt?: string;
    } | undefined) ?? {};
    const purchasedBalance = typeof wallet.purchasedBalance === "number"
      ? wallet.purchasedBalance
      : wallet.balance ?? 0;
    const subscriptionBalance = typeof wallet.subscriptionBalance === "number"
      ? wallet.subscriptionBalance
      : 0;
    const initialGranted = existing?.starter_credits_granted === true || ledgerSnap.exists;
    const nextSubscriptionBalance = initialGranted ? subscriptionBalance : 35;
    const totalBalance = purchasedBalance + nextSubscriptionBalance;
    const patch: SubscriptionDoc & { starter_credits_granted: boolean } = {
      ownerUid: uid,
      plan: "starter",
      subscription_status: "active",
      status: "active",
      billing_period: "monthly",
      current_period_start: existing?.current_period_start ?? start,
      current_period_end: existing?.current_period_end && Date.parse(existing.current_period_end) > now.getTime()
        ? existing.current_period_end
        : nextCreditAt,
      current_period_end_at: periodEndTimestamp(
        existing?.current_period_end && Date.parse(existing.current_period_end) > now.getTime()
          ? existing.current_period_end
          : nextCreditAt
      ) ?? undefined,
      lead_limit: 3,
      leads_used: existingEntitlement.plan === "starter" ? existing?.leads_used ?? 0 : 0,
      leads_period_key: existing?.leads_period_key ?? periodKey(nextCreditAt),
      provider: "none",
      provider_ref: null,
      cancel_at_period_end: false,
      auto_renew: false,
      next_renewal_at: null,
      renewal_attempts: 0,
      renewal_lock_until: null,
      renewal_attempt_reference: null,
      payment_reference: null,
      renewal_amount_cents: null,
      auto_renew_error: null,
      included_credits_next_at: existing?.included_credits_next_at &&
        Date.parse(existing.included_credits_next_at) > now.getTime()
        ? existing.included_credits_next_at
        : nextCreditAt,
      included_credits_plan: "starter",
      included_credits_anchor_day: existing?.included_credits_anchor_day ?? anchorDay,
      starter_credits_granted: true,
      trial_started_at: existing?.trial_started_at ?? null,
      trial_ends_at: existing?.trial_ends_at ?? null,
      trial_used: existing?.trial_used ?? false,
      createdAt: existing?.createdAt ?? start,
      updatedAt: start,
    };
    tx.set(subscriptionRef, patch, { merge: true });

    if (!initialGranted) {
      tx.set(walletRef, {
        ownerUid: uid,
        balance: totalBalance,
        subscriptionBalance: nextSubscriptionBalance,
        purchasedBalance,
        subscriptionExpiresAt: nextCreditAt,
        lifetimeEarned: (wallet.lifetimeEarned ?? 0) + 35,
        lifetimeSpent: wallet.lifetimeSpent ?? 0,
        createdAt: wallet.createdAt ?? start,
        updatedAt: start,
      });
      tx.set(ledgerRef, {
        id: ledgerRef.id,
        ownerUid: uid,
        type: "bonus",
        amount: 35,
        balanceAfter: totalBalance,
        planId: "starter",
        reference: `starter-initial:${uid}:${monthKey}`,
        note: "Starter monthly credits",
        createdAt: start,
      });
    } else if (walletSnap.exists && wallet.subscriptionBalance === undefined) {
      tx.set(walletRef, {
        subscriptionBalance,
        purchasedBalance,
        balance: totalBalance,
        subscriptionExpiresAt: nextCreditAt,
        updatedAt: start,
      }, { merge: true });
    }

    return { ok: true as const, entitlement: entitlementFrom(patch) };
  });

  if (result.ok && result.entitlement.plan === "starter") {
    await db.collection("billing_methods").doc(uid).delete();
    await syncBusinessPlan(db, uid, "starter");
  }
  return result;
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

export { periodDays, addDaysIso, nowIso };

/** Result shape shared by every mutation so route handlers can respond uniformly. */
export type MutationResult =
  | { ok: true; entitlement: Entitlement }
  | { ok: false; error: string; entitlement?: Entitlement };

/** Period key used to detect month rollover for the lead counter. */
const periodKey = (periodEnd: string | null | undefined) =>
  periodEnd ? periodEnd.slice(0, 10) : null;

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
  const end = input.period === "monthly"
    ? nextMonthlyCreditAt(new Date(start), new Date(start).getUTCDate())
    : addDaysIso(periodDays(input.period), new Date(start));
  const result = await db.runTransaction(async (tx) => {
    const [subSnap, paymentSnap] = await Promise.all([tx.get(ref), tx.get(paymentRef)]);
    if (!paymentSnap.exists) return { ok: false as const, error: "Payment record not found." };

    const payment = paymentSnap.data() as {
      ownerUid?: string;
      planId?: string;
      period?: string;
      kind?: string;
      status?: string;
      autoRenew?: boolean;
      amountCents?: number;
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
    const creditAnchorDay = new Date(start).getUTCDate();
    const walletSnap = await tx.get(walletRef);

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
      leads_used: planChanged || payment.kind === "renewal" ? 0 : (doc?.leads_used ?? 0),
      leads_period_key: periodKey(end),
      provider: input.provider,
      provider_ref: input.providerRef ?? doc?.provider_ref ?? null,
      cancel_at_period_end: false,
      auto_renew: payment.kind === "renewal" ? doc?.auto_renew === true : payment.autoRenew === true,
      next_renewal_at: payment.kind === "renewal" || payment.autoRenew === true ? end : null,
      renewal_attempts: 0,
      renewal_lock_until: null,
      renewal_attempt_reference: null,
      payment_reference: input.paymentReference,
      renewal_amount_cents: payment.kind === "renewal"
        ? doc?.renewal_amount_cents ?? payment.amountCents ?? null
        : payment.autoRenew === true ? payment.amountCents ?? null : null,
      auto_renew_error: null,
      trial_started_at: doc?.trial_started_at ?? null,
      trial_ends_at: doc?.trial_ends_at ?? null,
      trial_used: doc?.trial_used ?? false,
      included_credits_next_at: input.period === "annual"
        ? nextMonthlyCreditAt(new Date(start), creditAnchorDay)
        : null,
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

    if (walletSnap) {
      const wallet = (walletSnap.data() as {
        ownerUid?: string;
        balance?: number;
        subscriptionBalance?: number;
        purchasedBalance?: number;
        subscriptionExpiresAt?: string | null;
        lifetimeEarned?: number;
        lifetimeSpent?: number;
        createdAt?: string;
      } | undefined) ?? {};
      const purchasedBalance = typeof wallet.purchasedBalance === "number"
        ? wallet.purchasedBalance
        : wallet.balance ?? 0;
      const balance = purchasedBalance + plan.includedCredits;
      tx.set(walletRef, {
        ownerUid: input.uid,
        balance,
        subscriptionBalance: plan.includedCredits,
        purchasedBalance,
        subscriptionExpiresAt: input.period === "annual"
          ? nextMonthlyCreditAt(new Date(start), creditAnchorDay)
          : end,
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
        note: `${plan.name} included credits for confirmed payment`,
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
        auto_renew: false,
        next_renewal_at: null,
        current_period_end: now,
        current_period_end_at: periodEndTimestamp(now) ?? undefined,
        updatedAt: now,
      }
    : {
        subscription_status: "canceled",
        status: "canceled",
        cancel_at_period_end: true, // keeps access until current_period_end
        auto_renew: false,
        next_renewal_at: null,
        current_period_end_at: periodEndTimestamp(doc.current_period_end) ?? undefined,
        updatedAt: now,
      };

  await ref.set(patch, { merge: true });
  await db.collection("billing_methods").doc(uid).delete();
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
export async function consumeLeadOpportunity(uid: string, requestId: string): Promise<
  | { ok: true; entitlement: Entitlement; already?: boolean }
  | { ok: false; reason: "limit" | "not-entitled" | "no-subscription"; entitlement: Entitlement | null }
> {
  const db = adminDb();
  if (!db) return { ok: false, reason: "no-subscription", entitlement: null };
  if (!requestId || requestId.includes("/")) {
    return { ok: false, reason: "not-entitled", entitlement: null };
  }

  const ref = db.collection("subscriptions").doc(uid);
  const allocationRef = db.collection("lead_allocations").doc(`${uid}_${requestId}`);

  return db.runTransaction(async (tx) => {
    const [snap, allocationSnap] = await Promise.all([tx.get(ref), tx.get(allocationRef)]);
    if (!snap.exists) return { ok: false as const, reason: "no-subscription" as const, entitlement: null };

    const doc = snap.data() as SubscriptionDoc;
    const ent = entitlementFrom(doc);

    if (!ent.entitled) return { ok: false as const, reason: "not-entitled" as const, entitlement: ent };
    if (allocationSnap.exists) return { ok: true as const, entitlement: ent, already: true };

    let periodEnd = ent.periodEnd;
    let periodStart = doc.current_period_start ?? nowIso();
    if (ent.plan === "starter" && (!periodEnd || Date.parse(periodEnd) <= Date.now())) {
      const anchorDay = doc.included_credits_anchor_day ?? new Date(periodStart).getUTCDate();
      let nextEnd = periodEnd && Number.isFinite(Date.parse(periodEnd))
        ? periodEnd
        : nowIso();
      while (Date.parse(nextEnd) <= Date.now()) {
        periodStart = nextEnd;
        nextEnd = nextMonthlyCreditAt(new Date(nextEnd), anchorDay);
      }
      periodEnd = nextEnd;
    }

    // Period rollover gives Starter a fresh opportunity allowance once per
    // monthly allocation period; Premium has no fixed opportunity limit.
    const key = periodKey(periodEnd);
    let used = ent.leadsUsed;
    const rolledOver = doc.leads_period_key !== key;
    if (rolledOver) used = 0;

    const limit = ent.leadLimit;
    if (limit !== null && used >= limit) {
      // Persist the rollover even when we reject, so next call is accurate.
      if (rolledOver) {
        tx.set(ref, {
          leads_used: used,
          leads_period_key: key,
          ...(ent.plan === "starter" ? {
            current_period_start: periodStart,
            current_period_end: periodEnd,
            current_period_end_at: periodEnd ? periodEndTimestamp(periodEnd) : null,
            included_credits_next_at: periodEnd,
          } : {}),
          updatedAt: nowIso(),
        }, { merge: true });
      }
      return { ok: false as const, reason: "limit" as const, entitlement: { ...ent, leadsUsed: used } };
    }

    const nextUsed = used + 1;
    const allocatedAt = nowIso();
    tx.set(ref, {
      leads_used: nextUsed,
      leads_period_key: key,
      ...(ent.plan === "starter" && doc.leads_period_key !== key ? {
        current_period_start: periodStart,
        current_period_end: periodEnd,
        current_period_end_at: periodEnd ? periodEndTimestamp(periodEnd) : null,
        included_credits_next_at: periodEnd,
      } : {}),
      updatedAt: allocatedAt,
    }, { merge: true });
    tx.create(allocationRef, {
      ownerUid: uid,
      requestId,
      plan: ent.plan,
      periodEnd,
      allocationType: "matched",
      status: "allocated",
      createdAt: allocatedAt,
    });

    return { ok: true as const, entitlement: { ...ent, leadsUsed: nextUsed, leadsRemaining: limit === null ? null : Math.max(0, limit - nextUsed) } };
  });
}

/** Return a reserved opportunity only when its lead was not delivered. */
export async function releaseLeadOpportunity(uid: string, requestId: string): Promise<void> {
  const db = adminDb();
  if (!db) throw new Error("Server storage is not configured.");
  const subscriptionRef = db.collection("subscriptions").doc(uid);
  const allocationRef = db.collection("lead_allocations").doc(`${uid}_${requestId}`);
  await db.runTransaction(async (tx) => {
    const [subscriptionSnap, allocationSnap] = await Promise.all([
      tx.get(subscriptionRef),
      tx.get(allocationRef),
    ]);
    if (!subscriptionSnap.exists || !allocationSnap.exists) return;
    const allocation = allocationSnap.data() as { status?: string; periodEnd?: string | null };
    if (allocation.status !== "allocated") return;
    const subscription = subscriptionSnap.data() as SubscriptionDoc;
    const samePeriod = subscription.leads_period_key === periodKey(allocation.periodEnd);
    tx.delete(allocationRef);
    if (samePeriod) {
      tx.set(subscriptionRef, {
        leads_used: Math.max(0, (subscription.leads_used ?? 0) - 1),
        updatedAt: nowIso(),
      }, { merge: true });
    }
  });
}
