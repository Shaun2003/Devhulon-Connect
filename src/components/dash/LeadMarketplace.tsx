"use client";

import { useState } from "react";
import Link from "next/link";
import { KIcon } from "@/lib/icons";
import { useAuth } from "@/components/AuthProvider";
import {
  useRealtime,
  subscribeMarketplaceLeads,
  subscribeMyWallet,
  subscribeMyCreditLedger,
  subscribeMyUnlockedLeads,
  subscribeMySubscription,
} from "@/lib/realtime";
import { unlockLead, buyCreditPack } from "@/lib/repo";
import { creditPriceFor, LEAD_TIER_CREDITS, LEAD_TIER_LABEL, tierForLead } from "@/lib/credits";
import { formatZAR, normalizePlanId, subscriptionIsEntitled } from "@/lib/plans";
import { Panel, EmptyLine, ErrorNote } from "@/components/dash/parts";
import CreditPackGrid from "@/components/dash/CreditPackGrid";

type Row = Record<string, unknown>;

/**
 * The seller's realtime lead marketplace (marketplace spec §2–§4).
 *
 * The core of the pay-per-contact model, and the whole reason it is realtime:
 * a seller watches OPEN requests arrive the instant a buyer posts one, sees a
 * contact-stripped PREVIEW (what's needed, roughly where, when, and the credit
 * price), and spends credits to reveal a specific buyer's phone/email. The buyer
 * contact is never in the preview — it is the thing being sold.
 *
 * Everything here reads through realtime listeners and every state change (an
 * unlock, a purchase) flows back through them, so the balance, the ledger and the
 * "unlocked" badges all update live with no refresh.
 */
