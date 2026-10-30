"use client";
import { KIcon, type IconKey } from "@/lib/icons";
import { PageHero, Stars } from "@/components/ui";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { useSavedItems } from "@/components/SavedItemsProvider";
import { useRealtime, subscribeSavedItems, subscribeLeadsByRequester, subscribeReviewsByReviewer, subscribeSavedSearches, subscribeTopBusinesses, subscribeQuotesForBuyer, subscribeBookingsByBuyer, SAVED_ITEMS_LIMIT } from "@/lib/realtime";
import { deleteSavedSearch, buyerCancelBooking, hideBuyerDashboardItem, unsave } from "@/lib/repo";
import { waLink } from "@/lib/utils";
import { DashboardSkeleton, Panel, EmptyLine, ErrorNote, SignInInline } from "@/components/dash/parts";
import PrivacyPanel from "@/components/dash/PrivacyPanel";
import AccountSettings from "@/components/dash/AccountSettings";
import { SITE_SHORT } from "@/lib/site";
import { greetingFor } from "@/lib/utils";

type Row = Record<string, unknown>;
type BuyerSection =
  | "saved-businesses"
  | "saved-posts"
  | "requests"
  | "quotes"
  | "bookings"
  | "reviews"
  | "searches"
  | "saved-items"
  | "privacy"
  | "business"
  | "settings";

/** Filter chips for the saved list — mirrors SaveButton's SaveType union. */
const SAVED_FILTERS: ReadonlyArray<readonly [string, string]> = [
  ["", "All"],
  ["deal", "Deals"],
  ["event", "Events"],
  ["place", "Places"],
  ["guide", "Guides"],
  ["job", "Jobs"],
];

/**
 * Buyer hub: saved businesses, quote requests, own reviews — all realtime.
 * Browsing KASI is public; this dashboard needs a (free) account.
 */
