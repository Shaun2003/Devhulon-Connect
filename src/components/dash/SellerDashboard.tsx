"use client";
import { KIcon, type IconKey } from "@/lib/icons";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { useRealtime, subscribeMyBusinesses, subscribeMyTeamMemberships, subscribeBusinessesForOwners, subscribeLeadsInbox, subscribeMySubscription, subscribeMyUnlockedLeads, subscribeJobs, subscribeEvents, subscribeDeals, subscribePlaces, subscribeArticles, subscribeMyQuotes, subscribePortfolioByOwner, subscribeBookingsBySeller } from "@/lib/realtime";
import { setLeadStatus, deleteBusiness, deleteFeedItem, setFeedItemFeatured, withdrawQuote, markLeadViewed, sellerBookingAction, unlockLead, type LeadStatus } from "@/lib/repo";
import { DashboardSkeleton, Panel, EmptyLine, ErrorNote, SignInInline } from "@/components/dash/parts";
import PortfolioPanel from "@/components/dash/PortfolioPanel";
import ProfileStrength from "@/components/dash/ProfileStrength";
import ServiceAreaEditor from "@/components/dash/ServiceAreaEditor";
import SellerAnalytics from "@/components/dash/SellerAnalytics";
import LeadMarketplace from "@/components/dash/LeadMarketplace";
import TeamManagement from "@/components/dash/TeamManagement";
import SupportPanel from "@/components/dash/SupportPanel";
import VerificationRequest from "@/components/dash/VerificationRequest";
import { BOOKING_STATUS_LABEL, BOOKING_STATUS_TONE, bookingWhen, normalizeBookingStatus } from "@/lib/bookings";
import QuoteComposer from "@/components/quotes/QuoteComposer";
import { QUOTE_STATUS_LABEL, QUOTE_STATUS_TONE, normalizeQuoteStatus } from "@/lib/quotes";
import { formatZAR, hasCap, limitsFor, subscriptionIsEntitled } from "@/lib/plans";
import { creditPriceFor } from "@/lib/credits";
import { SITE_SHORT } from "@/lib/site";
import { greetingFor } from "@/lib/utils";

type Row = Record<string, unknown>;
const hasLeadUnlock = (lead: Row, unlockIds: ReadonlySet<string>) =>
  unlockIds.has(String(lead.id ?? "")) || unlockIds.has(String(lead.requestId ?? ""));
const tabs = ["listings", "leads", "bookings", "marketplace", "quotes", "analytics", "portfolio", "areas", "my posts", "team", "support", "plan", "verification"] as const;
type Tab = (typeof tabs)[number];

/**
 * Seller hub: realtime listings, credit-unlocked leads and the subscription panel.
 * Role = seller required.
 */
