"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { useRealtime, subscribeLeadsByRequester, subscribeQuotesForBuyer, subscribeTopBusinesses } from "@/lib/realtime";
import { SignInInline, ErrorNote } from "@/components/dash/parts";
import QuoteComparison from "@/components/quotes/QuoteComparison";
import { KIcon } from "@/lib/icons";
import { SITE_SHORT } from "@/lib/site";
import { PageHero } from "@/components/ui";

type Row = Record<string, unknown>;

/**
 * Buyer's quote centre (§17): pick a request, compare every quote on it.
 * Realtime, so a quote that lands while you're on the page appears instantly.
 */
export default function CompareQuotesClient({ initialLeadId }: { initialLeadId?: string }) {
  const { user, loading } = useAuth();
  const uid = user?.uid ?? "";

  const leads = useRealtime<Row>((cb, onErr) => (uid ? subscribeLeadsByRequester(uid, cb as never, onErr) : () => {}), [], [uid]);
  const quotes = useRealtime<Row>((cb, onErr) => (uid ? subscribeQuotesForBuyer(uid, cb as never, onErr) : () => {}), [], [uid]);
  // Businesses are public, so one listener covers every seller who quoted.
  const biz = useRealtime<Row>((cb, onErr) => subscribeTopBusinesses(cb as never, onErr), [], []);
  const [picked, setPicked] = useState("");

  /**
   * Group by the PARENT REQUEST, not by the seller's own lead copy.
   *
   * A broadcast writes one lead per matched seller. Those leads used to be
   * unlinkable, so the buyer saw the SAME job listed N times and could only ever
   * compare one seller's offers against themselves — the opposite of what a quote
   * comparison is for. Every lead and quote now carries `requestId`, which is what
   * makes "one job, every competing seller" a single row.
   *
   * Leads created before this change have no `requestId`, so they fall back to
   * their own id — a request of one, which is still correct.
   */
  const requests = useMemo(() => {
    const byRequest = new Map<string, { lead: Row; id: string; quoteCount: number }>();

    for (const lead of leads.rows) {
      const leadId = String(lead.id ?? "");
      if (!leadId) continue;
      // The canonical request doc (businessId null — ownerUid is NOT a reliable
      // signal, because a seller CLAIMING the open request sets ownerUid while
      // the doc remains the buyer's parent request) is the best representative;
      // a seller-facing copy is only a stand-in when it is absent.
      const requestId = String(lead.requestId ?? "") || leadId;
      const existing = byRequest.get(requestId);
      const isCanonical = lead.businessId == null;
      if (!existing || (isCanonical && existing.lead.ownerUid)) {
        byRequest.set(requestId, {
          lead: isCanonical ? lead : (existing?.lead ?? lead),
          id: requestId,
          quoteCount: 0,
        });
      }
    }

    // Attach each quote to its request. Requests with NO replies yet are KEPT:
    // a buyer who has just asked for quotes needs to see that request sitting in
    // the list ("0 quotes", waiting). Dropping them here made a brand-new
    // request vanish from /compare-quotes until the first seller replied, which
    // reads as "my request never went through". QuoteComparison renders its
    // "No quotes on this request yet" waiting state for those rows.
    const out: { lead: Row; id: string; quoteCount: number }[] = [];
    for (const entry of byRequest.values()) {
      const mine = quotes.rows.filter((q) => (String(q.requestId ?? "") || String(q.leadId ?? "")) === entry.id);
      out.push({ ...entry, quoteCount: mine.length });
    }
    return out.sort((a, b) => String(b.lead.createdAt ?? "").localeCompare(String(a.lead.createdAt ?? "")));
  }, [leads.rows, quotes.rows]);

  /**
   * Deep-link resolution for `/compare-quotes?lead=<id>`.
   *
   * Notifications link with the SELLER's lead id (the seller-facing copy), but
   * the rows above are keyed by the PARENT request id. Without this mapping the
   * id matched no row, `active` came back null and the page opened on an empty
   * comparison — the buyer's "you have a quote" tap showed nothing. Resolve the
   * copy to its parent request (or pass through when it already is one).
   */
  const resolvedInitial = useMemo(() => {
    if (!initialLeadId) return "";
    if (requests.some((r) => r.id === initialLeadId)) return initialLeadId;
    const copy = leads.rows.find((r) => String(r.id ?? "") === initialLeadId);
    const parent = copy ? String(copy.requestId ?? "") || initialLeadId : "";
    return requests.some((r) => r.id === parent) ? parent : "";
  }, [initialLeadId, leads.rows, requests]);

  const fallbackId = String(resolvedInitial || requests.find((r) => r.quoteCount > 0)?.id || requests[0]?.id || "");
  const activeId = picked || fallbackId;
  const active = requests.find((r) => r.id === activeId)?.lead ?? null;
  const activeQuotes = activeId
    ? quotes.rows.filter((q) => (String(q.requestId ?? "") || String(q.leadId ?? "")) === activeId)
    : [];
  const hero = (
    <PageHero
      kicker="Compare quotes"
      title="Your requests, every quote, one screen"
      sub="Pick a request to compare the replies. Nothing is ranked automatically and no winner is chosen for you — you accept the quote that fits."
    />
  );

  if (loading) {
    return (
      <>
        {hero}
        <div className="mx-auto max-w-6xl animate-pulse space-y-5 px-4 py-8" role="status" aria-label="Loading your quotes">
          <span className="sr-only">Loading your quotes</span>
          <div className="grid gap-4 md:grid-cols-[20rem_1fr]">
            <div className="hippo-card space-y-3 p-4">
              {[0, 1, 2].map((item) => <div key={item} className="h-16 rounded-xl border border-[#e7eef5] bg-[#f7fafc]" />)}
            </div>
            <div className="hippo-card space-y-3 p-5">
              {[0, 1, 2].map((item) => <div key={item} className="h-16 rounded-xl border border-[#e7eef5] bg-[#f7fafc]" />)}
            </div>
          </div>
        </div>
      </>
    );
  }

  if (!user || !uid) {
    return (
      <>
        {hero}
        <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
          <span className="icon-3d icon-3d-sm mx-auto" aria-hidden="true"><KIcon name="sliders" size={26} /></span>
          <p className="text-sm text-[#1d3a5f]/70 max-w-lg mx-auto">
            Ask for what you need, then compare every reply on price, warranty, availability and reviews.
            Sign in to see your requests and the quotes local businesses sent you — browsing {SITE_SHORT} stays free.
          </p>
          <SignInInline />
          <p className="text-sm">
            <Link href="/request-quote" className="font-bold text-[#558c2b] hover:underline">No request yet? Get up to 3 quotes free </Link>
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      {hero}
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-5">
        <ErrorNote error={leads.error ?? quotes.error} />
        {requests.length === 0 ? (
          <div className="hippo-card p-6 sm:p-10 text-center">
            <span className="icon-3d icon-3d-sm mx-auto" aria-hidden="true"><KIcon name="search" size={26} /></span>
            <h2 className="text-xl font-black text-[#10243e] mt-3">No quote requests yet</h2>
            <p className="text-sm text-[#1d3a5f]/70 mt-1 max-w-md mx-auto">
              Tell us what you need and where — matching local businesses see it in their lead inbox and
              reply with real prices. Replies show up here for comparison.
            </p>
            <Link href="/request-quote" className="btn-hippo text-sm mt-4">Request quotes — free </Link>
          </div>
        ) : (
          <>
              <div className="hippo-card p-3 flex gap-2 overflow-x-auto">
                {requests.map((r) => {
                  const isActive = r.id === activeId;
                  return (
                    <button
                      key={r.id}
                      onClick={() => setPicked(r.id)}
                      aria-pressed={isActive}
                      className={`whitespace-nowrap rounded-2xl px-3 py-2 text-left text-xs font-bold transition border-2 ${
                        isActive
                          ? "border-[#7ac142] bg-[#f3f9ec] text-[#10243e]"
                          : "border-[#d6e1ec] bg-white text-[#1d3a5f] hover:border-[#7ac142]"
                      }`}
                    >
                      <span className="block max-w-[16rem] truncate">{String(r.lead.need ?? "Request")}</span>
                      <span className="block text-[10px] font-black uppercase tracking-wide text-[#1d3a5f]/60 mt-0.5">
                        {String(r.lead.status ?? "new")} · {r.quoteCount} {r.quoteCount === 1 ? "quote" : "quotes"}
                      </span>
                    </button>
                  );
                })}
              </div>

              {active && (
                <section className="hippo-card p-4">
                  <h2 className="font-black text-[#10243e]">Your request</h2>
                  <p className="text-sm text-[#1d3a5f]/80 mt-1">{String(active.need ?? "")}</p>
                  <div className="flex flex-wrap gap-3 text-xs text-[#1d3a5f]/60 mt-2">
                    <span>Area: <b className="text-[#10243e]">{String(active.suburb ?? "—")}</b></span>
                    <span>Status: <b className="text-[#10243e] uppercase">{String(active.status ?? "new")}</b></span>
                    <Link href="/request-quote" className="font-bold text-[#558c2b] hover:underline ml-auto">
                      Update or add another request 
                    </Link>
                  </div>
                </section>
              )}

              <QuoteComparison lead={active} requestId={activeId} quotes={activeQuotes} sellers={biz.rows} />
            </>
          )}
        </div>
    </>
  );
}
