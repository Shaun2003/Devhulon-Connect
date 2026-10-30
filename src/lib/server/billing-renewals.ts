import { randomUUID } from "node:crypto";
import { adminDb } from "./admin";
import { renewalFailurePolicy } from "@/lib/billing-policy";
import { activateSubscription } from "./subscriptions";
import {
  chargePaystackAuthorization,
  verifyPaystackTransaction,
} from "./payments";
import type { BillingPeriod } from "@/lib/plans";

type StoredAuthorization = {
  provider?: string;
  authorizationCode?: string;
  email?: string;
};

export async function saveReusablePaystackAuthorization(
  uid: string,
  paymentReference: string,
  email: string | undefined,
  authorizationCode: string | undefined,
  reusable: boolean
): Promise<void> {
  const db = adminDb();
  if (!db) throw new Error("Server billing is not configured.");
  const subscriptionRef = db.collection("subscriptions").doc(uid);
  const methodRef = db.collection("billing_methods").doc(uid);
  const current = await subscriptionRef.get();
  if (!current.exists || current.data()?.payment_reference !== paymentReference) return;
  if (!reusable || !authorizationCode || !email) {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(subscriptionRef);
      if (!snap.exists || snap.data()?.payment_reference !== paymentReference) return;
      tx.delete(methodRef);
      tx.set(subscriptionRef, {
        auto_renew: false,
        next_renewal_at: null,
        auto_renew_error: "payment_method_not_reusable",
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    });
    return;
  }

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(subscriptionRef);
    if (!snap.exists || snap.data()?.payment_reference !== paymentReference) return;
    tx.set(methodRef, {
      ownerUid: uid,
      provider: "paystack",
      email,
      authorizationCode,
      updatedAt: new Date().toISOString(),
    });
    tx.set(subscriptionRef, {
      auto_renew: true,
      auto_renew_error: null,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  });
}

export async function recordBillingRenewalFailure(
  uid: string,
  reference: string,
  message: string,
  now: Date
): Promise<void> {
  const db = adminDb();
  if (!db) throw new Error("Server billing is not configured.");
  const subscriptionRef = db.collection("subscriptions").doc(uid);
  const paymentRef = db.collection("payments").doc(reference);
  const stop = await db.runTransaction(async (tx) => {
    const [subscriptionSnap, paymentSnap] = await Promise.all([
      tx.get(subscriptionRef),
      tx.get(paymentRef),
    ]);
    if (!paymentSnap.exists || paymentSnap.data()?.status === "paid") return false;
    const subscription = subscriptionSnap.data() ?? {};
    const canceled = subscription.auto_renew === false || subscription.cancel_at_period_end === true;
    const policy = renewalFailurePolicy(Number(subscription.renewal_attempts ?? 0), canceled);
    tx.set(paymentRef, {
      status: "failed",
      failureReason: message,
      updatedAt: now.toISOString(),
    }, { merge: true });
    if (subscriptionSnap.exists) {
      tx.set(subscriptionRef, {
        ...(canceled ? {} : { subscription_status: "past_due", status: "past_due" }),
        renewal_attempts: policy.attempts,
        next_renewal_at: policy.retryAfterDays === null
          ? null
          : new Date(now.getTime() + policy.retryAfterDays * 86_400_000).toISOString(),
        auto_renew: !policy.stopped,
        renewal_lock_until: null,
        renewal_attempt_reference: null,
        auto_renew_error: canceled ? "renewal_cancelled" : policy.stopped ? "renewal_attempts_exhausted" : message,
        updatedAt: now.toISOString(),
      }, { merge: true });
    }
    return policy.stopped && !canceled;
  });
  if (stop) await db.collection("billing_methods").doc(uid).delete();
}

