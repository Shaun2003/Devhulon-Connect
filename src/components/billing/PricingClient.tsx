"use client";
import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { useRealtime, subscribeMySubscription, subscribeMyPayments, type RealtimeError } from "@/lib/realtime";
import { subscribeSeller } from "@/lib/monetize";
import {
  annualSaving,
  formatZAR,
  normalizePlanId,
  perMonthEquivalent,
  planRank,
  priceFor,
  subscriptionIsEntitled,
  type BillingPeriod,
  type PlanId,
} from "@/lib/plans";
import { ErrorNote } from "@/components/dash/parts";
import { usePlans } from "@/components/PlanConfigProvider";
import { KIcon } from "@/lib/icons";
import { verifyCheckout } from "@/lib/monetize";
import { cancelSellerSubscription, resumeSellerSubscription } from "@/lib/monetize";
import { PageHero } from "@/components/ui";

type Row = Record<string, unknown>;

type Cta = {
  label: string;
  action: () => void;
  tone: "primary" | "navy" | "ghost";
  current?: boolean;
  disabled?: boolean;
};

/**
 * /pricing (spec §21 + §23): monthly/annual toggle, per-plan cards from
 * plans.ts (single source of truth), current-plan awareness and real billing
 * history from `payments/{reference}`.
 *
 * Checkout goes through /api/billing/checkout (server-resolved price) — the
 * browser only ever redirects to the provider's hosted page.
 */
