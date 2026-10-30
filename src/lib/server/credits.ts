/**
 * Credit wallet service â€” TRUSTED SERVER ONLY (Admin SDK).
 *
 * This is the authoritative half of the pay-per-contact model. The browser may
 * READ its own wallet and the (contact-stripped) lead feed, but every balance
 * change happens here, in a Firestore transaction, from a verified ID token â€”
 * never from a credit price, wallet balance or seller role sent by the client.
 *
 * Collections (all server-write-only in firestore.rules):
 *   wallets/{uid}            balance + lifetime totals
 *   credit_ledger/{id}       one immutable row per earn/spend (the audit trail)
 *   lead_unlocks/{uid}_{requestId}  idempotency guard: a request is charged at most once
 *
 * The unlock sequence below is the exact order the marketplace spec requires:
 *   1. authenticate the seller (done by the route via the ID token) & verify active
 *   2. verify the lead exists, is eligible, and isn't already unlocked by them
 *   3. read the lead's credit price from TRUSTED server data (recomputed here)
 *   4. check the seller's available balance
 *   5. atomically deduct the credits and write a ledger row
 *   6. record the unlock so it cannot be charged twice
 *   7. unlock the contact details and create the conversation
 *   8. notify the buyer
 *
 * Steps 5â€“6 run inside ONE transaction, so two simultaneous clicks can never
 * double-spend. The deterministic `lead_unlocks/{uid}_{requestId}` id makes the
 * whole operation idempotent: a duplicate request finds the guard already set
 * and returns the same result without deducting again.
 */

import { adminDb } from "./admin";
import { nextMonthlyCreditAt } from "@/lib/credit-schedule";
import { conversationId } from "@/lib/messages";
import { activateStarter, entitlementFrom, readSubscription, syncBusinessPlan } from "./subscriptions";
import { grantContact } from "./contact-grants";
import { Timestamp, type Firestore, type Query } from "firebase-admin/firestore";
import { creditPriceFor, getCreditPack, tierForLead, LEAD_TIER_CREDITS, type CreditPack } from "@/lib/credits";
import { getPlan, normalizePlanId } from "@/lib/plans";
import { purchasedCreditRefundDelta } from "@/lib/billing-policy";

const nowIso = () => new Date().toISOString();

export type WalletDoc = {
  ownerUid: string;
  balance: number;
  subscriptionBalance?: number;
  purchasedBalance?: number;
  subscriptionExpiresAt?: string | null;
  lifetimeEarned: number;
  lifetimeSpent: number;
  updatedAt?: string;
  createdAt?: string;
};

/** Deterministic unlock-guard id — the linchpin of "charge at most once". */
const unlockId = (uid: string, leadId: string) => `${uid}_${leadId}`;

/** Read a wallet, or null when the seller has never bought credits. */
export async function readWallet(uid: string): Promise<WalletDoc | null> {
  const db = adminDb();
  if (!db) return null;
  const snap = await db.collection("wallets").doc(uid).get();
  return snap.exists ? (snap.data() as WalletDoc) : null;
}

/** Current balance, defaulting to 0 for a brand-new seller. */
export async function getBalance(uid: string): Promise<number> {
  const w = await readWallet(uid);
  return w?.balance ?? 0;
}

/**
 * Grant credits for a purchased pack. Called by the billing webhook AFTER a
 * payment is confirmed â€” never from the client.
 *
 * Idempotent by `reference`: the ledger already contains a `purchase` row with
 * that reference, so a provider retry (webhooks are delivered at-least-once)
 * cannot grant the same pack twice. This is the same at-least-once defence the
 * subscription webhook uses for plan activation.
 */