export default function LeadMarketplace() {
  const { user } = useAuth();
  const uid = user?.uid ?? "";

  // Realtime feeds. All three are always-on for this panel because the header
  // renders the balance and the feed marks unlocked leads — gating them on a
  // sub-tab would make the numbers flicker.
  const feed = useRealtime<Row>((cb, onErr) => (uid ? subscribeMarketplaceLeads(cb as never, onErr) : () => {}), [], [uid]);
  const wallet = useRealtime<Row>(
    // subscribeMyWallet is a SINGLE-DOC listener: it emits `null` while the wallet
    // doc doesn't exist yet, then one row OBJECT. useRealtime stores a ROW ARRAY —
    // passing its callback straight through (the old `cb as never`) made `rows`
    // `null` (crashing `wallet.rows[0]` on first render for a seller with no
    // wallet) or a bare object (whose `[0]` is undefined → balance stuck at 0).
    // Normalise here: null → [], row → [row].
    (cb, onErr) => (uid ? subscribeMyWallet(uid, (row) => cb(row ? [row] : []), onErr) : () => {}),
    [],
    [uid]
  );
  const ledger = useRealtime<Row>((cb, onErr) => (uid ? subscribeMyCreditLedger(uid, cb as never, onErr) : () => {}), [], [uid]);
  const unlocks = useRealtime<Row>((cb, onErr) => (uid ? subscribeMyUnlockedLeads(uid, cb as never, onErr) : () => {}), [], [uid]);
  // PREMIUM CATALOGUE: the lead marketplace (packs + feed + unlocks) is part of
  // the paid catalogue, not the free tier. The subscription doc is the single
  // source of truth for entitlement — the same doc the server checks inside
  // unlockLeadContact, so the UI gate and the enforcement can never disagree.
  const subs = useRealtime<Row>((cb, onErr) => (uid ? subscribeMySubscription(uid, cb as never, onErr) : () => {}), [], [uid]);
  const subDoc = (subs.rows[0] ?? {}) as {
    plan?: string;
    subscription_status?: string;
    status?: string;
    current_period_end?: string | null;
    cancel_at_period_end?: boolean;
    leads_used?: number;
  };
  const premiumActive = normalizePlanId(subDoc.plan) === "premium" && subscriptionIsEntitled({
    plan: "premium",
    status: subDoc.subscription_status ?? subDoc.status,
    periodEnd: subDoc.current_period_end,
    cancelAtPeriodEnd: subDoc.cancel_at_period_end,
  });
  const effectivePlan = premiumActive ? "premium" : "starter";
  const entitled = true;

  const balance = Number(wallet.rows[0]?.balance ?? 0);
  const subscriptionBalance = Number(wallet.rows[0]?.subscriptionBalance ?? 0);
  const purchasedBalance = Number(wallet.rows[0]?.purchasedBalance ?? balance);
  const starterLimitReached = effectivePlan === "starter" && Number(subDoc.leads_used ?? 0) >= 3;
  const unlockedIds = new Set(unlocks.rows.flatMap((u) => [
    String(u.leadId ?? ""),
    String(u.requestId ?? ""),
  ]));

  const [busyId, setBusyId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, { phone: string; email: string | null; name: string | null; conversationId: string }>>({});
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showPacks, setShowPacks] = useState(false);

  async function onUnlock(leadId: string) {
    setErr(null);
    setNotice(null);
    setBusyId(leadId);
    try {
      const res = await unlockLead(leadId);
      setRevealed((prev) => ({ ...prev, [leadId]: { ...res.contact, conversationId: res.conversationId } }));
      setNotice(
        res.already
          ? "You've already unlocked this request — here are the contact details again."
          : `Unlocked for ${res.credits} credits. New balance: ${res.balance}.`
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not unlock this request.";
      setErr(msg);
      // A not-enough-credits failure is the moment to sell a pack.
      if (/credit/i.test(msg)) setShowPacks(true);
    } finally {
      setBusyId(null);
    }
  }

  async function onBuy(packId: string) {
    setErr(null);
    try {
      const { url } = await buyCreditPack(packId);
      if (url) window.location.href = url;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not start checkout.");
    }
  }

  return (
    <div className="space-y-5">
      {/* Starter can browse and unlock eligible leads; Premium only removes the
          monthly opportunity cap and adds seller tools. */}
      {!entitled && (
        <div className="hippo-card p-6 text-center space-y-3">
          <span className="icon-3d icon-3d-sm mx-auto"><KIcon name="lock" size={20} /></span>
          <h2 className="font-black text-[#10243e]">Your Premium access has ended</h2>
          <p className="text-sm text-[#1d3a5f]/70 max-w-md mx-auto">
            Your account is on Starter. Your listing, existing conversations and purchased credits remain available.
          </p>
          <Link href="/pricing" className="btn-hippo text-sm inline-flex">View Premium </Link>
        </div>
      )}

      {entitled && (
      <>
      {/* Credit balance — the seller's spendable wallet, live. */}
      <div className="hippo-card p-5 flex flex-wrap items-center gap-4 justify-between">
        <div className="flex items-center gap-3">
          <span className="icon-3d icon-3d-sm"><KIcon name="award" size={20} /></span>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#558c2b]">Credit balance</p>
            <p className="text-3xl font-black text-[#10243e] leading-none">
              {balance}
              <span className="text-sm font-bold text-[#1d3a5f]/50"> available credits</span>
            </p>
            <p className="mt-1 text-xs text-[#1d3a5f]/60">
              {subscriptionBalance} monthly · {purchasedBalance} purchased
            </p>
          </div>
        </div>
        {effectivePlan === "starter" && (
          <div className="hippo-card px-5 py-4 flex flex-wrap items-center justify-between gap-3 text-sm">
            <p className="text-[#1d3a5f]/75">
              Starter opportunities: <b className="text-[#10243e]">{Math.min(3, Number(subDoc.leads_used ?? 0))}/3</b> this allocation period.
              Buying credits does not change this limit.
            </p>
            {starterLimitReached && <Link href="/pricing" className="font-extrabold text-[#558c2b] hover:underline">Upgrade to Premium </Link>}
          </div>
        )}
        <button onClick={() => setShowPacks((s) => !s)} className="btn-hippo text-sm">
          {showPacks ? "Hide credit packs" : "Buy credits "}
        </button>
      </div>

      {err && <p className="text-sm font-bold text-red-700 bg-red-50 rounded-2xl px-4 py-3" role="alert">{err}</p>}
      {notice && <p className="text-sm font-bold text-[#3c6b1d] bg-[#e8f6d8] rounded-2xl px-4 py-3" role="status">{notice}</p>}

      {showPacks && (
        <Panel title="Buy credits" live={false}>
          <p className="text-sm text-[#1d3a5f]/70 mb-3">
            Monthly plan credits expire at the next allocation and do not roll over. Purchased credits remain available until spent. Credits are charged only when you unlock a genuine buyer request.
          </p>
          <details className="mb-4 rounded-xl border border-[#e7eef5] bg-[#f8fafc] p-4">
            <summary className="cursor-pointer text-sm font-extrabold text-[#10243e]">
              Credit pricing information
            </summary>
            <div className="mt-3 space-y-3 text-sm text-[#1d3a5f]/75">
              <p>Each buyer contact unlock uses credits. The required credit amount is shown before you reveal a buyer&apos;s contact details.</p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {([
                  ["small", "Small job · buyer budget under R3,000"],
                  ["standard", "Standard job · buyer budget R3,000–R14,999"],
                  ["large", "Large project · buyer budget R15,000–R49,999 or estimated large from the job description"],
                  ["major", "Major project · buyer budget R50,000+"],
                ] as const).map(([tier, description]) => (
                  <li key={tier} className="rounded-xl bg-white p-3">
                    <span className="block font-black text-[#10243e]">{LEAD_TIER_CREDITS[tier]} credits to unlock</span>
                    {description}
                  </li>
                ))}
              </ul>
              <p className="text-xs">
                If the buyer doesn&apos;t enter a budget, the job description is used to estimate its tier. Your subscription gives access to the lead catalogue; purchased credits are separate and pay for contact unlocks.
              </p>
            </div>
          </details>
          <CreditPackGrid onBuy={onBuy} />
        </Panel>
      )}

      <Panel title="Find leads — new requests, live" count={feed.rows.length} live={feed.live}>
        <ErrorNote error={feed.error} />
        {feed.rows.length === 0 ? (
          <EmptyLine what="No open requests right now — new ones appear here the second a buyer posts them." />
        ) : (
          <div className="space-y-3">
            {feed.rows.map((l, i) => {
              const lid = String(l.id ?? "");
              const isMine = String(l.requesterUid ?? "") === uid;
              const requestId = String(l.requestId ?? lid);
              const alreadyUnlocked = unlockedIds.has(lid) || unlockedIds.has(requestId) || Boolean(revealed[lid]);
              const price = creditPriceFor(l as Parameters<typeof creditPriceFor>[0]);
              const tier = tierForLead(l as Parameters<typeof tierForLead>[0]);
              return (
                <article key={lid || i} className="rounded-2xl border border-[#e7eef5] p-4">
                  <div className="flex flex-wrap items-start gap-2 justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-[10px] font-black uppercase rounded-full px-2 py-0.5 ${tier === "major" ? "bg-[#5b2c83] text-white" : tier === "large" ? "bg-[#10243e] text-[#ffc72c]" : tier === "standard" ? "bg-[#e8f6d8] text-[#3c6b1d]" : "bg-[#f2f6fa] text-[#1d3a5f]/70"}`}>
                          {LEAD_TIER_LABEL[tier]}
                        </span>
                        {l.category ? <span className="text-[11px] font-bold text-[#1d3a5f]/60">{String(l.category)}</span> : null}
                        {l.timeline ? <span className="text-[11px] font-bold text-[#1d3a5f]/60">· {String(l.timeline)}</span> : null}
                      </div>
                      <p className="text-sm font-bold text-[#10243e] mt-1.5">{String(l.need ?? "Service request")}</p>
                      {/* Approximate location only — the buyer's exact address is never shown. */}
                      <p className="text-xs text-[#1d3a5f]/60 mt-0.5 flex items-center gap-1">
                        <KIcon name="mapPin" size={13} /> {l.suburb ? String(l.suburb) : "Location shared on unlock"}
                      </p>
                      {typeof l.budget === "number" && l.budget > 0 && (
                        <p className="mt-1 text-xs font-extrabold text-[#3c6b1d]">
                          Buyer budget: {formatZAR(l.budget)}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-black leading-tight text-[#10243e]">
                        {price}
                        <span className="block text-xs font-bold text-[#1d3a5f]/60">credits</span>
                      </p>
                    </div>
                  </div>

                  {/* Contact is hidden until unlocked — this is what's being sold. */}
                  {revealed[lid] ? (
                    <div className="mt-3 rounded-xl bg-[#f3f9ec] border border-[#d6e1ec] p-3">
                      <p className="text-xs font-extrabold uppercase tracking-wider text-[#558c2b] flex items-center gap-1">
                        <KIcon name="check" size={13} /> Contact unlocked
                      </p>
                      <div className="mt-1.5 grid sm:grid-cols-2 gap-1 text-sm">
                        {revealed[lid].name && <p className="text-[#10243e]"><b>Name:</b> {revealed[lid].name}</p>}
                        <p className="text-[#10243e]"><b>Phone:</b> <a href={`tel:${revealed[lid].phone}`} className="font-bold text-[#558c2b] hover:underline">{revealed[lid].phone}</a></p>
                        {revealed[lid].email && <p className="text-[#10243e] break-all"><b>Email:</b> {revealed[lid].email}</p>}
                      </div>
                      <div className="flex gap-3 mt-2">
                        {revealed[lid].conversationId && (
                          <Link href={`/messages?c=${encodeURIComponent(revealed[lid].conversationId)}`} className="text-xs font-bold text-[#558c2b] hover:underline">Open conversation </Link>
                        )}
                        {revealed[lid].phone && (
                          <a href={`tel:${revealed[lid].phone}`} className="text-xs font-bold text-[#558c2b] hover:underline">Call now </a>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 flex items-center gap-2">
                      <p className="text-xs text-[#1d3a5f]/55 flex items-center gap-1">
                        <KIcon name="lock" size={13} /> Contact details hidden until you unlock.
                      </p>
                      {!isMine && (
                        <button
                          disabled={busyId === lid}
                          onClick={() => onUnlock(lid)}
                          className={`ml-auto rounded-lg text-xs font-bold px-3 py-1.5 disabled:opacity-50 ${alreadyUnlocked ? "bg-[#10243e] text-white" : "btn-hippo"}`}
                        >
                          {busyId === lid
                            ? "Unlocking…"
                            : alreadyUnlocked
                            ? "View unlocked contact"
                            : `View lead & contact · ${price} credits`}
                        </button>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </Panel>

      {/* Ledger — the auditable trail behind the balance. */}
      <Panel title="Credit history" count={ledger.rows.length} live={ledger.live}>
        <ErrorNote error={ledger.error} />
        {ledger.rows.length === 0 ? (
          <EmptyLine what="No credit activity yet. Buy a pack to start unlocking leads." />
        ) : (
          <ul className="divide-y divide-[#eef3f8]">
            {ledger.rows.map((t) => {
              const amount = Number(t.amount ?? 0);
              const spend = String(t.type) === "spend";
              return (
                <li key={String(t.id)} className="flex items-center justify-between py-2 text-sm">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className={`w-6 h-6 rounded-full grid place-items-center shrink-0 ${spend ? "bg-[#fff4d6] text-[#a36508]" : "bg-[#e8f6d8] text-[#3c6b1d]"}`}>
                      <KIcon name={spend ? "send" : "award"} size={13} />
                    </span>
                    <span className="text-[#10243e] truncate">{String(t.note ?? (spend ? "Lead unlock" : "Credit purchase"))}</span>
                  </span>
                  <span className={`font-black shrink-0 ${spend ? "text-[#a36508]" : "text-[#3c6b1d]"}`}>
                    {spend ? "−" : "+"}{amount}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      </>
      )}
    </div>
  );
}