export default function PricingClient() {
  const { user, role, roleLoading, loading } = useAuth();
  const uid = user?.uid ?? "";
  const sellerUid = role === "seller" ? uid : "";
  const [period, setPeriod] = useState<BillingPeriod>("monthly");
  const [autoRenew, setAutoRenew] = useState(false);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // Admin-configured prices/limits (§21) — re-renders when overrides load.
  const plans = usePlans();

  const subs = useRealtime<Row>((cb, onErr) => (sellerUid ? subscribeMySubscription(sellerUid, cb as never, onErr) : () => {}), [], [sellerUid]);
  const payments = useRealtime<Row>((cb, onErr) => (sellerUid ? subscribeMyPayments(sellerUid, cb as never, onErr) : () => {}), [], [sellerUid]);

  const sub = subs.rows[0];
  const storedPlan = normalizePlanId(sub?.plan ?? "starter");
  const subStatus = String(sub?.subscription_status ?? sub?.status ?? "");
  const periodEnd = (sub?.current_period_end as string | undefined) ?? null;
  const storedPlanActive = subscriptionIsEntitled({
    plan: storedPlan,
    status: subStatus,
    periodEnd,
    cancelAtPeriodEnd: sub?.cancel_at_period_end === true,
  });
  const subPlan: PlanId = storedPlan === "premium" && storedPlanActive ? "premium" : "starter";
  const subActive = true;
  const currentRank = planRank(subPlan);
  const renewalError = String(sub?.auto_renew_error ?? "");
  const renewalNotice = renewalError === "renewal_attempts_exhausted"
    ? "Automatic renewal stopped after three failed attempts. Complete a new checkout to continue Premium."
    : renewalError === "renewal_amount_mismatch_review_required"
      ? "Automatic renewal was paused for a payment verification review. No further renewal charges will be attempted."
      : renewalError === "payment_method_not_reusable" || renewalError === "payment_method_missing"
        ? "Paystack did not provide a reusable payment method. Premium remains prepaid; renew manually at the end of the paid period."
        : renewalError === "renewal_status_pending"
          ? "Your renewal is still being verified. Another renewal charge will not be attempted while its status is unclear."
          : renewalError
            ? "Automatic renewal could not be completed. Review your billing history or contact support before the next renewal."
            : null;

  async function choose(planId: PlanId) {
    setBusyPlan(planId);
    setError(null);
    setNote(null);
    try {
      const res = await subscribeSeller(planId, undefined, {
        period,
        autoRenew: planId === "premium" && autoRenew,
      });
      if (res.url) {
        window.location.assign(res.url); // hosted checkout — the browser only redirects
        return;
      }
      if (res.ok) setNote(res.message ?? "Plan updated.");
      else setError(res.message ?? "Could not start checkout.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start checkout.");
    } finally {
      setBusyPlan(null);
    }
  }

  async function verifyPendingPayment(reference: string) {
    setBusyPlan(`verify:${reference}`);
    setError(null);
    setNote(null);
    try {
      const result = await verifyCheckout(reference);
      if (result.ok) {
        setNote("Payment confirmed. Your plan and billing history are updating.");
      } else {
        setError(result.message ?? "Paystack has not confirmed this payment. Check the payment status in Paystack and try again.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify this payment.");
    } finally {
      setBusyPlan(null);
    }
  }

  async function stopRenewal() {
    if (!window.confirm("Turn off automatic renewal? Premium remains active until the paid-through date.")) return;
    setBusyPlan("renewal");
    setError(null);
    setNote(null);
    try {
      const result = await cancelSellerSubscription(false);
      if (result.ok) setNote("Automatic renewal is off. Premium remains active until the paid-through date.");
      else setError(result.message ?? "Could not cancel automatic renewal.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel automatic renewal.");
    } finally {
      setBusyPlan(null);
    }
  }

  async function resumePaidPeriod() {
    setBusyPlan("renewal");
    setError(null);
    setNote(null);
    try {
      const result = await resumeSellerSubscription();
      if (result.ok) setNote("Your paid Premium access is active again. Automatic renewal remains off.");
      else setError(result.message ?? "Could not resume Premium access.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resume Premium access.");
    } finally {
      setBusyPlan(null);
    }
  }

  function ctaFor(planId: PlanId): Cta {
    const rank = planRank(planId);
    if (!user) {
      return { label: "Sign in to choose", action: () => {}, tone: "navy", disabled: true };
    }
    if (subActive && rank === currentRank) {
      if (planId === "starter") {
        return { label: "Current plan — free", action: () => {}, tone: "ghost", current: true, disabled: true };
      }
      return { label: "Current plan", action: () => {}, tone: "ghost", current: true, disabled: true };
    }
    if (subActive && rank < currentRank) {
      return { label: "Starter after Premium expires", action: () => {}, tone: "ghost", disabled: true };
    }
    if (subActive && rank > currentRank) {
      return { label: `Upgrade to ${planId}`, action: () => choose(planId), tone: "primary", disabled: busyPlan === planId };
    }
    if (planId === "starter" && !sub) {
      return { label: "Choose Starter — free", action: () => choose(planId), tone: "primary", disabled: busyPlan === planId };
    }
    return { label: `Choose ${planId}`, action: () => choose(planId), tone: rank === 1 ? "primary" : "navy", disabled: busyPlan === planId };
  }
  const maxSaving = Math.max(...plans.map((p) => annualSaving(p).percent));

  if (loading || (user && roleLoading)) {
    return (
      <div className="mx-auto min-h-screen max-w-6xl animate-pulse space-y-5 px-4 py-10" role="status" aria-label="Loading pricing">
        <div className="mx-auto h-8 w-48 rounded bg-[#e7eef5]" />
        <div className="mx-auto h-12 w-2/3 rounded bg-[#e7eef5]" />
        <div className="grid gap-4 pt-8 md:grid-cols-2">
          <div className="h-72 rounded-2xl bg-[#f2f6fa]" />
          <div className="h-72 rounded-2xl bg-[#f2f6fa]" />
        </div>
      </div>
    );
  }

  if (user && role !== "seller") {
    return (
      <div className="min-h-screen">
        <PageHero
          kicker="For buyers"
          title="DevhulonConnect is free for buyers"
          sub="Starter and Premium subscriptions are for sellers. You can browse businesses, save favourites, and request quotes without a seller plan."
          align="center"
        />
        <main className="mx-auto max-w-3xl space-y-5 px-4 py-10">
          <section className="hippo-card p-5 text-center sm:p-8">
            <h2 className="text-xl font-black text-[#10243e]">What would you like to do?</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#1d3a5f]/70">
              No subscription or credits are needed to find local services and request quotes.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Link href="/request-quote" className="btn-hippo text-sm">Request free quotes</Link>
              <Link href="/services" className="btn-sun text-sm">Browse services</Link>
              <Link href="/dashboard" className="self-center text-sm font-bold text-[#558c2b] hover:underline">Buyer dashboard</Link>
            </div>
          </section>
          <p className="text-center text-sm text-[#1d3a5f]/65">
            Have a business to promote? <Link href="/register-seller" className="font-bold text-[#558c2b] hover:underline">Register as a seller</Link> to view seller plans.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <PageHero
        kicker="Plans & pricing"
        title="Get matched with buyers who need you"
        sub="Compare businesses for free, then unlock genuine buyer requests with credits. Starter is free; Premium is R300/month and billed upfront for the selected period. You can choose a one-time checkout or opt in to automatic Paystack renewal."
        align="center"
      >
        <div className="flex flex-col items-center gap-2">
          {/* Monthly / Annual toggle (§23) */}
          <div className="inline-flex items-center gap-1 rounded-full border border-white/25 bg-white/10 p-1" role="group" aria-label="Billing period">
            {(["monthly", "annual"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                aria-pressed={period === p}
                className={`rounded-full px-5 py-2 text-sm font-extrabold capitalize transition ${period === p ? "bg-white text-[#10243e]" : "text-white/80 hover:text-white"}`}
              >
                {p}
                {p === "annual" && <span className="ml-1.5 text-[10px] font-black text-[#ffc72c]">−{maxSaving}%</span>}
              </button>
            ))}
          </div>
          {period === "annual" && (
            <p className="text-xs text-white/70">Annual billing is charged upfront; included credits are allocated monthly while Premium is active.</p>
          )}
          {user && (
            <label className="flex max-w-2xl items-start justify-center gap-2 text-center text-xs text-white/80">
              <input
                type="checkbox"
                checked={autoRenew}
                onChange={(event) => setAutoRenew(event.target.checked)}
                className="mt-0.5 accent-[#7ac142]"
              />
              <span>
                Opt in to automatic {period} renewal through Paystack at the displayed price. You can cancel renewal at any time; Premium access remains through the paid period.
              </span>
            </label>
          )}
        </div>
      </PageHero>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-10">

      {error && <p className="text-sm font-bold text-red-700 bg-red-50 rounded-2xl px-4 py-3">{error}</p>}
      {note && <p className="text-sm font-bold text-[#3c6b1d] bg-[#e8f6d8] rounded-2xl px-4 py-3">{note}</p>}
      <ErrorNote error={subs.error as RealtimeError | null} />
      {renewalNotice && <p className="rounded-2xl bg-[#fff4d6] px-4 py-3 text-sm font-bold text-[#805300]">{renewalNotice}</p>}
      {/* Current-plan status strip (§23: current plan + renewal date) */}
      {subActive && (
        <section className="hippo-card p-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span>Current plan: <b className="uppercase text-[#10243e]">{subPlan}</b></span>
          <span>{subPlan === "premium" ? "Paid through" : "Monthly charge"}: <b className="text-[#10243e]">{subPlan === "premium" && periodEnd ? new Date(periodEnd).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" }) : "R0"}</b>{subPlan === "premium" ? (sub?.auto_renew === true ? " · automatic renewal enabled" : " · renew with another checkout") : ""}</span>
          <span>Lead opportunities: <b className="text-[#10243e]">{subPlan === "premium" ? "Unlimited eligible" : `${String(sub?.leads_used ?? 0)}/3`}</b></span>
          {subPlan === "premium" && sub?.auto_renew === true && (
            <button type="button" onClick={() => void stopRenewal()} disabled={busyPlan === "renewal"} className="rounded-full border border-[#10243e] px-3 py-1 text-xs font-bold disabled:opacity-50">
              {busyPlan === "renewal" ? "Updating…" : "Turn off auto-renew"}
            </button>
          )}
          {subPlan === "premium" && sub?.cancel_at_period_end === true && (
            <button type="button" onClick={() => void resumePaidPeriod()} disabled={busyPlan === "renewal"} className="rounded-full border border-[#10243e] px-3 py-1 text-xs font-bold disabled:opacity-50">
              {busyPlan === "renewal" ? "Updating…" : "Resume paid access"}
            </button>
          )}
        </section>
      )}

      {/* Billing history (§23) — real payments records, newest first */}
      {payments.rows.length > 0 && (
        <section className="hippo-card p-5" aria-label="Billing history">
          <h2 className="font-black text-[#10243e] text-base mb-1">Billing history</h2>
          <p className="text-xs text-[#1d3a5f]/60 mb-4">Every checkout attempt and payment, in reverse order.</p>
          <div className="divide-y divide-[#e2e8f0]">
            {payments.rows
              .slice()
              .sort((a, b) => {
                const da = a.createdAt ? new Date(String(a.createdAt)).getTime() : 0;
                const db = b.createdAt ? new Date(String(b.createdAt)).getTime() : 0;
                return db - da;
              })
              .map((p: Record<string, unknown>) => {
                const reference = String(p.reference ?? "");
                const planId = String(p.planId ?? "");
                const plan = plans.find((pl) => pl.id === planId);
                const period = String(p.period ?? "monthly") as BillingPeriod;
                const status = String(p.status ?? "pending");
                const amount = typeof p.amount === "number" ? p.amount : 0;
                const createdAt = p.createdAt ? new Date(String(p.createdAt)) : null;
                const paidAt = p.paidAt ? new Date(String(p.paidAt)) : null;
                const displayDate = paidAt ?? createdAt;
                return (
                  <div key={reference} className="py-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                    <span className="font-mono text-[#1d3a5f]/50 text-xs">{reference.slice(0, 12)}…</span>
                    <span className="font-medium text-[#10243e]">
                      {plan?.name ?? planId}
                      <span className="text-[#64748b] font-normal"> / {period}</span>
                    </span>
                    <span className="text-[#10243e] font-semibold">{formatZAR(amount)}</span>
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${status === "paid" ? "bg-[#e8f6d8] text-[#3c6b1d]" : status === "pending" ? "bg-[#fff4d6] text-[#a36508]" : "bg-[#fde8e8] text-[#a3341f]"}`}>
                      {status}
                    </span>
                    {status === "pending" && p.provider === "paystack" && (
                      <button
                        type="button"
                        onClick={() => void verifyPendingPayment(reference)}
                        disabled={busyPlan === `verify:${reference}`}
                        className="rounded-full border border-[#10243e] px-3 py-1 text-xs font-bold text-[#10243e] hover:bg-[#10243e] hover:text-white disabled:opacity-50"
                      >
                        {busyPlan === `verify:${reference}` ? "Checking…" : "Check payment"}
                      </button>
                    )}
                    <span className="text-[#64748b] text-xs">
                      {displayDate ? displayDate.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                      {paidAt && createdAt && paidAt.getTime() !== createdAt.getTime() ? ` · paid ${paidAt.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}` : ""}
                    </span>
                  </div>
                );
              })}
          </div>
        </section>
      )}

      {/* Plan cards — rendered from plans.ts, the same config checkout prices from */}
      <div className="grid md:grid-cols-2 gap-4 items-stretch">
        {plans.map((p) => {
          const s = annualSaving(p);
          const cta = ctaFor(p.id);
          const isCurrent = cta.current === true;
          return (
            <div key={p.id} className={`hippo-card p-6 flex flex-col ${p.popular ? "border-2 !border-[#7ac142] shadow-[0_24px_50px_-24px_rgba(122,193,66,0.7)]" : ""}`}>
              {p.popular && (
                <span className="self-start text-[10px] font-black uppercase tracking-widest bg-[#7ac142] text-[#0b1e33] rounded-full px-2 py-0.5 mb-2">
                  Most popular
                </span>
              )}
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#558c2b]">{p.name}</p>
              <p className="text-3xl font-black text-[#10243e] mt-1">
                {formatZAR(priceFor(p, period))}
                <span className="text-sm font-bold text-[#1d3a5f]/60">/{period === "annual" ? "yr" : "mo"}</span>
              </p>
              {period === "annual" && (
                <p className="text-[11px] font-bold text-[#558c2b] mt-1">
                  {formatZAR(perMonthEquivalent(p, period))}/mo equivalent · save {formatZAR(s.amount)} ({s.percent}%)
                </p>
              )}
              {p.id === "premium" ? <p className="text-[11px] text-[#1d3a5f]/60 mt-0.5">R300/month; credits are granted only after confirmed payment and allocated monthly.</p> : null}
              <p className="text-xs text-[#1d3a5f]/60 mt-2">{p.blurb}</p>
              <p className="mt-3 rounded-xl bg-[#e8f6d8] px-3 py-2 text-sm font-extrabold text-[#3c6b1d]">
                {p.includedCredits} credits included monthly
              </p>
              <ul className="text-sm mt-4 space-y-2 flex-1 text-[#10243e]">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2"><span className="text-[#7ac142] font-black shrink-0"><KIcon name="check" size={14} /></span>{f}</li>
                ))}
              </ul>
              <button
                onClick={cta.action}
                disabled={cta.disabled || loading}
                className={`mt-5 text-center text-sm font-extrabold rounded-full px-4 py-3 transition disabled:opacity-60 ${
                  cta.tone === "primary" ? "btn-hippo" : cta.tone === "navy" ? "btn-navy" : "border-2 border-[#10243e] text-[#10243e] hover:bg-[#10243e] hover:text-white"
                }`}
              >
                {busyPlan === p.id ? "Working…" : cta.label}
              </button>
              {isCurrent && <p className="text-[11px] text-[#1d3a5f]/55 text-center mt-2">You&apos;re on this plan.</p>}
            </div>
          );
        })}
      </div>

      {!user && !loading && (
        <p className="text-center text-sm text-[#1d3a5f]/70">
          <Link href="/list-business" className="font-bold text-[#558c2b] hover:underline">List your business first </Link>{" "}
          (or sign in above to choose a plan)
        </p>
      )}
      </main>
    </div>
  );
}