export async function grantCreditsForPurchase(
  uid: string,
  packId: string,
  reference: string
): Promise<{ ok: boolean; balance?: number; error?: string; already?: boolean }> {
  const db = adminDb();
  if (!db) return { ok: false, error: "Server storage is not configured." };

  const pack = getCreditPack(packId) as CreditPack | undefined;
  if (!pack) return { ok: false, error: "Unknown credit pack." };
  if (!uid) return { ok: false, error: "Missing the buyer of the credits." };

  const walletRef = db.collection("wallets").doc(uid);
  // Deterministic ledger id per payment reference â€” the idempotency key.
  const ledgerId = `purchase_${reference}`;
  const ledgerRef = db.collection("credit_ledger").doc(ledgerId);

  return db.runTransaction(async (tx) => {
    const existingLedger = await tx.get(ledgerRef);
    if (existingLedger.exists) {
      const w = await tx.get(walletRef);
      return { ok: true as const, already: true, balance: (w.data() as WalletDoc | undefined)?.balance ?? 0 };
    }

    const wSnap = await tx.get(walletRef);
    const w = (wSnap.data() as WalletDoc | undefined) ?? {
      ownerUid: uid,
      balance: 0,
      subscriptionBalance: 0,
      purchasedBalance: 0,
      lifetimeEarned: 0,
      lifetimeSpent: 0,
      createdAt: nowIso(),
    };
    const purchasedBalance = typeof w.purchasedBalance === "number"
      ? w.purchasedBalance
      : w.balance ?? 0;
    const subscriptionBalance = w.subscriptionBalance ?? 0;
    const balance = subscriptionBalance + purchasedBalance + pack.credits;

    tx.set(walletRef, {
      ownerUid: uid,
      balance,
      subscriptionBalance,
      purchasedBalance: purchasedBalance + pack.credits,
      subscriptionExpiresAt: w.subscriptionExpiresAt ?? null,
      lifetimeEarned: (w.lifetimeEarned ?? 0) + pack.credits,
      lifetimeSpent: w.lifetimeSpent ?? 0,
      createdAt: w.createdAt ?? nowIso(),
      updatedAt: nowIso(),
    });

    tx.set(ledgerRef, {
      id: ledgerId,
      ownerUid: uid,
      type: "purchase",
      amount: pack.credits,
      balanceAfter: balance,
      packId: pack.id,
      reference,
      note: `${pack.name} â€” ${pack.credits} credits`,
      createdAt: nowIso(),
    });

    return { ok: true as const, balance };
  });
}

/** Revoke the unspent portion of a refunded purchase, exactly once. */
export async function reversePurchasedCredits(
  uid: string,
  reference: string,
  purchasedCredits: number
): Promise<{ revoked: number; shortfall: number }> {
  const db = adminDb();
  if (!db) throw new Error("Server storage is not configured.");
  const walletRef = db.collection("wallets").doc(uid);
  const ledgerRef = db.collection("credit_ledger").doc(`refund_${reference}`);
  return db.runTransaction(async (tx) => {
    const [existingLedger, walletSnap] = await Promise.all([
      tx.get(ledgerRef),
      tx.get(walletRef),
    ]);
    if (existingLedger.exists) {
      const ledger = existingLedger.data() ?? {};
      return {
        revoked: Number(ledger.revokedCredits ?? 0),
        shortfall: Number(ledger.shortfallCredits ?? 0),
      };
    }

    const wallet = (walletSnap.data() as WalletDoc | undefined) ?? {
      ownerUid: uid,
      balance: 0,
      subscriptionBalance: 0,
      purchasedBalance: 0,
      lifetimeEarned: 0,
      lifetimeSpent: 0,
    };
    const purchasedBalance = typeof wallet.purchasedBalance === "number"
      ? wallet.purchasedBalance
      : wallet.balance ?? 0;
    const includedIsCurrent = !wallet.subscriptionExpiresAt ||
      !Number.isFinite(Date.parse(wallet.subscriptionExpiresAt)) ||
      Date.parse(wallet.subscriptionExpiresAt) > Date.now();
    const subscriptionBalance = includedIsCurrent ? wallet.subscriptionBalance ?? 0 : 0;
    const { revoked, shortfall } = purchasedCreditRefundDelta(purchasedCredits, purchasedBalance);
    const nextPurchasedBalance = purchasedBalance - revoked;
    const balance = nextPurchasedBalance + subscriptionBalance;
    tx.set(walletRef, {
      ownerUid: uid,
      balance,
      purchasedBalance: nextPurchasedBalance,
      subscriptionBalance,
      subscriptionExpiresAt: wallet.subscriptionExpiresAt ?? null,
      lifetimeEarned: wallet.lifetimeEarned ?? 0,
      lifetimeSpent: wallet.lifetimeSpent ?? 0,
      createdAt: wallet.createdAt ?? nowIso(),
      updatedAt: nowIso(),
    }, { merge: true });
    tx.create(ledgerRef, {
      id: ledgerRef.id,
      ownerUid: uid,
      type: "refund",
      amount: -revoked,
      revokedCredits: revoked,
      shortfallCredits: shortfall,
      balanceAfter: balance,
      reference,
      note: `Refund: revoked ${revoked} unspent purchased credits`,
      createdAt: nowIso(),
    });
    return { revoked, shortfall };
  });
}