export async function stopRenewalForReview(
  uid: string,
  reference: string,
  now: Date,
  paymentRecordExists = true,
  errorCode = "renewal_amount_mismatch_review_required"
): Promise<void> {
  const db = adminDb();
  if (!db) throw new Error("Server billing is not configured.");
  if (paymentRecordExists) {
    await db.collection("payments").doc(reference).set({
      status: "amount_mismatch",
      updatedAt: now.toISOString(),
    }, { merge: true });
  }
  await db.collection("subscriptions").doc(uid).set({
    auto_renew: false,
    next_renewal_at: null,
    renewal_lock_until: null,
    renewal_attempt_reference: null,
    auto_renew_error: errorCode,
    updatedAt: now.toISOString(),
  }, { merge: true });
}

async function holdRenewalForReconciliation(uid: string, reference: string, now: Date): Promise<void> {
  const db = adminDb();
  if (!db) throw new Error("Server billing is not configured.");
  await db.collection("subscriptions").doc(uid).set({
    next_renewal_at: new Date(now.getTime() + 86_400_000).toISOString(),
    renewal_lock_until: null,
    auto_renew_error: "renewal_status_pending",
    updatedAt: now.toISOString(),
  }, { merge: true });
  await db.collection("payments").doc(reference).set({
    renewalReconciliationRequired: true,
    updatedAt: now.toISOString(),
  }, { merge: true });
}

