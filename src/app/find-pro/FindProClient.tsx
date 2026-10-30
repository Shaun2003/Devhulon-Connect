"use client";
import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import SignInModal from "@/components/SignInModal";
import { matchPros, matchCategory, type MatchedPro } from "@/lib/matching";
import { resolvePlace } from "@/data/za-locations";
import { KIcon, iconForCategory } from "@/lib/icons";
import { RatingSummary } from "@/components/ui";
import { isFirebaseConfigured } from "@/lib/firebase";
import { matchProRequest } from "@/lib/repo";
import ConsentCheckbox from "@/components/ConsentCheckbox";
import { LEAD_CONSENT_DETAIL, LEAD_CONSENT_LABEL, MAX_ALERTED_PROS } from "@/lib/legal";
import { useRealtime, useReviewRatings, subscribeTopBusinesses, type RealtimeError } from "@/lib/realtime";
import { applyReviewRatings, toBusiness, type Business } from "@/data/businesses";
import { PlaceSuggestions } from "@/components/SearchBar";
import { trackAnalyticsEvent } from "@/lib/track-analytics";
import { SERVICE_GROUPS } from "@/data/taxonomy";

/**
 * The buyer-facing "Find a pro" screen.
 *
 * A buyer types what they need and where, and gets a ranked list of local sellers
 * and request a quote without exposing seller contact details. Submitting the
 * form distributes a contact-stripped request to eligible matching sellers.
 */
