"use client";
import { useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRealtime, subscribeTopBusinesses, subscribeJobs, subscribeEvents, useReviewRatings, listenerHint, type RealtimeError } from "@/lib/realtime";
import { suburbs } from "@/data/locations";
import { categories } from "@/data/categories";
import { applyReviewRatings, type Business } from "@/data/businesses";
import { waLink } from "@/lib/utils";
import { planRank, normalizePlanId } from "@/lib/plans";
import { RatingSummary } from "@/components/ui";
import { KIcon } from "@/lib/icons";
import SaveButton from "@/components/SaveButton";
import { SITE_SHORT } from "@/lib/site";
import PostPreviewModal, { type PreviewKind } from "@/components/PostPreviewModal";
import { FeaturedBusinessSkeleton, FeedRowSkeleton } from "@/components/LoadingSkeletons";

type Row = Record<string, unknown>;

function Err({ error }: { error: RealtimeError | null }) {
  if (!error) return null;
  return <p className="text-xs font-bold text-[#a36508] bg-[#fff4d6] rounded-2xl px-3 py-2">{listenerHint(error)}</p>;
}

export default function HomeFeeds() {
  const [preview, setPreview] = useState<{ post: Row; kind: Extract<PreviewKind, "job" | "event"> } | null>(null);
  const biz = useRealtime<Row>((cb, onErr) => subscribeTopBusinesses(cb as never, onErr), [], []);
  const jobs = useRealtime<Row>((cb, onErr) => subscribeJobs(cb as never, onErr), [], []);
  const events = useRealtime<Row>((cb, onErr) => subscribeEvents(cb as never, onErr), [], []);
  // Ratings derived from the review documents. The stored `businesses.rating`
  // cache is not reliably writable, so ranking and the stars both read 0 for a
  // business that actually has 5★ reviews — the ranking below depends on it.
  const { ratings } = useReviewRatings();
  const bizRows = useMemo(() => applyReviewRatings(biz.rows as unknown as Business[], ratings), [biz.rows, ratings]);
  // Paid placement affects order, while labels remain explicit to visitors.
  const rankOf = (b: Business) =>
    planRank(normalizePlanId(b.plan)) * 1000 +
    (b.featured === true ? 250 : 0) +
    Number(b.rating ?? 0) * 10;
  const top = [...bizRows].sort((a, b) => rankOf(b) - rankOf(a)).slice(0, 6);
  const cityOf = (b: Business) => suburbs.find((s) => s.slug === b.suburbSlug)?.name ?? b.suburbSlug ?? "";
  const catName = (b: Business) => categories.find((c) => c.slug === b.categorySlug)?.plural ?? b.categorySlug ?? "";
  /**
   * The seller's own photo: cover image first, then the first gallery upload.
   * Returns null when they have uploaded nothing, so the caller can fall back
   * to stock photography rather than rendering an empty banner.
   */
  const photoOf = (b: Business) => {
    const v = (b as unknown as { coverImageUrl?: unknown }).coverImageUrl;
    if (typeof v === "string" && v.length > 0) return v;
    const photos = (b as unknown as { photos?: unknown }).photos;
    const first = Array.isArray(photos)
      ? photos.find((p): p is string => typeof p === "string" && p.length > 0)
      : undefined;
    return first ?? null;
  };

  return (
    <>
      {/* Popular near you — live from Firestore */}
      <section>
        <div className="flex items-end justify-between gap-4 mb-4">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#558c2b]">Popular near you {biz.live && <span className="chip-live ml-1">Live</span>}</p>
            <h2 className="text-xl sm:text-2xl font-black text-[#10243e] tracking-tight">Top-rated local businesses</h2>
          </div>
          <Link href="/locations" className="text-sm font-bold text-[#10243e] link-underline pb-0.5 shrink-0">All areas →</Link>
        </div>
        <Err error={biz.error} />
        {biz.live && biz.rows.length === 0 && !biz.error && (
          <p className="text-sm text-[#1d3a5f]/60">No businesses listed yet — sellers appear here live.</p>
        )}
        <div aria-busy={!biz.live && !biz.error} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
          {!biz.live && !biz.error && top.length === 0 && [0, 1, 2].map((item) => <FeaturedBusinessSkeleton key={item} />)}
          {top.map((b) => {
            // The seller's uploaded profile photo, live via the listener above —
            // it changes the moment they add one. NO stock fallback: a card with
            // no uploaded photo shows the plain card header instead of a
            // generic image pretending to be this business.
            const photo = photoOf(b);
            return (
            <article key={b.id} className="bg-white border border-[#e7eef5] rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col h-full relative group">
              <div className="h-32 w-full relative overflow-hidden shrink-0 bg-[#f4f7f6]">
                 {photo && (
                   <div 
                     className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
                     style={{ backgroundImage: `url('${photo}')` }} 
                   />
                 )}
                 <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent"></div>
                 <div className="absolute top-3 left-3 flex flex-wrap gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest bg-white/95 text-[#10243e] rounded-full px-2.5 py-1 shadow-sm backdrop-blur">{catName(b)}</span>
                    {normalizePlanId(b.plan) === "business" && <span className="text-[10px] font-black uppercase tracking-widest bg-[#10243e] text-[#ffc72c] rounded-full px-2.5 py-1 shadow-sm">Sponsored</span>}
                    {normalizePlanId(b.plan) === "professional" && <span className="text-[10px] font-black uppercase tracking-widest bg-[#e8f6d8] text-[#3c6b1d] rounded-full px-2.5 py-1 shadow-sm">Professional</span>}
                 </div>
                 {b.verified && (
                   <div className="absolute top-3 right-3 text-white bg-[#558c2b] rounded-full p-1 shadow-lg">
                      <KIcon name="shieldCheck" size={14} strokeWidth={2.2} />
                   </div>
                 )}
              </div>
              <div className="p-5 flex flex-col flex-1 bg-white relative z-10">
                <h3 className="text-lg font-black text-[#10243e] leading-tight"><Link href={`/business/${b.id}`} className="hover:text-[#558c2b] hover:underline">{b.name}</Link></h3>
                <p className="text-[11px] font-bold text-[#558c2b] mt-1">{cityOf(b)}</p>
                <RatingSummary rating={Number(b.rating ?? 0)} reviews={Number(b.reviewCount ?? 0)} countOnly className="mt-2 text-sm" empty="No reviews yet" />
                <p className="text-sm text-[#1d3a5f]/75 mt-3 flex-1 line-clamp-2 leading-relaxed">{b.description}</p>
                
                <div className="flex gap-2 mt-5 pt-4 border-t border-[#e7eef5]">
                  <a href={`tel:${String(b.phone ?? "").replace(/\s/g, "")}`} className="flex-1 text-center text-xs font-extrabold rounded-xl border-2 border-[#10243e] text-[#10243e] px-2 py-2 hover:bg-[#10243e] hover:text-white transition flex items-center justify-center gap-1.5">
                    <KIcon name="phone" size={14} /> Call
                  </a>
                  {b.whatsapp && (
                    <a target="_blank" rel="noreferrer" href={waLink(b.whatsapp, `Hi ${b.name}, I found you on ${SITE_SHORT}.`)} className="flex-1 text-center text-xs font-extrabold rounded-xl bg-[#25D366] text-white px-2 py-2 hover:brightness-95 flex items-center justify-center gap-1.5">
                      <KIcon name="message" size={14} /> WhatsApp
                    </a>
                  )}
                  <Link href={`/business/${b.id}`} className="flex-1 text-center text-xs font-extrabold rounded-xl bg-[#7ac142] text-[#0b1e33] px-2 py-2 hover:bg-[#68ad35] flex items-center justify-center gap-1.5">
                     View <KIcon name="arrowRight" size={14} />
                  </Link>
                </div>
              </div>
            </article>
          )})}
        </div>
      </section>
      {/* Latest jobs + events — live side by side */}
      <section className="grid lg:grid-cols-2 gap-6">
        <div>
          <div className="flex items-end justify-between gap-3 mb-3">
            <h2 className="text-xl font-black text-[#10243e]">Latest jobs {jobs.live && <span className="chip-live ml-1">Live</span>}</h2>
            <Link href="/jobs" className="text-sm font-bold text-[#10243e] link-underline pb-0.5">All jobs →</Link>
          </div>
          <Err error={jobs.error} />
          <ul aria-busy={!jobs.live && !jobs.error} className="space-y-2">
            {!jobs.live && !jobs.error && jobs.rows.length === 0 && [0, 1, 2].map((item) => <FeedRowSkeleton key={`job-skeleton-${item}`} />)}
            {jobs.rows.slice(0, 4).map((j, i) => (
              <li key={String(j.id ?? i)} className="hippo-card p-3.5 flex items-center justify-between gap-2 hover-lift anim-rise" style={{ "--d": `${i * 45}ms` } as CSSProperties}>
                <div className="min-w-0">
                  <button type="button" onClick={() => setPreview({ post: j, kind: "job" })} className="block max-w-full truncate text-left font-bold text-[#10243e] text-sm hover:text-[#558c2b]">
                    {String(j.title ?? "")}
                  </button>
                  <p className="text-xs text-[#1d3a5f]/60 truncate">{String(j.company ?? "")} · {String(j.suburb ?? "")} · {String(j.type ?? "")}</p>
                  <button type="button" onClick={() => setPreview({ post: j, kind: "job" })} className="mt-1 text-[11px] font-bold text-[#558c2b] hover:underline">Full preview →</button>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
                  <span className="text-xs font-black text-[#558c2b] bg-[#e8f6d8] rounded-full px-2.5 py-1 whitespace-nowrap">{String(j.pay ?? "")}</span>
                  <SaveButton type="job" id={String(j.id ?? "")} title={String(j.title ?? "")} suburb={String(j.suburb ?? "")} />
                </div>
              </li>
            ))}
          </ul>
          {jobs.live && jobs.rows.length === 0 && <p className="text-sm text-[#1d3a5f]/60">No jobs yet — employers post live, free.</p>}
        </div>
        <div>
          <div className="flex items-end justify-between gap-3 mb-3">
            <h2 className="text-xl font-black text-[#10243e]">What&apos;s happening {events.live && <span className="chip-live ml-1">Live</span>}</h2>
            <Link href="/events" className="text-sm font-bold text-[#10243e] link-underline pb-0.5">All events →</Link>
          </div>
          <Err error={events.error} />
          <ul aria-busy={!events.live && !events.error} className="space-y-2">
            {!events.live && !events.error && events.rows.length === 0 && [0, 1, 2].map((item) => <FeedRowSkeleton key={`event-skeleton-${item}`} />)}
            {events.rows.slice(0, 4).map((e, i) => (
              <li key={String(e.id ?? i)} className="hippo-card p-3.5 flex items-center justify-between gap-2 hover-lift anim-rise" style={{ "--d": `${i * 45}ms` } as CSSProperties}>
                <div className="min-w-0">
                  <button type="button" onClick={() => setPreview({ post: e, kind: "event" })} className="block max-w-full truncate text-left font-bold text-[#10243e] text-sm hover:text-[#558c2b]">
                    {String(e.title ?? "")}
                  </button>
                  <p className="text-xs text-[#1d3a5f]/60 truncate">{String(e.venue ?? "")} · {String(e.suburb ?? "")}</p>
                  <button type="button" onClick={() => setPreview({ post: e, kind: "event" })} className="mt-1 text-[11px] font-bold text-[#558c2b] hover:underline">Full preview →</button>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
                  <span className="text-xs font-black text-[#558c2b] bg-[#e8f6d8] rounded-full px-2.5 py-1 whitespace-nowrap">{String(e.fee ?? "Free")}</span>
                  <SaveButton type="event" id={String(e.id ?? "")} title={String(e.title ?? "")} suburb={String(e.suburb ?? "")} />
                </div>
              </li>
            ))}
          </ul>
          {events.live && events.rows.length === 0 && <p className="text-sm text-[#1d3a5f]/60">No events yet — submit one free.</p>}
        </div>
      </section>
      <PostPreviewModal post={preview?.post ?? null} kind={preview?.kind ?? "job"} onClose={() => setPreview(null)} />
    </>
  );
}