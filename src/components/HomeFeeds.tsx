"use client";
import { useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRealtime, subscribeTopBusinesses, subscribeJobs, subscribeEvents, useReviewRatings, listenerHint, type RealtimeError } from "@/lib/realtime";
import { applyReviewRatings, type Business } from "@/data/businesses";
import HomeBusinessCard, { businessPlacementRank } from "@/components/HomeBusinessCard";
import SaveButton from "@/components/SaveButton";
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
  const top = useMemo(() => {
    const ranked = [...bizRows]
      .filter((business) => !["paused", "rejected"].includes(String((business as Business & { status?: string }).status ?? "")))
      .sort((a, b) => Number(Boolean(b.verified)) - Number(Boolean(a.verified)) || businessPlacementRank(b) - businessPlacementRank(a));
    const selected: Business[] = [];
    const categoriesSeen = new Set<string>();

    for (const business of ranked) {
      if (selected.length === 6) break;
      const category = String(business.categorySlug ?? "");
      if (!category || categoriesSeen.has(category)) continue;
      selected.push(business);
      categoriesSeen.add(category);
    }

    for (const business of ranked) {
      if (selected.length === 6) break;
      if (!selected.some((item) => item.id === business.id)) selected.push(business);
    }
    return selected;
  }, [bizRows]);
  return (
    <>
      {/* Popular near you — live from Firestore */}
      <section>
        <div className="flex items-end justify-between gap-4 mb-4">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#558c2b]">Popular near you {biz.live && <span className="chip-live ml-1">Live</span>}</p>
            <h2 className="text-xl sm:text-2xl font-black text-[#10243e] tracking-tight">Top-rated local businesses</h2>
          </div>
          <Link href="/services/businesses" className="text-sm font-bold text-[#10243e] link-underline pb-0.5 shrink-0">View more</Link>
        </div>
        <Err error={biz.error} />
        {biz.live && biz.rows.length === 0 && !biz.error && (
          <p className="text-sm text-[#1d3a5f]/60">No businesses listed yet — sellers appear here live.</p>
        )}
        <div aria-busy={!biz.live && !biz.error} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
          {!biz.live && !biz.error && top.length === 0 && [0, 1, 2].map((item) => <FeaturedBusinessSkeleton key={item} />)}
          {top.map((business) => <HomeBusinessCard key={business.id} business={business} />)}
        </div>
      </section>
      {/* Latest jobs + events — live side by side */}
      <section className="grid lg:grid-cols-2 gap-6">
        <div>
          <div className="flex flex-col gap-2 mb-3 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="text-xl font-black text-[#10243e]">Latest jobs {jobs.live && <span className="chip-live ml-1">Live</span>}</h2>
            <Link href="/jobs" className="text-sm font-bold text-[#10243e] link-underline pb-0.5">All jobs</Link>
          </div>
          <Err error={jobs.error} />
          <ul aria-busy={!jobs.live && !jobs.error} className="space-y-2">
            {!jobs.live && !jobs.error && jobs.rows.length === 0 && [0, 1, 2].map((item) => <FeedRowSkeleton key={`job-skeleton-${item}`} />)}
            {jobs.rows.slice(0, 4).map((j, i) => (
              <li key={String(j.id ?? i)} className="hippo-card grid min-h-32 min-w-0 grid-cols-1 gap-3 p-3.5 hover-lift anim-rise sm:grid-cols-[minmax(0,1fr)_9.5rem] sm:items-stretch" style={{ "--d": `${i * 45}ms` } as CSSProperties}>
                <div className="flex min-w-0 flex-col">
                  <button type="button" onClick={() => setPreview({ post: j, kind: "job" })} className="line-clamp-2 min-h-10 max-w-full break-words text-left text-sm font-bold leading-5 text-[#10243e] hover:text-[#558c2b]">
                    {String(j.title ?? "")}
                  </button>
                  <p className="mt-1 line-clamp-2 min-h-9 break-words text-xs leading-[18px] text-[#1d3a5f]/60">{[j.company, j.suburb, j.type].filter(Boolean).map(String).join(" · ")}</p>
                  <button type="button" onClick={() => setPreview({ post: j, kind: "job" })} className="mt-auto pt-2 text-left text-[11px] font-bold text-[#558c2b] hover:underline">Full preview </button>
                </div>
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-2 sm:flex sm:flex-col sm:items-end sm:justify-between">
                  <span className="inline-flex min-h-8 max-w-full items-center truncate rounded-full bg-[#e8f6d8] px-2.5 py-1 text-xs font-black text-[#558c2b]">{String(j.pay ?? "")}</span>
                  <SaveButton type="job" id={String(j.id ?? "")} title={String(j.title ?? "")} suburb={String(j.suburb ?? "")} className="sm:mt-auto" />
                </div>
              </li>
            ))}
          </ul>
          {jobs.live && jobs.rows.length === 0 && <p className="text-sm text-[#1d3a5f]/60">No jobs yet — employers post live, free.</p>}
        </div>
        <div>
          <div className="flex flex-col gap-2 mb-3 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="text-xl font-black text-[#10243e]">What&apos;s happening {events.live && <span className="chip-live ml-1">Live</span>}</h2>
            <Link href="/events" className="text-sm font-bold text-[#10243e] link-underline pb-0.5">All events</Link>
          </div>
          <Err error={events.error} />
          <ul aria-busy={!events.live && !events.error} className="space-y-2">
            {!events.live && !events.error && events.rows.length === 0 && [0, 1, 2].map((item) => <FeedRowSkeleton key={`event-skeleton-${item}`} />)}
            {events.rows.slice(0, 4).map((e, i) => (
              <li key={String(e.id ?? i)} className="hippo-card grid min-h-32 min-w-0 grid-cols-1 gap-3 p-3.5 hover-lift anim-rise sm:grid-cols-[minmax(0,1fr)_9.5rem] sm:items-stretch" style={{ "--d": `${i * 45}ms` } as CSSProperties}>
                <div className="flex min-w-0 flex-col">
                  <button type="button" onClick={() => setPreview({ post: e, kind: "event" })} className="line-clamp-2 min-h-10 max-w-full break-words text-left text-sm font-bold leading-5 text-[#10243e] hover:text-[#558c2b]">
                    {String(e.title ?? "")}
                  </button>
                  <p className="mt-1 line-clamp-2 min-h-9 break-words text-xs leading-[18px] text-[#1d3a5f]/60">{[e.venue, e.suburb].filter(Boolean).map(String).join(" · ")}</p>
                  <button type="button" onClick={() => setPreview({ post: e, kind: "event" })} className="mt-auto pt-2 text-left text-[11px] font-bold text-[#558c2b] hover:underline">Full preview </button>
                </div>
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-2 sm:flex sm:flex-col sm:items-end sm:justify-between">
                  <span className="inline-flex min-h-8 max-w-full items-center truncate rounded-full bg-[#e8f6d8] px-2.5 py-1 text-xs font-black text-[#558c2b]">{String(e.fee ?? "Free")}</span>
                  <SaveButton type="event" id={String(e.id ?? "")} title={String(e.title ?? "")} suburb={String(e.suburb ?? "")} className="sm:mt-auto" />
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