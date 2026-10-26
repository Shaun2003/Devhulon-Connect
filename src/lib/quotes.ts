/**
 * Quote engine — pure rules for the buyer ↔ seller quote lifecycle (§16, §17).
 *
 * Deliberately has NO Firebase imports: the SAME validation runs in the browser
 * (instant feedback) and is re-applied by `firestore.rules` on the server, which
 * stays authoritative. A tampered request therefore cannot slip past the price
 * band or rewrite a seller-owned field.
 */

export type QuoteStatus = "sent" | "accepted" | "declined" | "withdrawn" | "expired";

/** Shape of a `quotes/{id}` document. */
export type Quote = {
  id: string;
  leadId: string;
  /**
   * The PARENT request this quote belongs to. A broadcast gives each seller its
   * own lead copy, so `leadId` alone cannot tell you which quotes compete for the
   * same buyer job — `requestId` can.
   */
  requestId?: string;
  buyerUid: string;
  sellerUid: string;
  businessId?: string | null;
  price: number;
  vatIncluded: boolean;
  duration: string;
  availability: string;
  message: string;
  inclusions: string[];
  exclusions: string[];
  warranty: string;
  attachments: string[];
  status: QuoteStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
  decidedAt?: unknown;
  buyerResponse?: string;
};

/** What a seller actually submits (everything else is server/derived). */
export type QuoteDraft = {
  price: number;
  vatIncluded: boolean;
  duration: string;
  availability: string;
  message: string;
  inclusions: string[];
  exclusions: string[];
  warranty: string;
  attachments: string[];
};

export const QUOTE_LIMITS = {
  maxPrice: 5_000_000,
  duration: 40,
  availability: 60,
  message: 1200,
  warranty: 200,
  listItems: 12,
  itemLength: 80,
  attachments: 5,
} as const;

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  sent: "Awaiting decision",
  accepted: "Accepted",
  declined: "Declined",
  withdrawn: "Withdrawn",
  expired: "Expired",
};

/** Chip classes per status, so statuses read the same everywhere. */
export const QUOTE_STATUS_TONE: Record<QuoteStatus, string> = {
  sent: "bg-[#fff4d6] text-[#a36508]",
  accepted: "bg-[#e8f6d8] text-[#3c6b1d]",
  declined: "bg-[#f2f6fa] text-[#1d3a5f]/70",
  withdrawn: "bg-[#f2f6fa] text-[#1d3a5f]/70",
  expired: "bg-[#f2f6fa] text-[#1d3a5f]/70",
};

export function normalizeQuoteStatus(v: unknown): QuoteStatus {
  const s = String(v ?? "sent");
  return s === "accepted" || s === "declined" || s === "withdrawn" || s === "expired" ? s : "sent";
}

/** Split a textarea / comma list into clean, de-duplicated, capped items. */
export function parseList(raw: unknown, max: number = QUOTE_LIMITS.listItems): string[] {
  const parts = String(raw ?? "").split(/[\n,;]+/);
  const out: string[] = [];
  for (const part of parts) {
    const v = part.trim().slice(0, QUOTE_LIMITS.itemLength);
    if (!v) continue;
    if (out.some((x) => x.toLowerCase() === v.toLowerCase())) continue;
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

/** Keep only well-formed https attachments. */
export function cleanLinks(raw: unknown): string[] {
  return parseList(raw, QUOTE_LIMITS.attachments).filter((u) => /^https:\/\/.+/i.test(u));
}

/**
 * Human-readable problems for a draft (empty array = valid). Mirrors the
 * server rules so the seller never gets a silent rejection.
 */
export function validateQuote(draft: {
  price?: unknown;
  duration?: unknown;
  availability?: unknown;
  message?: unknown;
}): string[] {
  const issues: string[] = [];
  const price = Number(draft.price);
  if (!Number.isFinite(price) || price <= 0) issues.push("Enter your price in rands (numbers only).");
  else if (price > QUOTE_LIMITS.maxPrice) issues.push(`Price looks too high — keep it under R${QUOTE_LIMITS.maxPrice.toLocaleString("en-ZA")}.`);
  if (String(draft.duration ?? "").trim().length < 2) issues.push("Add an estimated duration (e.g. “2–3 days”).");
  if (String(draft.message ?? "").trim().length < 10) issues.push("Write at least a sentence about what you'll do.");
  return issues;
}

/** Trim + clamp a submitted draft into the exact document shape we store. */
export function cleanQuoteDraft(draft: {
  price: unknown;
  vatIncluded?: unknown;
  duration?: unknown;
  availability?: unknown;
  message?: unknown;
  inclusions?: unknown;
  exclusions?: unknown;
  warranty?: unknown;
  attachments?: unknown;
}): QuoteDraft {
  const price = Math.round(Number(draft.price) || 0);
  return {
    price: Math.min(Math.max(price, 1), QUOTE_LIMITS.maxPrice),
    vatIncluded: draft.vatIncluded === true,
    duration: String(draft.duration ?? "").trim().slice(0, QUOTE_LIMITS.duration),
    availability: String(draft.availability ?? "").trim().slice(0, QUOTE_LIMITS.availability),
    message: String(draft.message ?? "").trim().slice(0, QUOTE_LIMITS.message),
    inclusions: parseList(draft.inclusions),
    exclusions: parseList(draft.exclusions),
    warranty: String(draft.warranty ?? "").trim().slice(0, QUOTE_LIMITS.warranty),
    attachments: cleanLinks(draft.attachments),
  };
}

/**
 * Cheapest-first ordering for the comparison table. This is a PRESENTATION
 * order only — KASI never declares a winner (§17): the buyer decides.
 */
export function orderForCompare(quotes: Quote[]): Quote[] {
  return [...quotes].sort((a, b) => {
    const live = Number(b.status === "sent") - Number(a.status === "sent");
    return live !== 0 ? live : a.price - b.price;
  });
}

/** Lowest / highest / spread across live quotes — shown as "no winner" context. */
export function priceSpread(quotes: Quote[]): { low: number; high: number; count: number } | null {
  const live = quotes.filter((q) => q.status === "sent" || q.status === "accepted");
  if (live.length === 0) return null;
  const prices = live.map((q) => q.price);
  return { low: Math.min(...prices), high: Math.max(...prices), count: live.length };
}