export default function SellerDashboard({ initialTab = "listings" }: { initialTab?: "listings" | "leads" | "marketplace" }) {
  const { user, role, loading } = useAuth();
  const uid = user?.uid ?? "";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [acting, setActing] = useState<string | null>(null);
  const [leadActionError, setLeadActionError] = useState<string | null>(null);
  const [exportingLeads, setExportingLeads] = useState(false);
  const [featuredBusinessBusy, setFeaturedBusinessBusy] = useState<string | null>(null);
  // Contacts revealed by paying (unlocks) this session — the lead doc itself
  // never carries contact, so the revealed details live here until reload.
  const [revealed, setRevealed] = useState<Record<string, { phone: string; email: string | null; name: string | null; conversationId: string }>>({});

  const biz = useRealtime<Row>((cb, onErr) => (uid ? subscribeMyBusinesses(uid, cb as never, onErr) : () => {}), [], [uid]);
  const teamMemberships = useRealtime<Row>((cb, onErr) => (uid ? subscribeMyTeamMemberships(uid, cb as never, onErr) : () => {}), [], [uid]);
  const activeTeamMemberships = teamMemberships.rows.filter((membership) => (membership.status ?? "active") === "active");
  const teamOwnerIds = [...new Set(activeTeamMemberships.map((membership) => String(membership.ownerUid ?? "")).filter(Boolean))];
  const sharedBusinesses = useRealtime<Row>(
    (cb, onErr) => subscribeBusinessesForOwners(teamOwnerIds, cb as never, onErr),
    [],
    [teamOwnerIds.join(",")],
  );
  const leads = useRealtime<Row>((cb, onErr) => (uid ? subscribeLeadsInbox(uid, cb as never, onErr) : () => {}), [], [uid]);
  const unlockedLeads = useRealtime<Row>(
    (cb, onErr) => (uid && (tab === "leads" || tab === "quotes") ? subscribeMyUnlockedLeads(uid, cb as never, onErr) : () => {}),
    [],
    [uid, tab],
  );
  const subs = useRealtime<Row>((cb, onErr) => (uid ? subscribeMySubscription(uid, cb as never, onErr) : () => {}), [], [uid]);
  // The plan allowance is still used for delivery eligibility; contact access
  // itself is separately metered from the seller's credit wallet.
  const subDoc = (subs.rows[0] ?? {}) as {
    plan?: string;
    lead_limit?: number | null;
    leads_used?: number;
    subscription_status?: string;
    status?: string;
    current_period_end?: string | null;
    cancel_at_period_end?: boolean;
  };
  const subscriptionEntitled = subscriptionIsEntitled({
    status: subDoc.subscription_status ?? subDoc.status,
    periodEnd: subDoc.current_period_end,
    cancelAtPeriodEnd: subDoc.cancel_at_period_end,
  });
  const plan = subscriptionEntitled ? (subDoc.plan ?? "starter") : "starter";
  const leadLimit = subscriptionEntitled
    ? typeof subDoc.lead_limit === "number" ? subDoc.lead_limit : limitsFor(plan).leadsPerMonth
    : limitsFor("starter").leadsPerMonth;
  const leadsUsed = subscriptionEntitled ? Number(subDoc.leads_used ?? 0) : 0;

  // ── Tab-scoped subscriptions ──────────────────────────────────────────────
  // This dashboard used to open TWELVE realtime listeners the moment it mounted,
  // whatever tab you were on — so a seller who only wanted to check their listing
  // was paying Firestore reads for their bookings, quotes, portfolio and five
  // post collections simultaneously, and every one of them stayed live for as
  // long as the page was open. Firestore bills per document read, so that is the
  // single largest avoidable cost in the app.
  //
  // Now each feed is gated on its tab. `listings`, `leads` and the subscription
  // stay always-on because the header renders from them on every tab; everything
  // else opens when its tab is first visited. Default view goes from 12 live
  // queries to 4.
  //
  // TRADE-OFF, deliberately taken: a tab's badge count is now shown once you have
  // visited that tab (it renders nothing before then, rather than a misleading 0).
  // Showing a real count for 9 unopened collections is precisely the cost being
  // removed — a dot indicating "has items" would need the same reads.
  const onTab = (t: Tab) => tab === t;
  const myJobs = useRealtime<Row>((cb, onErr) => (uid && onTab("my posts") ? subscribeJobs(cb as never, onErr) : () => {}), [], [uid, tab]);
  const myEvents = useRealtime<Row>((cb, onErr) => (uid && onTab("my posts") ? subscribeEvents(cb as never, onErr) : () => {}), [], [uid, tab]);
  const myDeals = useRealtime<Row>((cb, onErr) => (uid && onTab("my posts") ? subscribeDeals(cb as never, onErr) : () => {}), [], [uid, tab]);
  const myPlaces = useRealtime<Row>((cb, onErr) => (uid && onTab("my posts") ? subscribePlaces(cb as never, onErr) : () => {}), [], [uid, tab]);
  const myGuides = useRealtime<Row>((cb, onErr) => (uid && onTab("my posts") ? subscribeArticles(cb as never, onErr) : () => {}), [], [uid, tab]);
  const myQuotes = useRealtime<Row>((cb, onErr) => (uid && onTab("quotes") ? subscribeMyQuotes(uid, cb as never, onErr) : () => {}), [], [uid, tab]);
  const work = useRealtime<Row>((cb, onErr) => (uid && (onTab("portfolio") || onTab("listings")) ? subscribePortfolioByOwner(uid, cb as never, onErr) : () => {}), [], [uid, tab]);
  const bookings = useRealtime<Row>((cb, onErr) => (uid && onTab("bookings") ? subscribeBookingsBySeller(uid, cb as never, onErr) : () => {}), [], [uid, tab]);
  const [leadFilter, setLeadFilter] = useState<string>("all");
  const unlockedLeadIds = useMemo(
    () => new Set(unlockedLeads.rows.flatMap((row) => [
      String(row.leadId ?? ""),
      String(row.requestId ?? ""),
    ])),
    [unlockedLeads.rows],
  );
  const allLeads = leads.rows;
  const allShownLeads = leadFilter === "all" ? allLeads : allLeads.filter((lead) => String(lead.status ?? "new") === leadFilter);
  const allMyQuotes = myQuotes.rows;
  // Requests this seller took on but hasn't quoted yet (accept-first workflow).
  const needsQuote = allLeads.filter((l) =>
    hasLeadUnlock(l, unlockedLeadIds) && ["accepted", "negotiating"].includes(String(l.status ?? ""))
  );

  const showTeamTab = hasCap(plan, "teamMembers") || teamMemberships.rows.length > 0;
  const listingRows = [...biz.rows, ...sharedBusinesses.rows.filter((shared) => !biz.rows.some((owned) => owned.id === shared.id))];
  /** Primary listing — the strength card and the areas tab resolve to it first. */
  const primary = biz.rows[0] as (Row & { ownerUid?: string }) | undefined;

  // Tab presentation. Labels are short so the strip stays readable on a phone,
  // and every count is derived from the SAME realtime row sets the panels render,
  // so the number on the tab can never disagree with the list underneath it.
  const TAB_LABEL: Record<Tab, string> = {
    listings: "Listings",
    leads: "Leads",
    bookings: "Bookings",
    marketplace: "Find leads",
    quotes: "Quotes",
    analytics: "Analytics",
    portfolio: "Portfolio",
    areas: "Areas",
    "my posts": "My posts",
    team: "Team",
    support: "Support",
    plan: "Plan",
    verification: "Verify",
  };
  const TAB_ICON: Record<Tab, IconKey> = {
    listings: "building",
    leads: "message",
    bookings: "calendar",
    marketplace: "award",
    quotes: "file",
    analytics: "trendingUp",
    portfolio: "image",
    areas: "mapPin",
    "my posts": "megaphone",
    team: "building",
    support: "message",
    plan: "award",
    verification: "badgeCheck",
  };
  // Badge counts are `undefined` until that tab's feed has actually loaded. That is
  // the visible cost of tab-scoped subscriptions: a gated tab shows no number until
  // first visit. Rendering `0` there would be worse — it would be a confidently
  // wrong answer, telling a seller they have no bookings when we simply have not
  // looked yet.
  const TAB_COUNT: Partial<Record<Tab, () => number | undefined>> = {
    listings: () => listingRows.length,
    leads: () => allLeads.length,
    bookings: () => (bookings.live ? bookings.rows.length : undefined),
    quotes: () => (myQuotes.live ? allMyQuotes.length : undefined),
    portfolio: () => (work.live ? work.rows.length : undefined),
    "my posts": () =>
      myJobs.live
        ? myJobs.rows.length + myEvents.rows.length + myDeals.rows.length + myPlaces.rows.length + myGuides.rows.length
        : undefined,
  };

  async function toggleFeaturedBusiness(businessId: string, featured: boolean) {
    if (!user) return;
    setFeaturedBusinessBusy(businessId);
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/business/featured", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, featured }),
      });
      const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok || result.ok !== true) throw new Error(result.error ?? "Could not update featured placement.");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not update featured placement.");
    } finally {
      setFeaturedBusinessBusy(null);
    }
  }

  // Only a seller who has paid to unlock the request may progress its pipeline.
  useEffect(() => {
    if (tab !== "quotes" || !uid) return;
    for (const l of allLeads) {
      if (hasLeadUnlock(l, unlockedLeadIds) &&
          ["new", "accepted"].includes(String(l.status ?? ""))) {
        void markLeadViewed(String(l.id ?? ""));
      }

    }
  }, [tab, uid, allLeads, unlockedLeadIds]);

  async function act(leadId: string, status: LeadStatus) {
    setActing(leadId + status);
    try {
      // Accepted leads carry our business contact so the BUYER sees who replied.
      // Declined leads get status only — no contact details exposed.
      const mine = biz.rows[0] as { name?: string; phone?: string; whatsapp?: string } | undefined;
      await setLeadStatus(
        leadId,
        status,
        status === "accepted"
          ? { ownerUid: uid, businessName: mine?.name, phone: mine?.phone, whatsapp: mine?.whatsapp }
          : undefined
      );
    } catch (e) { alert(e instanceof Error ? e.message : "Could not update lead."); } finally { setActing(null); }
  }
  /**
   * Pay-per-contact: the lead doc no longer carries the buyer's phone/email —
   * it lives in the server-only vault and is revealed by spending credits
   * (POST /api/leads/unlock, atomic + idempotent server-side). A failure here
   * (not enough credits / no active plan) surfaces the server's message, which
   * is exactly the upgrade / buy-credits prompt the seller needs to see.
   */
  async function reveal(leadId: string) {
    setActing(leadId + "unlock");
    setLeadActionError(null);
    try {
      const res = await unlockLead(leadId);
      setRevealed((prev) => ({ ...prev, [leadId]: { ...res.contact, conversationId: res.conversationId } }));
    } catch (e) {
      setLeadActionError(e instanceof Error ? e.message : "Could not unlock this contact.");
    } finally {
      setActing(null);
    }
  }

  async function exportLeads() {
    if (!user) return;
    setExportingLeads(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/leads/export", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!response.ok) {
        const result = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(result.error ?? "Could not export leads.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "kasi-leads.csv";
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not export leads.");
    } finally {
      setExportingLeads(false);
    }
  }

  if (loading) return <DashboardSkeleton title="Loading seller hub" />;

  if (!user || !uid) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10 text-center space-y-4 sm:py-16">
        <span className="text-5xl"><KIcon name="building" size={14} className="inline shrink-0" /></span>
        <h1 className="text-3xl font-black text-[#10243e]">Seller hub</h1>
        <p className="text-sm text-[#1d3a5f]/70">Sign in to manage your listings, leads and plan.</p>
        <SignInInline />
      </div>
    );
  }

  if (role !== "seller") {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10 text-center space-y-4 sm:py-16">
        <h1 className="text-3xl font-black text-[#10243e]">Switch to a seller account</h1>
        <p className="text-sm text-[#1d3a5f]/70">Your buyer dashboard and saved businesses stay untouched.</p>
        <Link href="/register-seller" className="btn-hippo text-sm inline-flex">Continue seller registration →</Link>
        <Link href="/dashboard" className="block text-xs font-bold text-[#558c2b] hover:underline">Keep me as a buyer</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl min-w-0 px-4 py-6 space-y-5 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#558c2b]">Seller hub</p>
          <h1 className="text-2xl sm:text-3xl font-black text-[#10243e] break-words">{greetingFor()}, {user.displayName ?? "seller"}</h1>
        </div>
        <Link href="/list-business" className="btn-hippo text-sm ml-auto">+ New listing</Link>
      </header>

      {/* Tabs scroll horizontally on a phone instead of forcing the page wide.
          Each tab carries its icon + live count, so the bar reads the same way
          as the rest of the site and the numbers are always visible. */}
      <nav className="scroll-x -mx-1 px-1" aria-label="Seller dashboard sections">
        {tabs.filter((t) => t !== "team" || showTeamTab).map((t) => {
          const label = TAB_LABEL[t];
          const count = TAB_COUNT[t]?.();
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              aria-current={tab === t ? "page" : undefined}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap px-3.5 py-2 rounded-full text-sm font-bold transition ${
                tab === t
                  ? "hippo-tab-active"
                  : "bg-white border border-[#d6e1ec] text-[#1d3a5f] hover:border-[#7ac142]"
              }`}
            >
              <KIcon name={TAB_ICON[t]} size={14} className="shrink-0" />
              {label}
              {count !== undefined && (
                <span
                  className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-black leading-none ${
                    tab === t ? "bg-black/15" : "bg-[#f2f6fa] text-[#1d3a5f]/70"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {tab === "listings" && (
        <div className="space-y-5">
          {/* Profile strength sits at the top of the hub: one glance, one next step. */}
          <ProfileStrength
            input={{
              name: primary ? String(primary.name ?? "") : "",
              description: primary ? String(primary.description ?? "") : "",
              phone: primary ? String(primary.phone ?? "") : "",
              hours: primary ? String(primary.hours ?? "") : "",
              priceNote: primary ? String(primary.priceNote ?? "") : "",
              hasPhoto: Boolean(primary?.coverImageUrl || (primary?.photos as unknown[] | undefined)?.length),
              servicesCount: Array.isArray(primary?.services) ? (primary?.services as unknown[]).length : 0,
              serviceAreasCount: Array.isArray(primary?.serviceAreas) ? (primary?.serviceAreas as unknown[]).length : 0,
              portfolioCount: work.rows.length,
              verified: primary?.verified === true,
              businessId: primary ? String(primary.id ?? "") : null,
            }}
            onTab={(t) => setTab(t)}
          />
          <Panel
            title="My listings"
            count={listingRows.length}
            live={biz.live && sharedBusinesses.live}
            loading={(!biz.live || !sharedBusinesses.live) && !biz.error && !sharedBusinesses.error}
          >
          <ErrorNote error={biz.error} />
          <ErrorNote error={sharedBusinesses.error} />
          {listingRows.length === 0 ? (
            <EmptyLine what="No listings yet." ctaHref="/list-business" ctaLabel="List your business" />
          ) : (
            listingRows.map((b, i) => (
              <div key={String(b.id ?? i)} className="flex flex-wrap items-center gap-2 rounded-xl border border-[#e7eef5] p-3">
                <b className="text-[#10243e]">{String(b.name ?? "Listing")}</b>
                <span className="text-xs text-[#1d3a5f]/60">{String(b.suburbSlug ?? "")} · {String(b.categorySlug ?? "")}</span>
                {!biz.rows.some((owned) => owned.id === b.id) && <span className="text-[10px] font-black uppercase text-[#558c2b]">Shared</span>}
                {b.verified
                  ? <span className="text-[10px] font-black bg-[#e8f6d8] text-[#3c6b1d] rounded-full px-2 py-0.5"><KIcon name="check" size={14} className="inline shrink-0" /> Verified</span>
                  : <span className="text-[10px] font-black bg-[#fff4d6] text-[#a36508] rounded-full px-2 py-0.5">Pending check</span>}
                <Link href={`/business/${String(b.id)}`} className="text-xs font-bold text-[#558c2b] hover:underline ml-auto">View →</Link>
                <Link href={`/business/${String(b.id)}/edit`} className="text-xs font-bold text-[#10243e] hover:underline">Edit</Link>
                {biz.rows.some((owned) => owned.id === b.id) && hasCap(plan, "featuredProfile") && (
                  <button
                    type="button"
                    disabled={featuredBusinessBusy === String(b.id)}
                    onClick={() => void toggleFeaturedBusiness(String(b.id), b.featured !== true)}
                    className="text-xs font-bold text-[#558c2b] hover:underline disabled:opacity-50"
                  >
                    {featuredBusinessBusy === String(b.id) ? "Saving…" : b.featured === true ? "Remove feature" : "Feature profile"}
                  </button>
                )}
                {biz.rows.some((owned) => owned.id === b.id) && (
                  <button
                    onClick={() => { if (confirm("Delete this listing permanently?")) deleteBusiness(String(b.id)).catch((e) => alert(e instanceof Error ? e.message : "Failed")); }}
                    className="text-xs font-bold text-red-700 hover:underline"
                  >
                    Delete
                  </button>
                )}
              </div>
            ))
          )}
        </Panel>
        </div>
      )}

      {tab === "leads" && (
        <Panel
          title="Leads inbox"
          count={allShownLeads.length}
          live={leads.live}
          loading={(!leads.live || !unlockedLeads.live) && !leads.error && !unlockedLeads.error}
        >
          {hasCap(plan, "leadExport") && (
            <button
              type="button"
              onClick={() => void exportLeads()}
              disabled={exportingLeads}
              className="mb-3 rounded-full border-2 border-[#10243e] px-4 py-2 text-xs font-extrabold text-[#10243e] disabled:opacity-50"
            >
              {exportingLeads ? "Preparing export…" : "Export leads CSV"}
            </button>
          )}
          <ErrorNote error={leads.error} />
          <ErrorNote error={unlockedLeads.error} />
          {leadActionError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
              <p>{leadActionError}</p>
              <button
                type="button"
                onClick={() => {
                  setLeadActionError(null);
                  setTab("marketplace");
                }}
                className="mt-2 font-bold underline"
              >
                Go to Find leads and credits →
              </button>
            </div>
          )}
          {/* Status filter — spec §15: filter the pipeline without leaving the tab. */}
          <div className="flex flex-wrap gap-1.5 pb-1">
            {["all", "new", "viewed", "accepted", "quoted", "negotiating", "won", "lost"].map((f) => (
              <button
                key={f}
                onClick={() => setLeadFilter(f)}
                aria-pressed={leadFilter === f}
                className={`rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide transition border ${
                  leadFilter === f ? "bg-[#10243e] text-white border-[#10243e]" : "bg-white text-[#1d3a5f] border-[#d6e1ec] hover:border-[#7ac142]"
                }`}
              >
                {f}
                {f !== "all" && (
                  <span className="ml-1 opacity-60">{allLeads.filter((l) => String(l.status ?? "new") === f).length}</span>
                )}
              </button>
            ))}
          </div>
          {leadFilter !== "all" && allShownLeads.length === 0 ? (
            <EmptyLine what={`Nothing in “${leadFilter}” right now.`} />
          ) : null}
          {leadFilter === "all" && allLeads.length === 0 ? (
            <EmptyLine what="No requests yet. Select Find leads to browse new buyer requests." />
          ) : (
            allShownLeads.map((l, i) => {
              const lid = String(l.id ?? "");
              const st = String(l.status ?? "new");
              const busy = acting === lid + "accepted" || acting === lid + "declined";
              const isUnlocked = hasLeadUnlock(l, unlockedLeadIds) || Boolean(revealed[lid]);
              const price = creditPriceFor(l as Parameters<typeof creditPriceFor>[0]);
              // Once a request is resolved — accepted, won, lost or declined — the
              // seller must not keep seeing live Accept/Decline buttons. Losing a
              // job is a normal outcome of a contested request, not an error, so it
              // is stated plainly instead of being hidden or left actionable.
              const closed = ["accepted", "quoted", "negotiating", "won", "lost", "declined"].includes(st);
              const lostElsewhere = st === "lost" && String(l.lostReason ?? "") === "awarded_elsewhere";
              return (
                <div
                  key={lid || i}
                  className={`rounded-xl border p-3 ${
                    lostElsewhere ? "border-[#e7eef5] bg-[#f8fafc] opacity-80" : "border-[#e7eef5]"
                  }`}
                >
                  <p className="text-sm font-bold text-[#10243e]">{String(l.need ?? "Quote request")}</p>
                  <p className="text-xs text-[#1d3a5f]/60 mt-0.5">
                    {String(l.suburb ?? "")} · {String(l.businessName ?? "")} · status: <b>{st}</b>
                    {/* Transparency: a seller who can see they are one of several
                        competing bids quotes more carefully and feels treated
                        fairly — Bark shows the same thing. */}
                    {Number(l.maxSellers ?? 0) > 1 && (
                      <span className="ml-1">· shared with up to {String(l.maxSellers)} pros</span>
                    )}
                  </p>
                  {typeof l.budget === "number" && l.budget > 0 && (
                    <p className="mt-1 text-xs font-extrabold text-[#3c6b1d]">
                      Buyer budget: {formatZAR(l.budget)}
                    </p>
                  )}
                  {lostElsewhere && (
                    <p className="text-xs font-bold text-[#1d3a5f]/70 bg-[#eef2f6] rounded-lg px-3 py-2 mt-2">
                      This job went to another business. No action needed — your allowance was not spent on this.
                    </p>
                  )}
                  {!closed && (
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <button
                        disabled={busy || acting === lid + "unlock"}
                        onClick={() => reveal(lid)}
                        className="rounded-lg bg-[#10243e] text-white text-xs font-bold px-3 py-1.5 disabled:opacity-50"
                      >
                        {acting === lid + "unlock"
                          ? "Unlocking…"
                          : revealed[lid]
                            ? "View contact (unlocked)"
                            : isUnlocked
                              ? "Reveal contact →"
                              : `Unlock contact · ${price} credits`}
                      </button>
                      {revealed[lid] && (
                        <>
                          <a href={`tel:${revealed[lid].phone.replace(/\s/g, "")}`} className="text-xs font-extrabold text-[#10243e] border-2 border-[#10243e] rounded-lg px-3 py-1.5 hover:bg-[#10243e] hover:text-white transition"><KIcon name="phone" size={14} className="inline shrink-0" /> {revealed[lid].phone}</a>
                          {revealed[lid].email && <a href={`mailto:${revealed[lid].email}`} className="text-xs font-bold text-[#558c2b] hover:underline">{revealed[lid].email}</a>}
                          {revealed[lid].conversationId && <Link href={`/messages?c=${encodeURIComponent(revealed[lid].conversationId)}`} className="text-xs font-bold text-[#558c2b] hover:underline">Open Conversation →</Link>}
                        </>
                      )}
                      {isUnlocked ? (
                        <>
                          <button disabled={busy} onClick={() => act(lid, "accepted")} className="rounded-lg bg-[#558c2b] text-white text-xs font-bold px-3 py-1.5 disabled:opacity-50">Accept</button>
                          <button disabled={busy} onClick={() => act(lid, "declined")} className="rounded-lg border text-xs font-bold px-3 py-1.5 disabled:opacity-50">Decline</button>
                        </>
                      ) : (
                        <p className="w-full text-xs text-[#1d3a5f]/60">Unlock with credits before contacting or responding to this buyer.</p>
                      )}
                    </div>
                  )}
                  {/* Contact details stay visible after accepting, because the job
                      is live business — but never on a lost/declined lead, where
                      the lead was never won. ONLY `revealed` is used here: the
                      lead doc's `phone` field is overwritten with the SELLER'S
                      own business contact on accept (so the buyer can see who
                      replied), so rendering `l.phone` would ring yourself. */}
                  {closed && st !== "lost" && st !== "declined" && revealed[lid] && (
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <a href={`tel:${revealed[lid].phone.replace(/\s/g, "")}`} className="text-xs font-extrabold text-[#10243e] border-2 border-[#10243e] rounded-lg px-3 py-1.5 hover:bg-[#10243e] hover:text-white transition"><KIcon name="phone" size={14} className="inline shrink-0" /> {revealed[lid].phone}</a>
                      {revealed[lid].email && <a href={`mailto:${revealed[lid].email}`} className="text-xs font-bold text-[#558c2b] hover:underline">{revealed[lid].email}</a>}
                      {revealed[lid].conversationId && <Link href={`/messages?c=${encodeURIComponent(revealed[lid].conversationId)}`} className="text-xs font-bold text-[#558c2b] hover:underline">Open Conversation →</Link>}
                    </div>
                  )}
                  {closed && st !== "lost" && st !== "declined" && !revealed[lid] && (
                    <button
                      disabled={acting === lid + "unlock"}
                      onClick={() => reveal(lid)}
                      className="mt-2 rounded-lg bg-[#10243e] text-white text-xs font-bold px-3 py-1.5 disabled:opacity-50"
                    >
                      {acting === lid + "unlock"
                        ? "Loading contact…"
                        : isUnlocked
                          ? "View contact (unlocked)"
                          : `Unlock contact · ${price} credits`}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </Panel>
      )}

      {tab === "bookings" && (
        <Panel title="Your diary — booking requests" count={bookings.rows.length} live={bookings.live} loading={!bookings.live && !bookings.error}>
          <ErrorNote error={bookings.error} />
          {bookings.rows.length === 0 ? (
            <EmptyLine
              what="No bookings yet. Buyers book a date and time straight from your profile — confirm or move them here."
              ctaHref="/list-business"
              ctaLabel="Get your listing bookable"
            />
          ) : (
            bookings.rows.map((bk) => {
              const id = String(bk.id ?? "");
              const st = normalizeBookingStatus(bk.status);
              const busy = acting === id;
              const live = st === "requested" || st === "confirmed";
              return (
                <div key={id} className="rounded-xl border border-[#e7eef5] p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="text-sm text-[#10243e]">{bookingWhen(bk)}</b>
                    <span className={`text-[10px] font-black uppercase rounded-full px-2 py-0.5 ${BOOKING_STATUS_TONE[st]}`}>
                      {BOOKING_STATUS_LABEL[st]}
                    </span>
                    {st === "rescheduled" && <span className="text-[10px] font-bold text-[#a36508]">new time agreed</span>}
                  </div>
                  {String(bk.note ?? "") && (
                    <p className="text-xs text-[#1d3a5f]/70 mt-1">Buyer: {String(bk.note)}</p>
                  )}
                  {live && (
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      {st === "requested" && (
                        <button
                          disabled={busy}
                          onClick={() => sellerBookingAction(id, "confirmed").catch((e) => alert(e instanceof Error ? e.message : "Failed"))}
                          className="rounded-lg bg-[#558c2b] text-white text-xs font-bold px-3 py-1.5 disabled:opacity-50"
                        >
                          Confirm
                        </button>
                      )}
                      <button
                        disabled={busy}
                        onClick={() => {
                          const date = prompt("New date (YYYY-MM-DD):", String(bk.date ?? "")) ?? "";
                          const time = prompt("New start time (HH:MM):", String(bk.time ?? "")) ?? "";
                          if (date && time) {
                            sellerBookingAction(id, "rescheduled", { date, time }).catch((e) => alert(e instanceof Error ? e.message : "Failed"));
                          }
                        }}
                        className="rounded-lg border text-xs font-bold px-3 py-1.5 disabled:opacity-50"
                      >
                        Reschedule
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => {
                          if (confirm("Cancel this booking? The buyer is notified.")) {
                            sellerBookingAction(id, "cancelled").catch((e) => alert(e instanceof Error ? e.message : "Failed"));
                          }
                        }}
                        className="rounded-lg border text-xs font-bold px-3 py-1.5 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      {st === "confirmed" && (
                        <>
                          <button
                            disabled={busy}
                            onClick={() => sellerBookingAction(id, "completed").catch((e) => alert(e instanceof Error ? e.message : "Failed"))}
                            className="rounded-lg bg-[#10243e] text-white text-xs font-bold px-3 py-1.5 disabled:opacity-50"
                          >
                            Mark completed
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => {
                              if (confirm("Mark this booking as a no-show?")) {
                                sellerBookingAction(id, "no-show").catch((e) => alert(e instanceof Error ? e.message : "Failed"));
                              }
                            }}
                            className="rounded-lg border text-xs font-bold px-3 py-1.5 disabled:opacity-50"
                          >
                            No-show
                          </button>
                        </>
                      )}
                    </div>
                  )}
                  {String(bk.sellerNote ?? "") && (
                    <p className="text-xs text-[#1d3a5f]/60 mt-1">Your note: {String(bk.sellerNote)}</p>
                  )}
                </div>
              );
            })
          )}
        </Panel>
      )}

      {tab === "marketplace" && <LeadMarketplace />}

      {tab === "quotes" && (
        <div className="space-y-4">
          <Panel
            title="Send a quote"
            count={needsQuote.length}
            live={leads.live}
            loading={(!leads.live || !unlockedLeads.live) && !leads.error && !unlockedLeads.error}
          >
            <ErrorNote error={leads.error} />
            <ErrorNote error={unlockedLeads.error} />
            {needsQuote.length === 0 ? (
              <EmptyLine what="No accepted requests waiting on a quote. Accept a request in Leads first — only then can you quote it." />
            ) : (
              needsQuote.map((l) => {
                const lid = String(l.id ?? "");
                return (
                  <QuoteComposer
                    key={lid}
                    leadId={lid}
                    requestSummary={`${String(l.need ?? "Quote request")} · ${String(l.suburb ?? "")}`}
                  />
                );
              })
            )}
          </Panel>

          <Panel title="Quotes you've sent" count={allMyQuotes.length} live={myQuotes.live} loading={!myQuotes.live && !myQuotes.error}>
            <ErrorNote error={myQuotes.error} />
            {allMyQuotes.length === 0 ? (
              <EmptyLine what="No quotes sent yet — accepted requests above turn into quotes the buyer can compare." />
            ) : (
              allMyQuotes.map((q) => {
                const qid = String(q.id ?? "");
                const qs = normalizeQuoteStatus(q.status);
                const quoteLeadId = String(q.leadId ?? "");
                const quoteRequestId = String(q.requestId ?? "");
                const quoteLead = allLeads.find((lead) => String(lead.id ?? "") === quoteLeadId)
                  ?? (quoteRequestId ? allLeads.find((lead) => String(lead.requestId ?? "") === quoteRequestId) : undefined);
                return (
                  <div key={qid} className="rounded-xl border border-[#e7eef5] p-3 flex flex-wrap items-center gap-2">
                    <b className="text-sm text-[#10243e]">{formatZAR(Number(q.price ?? 0))}</b>
                    <span className="text-xs text-[#1d3a5f]/60">{String(q.duration ?? "")}</span>
                    <span className={`text-[10px] font-black rounded-full px-2 py-0.5 ${QUOTE_STATUS_TONE[qs]}`}>
                      {QUOTE_STATUS_LABEL[qs]}
                    </span>
                    {quoteLead && (
                      <div className="basis-full rounded-lg bg-[#f2f6fa] px-3 py-2 text-xs text-[#1d3a5f]/80">
                        <p><b className="text-[#10243e]">Buyer request:</b> {String(quoteLead.need ?? "Request details unavailable")}</p>
                        {(quoteLead.suburb != null || quoteLead.place != null) && <p className="mt-1">Location: {String(quoteLead.suburb ?? quoteLead.place)}</p>}
                        {quoteLead.timeline != null && <p className="mt-1">Timing: {String(quoteLead.timeline)}</p>}
                        {quoteLead.budget != null && String(quoteLead.budget) !== "" && <p className="mt-1">Buyer budget: {String(quoteLead.budget)}</p>}
                      </div>
                    )}
                    {qs === "sent" && (
                      <button
                        onClick={() => {
                          if (confirm("Withdraw this quote? The buyer will no longer see it as an option.")) {
                            withdrawQuote(qid).catch((e) => alert(e instanceof Error ? e.message : "Failed"));
                          }
                        }}
                        className="ml-auto text-xs font-bold text-red-700 hover:underline"
                      >
                        Withdraw
                      </button>
                    )}
                    {String(q.buyerResponse ?? "") !== "" && (
                      <p className="basis-full text-xs text-[#1d3a5f]/70">Buyer said: {String(q.buyerResponse)}</p>
                    )}
                  </div>
                );
              })
            )}
          </Panel>

          <p className="text-xs text-[#1d3a5f]/60">
            A quote is your formal reply — price, what&apos;s included, warranty and availability. Buyers
            compare quotes side-by-side and choose; {SITE_SHORT} never ranks a winner for them.
          </p>
        </div>
      )}

      {tab === "analytics" && (
        <Panel title="Analytics" live={biz.live} loading={!biz.live && !biz.error}>
          <ErrorNote error={biz.error} />
          <SellerAnalytics plan={plan} biz={primary ?? null} leads={allLeads} quotes={allMyQuotes} bookings={bookings.rows} />
        </Panel>
      )}

      {tab === "portfolio" && (
        <Panel title="Portfolio — your proof of work" count={work.rows.length} live={work.live} loading={!work.live && !work.error}>
          <ErrorNote error={work.error} />
          {biz.rows.length === 0 ? (
            <EmptyLine what="You need a listing before you can attach portfolio items." ctaHref="/list-business" ctaLabel="List your business" />
          ) : (
            <PortfolioPanel items={work.rows} listings={biz.rows} plan={plan} />
          )}
        </Panel>
      )}

      {tab === "areas" && (
        <Panel title="Service areas — where you show up" live={biz.live} loading={!biz.live && !biz.error}>
          <ErrorNote error={biz.error} />
          {biz.rows.length === 0 ? (
            <EmptyLine what="You need a listing before you can set service areas." ctaHref="/list-business" ctaLabel="List your business" />
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-[#1d3a5f]/60">
                Matched quote requests are steered by these areas — keep them honest and you get fewer
                wasted leads.
              </p>
              {biz.rows.map((b) => (
                <ServiceAreaEditor
                  key={String(b.id ?? "")}
                  businessId={String(b.id ?? "")}
                  businessName={String(b.name ?? "Listing")}
                  current={Array.isArray(b.serviceAreas) ? (b.serviceAreas as unknown[]).map(String) : []}
                  plan={plan}
                />
              ))}
            </div>
          )}
        </Panel>
      )}

      {tab === "my posts" && (
        <div className="space-y-4">
          <p className="text-xs text-[#1d3a5f]/60">
            Pending posts show on the public feed only to you until an admin approves them. <KIcon name="star" size={14} className="inline shrink-0" />             Featured deal and event placement is available to Business sellers.
          </p>
          {([["jobs", myJobs, "/jobs"], ["events", myEvents, "/events"], ["deals", myDeals, "/deals"],
             ["places", myPlaces, "/places"], ["guides", myGuides, "/guides"]] as const).map(([col, feed, href]) => {
            const mine = feed.rows.filter((r) => String(r.createdBy ?? "") === uid);
            return (
              <Panel key={col} title={`${col.toUpperCase()} by you (${mine.length})`} live={feed.live} loading={!feed.live && !feed.error}>
                <ErrorNote error={feed.error} />
                {mine.length === 0 ? (
                  <p className="text-xs text-[#1d3a5f]/60">None yet — post from the <Link href={href} className="font-bold text-[#558c2b] hover:underline">{col}</Link> page.</p>
                ) : (
                  mine.map((p) => {
                    const pid = String(p.id ?? "");
                    const st = String(p.status ?? "live");
                    const feat = Boolean(p.featured);
                    // One-line preview so the seller can recognise the post without
                    // opening it — taken from whichever field that collection uses.
                    const preview = String(
                      p.detail ?? p.excerpt ?? p.fee ?? p.pay ?? p.date ?? p.company ?? p.venue ?? p.business ?? "",
                    ).slice(0, 140);
                    return (
                      <div key={pid} className="rounded-xl border border-[#e7eef5] p-3 flex flex-wrap items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <b className="text-sm text-[#10243e] block">{String(p.title ?? "")}</b>
                          {preview && <span className="text-xs text-[#1d3a5f]/65 block mt-0.5">{preview}</span>}
                          <span className="flex flex-wrap items-center gap-2 mt-1.5">
                            {st === "pending" && <span className="text-[10px] font-black bg-[#fff4d6] text-[#a36508] rounded-full px-2 py-0.5">Pending review</span>}
                            {feat && <span className="text-[10px] font-black bg-[#10243e] text-[#ffc72c] rounded-full px-2 py-0.5"><KIcon name="star" size={14} className="inline shrink-0" /> Featured</span>}
                          </span>
                        </div>
                        <span className="flex gap-3 shrink-0">
                          <Link href={href} className="text-xs font-bold text-[#1d3a5f] hover:underline">Preview</Link>
                          {hasCap(plan, col === "deals" ? "featuredDeals" : col === "events" ? "featuredEvents" : "promoFeatures") && ["deals", "events"].includes(col) && (
                            <button
                              onClick={() => setFeedItemFeatured(col, pid, !feat).catch((e) => alert(e instanceof Error ? e.message : "Failed"))}
                              className="text-xs font-bold text-[#558c2b] hover:underline"
                            >
                              {feat ? "Unfeature" : <><KIcon name="star" size={13} className="inline shrink-0" /> Feature</>}
                            </button>
                          )}
                          <button
                            onClick={() => { if (confirm("Delete this post?")) deleteFeedItem(col, pid).catch((e) => alert(e instanceof Error ? e.message : "Failed")); }}
                            className="text-xs font-bold text-red-700 hover:underline"
                          >
                            Delete
                          </button>
                        </span>
                      </div>
                    );
                  })
                )}
              </Panel>
            );
          })}
        </div>
      )}

      {tab === "team" && (
        <Panel title="Team members">
          <TeamManagement />
        </Panel>
      )}

      {tab === "support" && (
        <Panel title="Contact support">
          <SupportPanel plan={plan} />
        </Panel>
      )}

      {tab === "plan" && (
        <Panel title="Your subscription" live={subs.live} loading={!subs.live && !subs.error}>
          <ErrorNote error={subs.error} />
          <div className="rounded-xl bg-[#f3f9ec] p-4">
            <p className="text-sm">Current plan: <b className="uppercase">{plan}</b></p>
            <p className="text-xs text-[#1d3a5f]/70 mt-1">
              Lead allowance this period:{" "}
              {leadLimit === null ? (
                <b className="uppercase">unlimited</b>
              ) : (
                <b>
                  {leadsUsed} / {leadLimit} used
                </b>
              )}
              {leadLimit !== null && (
                <> — <b>{Math.max(0, leadLimit - leadsUsed)}</b> remaining</>
              )}
            </p>
            <p className="text-xs text-[#1d3a5f]/70 mt-1">
              {leadLimit !== null && leadsUsed >= leadLimit
                ? "You have used every lead in your allowance this period. Upgrade to keep receiving matched requests."
                : "Every matched request you receive uses one lead from this allowance."}
            </p>
            {/* A seller at their cap is a seller to convert — the upgrade prompt
                is the revenue moment, so it must be visible here. */}
            {leadLimit !== null && leadsUsed >= leadLimit && (
              <Link href="/list-business" className="btn-hippo text-xs mt-3 inline-flex">
                Upgrade for more leads →
              </Link>
            )}
          </div>
          <Link href="/list-business" className="btn-sun text-sm w-fit">Manage plan / upgrade →</Link>
        </Panel>
      )}

      {tab === "verification" && <VerificationRequest businessId={String(primary?.id ?? "")} businessName={String(primary?.name ?? "")} />}
    </div>
  );
}