/** Revoke unused included credits and downgrade only the currently refunded period. */
export async function reverseSubscriptionCredits(
  uid: string,
  reference: string
): Promise<{ revoked: number; currentPeriod: boolean }> {
  const db = adminDb();
  if (!db) throw new Error("Server storage is not configured.");
  const subscriptionRef = db.collection("subscriptions").doc(uid);
  const walletRef = db.collection("wallets").doc(uid);
  const ledgerRef = db.collection("credit_ledger").doc(`refund_${reference}`);
  const outcome = await db.runTransaction(async (tx) => {
    const [existingLedger, subscriptionSnap, walletSnap] = await Promise.all([
      tx.get(ledgerRef),
      tx.get(subscriptionRef),
      tx.get(walletRef),
    ]);
    if (existingLedger.exists) {
      return {
        revoked: Number(existingLedger.data()?.revokedCredits ?? 0),
        currentPeriod: existingLedger.data()?.currentPeriod === true,
      };
    }

    const subscription = subscriptionSnap.data() ?? {};
    const currentPeriod = subscription.payment_reference === reference;
    const wallet = (walletSnap.data() as WalletDoc | undefined) ?? {
      ownerUid: uid,
      balance: 0,
      subscriptionBalance: 0,
      purchasedBalance: 0,
      lifetimeEarned: 0,
      lifetimeSpent: 0,
    };
    const purchasedBalance = typeof wallet.purchasedBalance === "number"
      ? wallet.purchasedBalance
      : wallet.balance ?? 0;
    const revoked = currentPeriod ? Math.max(0, wallet.subscriptionBalance ?? 0) : 0;
    const nextPurchasedBalance = purchasedBalance;
    const balance = nextPurchasedBalance;
    if (currentPeriod) {
      tx.set(subscriptionRef, {
        subscription_status: "canceled",
        status: "canceled",
        cancel_at_period_end: false,
        auto_renew: false,
        next_renewal_at: null,
        current_period_end: nowIso(),
        current_period_end_at: Timestamp.fromDate(new Date()),
        updatedAt: nowIso(),
      }, { merge: true });
      tx.set(walletRef, {
        ownerUid: uid,
        balance,
        subscriptionBalance: 0,
        purchasedBalance: nextPurchasedBalance,
        subscriptionExpiresAt: nowIso(),
        lifetimeEarned: wallet.lifetimeEarned ?? 0,
        lifetimeSpent: wallet.lifetimeSpent ?? 0,
        createdAt: wallet.createdAt ?? nowIso(),
        updatedAt: nowIso(),
      }, { merge: true });
    }
    tx.create(ledgerRef, {
      id: ledgerRef.id,
      ownerUid: uid,
      type: "refund",
      amount: -revoked,
      revokedCredits: revoked,
      shortfallCredits: 0,
      currentPeriod,
      balanceAfter: balance,
      reference,
      note: currentPeriod
        ? `Refund: revoked ${revoked} unused subscription credits`
        : "Refund for a non-current subscription payment",
      createdAt: nowIso(),
    });
    return { revoked, currentPeriod };
  });

  if (outcome.currentPeriod) {
    await db.collection("billing_methods").doc(uid).delete();
    await syncBusinessPlan(db, uid, "starter");
  }
  return outcome;
}

/**
 * Replenish monthly plan credits for currently entitled sellers.
 *
 * The grant date is stored on the subscription and advanced transactionally with
 * the wallet + ledger write. Both the schedule and deterministic ledger id make
 * concurrent/retried cron runs safe.
 */
