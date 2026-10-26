"use client";
import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { useRealtime, subscribeMySubscription, subscribeMyPayments, type RealtimeError } from "@/lib/realtime";
import { cancelSellerSubscription, resumeSellerSubscription, subscribeSeller } from "@/lib/monetize";
import {
  TRIAL_DAYS,
  annualSaving,
  daysUntil,
  formatZAR,
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
 * plans.ts (single source of truth), 7-day trial, current-plan awareness,
 * cancel/resume of renewals and real billing history from `payments/{reference}`.
 *
 * Checkout goes through /api/billing/checkout (server-resolved price) — the
 * browser only ever redirects to the provider's hosted page.
 */
export default function PricingClient() {
  const { user, loading } = useAuth();
  const uid = user?.uid ?? "";
  const [period, setPeriod] = useState<BillingPeriod>("monthly");
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // Admin-configured prices/limits (§21) — re-renders when overrides load.
  const plans = usePlans();

  const subs = useRealtime<Row>((cb, onErr) => (uid ? subscribeMySubscription(uid, cb as never, onErr) : () => {}), [], [uid]);
  const payments = useRealtime<Row>((cb, onErr) => (uid ? subscribeMyPayments(uid, cb as never, onErr) : () => {}), [], [uid]);

  const sub = subs.rows[0];
  const subPlan = (sub?.plan as PlanId | undefined) ?? null;
  const subStatus = String(sub?.subscription_status ?? sub?.status ?? "");
  const periodEnd = (sub?.current_period_end as string | undefined) ?? null;
  const cancelAtEnd = sub?.cancel_at_period_end === true;
  const subActive = subPlan !== null && subscriptionIsEntitled({
    status: subStatus,
    periodEnd,
    cancelAtPeriodEnd: cancelAtEnd,
  });
  const isTrial = subStatus === "trialing";
  const trialLeft = daysUntil((sub?.trial_ends_at as string | undefined) ?? null);
  const currentRank = subActive ? planRank(subPlan) : -1;

  async function choose(planId: PlanId) {
    setBusyPlan(planId);
    setError(null);
    setNote(null);
    try {
      // "free" maps to the 7-day Starter trial on the server (one per account).
      const planArg: PlanId | "free" = planId === "starter" && !sub ? "free" : planId;
      const res = await subscribeSeller(planArg, undefined, { period });
      if (res.url) {
        window.location.assign(res.url); // hosted checkout — the browser only redirects
        return;
      }
      if (res.trial) setNote(res.message ?? "Your 7-day free trial has started.");
      else if (res.ok) setNote(res.message ?? "Plan updated.");
      else setError(res.message ?? "Could not start checkout.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start checkout.");
    } finally {
      setBusyPlan(null);
    }
  }

  async function cancelRenewal() {
    if (!confirm("Cancel auto-renewal? You keep your plan until the end of the paid period.")) return;
    setBusyPlan("cancel");
    setError(null);
    try {
      const res = await cancelSellerSubscription(false);
      setNote(res.ok ? "Auto-renewal cancelled — your plan stays active until the period ends." : res.message ?? "Could not cancel.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel.");
    } finally {
      setBusyPlan(null);
    }
  }

  async function resumeRenewal() {
    setBusyPlan("resume");
    setError(null);
    try {
      const res = await resumeSellerSubscription();
      setNote(res.ok ? "Auto-renewal is back on." : res.message ?? "Could not resume.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resume.");
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

  function ctaFor(planId: PlanId): Cta {
    const rank = planRank(planId);
    if (!user) {
      return { label: "Sign in to choose", action: () => {}, tone: "navy", disabled: true };
    }
    if (subActive && rank === currentRank) {
      if (cancelAtEnd) {
        return { label: "Resume auto-renewal", action: resumeRenewal, tone: "ghost", current: true, disabled: busyPlan === "resume" };
      }
      return { label: "Current plan — cancel renewal", action: cancelRenewal, tone: "ghost", current: true, disabled: busyPlan === "cancel" };
    }
    if (subActive && rank < currentRank) {
      return { label: `Downgrade to ${planId}`, action: () => choose(planId), tone: "ghost", disabled: busyPlan === planId };
    }
    if (subActive && rank > currentRank) {
      return { label: `Upgrade to ${planId}`, action: () => choose(planId), tone: "primary", disabled: busyPlan === planId };
    }
    if (planId === "starter" && !sub) {
      return { label: `Start ${TRIAL_DAYS}-day free trial`, action: () => choose(planId), tone: "primary", disabled: busyPlan === planId };
    }
    return { label: `Choose ${planId}`, action: () => choose(planId), tone: rank === 1 ? "primary" : "navy", disabled: busyPlan === planId };
  }
  const maxSaving = Math.max(...plans.map((p) => annualSaving(p).percent));

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <header className="hippo-hero min-w-0 rounded-3xl p-5 text-center text-white anim-rise sm:p-10">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#ffc72c]">Plans &amp; pricing</p>
        <h1 className="mt-2 break-words text-3xl font-black tracking-tight sm:text-5xl">Get matched with buyers who need you</h1>
        <p className="mx-auto mt-3 max-w-2xl break-words text-sm text-white/75 sm:text-base">
          Every plan starts with matched quote requests, a business profile and reviews. {TRIAL_DAYS}-day
          free trial on Starter. Cancel anytime.
        </p>

        {/* Monthly / Annual toggle (§23) */}
        <div className="mt-6 inline-flex items-center gap-1 rounded-full bg-white/10 border border-white/25 p-1" role="group" aria-label="Billing period">
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
          <p className="text-xs text-white/70 mt-2">Annual billing = 2 months free, charged once a year.</p>
        )}
      </header>

      {error && <p className="text-sm font-bold text-red-700 bg-red-50 rounded-2xl px-4 py-3">{error}</p>}
      {note && <p className="text-sm font-bold text-[#3c6b1d] bg-[#e8f6d8] rounded-2xl px-4 py-3">{note}</p>}
      <ErrorNote error={subs.error as RealtimeError | null} />
      {/* Trial status banner (§22) */}
      {isTrial && (
        <section className="hippo-card p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-black text-[#10243e]">Starter Trial</h2>
            <span className="text-[10px] font-black bg-[#fff4d6] text-[#a36508] rounded-full px-2 py-0.5">
              {trialLeft} {trialLeft === 1 ? "day" : "days"} remaining
            </span>
          </div>
          <div className="mt-2 h-2.5 rounded-full bg-[#f2f6fa] overflow-hidden" role="progressbar" aria-valuenow={Math.max(0, trialLeft)} aria-valuemin={0} aria-valuemax={TRIAL_DAYS}>
            <div className="h-full rounded-full bg-[#7ac142]" style={{ width: `${Math.max(0, Math.min(100, (trialLeft / TRIAL_DAYS) * 100))}%` }} />
          </div>
          <p className="text-xs text-[#1d3a5f]/60 mt-2">
            {trialLeft > 0
              ? `Your trial ends in ${trialLeft} ${trialLeft === 1 ? "day" : "days"}. Choose a plan below to keep your lead allowance flowing — nothing is charged during the trial.`
              : "Your trial has ended — pick a plan below to keep receiving matched leads."}
          </p>
        </section>
      )}

      {/* Current-plan status strip (§23: current plan + renewal date) */}
      {subActive && (
        <section className="hippo-card p-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span>Current plan: <b className="uppercase text-[#10243e]">{String(subPlan)}</b>{isTrial ? " (trial)" : ""}</span>
          <span>Renews: <b className="text-[#10243e]">{periodEnd ? new Date(periodEnd).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" }) : "—"}</b>{cancelAtEnd ? " (auto-renewal off)" : ""}</span>
          {typeof sub?.lead_limit === "number" && (
            <span>Leads: <b className="text-[#10243e]">{String(sub.leads_used ?? 0)}/{String(sub.lead_limit)}</b> this period</span>
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
      <div className="grid md:grid-cols-3 gap-4 items-stretch">
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
              {p.trialDays ? <p className="text-[11px] text-[#1d3a5f]/60 mt-0.5">{p.trialDays}-day free trial</p> : null}
              <p className="text-xs text-[#1d3a5f]/60 mt-2">{p.blurb}</p>
              <p className="mt-3 rounded-xl bg-[#e8f6d8] px-3 py-2 text-sm font-extrabold text-[#3c6b1d]">
                {p.includedCredits} credits included monthly
              </p>
              {p.id === "starter" && p.trialDays ? (
                <p className="mt-1 text-[11px] text-[#1d3a5f]/60">
                  Starter credits begin after the trial, with your first paid month.
                </p>
              ) : null}
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
              {isCurrent && <p className="text-[11px] text-[#1d3a5f]/55 text-center mt-2">You&apos;re on this plan{isTrial ? " (trial)" : ""}.</p>}
            </div>
          );
        })}
      </div>

      {!user && !loading && (
        <p className="text-center text-sm text-[#1d3a5f]/70">
          <Link href="/list-business" className="font-bold text-[#558c2b] hover:underline">List your business first →</Link>{" "}
          (or sign in above to choose a plan)
        </p>
      )}
    </div>
  );
}
