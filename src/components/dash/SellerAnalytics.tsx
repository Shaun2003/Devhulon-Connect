"use client";
import Link from "next/link";
import { aggregateSellerAnalytics, fmtRate } from "@/lib/analytics";
import { hasCap } from "@/lib/monetize";
import { KIcon } from "@/lib/icons";

type Row = Record<string, unknown>;

const ICON_MAP = { eye: "search", leads: "briefcase", file: "file", calendar: "calendar", taps: "heartPulse", saves: "heartPulse", star: "star" } as const;
type StatIcon = keyof typeof ICON_MAP;

function StatCard({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon: StatIcon }) {
  return (
    <div className="hippo-card p-4">
      <div className="flex items-center gap-2">
        <KIcon name={ICON_MAP[icon]} size={15} className="text-[#558c2b]" />
        <p className="text-xs font-extrabold uppercase tracking-wide text-[#1d3a5f]/60">{label}</p>
      </div>
      <p className="text-2xl font-black text-[#10243e] mt-1">{value}</p>
      {sub && <p className="text-[11px] text-[#1d3a5f]/60 mt-0.5">{sub}</p>}
    </div>
  );
}

function FunnelBar({ label, value, max, tone }: { label: string; value: number; max: number; tone: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-xs font-bold text-[#1d3a5f]/70">{label}</span>
      <div className="flex-1 h-5 rounded-full bg-[#f2f6fa] overflow-hidden">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${max > 0 ? Math.max(2, (value / max) * 100) : 2}%` }} />
      </div>
      <span className="w-10 text-right text-sm font-black text-[#10243e]">{value}</span>
    </div>
  );
}

/**
 * Seller analytics (spec §36). Every number is computed from real rows the
 * seller can read (leads/quotes/bookings) plus the business doc's
 * rules-protected counters — nothing is estimated or faked.
 *
 * Gating (§21/§60): the overview is Starter-level (basicAnalytics); the weekly
 * trend chart and conversion funnel are advancedAnalytics (Premium), and
 * the locked state is an upgrade offer, never a broken screen.
 */
export default function SellerAnalytics({
  plan,
  biz,
  leads,
  quotes,
  bookings,
}: {
  plan: string;
  biz?: Row | null;
  leads: Row[];
  quotes: Row[];
  bookings: Row[];
}) {
  const a = aggregateSellerAnalytics({ biz, leads, quotes, bookings });
  const advanced = hasCap(plan, "advancedAnalytics");
  const maxWeek = Math.max(1, ...a.timeline.map((w) => Math.max(w.leads, w.quotes, w.bookings)));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Profile views" value={String(a.counters.profileViews)} sub="All-time visits to your listing" icon="eye" />
        <StatCard label="Leads received" value={String(a.leads.received)} sub={`${a.leads.last30} in the last 30 days`} icon="leads" />
        <StatCard label="Quotes sent" value={String(a.quotes.sent)} sub={`${a.quotes.last30} in the last 30 days`} icon="file" />
        <StatCard label="Bookings" value={String(a.bookings.total)} sub={`${a.bookings.completed} completed`} icon="calendar" />
        <StatCard label="Phone taps" value={String(a.counters.phoneClicks)} sub="From your listing" icon="taps" />
        <StatCard label="WhatsApp taps" value={String(a.counters.whatsappClicks)} sub="From your listing" icon="taps" />
        <StatCard label="Saved by buyers" value={String(a.counters.saves)} sub="Added to their shortlists" icon="saves" />
        <StatCard label="Reviews" value={String(a.counters.reviewCount)} sub={a.counters.rating > 0 ? `${a.counters.rating.toFixed(1)} ★ average` : "No ratings yet"} icon="star" />
      </div>
      {advanced ? (
        <>
          <section className="hippo-card p-5" aria-label="Weekly activity">
            <h3 className="font-black text-[#10243e]">Last 6 weeks</h3>
            <p className="text-xs text-[#1d3a5f]/60 mt-0.5">Leads received, quotes sent and bookings requested per week.</p>
            <svg viewBox="0 0 340 130" className="w-full mt-3" role="img" aria-label="Weekly activity chart">
              {a.timeline.map((w, wi) => {
                const groupW = 340 / a.timeline.length;
                const x = wi * groupW + 14;
                const bar = (v: number, offset: number, color: string) => {
                  const h = Math.round((v / maxWeek) * 88);
                  return <rect key={offset} x={x + offset} y={104 - h} width={12} height={Math.max(v > 0 ? 3 : 0, h)} rx={2} fill={color} />;
                };
                return (
                  <g key={w.label}>
                    {bar(w.leads, 0, "#7ac142")}
                    {bar(w.quotes, 15, "#10243e")}
                    {bar(w.bookings, 30, "#ffc72c")}
                    <text x={x + 6} y={122} fontSize="9" fill="#1d3a5f" opacity="0.65">{w.label}</text>
                  </g>
                );
              })}
            </svg>
            <div className="flex flex-wrap gap-4 text-xs font-bold text-[#1d3a5f]/70 mt-1">
              <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#7ac142]" /> Leads</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#10243e]" /> Quotes</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#ffc72c]" /> Bookings</span>
            </div>
          </section>

          <section className="hippo-card p-5" aria-label="Conversion funnel">
            <h3 className="font-black text-[#10243e]">From request to won job</h3>
            <p className="text-xs text-[#1d3a5f]/60 mt-0.5">
              Quote rate {fmtRate(a.conversion.quoteRate)} · win rate on quotes {fmtRate(a.conversion.winRate)} · booking completion {fmtRate(a.conversion.completionRate)}
            </p>
            <div className="mt-3 space-y-2">
              <FunnelBar label="Leads" value={a.leads.received} max={Math.max(1, a.leads.received)} tone="bg-[#7ac142]" />
              <FunnelBar label="Engaged" value={a.leads.engaged} max={Math.max(1, a.leads.received)} tone="bg-[#558c2b]" />
              <FunnelBar label="Quoted" value={a.quotes.sent} max={Math.max(1, a.leads.received)} tone="bg-[#10243e]" />
              <FunnelBar label="Won" value={a.leads.won} max={Math.max(1, a.leads.received)} tone="bg-[#ffc72c]" />
            </div>
            <p className="text-[11px] text-[#1d3a5f]/55 mt-3">
              Rates show “—” until you have data. Benchmark: sellers who quote within a day win roughly twice as often.
            </p>
            {/* Contest context. Without this, a seller who bid on a shared request and
                was beaten sees a bare "lost" and concludes they did something wrong.
                Naming the real reason is both fairer and more motivating. */}
            {a.leads.lostToCompetition > 0 && (
              <p className="text-[11px] text-[#1d3a5f]/60 mt-2 bg-[#f2f6fa] rounded-lg px-3 py-2">
                <b className="text-[#10243e]">{a.leads.lostToCompetition}</b> of these went to a competing business
                on the same request. That is a bidding outcome, not a quality problem — each request reaches several
                pros, so only one can win.
              </p>
            )}
          </section>
        </>
      ) : (
        <section className="hippo-card p-5" aria-label="Advanced analytics">
          <div className="flex items-center gap-2">
            <KIcon name="trendingUp" size={18} className="text-[#558c2b]" />
            <h3 className="font-black text-[#10243e]">Advanced Analytics</h3>
          </div>
          <p className="text-sm text-[#1d3a5f]/70 mt-1">
            Weekly trends, conversion funnels and click-through detail are available on Premium.
            The overview above stays free on every plan.
          </p>
          <Link href="/pricing" className="btn-hippo text-sm mt-3 inline-flex">View plans </Link>
        </section>
      )}
    </div>
  );
}