export async function grantDuePlanCredits(now: Date = new Date(), batchSize = 200): Promise<{
  scanned: number;
  granted: number;
  downgraded: number;
  skipped: number;
  errors: string[];
}> {
  const db = adminDb();
  if (!db) throw new Error("Server storage is not configured.");
  const nowIsoValue = now.toISOString();
  const due = await db.collection("subscriptions")
    .where("included_credits_next_at", "<=", nowIsoValue)
    .limit(Math.min(Math.max(1, Math.floor(batchSize)), 500))
    .get();
  let granted = 0;
  let downgraded = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const candidate of due.docs) {
    try {
      const result = await db.runTransaction(async (tx) => {
        const subSnap = await tx.get(candidate.ref);
        if (!subSnap.exists) return "skipped" as const;
        const subscription = subSnap.data() as {
          plan?: string;
          subscription_status?: string;
          status?: string;
          current_period_end?: string | null;
          current_period_start?: string | null;
          billing_period?: string;
          included_credits_next_at?: string | null;
          included_credits_anchor_day?: number;
        };
        const scheduledAt = subscription.included_credits_next_at;
        if (typeof scheduledAt !== "string" || !Number.isFinite(Date.parse(scheduledAt))) {
          throw new Error(`Subscription ${candidate.id} has an invalid included-credit schedule.`);
        }
        if (Date.parse(scheduledAt) > now.getTime()) return "skipped" as const;

        const entitlement = entitlementFrom(subscription);
        const storedPlanId = normalizePlanId(subscription.plan);
        const eligible = entitlement.entitled && entitlement.plan === storedPlanId &&
          (storedPlanId === "starter" || subscription.billing_period === "annual");
        if (!eligible) {
          tx.set(candidate.ref, { included_credits_next_at: null, updatedAt: nowIsoValue }, { merge: true });
          return "skipped" as const;
        }

        const planId = storedPlanId;
        const plan = getPlan(planId);
        if (!plan) throw new Error(`Plan configuration is missing for ${candidate.id}.`);

        const anchorDay = subscription.included_credits_anchor_day ?? new Date(scheduledAt).getUTCDate();
        let allocationAt = scheduledAt;
        let nextGrant = nextMonthlyCreditAt(new Date(allocationAt), anchorDay);
        while (Date.parse(nextGrant) <= now.getTime()) {
          allocationAt = nextGrant;
          nextGrant = nextMonthlyCreditAt(new Date(allocationAt), anchorDay);
        }

        const monthKey = allocationAt.slice(0, 10).replace(/-/g, "");
        const ledgerRef = db.collection("credit_ledger").doc(`plan_monthly_${candidate.id}_${monthKey}`);
        const walletRef = db.collection("wallets").doc(candidate.id);
        const [ledgerSnap, walletSnap] = await Promise.all([tx.get(ledgerRef), tx.get(walletRef)]);
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

        if (!ledgerSnap.exists) {
          const purchasedBalance = typeof wallet.purchasedBalance === "number"
            ? wallet.purchasedBalance
            : wallet.balance ?? 0;
          const balance = purchasedBalance + plan.includedCredits;
          tx.set(walletRef, {
            ownerUid: candidate.id,
            balance,
            subscriptionBalance: plan.includedCredits,
            purchasedBalance,
            subscriptionExpiresAt: nextGrant,
            lifetimeEarned: (wallet.lifetimeEarned ?? 0) + plan.includedCredits,
            lifetimeSpent: wallet.lifetimeSpent ?? 0,
            createdAt: wallet.createdAt ?? nowIsoValue,
            updatedAt: nowIsoValue,
          });
          tx.set(ledgerRef, {
            id: ledgerRef.id,
            ownerUid: candidate.id,
            type: "bonus",
            amount: plan.includedCredits,
            balanceAfter: balance,
            planId,
            reference: `monthly:${candidate.id}:${allocationAt}`,
            note: `${plan.name} monthly allocation; previous included credits expired`,
            createdAt: nowIsoValue,
          });
        }

        tx.set(candidate.ref, {
          included_credits_next_at: nextGrant,
          included_credits_plan: planId,
          ...(planId === "starter" ? {
            current_period_start: allocationAt,
            current_period_end: nextGrant,
            current_period_end_at: Timestamp.fromDate(new Date(nextGrant)),
            leads_used: 0,
            leads_period_key: nextGrant.slice(0, 10),
          } : {}),
          updatedAt: nowIsoValue,
        }, { merge: true });
        return ledgerSnap.exists ? "skipped" as const : "granted" as const;
      });
      if (result === "granted") granted++;
      else skipped++;
    } catch (error) {
      errors.push(`${candidate.id}: ${error instanceof Error ? error.message : "Unknown credit grant error."}`);
    }
  }

  const expired = await db.collection("subscriptions")
    .where("current_period_end", "<=", nowIsoValue)
    .limit(Math.min(Math.max(1, Math.floor(batchSize)), 500))
    .get();
  for (const candidate of expired.docs) {
    try {
      const result = await db.runTransaction(async (tx) => {
        const subSnap = await tx.get(candidate.ref);
        if (!subSnap.exists) return null;
        const subscription = subSnap.data() as {
          plan?: string;
          subscription_status?: string;
          status?: string;
          current_period_end?: string | null;
          included_credits_anchor_day?: number;
          trial_used?: boolean;
          renewal_attempt_reference?: string | null;
        };
        if (normalizePlanId(subscription.plan) !== "premium" ||
            !subscription.current_period_end ||
            Date.parse(subscription.current_period_end) > now.getTime()) return null;
        if (typeof subscription.renewal_attempt_reference === "string" && subscription.renewal_attempt_reference) {
          const renewalPayment = await tx.get(
            db.collection("payments").doc(subscription.renewal_attempt_reference)
          );
          if (renewalPayment.data()?.status === "pending") return null;
        }

        const walletRef = db.collection("wallets").doc(candidate.id);
        const monthKey = nowIsoValue.slice(0, 10).replace(/-/g, "");
        const ledgerRef = db.collection("credit_ledger").doc(`starter_downgrade_${candidate.id}_${monthKey}`);
        const [walletSnap, ledgerSnap] = await Promise.all([tx.get(walletRef), tx.get(ledgerRef)]);
        const wallet = (walletSnap.data() as {
          balance?: number;
          subscriptionBalance?: number;
          purchasedBalance?: number;
          lifetimeEarned?: number;
          lifetimeSpent?: number;
          createdAt?: string;
        } | undefined) ?? {};
        const purchasedBalance = typeof wallet.purchasedBalance === "number"
          ? wallet.purchasedBalance
          : wallet.balance ?? 0;
        const nextGrant = nextMonthlyCreditAt(now, now.getUTCDate());
        const balance = purchasedBalance + 35;
        tx.set(candidate.ref, {
          plan: "starter",
          subscription_status: "active",
          status: "active",
          billing_period: "monthly",
          current_period_start: nowIsoValue,
          current_period_end: nextGrant,
          current_period_end_at: Timestamp.fromDate(new Date(nextGrant)),
          lead_limit: 3,
          leads_used: 0,
          leads_period_key: nextGrant.slice(0, 10),
          provider: "none",
          provider_ref: null,
          cancel_at_period_end: false,
          included_credits_next_at: nextGrant,
          included_credits_plan: "starter",
          included_credits_anchor_day: now.getUTCDate(),
          starter_credits_granted: true,
          updatedAt: nowIsoValue,
        }, { merge: true });
        if (!ledgerSnap.exists) {
          tx.set(walletRef, {
            ownerUid: candidate.id,
            balance,
            subscriptionBalance: 35,
            purchasedBalance,
            subscriptionExpiresAt: nextGrant,
            lifetimeEarned: (wallet.lifetimeEarned ?? 0) + 35,
            lifetimeSpent: wallet.lifetimeSpent ?? 0,
            createdAt: wallet.createdAt ?? nowIsoValue,
            updatedAt: nowIsoValue,
          });
          tx.set(ledgerRef, {
            id: ledgerRef.id,
            ownerUid: candidate.id,
            type: "bonus",
            amount: 35,
            balanceAfter: balance,
            planId: "starter",
            reference: `downgrade:${candidate.id}:${monthKey}`,
            note: "Starter credits granted after Premium access expired",
            createdAt: nowIsoValue,
          });
        }
        return candidate.id;
      });
      if (result) {
        downgraded++;
        await syncBusinessPlan(db, candidate.id, "starter");
      }
    } catch (error) {
      errors.push(`${candidate.id}: ${error instanceof Error ? error.message : "Unknown downgrade error."}`);
    }
  }

  return { scanned: due.size + expired.size, granted, downgraded, skipped, errors };
}

