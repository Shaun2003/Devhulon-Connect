"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { ANALYTICS_PAGES, type AnalyticsPage } from "@/lib/analytics-events";

type DailyMetric = {
  day: string;
  pageViews: number;
  searches: number;
  quoteSubmissions: number;
  pages: Partial<Record<AnalyticsPage, number>>;
};

const pageLabels: Record<AnalyticsPage, string> = {
  home: "Home",
  directory: "Service directory",
  service_detail: "Service category",
  search: "Find a pro",
  quote_request: "Quote request",
  quote_comparison: "Quote comparison",
  business_profile: "Business profile",
  dashboard: "Dashboard",
  content: "Other content",
};

function formatDay(day: string): string {
  return new Date(`${day}T00:00:00.000Z`).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function AnalyticsAdmin() {
  const { user, loading: authLoading } = useAuth();
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [daily, setDaily] = useState<DailyMetric[]>([]);
  const [loadedPeriod, setLoadedPeriod] = useState<number | null>(null);
  const [loadedUid, setLoadedUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const loading = authLoading || (!!user && !error && loadedPeriod !== days);

  const fetchDaily = useCallback(async (period: number): Promise<DailyMetric[]> => {
    const token = await user?.getIdToken();
    if (!token) throw new Error("Sign in as an admin to view analytics.");
    const response = await fetch(`/api/admin/analytics?days=${period}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const json = await response.json() as {
      ok?: boolean;
      error?: string;
      daily?: DailyMetric[];
    };
    if (!response.ok || json.ok !== true) {
      throw new Error(json.error ?? "Could not load analytics.");
    }
    return json.daily ?? [];
  }, [user]);

  useEffect(() => {
    if (authLoading || !user) return;
    let active = true;
    fetchDaily(days)
      .then((rows) => {
        if (active) {
          setDaily(rows);
          setLoadedPeriod(days);
          setLoadedUid(user.uid);
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Could not load analytics.");
      });
    return () => {
      active = false;
    };
  }, [authLoading, days, fetchDaily, user]);

  async function refresh() {
    setRefreshing(true);
    setError(null);
    try {
      setDaily(await fetchDaily(days));
      setLoadedPeriod(days);
      setLoadedUid(user?.uid ?? null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load analytics.");
    } finally {
      setRefreshing(false);
    }
  }

  function changePeriod(value: string) {
    if (value !== "7" && value !== "30" && value !== "90") return;
    setDays(Number(value) as 7 | 30 | 90);
    setError(null);
  }

  const totals = useMemo(() => daily.reduce(
    (sum, row) => ({
      pageViews: sum.pageViews + row.pageViews,
      searches: sum.searches + row.searches,
      quoteSubmissions: sum.quoteSubmissions + row.quoteSubmissions,
    }),
    { pageViews: 0, searches: 0, quoteSubmissions: 0 },
  ), [daily]);
  const dataAvailable = Boolean(user && loadedUid === user.uid && loadedPeriod === days && !error);

  return (
    <section className="space-y-5">
      <header className="hippo-card flex flex-wrap items-center gap-3 p-5">
        <div className="min-w-0 flex-1">
          <h2 className="font-black text-[#10243e]">Marketplace analytics</h2>
          <p className="mt-1 text-xs text-[#1d3a5f]/65">
            Daily aggregate counts only. No account, device, search-term, or location identifiers.
          </p>
        </div>
        <label className="text-xs font-bold text-[#1d3a5f]">
          Period{" "}
          <select
            value={days}
            onChange={(event) => changePeriod(event.target.value)}
            className="ml-1 rounded-lg border border-[#d6e1ec] bg-white px-2 py-2"
          >
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </select>
        </label>
        <button type="button" onClick={refresh} disabled={refreshing} className="btn-sun text-sm">
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {!authLoading && !user && !error && (
        <p className="rounded-xl border border-[#d6e1ec] bg-white p-4 text-sm text-[#1d3a5f]">
          Sign in with an administrator account to view aggregate analytics.
        </p>
      )}
      {loading ? (
        <p className="hippo-card p-5 text-sm text-[#1d3a5f]/60">Loading aggregate counts…</p>
      ) : dataAvailable ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["Page views", totals.pageViews],
              ["Searches submitted", totals.searches],
              ["Quote requests submitted", totals.quoteSubmissions],
            ].map(([label, value]) => (
              <article key={label} className="hippo-card p-5">
                <p className="text-xs font-bold uppercase tracking-wide text-[#1d3a5f]/60">{label}</p>
                <p className="mt-2 text-3xl font-black text-[#10243e]">{Number(value).toLocaleString("en-ZA")}</p>
                <p className="mt-1 text-xs text-[#1d3a5f]/50">Last {days} days</p>
              </article>
            ))}
          </div>

          <div className="hippo-card overflow-x-auto p-5">
            <h3 className="font-black text-[#10243e]">Daily activity</h3>
            {daily.length === 0 ? (
              <p className="py-6 text-center text-sm text-[#1d3a5f]/60">No aggregate events recorded in this period yet.</p>
            ) : (
              <table className="mt-3 w-full min-w-[520px] text-left text-sm">
                <thead className="text-xs uppercase text-[#1d3a5f]/55">
                  <tr>
                    <th className="py-2">Day</th>
                    <th className="py-2 text-right">Page views</th>
                    <th className="py-2 text-right">Searches</th>
                    <th className="py-2 text-right">Quote requests</th>
                  </tr>
                </thead>
                <tbody>
                  {[...daily].reverse().map((row) => (
                    <tr key={row.day} className="border-t border-[#e7eef5]">
                      <td className="py-2 font-semibold">{formatDay(row.day)}</td>
                      <td className="py-2 text-right">{row.pageViews.toLocaleString("en-ZA")}</td>
                      <td className="py-2 text-right">{row.searches.toLocaleString("en-ZA")}</td>
                      <td className="py-2 text-right">{row.quoteSubmissions.toLocaleString("en-ZA")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <details className="hippo-card p-5">
            <summary className="cursor-pointer font-bold text-[#10243e]">Page-view breakdown</summary>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {ANALYTICS_PAGES.map((page) => {
                const count = daily.reduce((sum, row) => sum + (row.pages[page] ?? 0), 0);
                return (
                  <p key={page} className="flex justify-between gap-3 rounded-lg bg-[#f7fafc] px-3 py-2 text-sm">
                    <span>{pageLabels[page]}</span>
                    <b>{count.toLocaleString("en-ZA")}</b>
                  </p>
                );
              })}
            </div>
          </details>
          <p className="text-xs text-[#1d3a5f]/55">
            Counts are aggregate events, not unique visitors or user-level conversion rates.
          </p>
        </>
      ) : null}
    </section>
  );
}