export default function FindProClient({
  initialNeed = "",
  initialPlace = "",
  initialServiceGroupSlug,
  initialPool = [],
}: {
  initialNeed?: string;
  initialPlace?: string;
  initialServiceGroupSlug?: string;
  /** Server-fetched live listings, so matches render before hydration. */
  initialPool?: Business[];
}) {
  const { user, loading: authLoading } = useAuth();
  const [need, setNeed] = useState(initialNeed);
  const [place, setPlace] = useState(initialPlace);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // POPIA: sharing a number with up to MAX_ALERTED_PROS independent businesses is
  // a disclosure to third parties and needs explicit, informed consent. `consentErr`
  // is separate from `err` so a rejected tick can explain itself without hiding a
  // server error (or vice versa).
  const [consent, setConsent] = useState(false);
  const [consentErr, setConsentErr] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<{ key: string; businesses: Business[] } | null>(null);
  const [searchStatus, setSearchStatus] = useState<{
    key: string;
    status: "loading" | "done" | "error";
    error?: string;
  } | null>(null);

  const resolvedPlace = useMemo(() => resolvePlace(place), [place]);
  const guessedCategory = useMemo(() => matchCategory(need), [need]);
  const selectedGroup = SERVICE_GROUPS.find((group) => group.slug === initialServiceGroupSlug);
  const searchKey = JSON.stringify([need.trim(), place.trim(), initialServiceGroupSlug ?? ""]);
  const initialSearchKey = JSON.stringify([initialNeed.trim(), initialPlace.trim(), initialServiceGroupSlug ?? ""]);
  const searchPool = useMemo(
    () => need.trim().length < 2
      ? []
      : searchKey === initialSearchKey
        ? initialPool
        : searchResults?.key === searchKey
          ? searchResults.businesses
          : [],
    [need, searchKey, initialSearchKey, initialPool, searchResults],
  );
  const searchLoading = need.trim().length > 1 && (
    (searchKey !== initialSearchKey && searchStatus?.key !== searchKey)
    || (searchStatus?.key === searchKey && searchStatus.status === "loading")
  );
  const searchError = searchStatus?.key === searchKey && searchStatus.status === "error"
    ? searchStatus.error ?? "Could not load matching pros."
    : null;

  useEffect(() => {
    const trimmedNeed = need.trim();
    const trimmedPlace = place.trim();
    if (trimmedNeed.length < 2
      || (trimmedNeed === initialNeed.trim() && trimmedPlace === initialPlace.trim())) return;

    const controller = new AbortController();
    const key = JSON.stringify([trimmedNeed, trimmedPlace, initialServiceGroupSlug ?? ""]);
    const timer = window.setTimeout(async () => {
      setSearchStatus({ key, status: "loading" });
      const params = new URLSearchParams({ need: trimmedNeed, place: trimmedPlace, serviceGroup: initialServiceGroupSlug ?? "" });
      try {
        const response = await fetch(`/api/public/pro-search?${params}`, {
          signal: controller.signal,
        });
        const payload = await response.json() as { ok?: boolean; businesses?: Business[]; error?: string };
        if (!response.ok || !payload.ok || !Array.isArray(payload.businesses)) {
          throw new Error(payload.error || "Could not load matching pros.");
        }
        setSearchResults({ key, businesses: payload.businesses });
        setSearchStatus({ key, status: "done" });
      } catch (error) {
        if (controller.signal.aborted) return;
        setSearchStatus({
          key,
          status: "error",
          error: error instanceof Error ? error.message : "Could not load matching pros.",
        });
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [need, place, initialNeed, initialPlace, initialServiceGroupSlug]);

  /** Live updates refresh candidate listings but never add unrelated sellers. */
  const live = useRealtime<Record<string, unknown>>(
    (cb, onErr) => (isFirebaseConfigured ? subscribeTopBusinesses(cb as never, onErr as (e: RealtimeError) => void) : () => {}),
    [],
    [],
  );
  const rawPool = useMemo(() => {
    const byId = new Map(searchPool.map((business) => [business.id, business]));
    for (const row of live.rows) {
      const business = toBusiness(String(row.id ?? ""), row);
      if (byId.has(business.id) && String(row.status ?? "live") === "live") byId.set(business.id, business);
      else byId.delete(business.id);
    }
    return [...byId.values()];
  }, [searchPool, live.rows]);
  // Ratings come from the review documents, not the stored cache, so a pro with
  // real reviews isn't shown as unreviewed (and isn't ranked below one without).
  const { ratings } = useReviewRatings();
  const pool = useMemo(() => applyReviewRatings(rawPool, ratings), [rawPool, ratings]);

  const matches = useMemo(
    () => (need.trim().length > 1 ? matchPros({ need, place, serviceGroupSlug: initialServiceGroupSlug }, pool) : []),
    [need, place, pool, initialServiceGroupSlug],
  );

  /** Bark's core action: post the need straight to the matching sellers. */
  async function onPost(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setSent(null);
    setConsentErr(null);
    if (!phone.trim()) {
      setErr("Add your number so the pros can call you back.");
      return;
    }
    // Refuse locally with a specific reason, so the tick is a real gate rather
    // than decoration. The server enforces the same thing independently.
    if (!consent) {
      setConsentErr("Tick the box so the businesses you're alerting can lawfully use your number to quote you.");
      return;
    }
    if (!user) {
      setSignInOpen(true);
      return;
    }
    setBusy(true);
    try {
      const res = await matchProRequest({
        need,
        place,
        serviceGroupSlug: initialServiceGroupSlug,
        phone,
        name,
        consent: true,
      });
      trackAnalyticsEvent("quote_submitted", "search");
      // Report what was actually delivered. Sellers at their plan cap are
      // withheld server-side, so the honest count is `matched` — and saying so
      // plainly is what stops a buyer reading a low number as a broken site.
      if (res.matched === 0) {
        setErr(
          "No pros had capacity to take this on right now — the pros who match are at their monthly lead limit. Try again shortly or list your business so you hear about it first.",
        );
      } else if (res.limited > 0) {
        setSent(
          `Sent to ${res.matched} pro${res.matched === 1 ? "" : "s"} — they've been notified and can respond to your request.` +
            ` ${res.limited} other matching pro${res.limited === 1 ? " is" : "s are"} at their monthly limit, so they weren't notified.`,
        );
      } else {
        setSent(
          `Sent to ${res.matched} pro${res.matched === 1 ? "" : "s"} — they've been notified and can respond to your request.`,
        );
      }
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not send. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-8 items-start">
      {/* ── Left: what you need + where, then results ── */}
      <div className="space-y-6">
        <form
          onSubmit={onPost}
          className="bg-white rounded-3xl border border-[#e7eef5] shadow-sm p-4 sm:p-5"
        >
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-[#f7fafc] border-2 border-transparent focus-within:border-[#7ac142] focus-within:bg-white transition">
              <span className="text-[#558c2b] shrink-0" aria-hidden>
                <KIcon name="search" size={18} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#1d3a5f]/45">
                  What do you need
                </span>
                <input
                  name="need"
                  required
                  value={need}
                  onChange={(e) => setNeed(e.target.value)}
                  placeholder="Burst geyser, deep clean, piano lesson…"
                  aria-label="What do you need"
                  className="w-full bg-transparent outline-none text-sm font-bold text-[#10243e] placeholder:font-normal placeholder:text-[#1d3a5f]/35"
                />
              </span>
            </label>

            <label className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-[#f7fafc] border-2 border-transparent focus-within:border-[#7ac142] focus-within:bg-white transition">
              <span className="text-[#558c2b] shrink-0" aria-hidden>
                <KIcon name="mapPin" size={18} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#1d3a5f]/45">
                  Where
                </span>
                <input
                  name="place"
                  list="sa-find-pro-places"
                  value={place}
                  onChange={(e) => setPlace(e.target.value)}
                  placeholder="Any suburb or town in SA"
                  aria-label="Where do you need it"
                  className="w-full bg-transparent outline-none text-sm font-bold text-[#10243e] placeholder:font-normal placeholder:text-[#1d3a5f]/35"
                />
              </span>
            </label>
          </div>
          <PlaceSuggestions id="sa-find-pro-places" />
          {selectedGroup && (
            <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#f3f9ec] px-3 py-1.5 text-xs font-bold text-[#3c6b1d]">
              <KIcon name={selectedGroup.icon} size={14} /> Showing businesses in {selectedGroup.name}
            </p>
          )}

          {sent && (
            <p className="mt-3 rounded-2xl bg-[#e8f6d8] border border-[#3c6b1d]/20 px-4 py-3 text-sm font-bold text-[#3c6b1d] flex items-center gap-2">
              <KIcon name="check" size={16} /> {sent}
            </p>
          )}
          {err && (
            <p className="mt-3 rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-sm font-bold text-red-700">
              {err}
            </p>
          )}

          {need.trim().length > 1 && (
            <p className="mt-3 text-xs text-[#1d3a5f]/60 flex items-center gap-1.5">
              <KIcon name="zap" size={13} className="text-[#7ac142] shrink-0" />
              {matches.length > 0
                ? `${matches.length} pro${matches.length === 1 ? "" : "s"} matched — compare profiles or request quotes through DevhulonConnect.`
                : "No exact match yet — try a broader service."}
            </p>
          )}
        </form>

        {matches.length > 0 ? (
          <section aria-live="polite">
            <h2 className="text-lg font-black text-[#10243e] mb-3 flex items-center gap-2">
              <KIcon name={iconForCategory(matches[0].categorySlug)} size={18} className="text-[#558c2b]" />
              {selectedGroup ? `${selectedGroup.name} services` : matches[0].categoryName}
              {resolvedPlace?.area ? ` in ${resolvedPlace.area.name}` : resolvedPlace?.city ? ` near ${resolvedPlace.city.name}` : " near you"}
            </h2>
            <ul className="grid sm:grid-cols-2 gap-3 items-start">
              {matches.map((m, i) => (
                <ProCard key={m.business.id} match={m} rank={i + 1} />
              ))}
            </ul>
          </section>
        ) : need.trim().length > 1 ? (
        <div className="rounded-2xl bg-[#f2f6fa] px-4 py-4 text-sm text-[#1d3a5f]/70">
          {searchLoading && <p>Searching for matching pros…</p>}
          {searchError && <p role="alert" className="mb-2 text-amber-900">{searchError}</p>}
          {!searchLoading && !searchError && (
          <p>
            No pros match “{need}”{place ? ` in ${place}` : ""} yet.
            {guessedCategory ? ` We do list ${guessedCategory.name.toLowerCase()} in other areas — try just the service.` : " Try a broader description."}
          </p>
          )}
          {place && (
            <button
              type="button"
              onClick={() => setPlace("")}
              className="mt-2 font-bold text-[#558c2b] underline"
            >
              Search without an area
            </button>
          )}
        </div>
        ) : null}
      </div>


      {/* ── Right: your number, then post. Bark asks for the number first. ── */}
      <aside className="lg:sticky lg:top-24 bg-white rounded-3xl border border-[#e7eef5] shadow-sm p-5 space-y-4">
        <div className="flex items-center gap-2">
          <span className="icon-3d icon-3d-xs" aria-hidden>
            <KIcon name="bell" size={18} />
          </span>
          <div>
            <h2 className="font-black text-[#10243e] leading-tight">Alert the top pros</h2>
            <p className="text-xs text-[#1d3a5f]/60">No admin, no waiting — they get it instantly.</p>
          </div>
        </div>

        <label className="block">
          <span className="text-xs font-bold text-[#10243e]">Your name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Thandi M."
            className="mt-1 w-full rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-4 py-3 text-sm outline-none transition-colors"
          />
        </label>

        <label className="block">
          <span className="text-xs font-bold text-[#10243e]">Phone / WhatsApp</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            required
            placeholder="082 123 4567"
            className="mt-1 w-full rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-4 py-3 text-sm outline-none transition-colors"
          />
        </label>

        <ConsentCheckbox
          checked={consent}
          onChange={(v) => { setConsent(v); if (v) setConsentErr(null); }}
          label={LEAD_CONSENT_LABEL}
          detail={LEAD_CONSENT_DETAIL}
          error={consentErr}
        />

        <button
          onClick={onPost}
          disabled={busy || authLoading || !need.trim() || !consent || !isFirebaseConfigured}
          className="btn-hippo w-full justify-center disabled:opacity-50"
        >
          {busy ? "Sending…" : authLoading ? "Checking account…" : user ? `Alert ${Math.min(matches.length, MAX_ALERTED_PROS) || "matching"} pro${matches.length === 1 ? "" : "s"}` : "Sign in to alert pros"}
        </button>

        {!user && !authLoading && isFirebaseConfigured && (
          <p className="text-[11px] leading-5 text-[#1d3a5f]/55">
            Sign in or create a free buyer account to send your request. Your details and consent stay in this form while you sign in.
          </p>
        )}

        {!isFirebaseConfigured && (
          <p className="text-[11px] text-[#a36508] bg-[#fff4d6] rounded-xl px-3 py-2">
            Demo mode — add <code>NEXT_PUBLIC_FIREBASE_*</code> to send and call.
          </p>
        )}

        <p className="text-[11px] text-[#1d3a5f]/50 leading-5 flex items-start gap-1.5">
          <KIcon name="shieldCheck" size={13} className="shrink-0 mt-0.5" />
          Your number goes only to the pros you&apos;re sent to. We never sell or spam it.
        </p>
      </aside>
      <SignInModal open={signInOpen} onClose={() => setSignInOpen(false)} presetRole="buyer" />
    </div>
  );
}

/** One matched seller: name, trust, why-you-matched, and the number that matters. */
function ProCard({ match, rank }: { match: MatchedPro; rank: number }) {
  const b = match.business;

  return (
    <li
      className="hippo-card p-5 flex flex-col gap-3 hover-lift anim-rise group"
      style={{ "--d": `${Math.min(rank - 1, 6) * 60}ms` } as CSSProperties}
    >
      <div className="flex items-start gap-3">
        <span
          className="icon-3d icon-3d-md shrink-0 group-hover:bg-[#7ac142] group-hover:text-white transition-colors duration-200"
          aria-hidden
        >
          <KIcon name={iconForCategory(b.categorySlug)} size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <Link
            href={`/business/${b.id}`}
            className="font-black text-[#10243e] hover:text-[#558c2b] transition-colors leading-tight block truncate"
          >
            {b.name}
          </Link>
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-1 text-xs text-[#1d3a5f]/60">
            <RatingSummary rating={Number(b.rating ?? 0)} reviews={Number(b.reviewCount ?? 0)} countOnly empty="No reviews yet" />
            {b.verified && (
              <span className="inline-flex items-center gap-0.5 text-[#3c6b1d] font-bold">
                <KIcon name="badgeCheck" size={12} /> Verified
              </span>
            )}
          </div>
        </div>
      </div>

      <p className="text-xs text-[#1d3a5f]/70 leading-5">
        <span className="font-bold text-[#558c2b]">{match.reason}</span>
        {b.priceNote ? ` · ${b.priceNote}` : ""}
      </p>

      <div className="flex gap-2 mt-auto pt-1">
        <Link
          href={`/request-quote?business=${b.id}`}
          className="btn-hippo flex-1 text-sm !py-2.5 inline-flex items-center justify-center"
        >
          Request a quote
        </Link>
        <Link href={`/business/${b.id}`} className="text-sm !py-2.5 px-4 rounded-full border-2 border-[#e7eef5] text-[#10243e] font-extrabold inline-flex items-center justify-center hover:border-[#10243e] transition-colors">Profile</Link>
      </div>
    </li>
  );
}