/**
 * Unlock a lead's contact details for a seller, spending credits â€” the atomic
 * pay-per-contact transaction (marketplace spec Â§4).
 *
 * Returns the UNLOCKED contact (phone/email/name) ONLY on success; every failure
 * path returns a reason so the route can answer with the right status and the UI
 * can show the buy-credits prompt rather than a dead end.
 *
 * The lead's price is recomputed here from the stored lead via `creditPriceFor`
 * â€” the client never sends an amount to charge.
 *
 * Every new contact unlock costs credits, including matched requests already
 * present in a seller's inbox. Plan delivery eligibility does not grant contact
 * access; the wallet transaction below is the single access gate.
 */
export async function unlockLeadContact(
  uid: string,
  leadId: string
): Promise<
  | { ok: true; credits: number; balance: number; conversationId: string; contact: { phone: string; email: string | null; name: string | null }; already?: boolean }
  | { ok: false; reason: "no-db" | "not-found" | "ineligible" | "insufficient" | "limit"; error: string; balance?: number; price?: number }
> {
  const db = adminDb();
  if (!db) return { ok: false, reason: "no-db", error: "Server storage is not configured." };

  // â”€â”€ Premium catalogue gate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Starter and Premium sellers can both browse and unlock leads. The Starter
  // opportunity cap is checked transactionally below; bought credits do not
  // bypass that cap.
  if (!(await readSubscription(uid))) {
    const activated = await activateStarter(uid);
    if (!activated.ok) return { ok: false, reason: "ineligible", error: activated.error };
  }
  const ent = entitlementFrom(await readSubscription(uid));

  const leadRef = db.collection("leads").doc(leadId);
  const subscriptionRef = db.collection("subscriptions").doc(uid);
  const walletRef = db.collection("wallets").doc(uid);
  const ledgerRef = db.collection("credit_ledger").doc();

  // â”€â”€ Steps 2â€“6 inside ONE transaction â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const txResult = await db.runTransaction(async (tx) => {
    const leadSnap = await tx.get(leadRef);

    // Step 2a â€” the lead must exist and be sellable.
    if (!leadSnap.exists) return { ok: false as const, reason: "not-found" as const, error: "That request is no longer available." };
    const lead = leadSnap.data() as {
      status?: string; requesterUid?: string | null; ownerUid?: string | null; requestId?: string | null;
      need?: string; budget?: string | number | null; timeline?: string | null;
      phone?: string; email?: string | null; name?: string | null;
    };
    const status = String(lead.status ?? "new");
    const ownLead = lead.ownerUid === uid;
    if (lead.requesterUid === uid) {
      return { ok: false as const, reason: "ineligible" as const, error: "That's your own request." };
    }
    if (lead.ownerUid && !ownLead) {
      return { ok: false as const, reason: "ineligible" as const, error: "That request belongs to another seller." };
    }
    // Matched copies and the marketplace preview share one request id. Keying
    // the unlock by that id prevents a seller paying twice through both screens.
    const requestId = String(lead.requestId ?? leadId);
    const unlockRef = db.collection("lead_unlocks").doc(unlockId(uid, requestId));
    const allocationRef = db.collection("lead_allocations").doc(`${uid}_${requestId}`);
    const legacyUnlockRef = db.collection("lead_unlocks").doc(unlockId(uid, leadId));
    const [unlockSnap, walletSnap, subscriptionSnap, allocationSnap] = await Promise.all([
      tx.get(unlockRef),
      tx.get(walletRef),
      tx.get(subscriptionRef),
      tx.get(allocationRef),
    ]);
    const legacyUnlockSnap = requestId === leadId ? null : await tx.get(legacyUnlockRef);
    const existingUnlock = unlockSnap.exists ? unlockSnap : legacyUnlockSnap?.exists ? legacyUnlockSnap : null;

    // An earlier per-lead unlock also counts as paid. Mirror it under the
    // request id so every surface shares one idempotency record from now on.
    if (existingUnlock) {
      const old = existingUnlock.data() as { credits?: number; leadId?: string; createdAt?: unknown };
      if (!unlockSnap.exists) {
        tx.set(unlockRef, {
          id: unlockRef.id,
          leadId: old.leadId ?? leadId,
          requestId,
          ownerUid: uid,
          credits: old.credits ?? 0,
          createdAt: old.createdAt ?? nowIso(),
        });
      }
      return {
        ok: true as const,
        already: true,
        credits: old.credits ?? 0,
        balance: (walletSnap.data() as WalletDoc | undefined)?.balance ?? 0,
      };
    }

    if (!ownLead && !(status === "new" || status === "open")) {
      return { ok: false as const, reason: "ineligible" as const, error: "That request is no longer open." };
    }
    if (!ent.entitled) {
      return {
        ok: false as const,
        reason: "ineligible" as const,
        error: "The lead catalogue is part of your subscription â€” renew your plan to unlock buyer contacts.",
      };
    }

    // Step 3 â€” recompute the price from trusted server data for every lead.
    if (!subscriptionSnap.exists) {
      return {
        ok: false as const,
        reason: "ineligible" as const,
        error: "Your Starter account could not be activated. Please try again.",
      };
    }
    const subscription = subscriptionSnap.data() as {
      plan?: string;
      subscription_status?: string;
      status?: string;
      current_period_start?: string | null;
      current_period_end?: string | null;
      included_credits_anchor_day?: number;
      leads_period_key?: string | null;
      leads_used?: number;
    };
    const transactionEntitlement = entitlementFrom(subscription);
    if (!transactionEntitlement.entitled) {
      return {
        ok: false as const,
        reason: "ineligible" as const,
        error: "Your subscription is not active. Please review your plan before unlocking contacts.",
      };
    }
    let opportunityPeriodEnd = subscription.current_period_end ?? null;
    let opportunityPeriodStart = subscription.current_period_start ?? nowIso();
    if (ent.plan === "starter" &&
        (!opportunityPeriodEnd || Date.parse(opportunityPeriodEnd) <= Date.now())) {
      const anchorDay = subscription.included_credits_anchor_day ?? new Date(opportunityPeriodStart).getUTCDate();
      let nextEnd = opportunityPeriodEnd && Number.isFinite(Date.parse(opportunityPeriodEnd))
        ? opportunityPeriodEnd
        : nowIso();
      while (Date.parse(nextEnd) <= Date.now()) {
        opportunityPeriodStart = nextEnd;
        nextEnd = nextMonthlyCreditAt(new Date(nextEnd), anchorDay);
      }
      opportunityPeriodEnd = nextEnd;
    }
    const opportunityPeriodKey = opportunityPeriodEnd?.slice(0, 10) ?? null;
    const opportunitiesUsed = subscription.leads_period_key === opportunityPeriodKey
      ? Number(subscription.leads_used ?? 0)
      : 0;
    const opportunityLimit = transactionEntitlement.plan === "starter" ? 3 : null;
    if (!allocationSnap.exists && opportunityLimit !== null && opportunitiesUsed >= opportunityLimit) {
      return {
        ok: false as const,
        reason: "limit" as const,
        error: "You've used your 3 Starter lead opportunities this month. Upgrade to Premium for unlimited eligible opportunities; buying credits does not change this limit.",
      };
    }
    if (!allocationSnap.exists) {
      const allocatedAt = nowIso();
      tx.create(allocationRef, {
        ownerUid: uid,
        leadId,
        requestId,
        plan: transactionEntitlement.plan,
        periodEnd: opportunityPeriodEnd,
        allocationType: "marketplace-unlock",
        status: "delivered",
        createdAt: allocatedAt,
      });
      tx.set(subscriptionRef, {
        leads_used: opportunitiesUsed + 1,
        leads_period_key: opportunityPeriodKey,
        ...(transactionEntitlement.plan === "starter" && subscription.leads_period_key !== opportunityPeriodKey ? {
          current_period_start: opportunityPeriodStart,
          current_period_end: opportunityPeriodEnd,
          current_period_end_at: opportunityPeriodEnd ? Timestamp.fromDate(new Date(opportunityPeriodEnd)) : null,
          included_credits_next_at: opportunityPeriodEnd,
        } : {}),
        updatedAt: allocatedAt,
      }, { merge: true });
    }

    const price = creditPriceFor(lead);

    // Step 4 â€” require sufficient wallet balance before revealing contact.
    const wallet = (walletSnap.data() as WalletDoc | undefined) ?? {
      ownerUid: uid,
      balance: 0,
      lifetimeEarned: 0,
      lifetimeSpent: 0,
    };
    const purchasedBalance = typeof wallet.purchasedBalance === "number"
      ? wallet.purchasedBalance
      : wallet.balance ?? 0;
    const includedIsCurrent = !wallet.subscriptionExpiresAt ||
      !Number.isFinite(Date.parse(wallet.subscriptionExpiresAt)) ||
      Date.parse(wallet.subscriptionExpiresAt) > Date.now();
    const includedBalance = includedIsCurrent ? wallet.subscriptionBalance ?? 0 : 0;
    const balance = purchasedBalance + includedBalance;
    if (balance < price) {
      return {
        ok: false as const,
        reason: "insufficient" as const,
        error: `This lead costs ${price} credits and you have ${balance}. Buy more credits to unlock it.`,
        balance,
        price,
      };
    }

    // Steps 5-6 — deduct + ledger row + unlock guard, atomically.
    const includedSpent = Math.min(includedBalance, price);
    const purchasedSpent = price - includedSpent;
    const nextIncludedBalance = includedBalance - includedSpent;
    const nextPurchasedBalance = purchasedBalance - purchasedSpent;
    const nextBalance = nextIncludedBalance + nextPurchasedBalance;
    tx.set(walletRef, {
      ownerUid: uid,
      balance: nextBalance,
      subscriptionBalance: nextIncludedBalance,
      purchasedBalance: nextPurchasedBalance,
      subscriptionExpiresAt: wallet.subscriptionExpiresAt ?? null,
      lifetimeEarned: wallet.lifetimeEarned ?? 0,
      lifetimeSpent: (wallet.lifetimeSpent ?? 0) + price,
      createdAt: wallet.createdAt ?? nowIso(),
      updatedAt: nowIso(),
    });
    tx.set(ledgerRef, {
      id: ledgerRef.id,
      ownerUid: uid,
      type: "spend",
      amount: price,
      balanceAfter: nextBalance,
      subscriptionCredits: includedSpent,
      purchasedCredits: purchasedSpent,
      leadId,
      note: "Unlocked contact for a request",
      createdAt: nowIso(),
    });
    tx.set(unlockRef, {
      id: unlockRef.id,
      leadId,
      requestId,
      ownerUid: uid,
      credits: price,
      subscriptionCredits: includedSpent,
      purchasedCredits: purchasedSpent,
      createdAt: nowIso(),
    });

    return {
      ok: true as const,
      credits: price,
      balance: nextBalance,
    };
  });

  if (!txResult.ok) return txResult;

  // â”€â”€ Steps 7â€“8 (outside the money transaction â€” best-effort side effects) â”€â”€
  // Re-read the lead + contact vault for the response. On the fresh-unlock path
  // the transaction already returned them, but reading once more keeps ONE code
  // path for the (idempotent) already-unlocked case and guarantees the response
  // shape. The vault is keyed on the REQUEST id; a seller's copy finds it via
  // `requestId`, and a request doc is its own request.
  const leadSnap = await leadRef.get();
  const full = leadSnap.data() as { requestId?: string | null; requesterUid?: string | null } | undefined;
  const vaultSnap = await db.collection("lead_contacts").doc(String(full?.requestId ?? leadId)).get();
  const vault = vaultSnap.data() as { phone?: string; email?: string | null; name?: string | null; requesterUid?: string | null } | undefined;
  const requesterUid = String(vault?.requesterUid ?? full?.requesterUid ?? "") || null;
  const contact = {
    phone: String(vault?.phone ?? ""),
    email: vault?.email ? String(vault.email) : null,
    name: vault?.name ? String(vault.name) : null,
  };

  // Step 6b â€” grant the seller the right to START a thread with this buyer.
  // firestore.rules gates conversation create for seller-role callers on this
  // row, so without it the free DM back door (`requesterUid` on a lead doc +
  // ensureConversation) would still exist. Best-effort like step 8: the money
  // already moved inside the transaction, and the thread opened next uses the
  // Admin SDK (rules don't apply to it), so a failed grant write degrades to
  // "can't open a second thread later", never to a lost payment. Runs on the
  // idempotent already-unlocked path too â€” unlocks that predate this collection.
  if (requesterUid && requesterUid !== uid) {
    try {
      await grantContact(db, uid, requesterUid, { leadId, via: "unlock" });
    } catch (e) {
      console.warn("[KASI] contact_grant write failed:", e);
    }
  }

  // Step 7 â€” open a conversation between seller and buyer (idempotent).
  let conversationId = "";
  if (requesterUid && requesterUid !== uid) {
    conversationId = await openConversation(db, uid, requesterUid, leadId);
  }

  // Step 8 â€” notify the buyer that a pro unlocked their request.
  if (requesterUid && !txResult.already) {
    try {
      await db.collection("notifications").add({
        toUid: requesterUid,
        fromUid: uid,
        type: "lead-unlocked",
        message: "A professional unlocked your request and can now contact you.",
        leadId,
        href: `/dashboard?lead=${leadId}`,
        read: false,
        createdAt: nowIso(),
      });
    } catch {
      /* best-effort â€” never fail a paid unlock over a notification */
    }
  }

  return { ok: true, credits: txResult.credits, balance: txResult.balance, conversationId, contact, already: txResult.already };
}