export async function processDueBillingRenewals(now = new Date(), batchSize = 50): Promise<{
  scanned: number;
  charged: number;
  pending: number;
  failed: number;
  skipped: number;
}> {
  const db = adminDb();
  if (!db) throw new Error("Server billing is not configured.");

  const dueSnapshot = await db.collection("subscriptions")
    .where("auto_renew", "==", true)
    .where("next_renewal_at", "<=", now.toISOString())
    .orderBy("next_renewal_at", "asc")
    .limit(batchSize)
    .get();
  let charged = 0;
  let pending = 0;
  let failed = 0;
  let skipped = 0;

  for (const candidate of dueSnapshot.docs) {
    const uid = candidate.id;
    const subscriptionRef = candidate.ref;
    const methodRef = db.collection("billing_methods").doc(uid);
    const period: BillingPeriod = candidate.data().billing_period === "annual" ? "annual" : "monthly";
    const previousReference = candidate.data().renewal_attempt_reference;
    if (typeof previousReference === "string" && previousReference) {
      const previousPayment = await db.collection("payments").doc(previousReference).get();
      const previous = previousPayment.data();
      if (!previousPayment.exists) {
        await stopRenewalForReview(
          uid,
          previousReference,
          now,
          false,
          "renewal_attempt_missing_review_required"
        );
        failed += 1;
        continue;
      }
      if (previous?.status === "pending") {
        const verified = await verifyPaystackTransaction(previousReference);
        if (verified.ok && verified.amountCents === Number(previous.amountCents)) {
          const activation = await activateSubscription({
            uid,
            planId: "premium",
            period,
            provider: "paystack",
            paymentReference: previousReference,
            providerRef: typeof previous.providerRef === "string" ? previous.providerRef : null,
          });
          if (!activation.ok) throw new Error(activation.error);
          charged += 1;
        } else if (verified.ok) {
          await stopRenewalForReview(uid, previousReference, now);
          failed += 1;
        } else if (!verified.ok && ["failed", "abandoned", "reversed"].includes(verified.reason)) {
          await recordBillingRenewalFailure(uid, previousReference, verified.reason, now);
          failed += 1;
        } else {
          await holdRenewalForReconciliation(uid, previousReference, now);
          pending += 1;
        }
      } else {
        skipped += 1;
      }
      continue;
    }

    const reference = `renewal-${randomUUID()}`;
    const paymentRef = db.collection("payments").doc(reference);
    const claim = await db.runTransaction(async (tx) => {
      const [subscriptionSnap, methodSnap] = await Promise.all([
        tx.get(subscriptionRef),
        tx.get(methodRef),
      ]);
      if (!subscriptionSnap.exists) return null;
      const subscription = subscriptionSnap.data() ?? {};
      const dueAt = Date.parse(String(subscription.next_renewal_at ?? ""));
      if (subscription.auto_renew !== true || !Number.isFinite(dueAt) || dueAt > now.getTime()) return null;
      const lockUntil = Date.parse(String(subscription.renewal_lock_until ?? ""));
      if (Number.isFinite(lockUntil) && lockUntil > now.getTime()) return null;
      if (subscription.renewal_attempt_reference) return null;
      const method = methodSnap.data() as StoredAuthorization | undefined;
      if (method?.provider !== "paystack" || !method.authorizationCode || !method.email) {
        tx.set(subscriptionRef, {
          auto_renew: false,
          next_renewal_at: null,
          auto_renew_error: "payment_method_missing",
          renewal_lock_until: null,
          updatedAt: now.toISOString(),
        }, { merge: true });
        return null;
      }

      const amountCents = Number(subscription.renewal_amount_cents);
      if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
        tx.set(subscriptionRef, {
          auto_renew: false,
          next_renewal_at: null,
          auto_renew_error: "renewal_amount_missing",
          renewal_lock_until: null,
          updatedAt: now.toISOString(),
        }, { merge: true });
        return null;
      }
      tx.create(paymentRef, {
        reference,
        ownerUid: uid,
        email: method.email,
        planId: "premium",
        period,
        amount: amountCents / 100,
        amountCents,
        currency: "ZAR",
        status: "pending",
        provider: "paystack",
        providerRef: null,
        kind: "renewal",
        autoRenew: true,
        createdAt: now.toISOString(),
      });
      tx.set(subscriptionRef, {
        renewal_lock_until: new Date(now.getTime() + 5 * 60_000).toISOString(),
        renewal_attempt_reference: reference,
        updatedAt: now.toISOString(),
      }, { merge: true });
      return {
        email: method.email,
        authorizationCode: method.authorizationCode,
        amountCents,
        period,
      };
    });

    if (!claim) {
      skipped += 1;
      continue;
    }

    try {
      const result = await chargePaystackAuthorization({
        ...claim,
        reference,
        uid,
      });
      await paymentRef.set({ providerRef: result.reference, updatedAt: new Date().toISOString() }, { merge: true });
      if (result.status === "failed") {
        await recordBillingRenewalFailure(uid, reference, result.message ?? "Renewal charge failed.", now);
        failed += 1;
        continue;
      }
      if (result.status !== "success") {
        await subscriptionRef.set({
          next_renewal_at: new Date(now.getTime() + 30 * 60_000).toISOString(),
          renewal_lock_until: null,
          updatedAt: new Date().toISOString(),
        }, { merge: true });
        pending += 1;
        continue;
      }

      const verified = await verifyPaystackTransaction(reference);
      if (verified.ok && verified.amountCents !== claim.amountCents) {
        await stopRenewalForReview(uid, reference, now);
        failed += 1;
        continue;
      }
      if (!verified.ok) {
        if (["failed", "abandoned", "reversed"].includes(verified.reason)) {
          await recordBillingRenewalFailure(uid, reference, verified.reason, now);
          failed += 1;
          continue;
        }
        await holdRenewalForReconciliation(uid, reference, now);
        pending += 1;
        continue;
      }

      const activation = await activateSubscription({
        uid,
        planId: "premium",
        period: claim.period as BillingPeriod,
        provider: "paystack",
        paymentReference: reference,
        providerRef: result.reference,
      });
      if (!activation.ok) throw new Error(activation.error);
      charged += 1;
    } catch (error) {
      await holdRenewalForReconciliation(uid, reference, now);
      console.error(
        `[DevhulonConnect] renewal status unknown for ${reference}:`,
        error instanceof Error ? error.message : "Renewal processing failed."
      );
      pending += 1;
    }
  }

  return { scanned: dueSnapshot.size, charged, pending, failed, skipped };
}