export default function BuyerDashboard({ initialSection = "saved-businesses" }: { initialSection?: BuyerSection | "overview" }) {
  const { user, profileName, role, loading, roleLoading, sellerAccountReady } = useAuth();
  const [section, setSection] = useState<BuyerSection>(initialSection === "overview" ? "saved-businesses" : initialSection);
  const uid = user?.uid ?? "";

  // Saved BUSINESSES live in `saved_items` (itemType "business") — the same
  // collection the header counter reads. It previously read the legacy
  // `favorites` collection, so the two could disagree.
  const savedAll = useRealtime<Row>((cb, onErr) => (uid ? subscribeSavedItems(uid, cb as never, onErr) : () => {}), [], [uid]);
  const favs = useMemo(
    () => ({ ...savedAll, rows: savedAll.rows.filter((r) => String(r.itemType ?? "") === "business") }),
    [savedAll]
  );
  const savedJobs = useMemo(
    () => savedAll.rows.filter((r) => String(r.itemType ?? "") !== "business"),
    [savedAll.rows]
  );
  const leads = useRealtime<Row>((cb, onErr) => (uid ? subscribeLeadsByRequester(uid, cb as never, onErr) : () => {}), [], [uid]);
  const reviews = useRealtime<Row>((cb, onErr) => (uid ? subscribeReviewsByReviewer(uid, cb as never, onErr) : () => {}), [], [uid]);
  const searches = useRealtime<Row>((cb, onErr) => (uid ? subscribeSavedSearches(uid, cb as never, onErr) : () => {}), [], [uid]);
  const allBiz = useRealtime<Row>((cb, onErr) => subscribeTopBusinesses(cb as never, onErr), [], []);
  const quotes = useRealtime<Row>((cb, onErr) => (uid ? subscribeQuotesForBuyer(uid, cb as never, onErr) : () => {}), [], [uid]);
  const allLeads = useMemo(() => {
    const requests = new Map<string, Row>();
    for (const lead of leads.rows) {
      const requestId = String(lead.requestId ?? lead.id ?? "");
      if (!requestId) continue;
      const current = requests.get(requestId);
      if (!current || String(lead.id ?? "") === requestId) requests.set(requestId, lead);
    }
    return [...requests.values()];
  }, [leads.rows]);
  const allQuotes = quotes.rows;
  const bookings = useRealtime<Row>((cb, onErr) => (uid ? subscribeBookingsByBuyer(uid, cb as never, onErr) : () => {}), [], [uid]);
  // Reads the one app-wide listener from SavedItemsProvider — the dashboard does
  // not open a second identical query for the same data.
  const saved = useSavedItems();
  const [savedFilter, setSavedFilter] = useState("");
  const [deletingItem, setDeletingItem] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null);
  const [removalError, setRemovalError] = useState<{ key: string; message: string } | null>(null);
  const savedRows = useMemo(
    () => (savedFilter === "" ? saved.rows : saved.rows.filter((r) => String(r.itemType ?? "") === savedFilter)),
    [saved.rows, savedFilter]
  );
  const dashboardTabs: { id: BuyerSection; label: string; icon: IconKey; count?: number }[] = [
    { id: "saved-businesses", label: "Businesses", icon: "building", count: favs.rows.length },
    { id: "saved-posts", label: "Saved posts", icon: "layers", count: savedJobs.length },
    { id: "requests", label: "Quote requests", icon: "message", count: allLeads.length },
    { id: "quotes", label: "Quotes received", icon: "file", count: allQuotes.length },
    { id: "bookings", label: "Bookings", icon: "calendar", count: bookings.rows.length },
    { id: "reviews", label: "Reviews", icon: "star", count: reviews.rows.length },
    { id: "searches", label: "Saved searches", icon: "bell", count: searches.rows.length },
    { id: "saved-items", label: "Saved items", icon: "heart", count: saved.rows.length },
    { id: "privacy", label: "Privacy & data", icon: "lock" },
    { id: "business", label: "Business", icon: "building" },
    { id: "settings", label: "Settings", icon: "settings" },
  ];

  function itemLabel(type: string): string {
    return ({ deal: "Deal", event: "Event", place: "Place", guide: "Guide", job: "Job" } as Record<string, string>)[type] ?? type;
  }

  /**
   * Per-type icon for a saved row. The list used to render ONE hardcoded coin
   * glyph for every item, so a saved place, guide and job all looked identical
   * and the icon carried no meaning. This mirrors SaveButton's type union so the
   * row's icon matches the icon shown on the item's own card.
   */
  function itemIcon(type: string): IconKey {
    return ({
      deal: "tag",
      event: "calendar",
      place: "mapPin",
      guide: "file",
      job: "briefcase",
      business: "building",
    } as Record<string, IconKey>)[type] ?? "layers";
  }

  function itemHref(s: Row, type: string): string {
    const id = String(s.itemId ?? s.id ?? "");
    const slug = String(s.slug ?? "");
    const bid = String(s.businessId ?? "");
    // Only places, guides and businesses have detail routes (/places/[slug],
    // /guides/[slug], /business/[id]) — deals, events and jobs link to their live
    // board so a saved card can never 404.
    switch (type) {
      case "deal": return bid ? `/business/${bid}` : "/deals";
      case "event": return "/events";
      case "place": return `/places/${slug || id}`;
      case "guide": return `/guides/${slug || id}`;
      case "job": return "/jobs";
      default: return "#";
    }
  }

  function askToRemove(type: "request" | "quote", id: string) {
    const key = `${type}:${id}`;
    setPendingRemoval(key);
    setRemovalError(null);
  }

  async function removeDashboardItem(type: "request" | "quote", id: string) {
    const key = `${type}:${id}`;
    setDeletingItem(key);
    try {
      await hideBuyerDashboardItem(type, id);
      setPendingRemoval(null);
      setRemovalError(null);
    } catch (error) {
      setRemovalError({
        key,
        message: error instanceof Error ? error.message : "Could not remove this item.",
      });
    } finally {
      setDeletingItem(null);
    }
  }

  function removalControl(type: "request" | "quote", id: string, label: string) {
    const key = `${type}:${id}`;
    if (pendingRemoval !== key) {
      return (
        <button
          type="button"
          onClick={() => askToRemove(type, id)}
          aria-label={`Remove ${label} from your dashboard`}
          className="shrink-0 text-xs font-bold text-red-700 hover:underline"
        >
          Remove
        </button>
      );
    }

    return (
      <div className="flex flex-wrap items-center justify-end gap-2 sm:basis-full" role="group" aria-label={`Confirm removal of ${label}`}>
        <span className="text-xs text-[#1d3a5f]/70">Remove from your dashboard? Seller records stay unchanged.</span>
        <button
          type="button"
          disabled={deletingItem === key}
          onClick={() => void removeDashboardItem(type, id)}
          className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-800 disabled:opacity-50"
        >
          {deletingItem === key ? "Removing…" : "Confirm"}
        </button>
        <button
          type="button"
          disabled={deletingItem === key}
          onClick={() => {
            setPendingRemoval(null);
            setRemovalError(null);
          }}
          className="text-xs font-bold text-[#10243e] hover:underline disabled:opacity-50"
        >
          Cancel
        </button>
        {removalError?.key === key && <p className="basis-full text-right text-xs font-bold text-red-700" role="alert">{removalError.message}</p>}
      </div>
    );
  }

  function displayDate(value: unknown): string | null {
    let date: Date;
    if (value instanceof Date) {
      date = value;
    } else if (typeof value === "object" && value !== null && "toDate" in value && typeof value.toDate === "function") {
      date = value.toDate();
    } else if (typeof value === "string" || typeof value === "number") {
      date = new Date(value);
    } else {
      return null;
    }
    if (!Number.isFinite(date.getTime())) return null;
    return new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeZone: "Africa/Johannesburg" }).format(date);
  }


  if (loading || roleLoading) return <DashboardSkeleton title={`Loading your ${SITE_SHORT}`} />;

  if (!user || !uid) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10 text-center space-y-4 sm:py-16">
        <span className="text-5xl"><KIcon name="truck" size={14} className="inline shrink-0" /></span>
        <h1 className="text-3xl font-black text-[#10243e]">Your buyer dashboard</h1>
        <p className="text-sm text-[#1d3a5f]/70">Sign in to keep saved businesses, track quote requests and manage your reviews — all in one place. Browsing {SITE_SHORT} stays free without an account.</p>
        <SignInInline />
      </div>
    );
  }

  return (
    <>
      <PageHero kicker="Buyer dashboard" title={`${greetingFor()}, ${profileName || user.displayName || "neighbour"}`}>
        <nav className="scroll-x -mx-1 mt-4 px-1" aria-label="Buyer dashboard sections">
          {dashboardTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSection(tab.id)}
              aria-current={section === tab.id ? "page" : undefined}
              className={`mr-2 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-bold transition ${section === tab.id ? "hippo-tab-active" : "border border-white/25 bg-white/10 text-white hover:bg-white/20"}`}
            >
              <KIcon name={tab.icon} size={14} className="shrink-0" />
              {tab.label}
              {tab.count !== undefined && (
                <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-black leading-none ${section === tab.id ? "bg-black/15" : "bg-white/15"}`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </nav>
      </PageHero>
      <div className="mx-auto w-full max-w-6xl min-w-0 px-4 py-6 space-y-5 sm:px-6 sm:py-8">
      {section === "settings" && <AccountSettings />}
      {section !== "settings" && <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        {section === "saved-businesses" && (
        <Panel title="Saved businesses" count={favs.rows.length} live={favs.live} loading={!favs.live && !favs.error}>
          <ErrorNote error={favs.error} />
          {favs.rows.length === 0 ? (
            <EmptyLine what="Nothing saved yet — tap ☆ Save on any business profile." ctaHref="/services" ctaLabel="Browse services" />
          ) : (
            favs.rows.map((f, i) => (
              <div key={String(f.id ?? i)} className="flex items-center justify-between gap-2 rounded-xl border border-[#e7eef5] p-3">
                <Link href={`/business/${String(f.businessId ?? f.itemId ?? "")}`} className="min-w-0 hover:underline">
                  <b className="text-[#10243e] block truncate">{String(f.title ?? "Business")}</b>
                </Link>
                <button
                  onClick={() => unsave("business", String(f.itemId ?? f.businessId ?? "")).catch(() => {})}
                  className="text-xs font-bold text-red-700 hover:underline shrink-0"
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </Panel>
        )}

        {section === "saved-posts" && (
          <Panel title="Saved jobs, events, deals & guides" count={savedJobs.length} live={savedAll.live} loading={!savedAll.live && !savedAll.error}>
            <ErrorNote error={savedAll.error} />
            {savedJobs.length === 0 ? (
              <EmptyLine what="No saved posts yet." ctaHref="/jobs" ctaLabel="Explore posts" />
            ) : savedJobs.map((s, i) => (
              <div key={String(s.id ?? i)} className="flex items-center justify-between gap-2 rounded-xl border border-[#e7eef5] p-3">
                <span className="min-w-0">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#558c2b] block">{String(s.itemType ?? "")}</span>
                  <b className="text-[#10243e] block truncate">{String(s.title ?? "")}</b>
                </span>
                <button
                  onClick={() => unsave(String(s.itemType ?? ""), String(s.itemId ?? "")).catch(() => {})}
                  className="text-xs font-bold text-red-700 hover:underline shrink-0"
                >
                  Remove
                </button>
              </div>
            ))}
          </Panel>
        )}

        {section === "requests" && (
        <Panel title="My quote requests" count={allLeads.length} live={leads.live} loading={!leads.live && !leads.error}>
          <ErrorNote error={leads.error} />
          {allLeads.length === 0 ? (
            <EmptyLine what="No quote requests yet." ctaHref="/request-quote" ctaLabel="Request a quote" />
          ) : (
            allLeads.map((l, i) => {
              const st = String(l.status ?? "new");
              const phone = String(l.acceptedPhone ?? "");
              const wa = String(l.acceptedWhatsapp ?? "");
              return (
                <div key={String(l.id ?? i)} className="rounded-xl border border-[#e7eef5] p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <p className="min-w-0 flex-1 break-words text-sm font-bold text-[#10243e]">{String(l.need ?? "Quote request")}</p>
                    {removalControl("request", String(l.id ?? ""), "quote request")}
                  </div>
                  <p className="text-xs text-[#1d3a5f]/60 mt-0.5">
                    {String(l.suburb ?? "")} · {String(l.businessName ?? "Broadcast to locals")} ·{" "}
                    <b className={st === "accepted" ? "text-[#3c6b1d]" : st === "declined" ? "text-red-700" : "text-[#a36508]"}>{st}</b>
                  </p>
                  {st === "accepted" && (
                    <div className="mt-2 rounded-xl bg-[#f3f9ec] p-3">
                      <p className="text-xs font-extrabold uppercase tracking-widest text-[#3c6b1d]"><KIcon name="check" size={14} className="inline shrink-0" /> Accepted — contact your pro</p>
                      <p className="text-sm font-black text-[#10243e] mt-1">{String(l.acceptedBusinessName ?? "Local business")}</p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {phone && (
                          <a href={`tel:${phone.replace(/\s/g, "")}`} className="text-xs font-extrabold text-[#10243e] border-2 border-[#10243e] rounded-lg px-3 py-1.5 hover:bg-[#10243e] hover:text-white transition"><KIcon name="phone" size={14} className="inline shrink-0" /> {phone}</a>
                        )}
                        {wa && (
                          <a target="_blank" rel="noreferrer" href={waLink(wa, `Hi, I requested a quote on ${SITE_SHORT}: ${String(l.need ?? "")}`)} className="text-xs font-extrabold rounded-lg bg-[#25D366] text-white px-3 py-1.5 hover:brightness-95">WhatsApp</a>
                        )}
                      </div>
                    </div>
                  )}
                  {st === "declined" && (
                    <p className="text-xs text-[#1d3a5f]/60 mt-2">Declined — no contact details shared. <Link href="/request-quote" className="font-bold text-[#558c2b] hover:underline">Request quotes from other locals </Link></p>
                  )}
                  {st === "new" && <p className="text-xs text-[#a36508] mt-2">Waiting for replies — businesses in your area see this request live.</p>}
                </div>
              );
            })
          )}
        </Panel>
        )}

        {section === "quotes" && (
        <Panel title="Quotes received" count={allQuotes.length} live={quotes.live} loading={!quotes.live && !quotes.error}>
          <ErrorNote error={quotes.error} />
          {allQuotes.length === 0 ? (
            <EmptyLine
              what="No quotes yet — when a local business accepts your request and sends a price, it appears here."
              ctaHref="/compare-quotes"
              ctaLabel="Open compare view"
            />
          ) : (
            <>
              {allQuotes.map((q, i) => {
                const seller = allBiz.rows.find((b) => String(b.ownerUid ?? "") === String(q.sellerUid ?? ""));
                const st = String(q.status ?? "sent");
                return (
                  <div key={String(q.id ?? i)} className="flex flex-wrap items-center gap-2 rounded-xl border border-[#e7eef5] p-3 hover:border-[#7ac142] transition">
                    <Link href={`/compare-quotes?lead=${String(q.leadId ?? "")}`} className="flex min-w-0 flex-1 flex-wrap items-center gap-2 hover:underline">
                      <b className="text-sm text-[#10243e]">R{Number(q.price ?? 0).toLocaleString("en-ZA")}</b>
                      <span className="text-xs text-[#1d3a5f]/70">{String(seller?.name ?? "Local business")}</span>
                      <span className={`text-[10px] font-black uppercase rounded-full px-2 py-0.5 ${st === "accepted" ? "bg-[#e8f6d8] text-[#3c6b1d]" : st === "declined" ? "bg-[#f2f6fa] text-[#1d3a5f]/70" : "bg-[#fff4d6] text-[#a36508]"}`}>
                        {st === "sent" ? "Awaiting your decision" : st}
                      </span>
                    </Link>
                    {removalControl("quote", String(q.id ?? ""), "received quote")}
                  </div>
                );
              })}
              <Link href="/compare-quotes" className="btn-hippo text-sm w-fit">Compare all quotes </Link>
            </>
          )}
        </Panel>
        )}

        {section === "bookings" && (
        <Panel title="My bookings" count={bookings.rows.length} live={bookings.live} loading={!bookings.live && !bookings.error}>
          <ErrorNote error={bookings.error} />
          {bookings.rows.length === 0 ? (
            <EmptyLine
              what="No bookings yet — pick a date and time on any business profile and they'll confirm it here."
              ctaHref="/services"
              ctaLabel="Find a pro"
            />
          ) : (
            bookings.rows.map((bk, i) => {
              const id = String(bk.id ?? i);
              const st = String(bk.status ?? "requested");
              const live = st === "requested" || st === "confirmed";
              return (
                <div key={id} className="rounded-xl border border-[#e7eef5] p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {bk.businessId ? (
                      <Link href={`/business/${String(bk.businessId)}`} className="text-sm font-bold text-[#10243e] hover:text-[#558c2b] hover:underline">
                        {String(bk.businessName ?? "Business")}
                      </Link>
                    ) : (
                      <b className="text-sm text-[#10243e]">{String(bk.businessName ?? "Business")}</b>
                    )}
                    <span className="text-xs text-[#1d3a5f]/70">
                      {String(bk.date ?? "")} · {String(bk.time ?? "")}
                      {Number(bk.durationHours) > 0 ? ` · ${Number(bk.durationHours)} hour${Number(bk.durationHours) === 1 ? "" : "s"}` : ""}
                    </span>
                    <span className={`ml-auto text-[10px] font-black uppercase rounded-full px-2 py-0.5 ${
                      st === "confirmed" ? "bg-[#e8f6d8] text-[#3c6b1d]" :
                      st === "completed" ? "bg-[#10243e] text-[#ffc72c]" :
                      st === "cancelled" || st === "no-show" ? "bg-[#f2f6fa] text-[#1d3a5f]/70" :
                      "bg-[#fff4d6] text-[#a36508]"
                    }`}>{st}</span>
                  </div>
                  {displayDate(bk.createdAt) && <p className="mt-1 text-[11px] text-[#1d3a5f]/50">Requested {displayDate(bk.createdAt)}</p>}
                  {String(bk.note ?? "") && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-[#1d3a5f]/75">{String(bk.note)}</p>}
                  {String(bk.buyerNote ?? "") && <p className="mt-1 whitespace-pre-wrap break-words text-xs text-[#1d3a5f]/70"><b>Your note:</b> {String(bk.buyerNote)}</p>}
                  {String(bk.sellerNote ?? "") && <p className="mt-1 whitespace-pre-wrap break-words text-xs text-[#1d3a5f]/70"><b>Business update:</b> {String(bk.sellerNote)}</p>}
                  {live && (
                    <button
                      onClick={() => {
                        if (confirm("Cancel this booking? The business is notified.")) {
                          buyerCancelBooking(id).catch((e) => alert(e instanceof Error ? e.message : "Failed"));
                        }
                      }}
                      className="text-xs font-bold text-red-700 hover:underline mt-2"
                    >
                      Cancel booking
                    </button>
                  )}
                </div>
              );
            })
          )}
        </Panel>
        )}

        {section === "reviews" && (
        <Panel title="My reviews" count={reviews.rows.length} live={reviews.live} loading={!reviews.live && !reviews.error}>
          <ErrorNote error={reviews.error} />
          {reviews.rows.length === 0 ? (
            <EmptyLine what="No reviews written yet — your word helps neighbours choose." ctaHref="/services" ctaLabel="Find a business" />
          ) : (
            reviews.rows.map((r, i) => (
              <div key={String(r.id ?? i)} className="rounded-xl border border-[#e7eef5] p-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Stars value={Number(r.rating ?? 0)} size={13} />
                  {r.businessId ? (
                    <Link href={`/business/${String(r.businessId)}`} className="text-xs text-[#1d3a5f]/70 hover:text-[#558c2b] hover:underline">
                      {String(allBiz.rows.find((business) => String(business.id ?? "") === String(r.businessId ?? ""))?.name ?? "Business")}
                    </Link>
                  ) : <span className="text-xs text-[#1d3a5f]/70">Business</span>}
                  {r.hasBooking === true && <span className="text-[10px] font-bold text-[#3c6b1d]">Verified booking</span>}
                  {displayDate(r.createdAt) && <span className="ml-auto text-[11px] text-[#1d3a5f]/50">{displayDate(r.createdAt)}</span>}
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm text-[#10243e]">{String(r.body ?? "")}</p>
                {String(r.reply ?? "").trim() && (
                  <div className="mt-3 rounded-lg bg-[#f2f6fa] p-3">
                    <p className="text-[10px] font-black uppercase tracking-wide text-[#558c2b]">Business response</p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-[#1d3a5f]/80">{String(r.reply)}</p>
                  </div>
                )}
              </div>
            ))
          )}
        </Panel>
        )}

        {/* POPIA: the privacy policy promises a user can erase their own data
            without emailing anyone. This is where they actually do it. */}
        {section === "privacy" && <div className="sm:col-span-2">
          <PrivacyPanel />
        </div>}

        {section === "searches" && <section className="hippo-card min-w-0 p-4 sm:col-span-2 sm:p-5">
          <h2 className="font-black text-[#10243e]">Saved searches {searches.live && <span className="chip-live ml-1">Live</span>}</h2>
          { !searches.live && !searches.error ? (
            <div className="mt-4 space-y-3" role="status" aria-label="Loading saved searches">
              <span className="sr-only">Loading saved searches</span>
              {[0, 1].map((item) => <div key={item} className="h-12 animate-pulse rounded-xl bg-[#f2f6fa]" />)}
            </div>
          ) : <div className="mt-3 space-y-2">
            {searches.rows.length === 0 ? (
              <p className="text-sm text-[#1d3a5f]/60">None yet — tap <KIcon name="bell" size={14} className="inline shrink-0" /> Save this search on any category page to watch it here.</p>
            ) : (
              searches.rows.map((s, i) => {
                const cat = String(s.category ?? "");
                const sub = String(s.suburb ?? "");
                const cty = String(s.city ?? "pretoria");
                const matches = allBiz.rows.filter((b) => String(b.categorySlug ?? "") === cat && String(b.suburbSlug ?? "") === sub).length;
                return (
                  <div key={String(s.id ?? i)} className="rounded-xl border border-[#e7eef5] p-3 flex flex-wrap items-center gap-2">
                    <b className="text-sm text-[#10243e]"><KIcon name="bell" size={14} className="inline shrink-0" /> {String(s.label ?? cat)}</b>
                    <span className={`text-xs font-black rounded-full px-2 py-0.5 ${matches > 0 ? "bg-[#e8f6d8] text-[#3c6b1d]" : "bg-[#f2f6fa] text-[#1d3a5f]/60"}`}>
                      {matches} live {matches === 1 ? "listing" : "listings"}
                    </span>
                    <Link href={`/${cty}/${sub}/${cat}`} className="text-xs font-bold text-[#558c2b] hover:underline ml-auto">Open </Link>
                    <button onClick={() => deleteSavedSearch(String(s.id)).catch(() => {})} className="text-xs font-bold text-red-700 hover:underline">Remove</button>
                  </div>
                );
              })
            )}
          </div>}
        </section>}

        {section === "saved-items" && <section id="saved" className="hippo-card min-w-0 p-4 sm:col-span-2 sm:p-5 mb-4 scroll-mt-28">
          <h2 className="font-black text-[#10243e]">
            Saved items{saved.rows.length > 0 ? ` (${saved.rows.length})` : ""} {saved.live && <span className="chip-live ml-1">Live</span>}
          </h2>
          <p className="text-xs text-[#1d3a5f]/60 mt-1 mb-3">Deals, events, places, guides and jobs you have saved.</p>

          {!saved.live && !saved.error ? (
            <div className="space-y-3" role="status" aria-label="Loading saved items">
              <span className="sr-only">Loading saved items</span>
              {[0, 1].map((item) => <div key={item} className="h-14 animate-pulse rounded-xl bg-[#f2f6fa]" />)}
            </div>
          ) : (
            <>
          {saved.error && <ErrorNote error={saved.error} />}
          {saved.truncated && (
            <p className="text-xs font-bold text-[#a36508] bg-[#fff4d6] rounded-2xl px-3 py-2 mb-3">
              Showing your {SAVED_ITEMS_LIMIT} most recent saves — remove a few older ones to see the rest.
            </p>
          )}

          {saved.rows.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {SAVED_FILTERS.map(([key, label]) => {
                const n = key === "" ? saved.rows.length : saved.rows.filter((r) => String(r.itemType ?? "") === key).length;
                const on = savedFilter === key;
                return (
                  <button
                    key={key || "all"}
                    type="button"
                    onClick={() => setSavedFilter(key)}
                    aria-pressed={on}
                    className={`rounded-full border-2 px-3 py-1 text-xs font-extrabold transition ${
                      on ? "bg-[#10243e] text-white border-[#10243e]" : "border-[#d6e1ec] text-[#1d3a5f] hover:border-[#7ac142]"
                    }`}
                  >
                    {label} ({n})
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-3 space-y-2">
            {saved.rows.length === 0 ? (
              <p className="text-sm text-[#1d3a5f]/60">No saved items yet — hit Save on any deal, event, place, guide or job; it lands here instantly.</p>
            ) : savedRows.length === 0 ? (
              <p className="text-sm text-[#1d3a5f]/60">Nothing saved under this filter yet.</p>
            ) : (
              <div className="space-y-2">
                {savedRows.map((s) => {
                  const t = String(s.itemType ?? "");
                  const iid = String(s.itemId ?? "");
                  if (!iid) return;
                  return (
                    <div key={String(s.id)} className="flex items-start gap-3 rounded-xl border border-[#e7eef5] p-3">
                      <KIcon name={itemIcon(t)} size={20} className="shrink-0 mt-0.5 text-[#558c2b]" />
                      <div className="min-w-0 flex-1">
                        <b className="text-sm font-bold text-[#10243e]">{String(s.title ?? t)}</b>
                        <p className="text-xs text-[#1d3a5f]/60 mt-0.5">{itemLabel(t)}</p>
                        <a href={itemHref(s, t)} className="text-xs font-bold text-[#558c2b] hover:underline mt-1 inline-block">View </a>
                      </div>
                      <button onClick={() => unsave(t, iid).catch(() => {})} className="text-xs font-bold text-red-700 hover:underline shrink-0">Remove</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
            </>
          )}
        </section>}

        {section === "business" && <section className="hippo-card p-5 bg-[#f3f9ec]">
          <h2 className="font-black text-[#10243e]">Own a business?</h2>
          <p className="text-sm text-[#1d3a5f]/70 mt-1">Switch to a seller account to list your business, get leads and manage a plan. Free to start.</p>
          {role === "seller" && sellerAccountReady ? (
            <Link href="/dashboard" className="btn-hippo text-sm mt-3">Open seller hub </Link>
          ) : role === "seller" ? (
            <Link href="/register-seller" className="btn-hippo text-sm mt-3 inline-flex">Complete seller setup</Link>
          ) : (
            <Link href="/register-seller" className="btn-hippo text-sm mt-3 inline-flex">Become a seller </Link>
          )}
        </section>}
      </div>}
      </div>
    </>
  );

}