/**
 * Open (or reuse) a buyerâ†”seller conversation for an unlocked lead â€” the
 * server-side twin of `ensureConversation` in repo.ts, using the SAME
 * deterministic conversation id so the buyer and seller land in one thread
 * whether it was created here or from the client messaging UI.
 */
async function openConversation(
  db: Firestore,
  sellerUid: string,
  buyerUid: string,
  leadId: string
): Promise<string> {
  // Reuse the SAME deterministic id the client messaging UI uses, so a seller
  // who unlocks here and a buyer who opens Messages land in one thread.
  const cid = conversationId(sellerUid, buyerUid, null);
  const ref = db.collection("conversations").doc(cid);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      participants: [sellerUid, buyerUid].sort(),
      businessId: null,
      businessName: null,
      leadId,
      lastMessage: null,
      lastSenderUid: null,
      lastAt: null,
      status: "open",
      createdBy: sellerUid,
      createdAt: nowIso(),
    });
  } else if (!snap.data()?.leadId) {
    // Backfill the lead link onto a pre-existing thread without clobbering it.
    await ref.set({ leadId }, { merge: true });
  }
  return cid;
}

/**
 * Browse the OPEN marketplace feed â€” contact-stripped previews for sellers.
 *
 * This is the free half of the model: a seller sees WHAT is needed, roughly
 * WHERE, WHEN, and how many credits it costs, but NEVER the buyer's phone, email
 * or name. Those are unlocked only by `unlockLeadContact`.
 *
 * Server-side so the strip is authoritative: the raw lead documents are never
 * sent to a browsing seller, only the projected preview. (The realtime listener
 * in realtime.ts applies the same projection client-side as defence in depth.)
 */
