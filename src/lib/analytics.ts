/**
 * Seller analytics — pure aggregation over data the seller can already read
 * (master spec §36).
 *
 * No Firebase imports and NO mock numbers: every metric is derived from real
 * rows (leads, quotes, bookings) that the realtime layer already subscribes to,
 * plus the tamper-resistant counters on the business document (profile views,
 * phone/WhatsApp/website clicks, saves — each bumped by exactly ±1 under rules).
 *
 * Gating maps to the plans: the overview is Starter-tier (`basicAnalytics`),
 * trends + conversion funnels are Premium's `advancedAnalytics`.
 */

export type SellerRow = Record<string, unknown>;

/** Firestore Timestamp | Date | ISO | epoch → millis (0 when unknown). */
export function toMillis(value: unknown): number {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const t = new Date(value).getTime();
    return Number.isFinite(t) ? t : 0;
  }
  const m = value as { toMillis?: () => number; seconds?: number };
  if (typeof m.toMillis === "function") {
    try { return m.toMillis(); } catch { return 0; }
  }
  if (typeof m.seconds === "number") return m.seconds * 1000;
  return 0;
}

const DAY = 86_400_000;

/** Rolling weekly buckets ending now (oldest first). */
export function weeklyBuckets(weeks: number, now: Date = new Date()): { start: number; end: number; label: string }[] {
  const out: { start: number; end: number; label: string }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const end = now.getTime() - i * 7 * DAY;
    const start = end - 7 * DAY;
    out.push({
      start,
      end,
      label: new Date(start).toLocaleDateString("en-ZA", { day: "numeric", month: "short" }),
    });
  }
  return out;
}

function countIn(rows: SellerRow[], field: string, start: number, end: number): number {
  return rows.filter((r) => {
    const ms = toMillis(r[field]);
    return ms >= start && ms < end;
  }).length;
}

export type WeeklyPoint = { label: string; leads: number; quotes: number; bookings: number };

export type SellerAnalytics = {
  counters: {
    profileViews: number;
    phoneClicks: number;
    whatsappClicks: number;
    websiteClicks: number;
    saves: number;
    reviewCount: number;
    rating: number;
  };
  leads: {
    received: number;
    engaged: number;
    won: number;
    /** Genuinely lost (declined, expired, no response). */
    lost: number;
    /**
     * Lost to a COMPETING seller on the same request. Counted separately because
     * bidding and losing is the intended behaviour of a contested marketplace —
     * folding it into `lost` would understate every seller's win rate.
     */
    lostToCompetition: number;
    last30: number;
  };
  quotes: { sent: number; accepted: number; declined: number; last30: number };
  bookings: { total: number; confirmed: number; completed: number; cancelled: number; noShow: number; last30: number };
  conversion: { quoteRate: number | null; winRate: number | null; completionRate: number | null };
  timeline: WeeklyPoint[];
};

const LEAD_ENGAGED = ["accepted", "quoted", "negotiating", "won"];
const LAST_30 = 30 * DAY;

export function aggregateSellerAnalytics(input: {
  biz?: SellerRow | null;
  leads: SellerRow[];
  quotes: SellerRow[];
  bookings: SellerRow[];
  now?: Date;
}): SellerAnalytics {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const biz = input.biz ?? {};
  const num = (v: unknown) => Number(v ?? 0) || 0;

  const leadStatus = (r: SellerRow) => String(r.status ?? "new");
  const leads = input.leads;
  const quotes = input.quotes;
  const bookings = input.bookings;

  const quoteStatus = (r: SellerRow) => String(r.status ?? "sent");
  const bookingStatus = (r: SellerRow) => String(r.status ?? "requested");

  const timeline: WeeklyPoint[] = weeklyBuckets(6, now).map((w) => ({
    label: w.label,
    leads: countIn(leads, "createdAt", w.start, w.end),
    quotes: countIn(quotes, "createdAt", w.start, w.end),
    bookings: countIn(bookings, "createdAt", w.start, w.end),
  }));

  const pct = (part: number, whole: number): number | null =>
    whole <= 0 ? null : Math.round((part / whole) * 100);

  // Leads the buyer awarded to a COMPETING business on the same request. These are
  // the expected cost of bidding for one job, not a seller failure.
  const contested = leads.filter((r) => (r as { lostReason?: string }).lostReason === "awarded_elsewhere").length;

  return {
    counters: {
      profileViews: num(biz.profileViews),
      phoneClicks: num(biz.phoneClicks),
      whatsappClicks: num(biz.whatsappClicks),
      websiteClicks: num(biz.websiteClicks),
      saves: num(biz.saves),
      reviewCount: num(biz.reviewCount),
      rating: num(biz.rating),
    },
    leads: {
      received: leads.length,
      engaged: leads.filter((r) => LEAD_ENGAGED.includes(leadStatus(r))).length,
      won: leads.filter((r) => leadStatus(r) === "won").length,
      // A lead lost because the buyer awarded the job to ANOTHER business is not a
      // seller failure — it is the expected cost of competing for one job. Counting
      // it as a plain "lost" made the win rate look bad for sellers who quoted
      // competitively, and would have discouraged exactly the behaviour we want.
      lost: leads.filter((r) => leadStatus(r) === "lost").length - contested,
      /** Lost to a competing seller on the same request (normal, not a failure). */
      lostToCompetition: contested,
      last30: leads.filter((r) => nowMs - toMillis(r.createdAt) < LAST_30).length,
    },
    quotes: {
      sent: quotes.length,
      accepted: quotes.filter((r) => quoteStatus(r) === "accepted").length,
      declined: quotes.filter((r) => quoteStatus(r) === "declined").length,
      last30: quotes.filter((r) => nowMs - toMillis(r.createdAt) < LAST_30).length,
    },
    bookings: {
      total: bookings.length,
      confirmed: bookings.filter((r) => bookingStatus(r) === "confirmed").length,
      completed: bookings.filter((r) => bookingStatus(r) === "completed").length,
      cancelled: bookings.filter((r) => bookingStatus(r) === "cancelled").length,
      noShow: bookings.filter((r) => bookingStatus(r) === "no-show").length,
      last30: bookings.filter((r) => nowMs - toMillis(r.createdAt) < LAST_30).length,
    },
    conversion: {
      quoteRate: pct(quotes.length, leads.length),
      winRate: pct(quotes.filter((r) => quoteStatus(r) === "accepted").length, quotes.length),
      completionRate: pct(bookings.filter((r) => bookingStatus(r) === "completed").length, bookings.length),
    },
    timeline,
  };
}

/** Format a conversion number for display ("—" when there's no data yet). */
export function fmtRate(rate: number | null): string {
  return rate === null ? "—" : `${rate}%`;
}
