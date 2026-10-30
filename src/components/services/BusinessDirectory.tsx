"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import HomeBusinessCard from "@/components/HomeBusinessCard";
import { applyReviewRatings, type Business } from "@/data/businesses";
import { CATEGORY_GROUPS } from "@/data/taxonomy";
import { useReviewRatings } from "@/lib/realtime";

type DirectoryGroup = { slug: string; name: string; blurb: string };

export default function BusinessDirectory({
  groups,
  initialBusinesses,
  initialCursor,
  initialHasMore,
  initialError,
}: {
  groups: DirectoryGroup[];
  initialBusinesses: Business[];
  initialCursor: string | null;
  initialHasMore: boolean;
  initialError: string | null;
}) {
  const [businesses, setBusinesses] = useState(initialBusinesses);
  const [cursor, setCursor] = useState(initialCursor);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);
  const { ratings } = useReviewRatings();
  const ratedBusinesses = useMemo(
    () => applyReviewRatings(businesses, ratings),
    [businesses, ratings],
  );

  const byGroup = useMemo(() => {
    const grouped = new Map<string, Business[]>();
    for (const group of groups) grouped.set(group.slug, []);
    for (const business of ratedBusinesses) {
      const group = CATEGORY_GROUPS[business.categorySlug] ?? "other";
      if (!grouped.has(group)) grouped.set(group, []);
      grouped.get(group)?.push(business);
    }
    return grouped;
  }, [groups, ratedBusinesses]);

  async function loadMore() {
    if (!hasMore || loading) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (cursor) params.set("cursor", cursor);
      const response = await fetch(`/api/public/business-directory?${params.toString()}`);
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        businesses?: Business[];
        nextCursor?: string | null;
        hasMore?: boolean;
      };
      if (!response.ok || !payload.ok || !Array.isArray(payload.businesses)) {
        throw new Error(payload.error ?? "Could not load more businesses.");
      }
      setBusinesses((current) => {
        const byId = new Map(current.map((business) => [business.id, business]));
        for (const business of payload.businesses ?? []) byId.set(business.id, business);
        return [...byId.values()];
      });
      setCursor(payload.nextCursor ?? null);
      setHasMore(payload.hasMore === true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load more businesses.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {error && <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
      {groups.map((group) => {
        const listed = byGroup.get(group.slug) ?? [];
        return (
          <section key={group.slug} id={group.slug} aria-labelledby={`${group.slug}-heading`} className="scroll-mt-24">
            <header className="mb-4">
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#558c2b]">{listed.length} businesses loaded</p>
              <h2 id={`${group.slug}-heading`} className="mt-1 text-xl font-black text-[#10243e] sm:text-2xl">{group.name}</h2>
              <p className="mt-1 text-sm text-[#1d3a5f]/70">{group.blurb}</p>
            </header>
            {listed.length > 0 ? (
              <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {listed.map((business) => <HomeBusinessCard key={business.id} business={business} />)}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-[#d6e1ec] px-4 py-5 text-sm text-[#1d3a5f]/60">
                {hasMore ? "Load more businesses to continue browsing this category." : "No businesses are listed in this category yet."}
              </p>
            )}
          </section>
        );
      })}
      {(byGroup.get("other")?.length ?? 0) > 0 && (
        <section id="other" aria-labelledby="other-heading">
          <h2 id="other-heading" className="mb-4 text-xl font-black text-[#10243e] sm:text-2xl">Other services</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {byGroup.get("other")?.map((business) => <HomeBusinessCard key={business.id} business={business} />)}
          </div>
        </section>
      )}
      {hasMore && (
        <div className="text-center">
          <button type="button" onClick={() => void loadMore()} disabled={loading} className="btn-navy text-sm disabled:opacity-60">
            {loading ? "Loading businesses…" : "Load more businesses"}
          </button>
        </div>
      )}
      {!error && businesses.length === 0 && !hasMore && (
        <p className="rounded-2xl border border-[#e7eef5] bg-white p-6 text-center text-sm text-[#1d3a5f]/70">
          No businesses are listed yet. Be the first to <Link className="font-bold text-[#558c2b] hover:underline" href="/list-business">list your business</Link>.
        </p>
      )}
    </>
  );
}