export async function listMarketplaceLeads(opts: { categorySlug?: string; limit?: number } = {}) {
  const db = adminDb();
  if (!db) return { leads: [] as ReturnType<typeof toPreview>[] };
  const limit = Math.min(Math.max(1, Math.floor(opts.limit ?? 50)), 100);

  let q: Query = db
    .collection("leads")
    .where("status", "in", ["new", "open"])
    .where("ownerUid", "==", null)
    .orderBy("createdAt", "desc")
    .limit(limit);
  if (opts.categorySlug) {
    q = db
      .collection("leads")
      .where("status", "in", ["new", "open"])
      .where("ownerUid", "==", null)
      .where("category", "==", opts.categorySlug)
      .orderBy("createdAt", "desc")
      .limit(limit);
  }

  const snap = await q.get();
  return { leads: snap.docs.map((d) => toPreview({ id: d.id, ...(d.data() as Record<string, unknown>) })) };
}

/** Project a raw lead onto the public preview â€” drops every contact field. */
function toPreview(lead: Record<string, unknown>) {
  const tier = tierForLead(lead as Parameters<typeof tierForLead>[0]);
  return {
    id: String(lead.id ?? ""),
    need: String(lead.need ?? "Service request"),
    category: (lead.category as string | null) ?? null,
    suburb: (lead.suburb as string | null) ?? null,
    timeline: (lead.timeline as string | null) ?? null,
    tier,
    credits: LEAD_TIER_CREDITS[tier],
    createdAt: lead.createdAt ?? null,
  };
}

// @@NEXT@@
