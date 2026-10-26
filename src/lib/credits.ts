/**
 * Credit wallet — the isomorphic (client + server) half of the pay-per-contact
 * lead model.
 *
 * WHY THIS EXISTS ALONGSIDE THE SUBSCRIPTION ALLOWANCE: the site already meters
 * leads through `consumeLeadOpportunity` (a monthly allowance baked into each
 * plan). That is a *push* model — a matched request is delivered to a seller
 * automatically. The marketplace also needs a *pull* model, the one Bark uses:
 * a seller browses a live feed of requests for FREE (contact details hidden),
 * and pays credits only when they choose to unlock a specific buyer's contact.
 *
 * This module holds everything that is the SAME on both sides of the wire:
 *   • the credit-pack catalogue and their rand prices,
 *   • the lead→price tier table and `creditPriceFor()`,
 *   • the shared TypeScript shapes.
 *
 * It deliberately holds NO Firestore access. `creditPriceFor` is a PURE function
 * of a lead's public fields, so the SERVER recomputes the price from trusted
 * data at unlock time and never trusts a price the browser sends. See
 * `@/lib/server/credits` for the authoritative, transactional half.
 */

/** One purchasable bundle of credits. Prices are in whole rand. */
export type CreditPack = {
  id: "starter" | "growth" | "business";
  name: string;
  tagline: string;
  /** Price in ZAR (whole rands). The server resolves this — never the client. */
  price: number;
  credits: number;
  features: string[];
  popular?: boolean;
};

/**
 * Launch credit packs (marketplace spec §6). These are SUGGESTED launch prices to
 * test against acquisition cost and lead quality — not locked in. The per-credit
 * figure falls as the pack grows, which encourages the larger purchase.
 */
export const CREDIT_PACKS: CreditPack[] = [
  {
    id: "starter",
    name: "Starter Pack",
    tagline: "For freelancers and new businesses",
    price: 199,
    credits: 50,
    features: ["50 credits", "R3.98 per credit", "Test the platform and contact a handful of leads"],
  },
  {
    id: "growth",
    name: "Growth Pack",
    tagline: "For growing service businesses",
    price: 499,
    credits: 150,
    features: ["150 credits", "R3.33 per credit", "A lower cost per credit to encourage larger purchases"],
    popular: true,
  },
  {
    id: "business",
    name: "Business Pack",
    tagline: "For established businesses",
    price: 999,
    credits: 350,
    features: ["350 credits", "R2.85 per credit", "For businesses that contact leads regularly"],
  },
];

export const getCreditPack = (id: string): CreditPack | undefined =>
  CREDIT_PACKS.find((p) => p.id === id);

/** Cost per credit for a pack, to 2dp — shown on the pack card. */
export const perCredit = (pack: CreditPack): string => (pack.price / pack.credits).toFixed(2);

/**
 * Lead price tiers (spec §7). A job is NOT worth the same to every seller, so
 * price scales with estimated value. These are starting hypotheses to test, not
 * fixed market rates — monitor contact→reply and lead→hire rates and tune them.
 *
 *   small   → 5 credits    (budget under R3,000)
 *   standard→ 12 credits   (budget R3,000–R14,999)
 *   large   → 25 credits   (budget R15,000–R49,999 or estimated large job)
 *   major   → 40 credits   (budget R50,000+)
 */
export type LeadTier = "small" | "standard" | "large" | "major";

export const LEAD_TIER_CREDITS: Record<LeadTier, number> = {
  small: 5,
  standard: 12,
  large: 25,
  major: 40,
};

export const LEAD_TIER_LABEL: Record<LeadTier, string> = {
  small: "Small job",
  standard: "Standard job",
  large: "Large project",
  major: "Major project",
};

/**
 * The public shape of a lead as shown in the seller marketplace feed.
 *
 * NOTE WHAT IS ABSENT: `phone`, `email` and the buyer's `name` are NOT part of
 * this shape. A seller browsing the feed must never receive them — they are the
 * thing being sold. The server strips them; this type documents that contract so
 * a future edit can't quietly leak a contact field into the preview.
 */
export type LeadPreview = {
  id: string;
  need: string;
  category?: string | null;
  /** Approximate area only — never the buyer's exact address. */
  suburb?: string | null;
  timeline?: string | null;
  /** Buyer-stated maximum budget in ZAR; shown in the preview, not a contact field. */
  budget?: number | null;
  /** Estimated value band, derived server-side; drives the credit price. */
  tier: LeadTier;
  credits: number;
  createdAt?: unknown;
};

/**
 * Derive a lead's price tier from its PUBLIC fields.
 *
 * Pure and deterministic so the SERVER recomputes it from the stored lead and
 * gets the same answer the UI showed — a seller is never charged a different
 * price than advertised, and a tampered client can't talk the price down.
 *
 * Heuristic (until real budget signals exist): longer, more specific briefs and
 * explicit "ASAP / urgent" or build/develop/install language read as higher
 * value. `budget`, when a lead carries one, wins outright.
 */
export function tierForLead(lead: {
  need?: string | null;
  budget?: string | number | null;
  timeline?: string | null;
}): LeadTier {
  const budget = Number(lead.budget);
  if (Number.isFinite(budget) && budget > 0) {
    if (budget >= 50000) return "major";
    if (budget >= 15000) return "large";
    if (budget >= 3000) return "standard";
    return "small";
  }
  const text = `${lead.need ?? ""} ${lead.timeline ?? ""}`.toLowerCase();
  const bigWords = /(website|software|app|system|renovat|build|install|new |develop|platform|integrat)/.test(text);
  const urgent = /(asap|urgent|emergency|immediately)/.test(text);
  const long = (lead.need ?? "").length > 160;
  if (bigWords || long) return "large";
  if (urgent) return "standard";
  return "small";
}

/** The credit price for a lead — the single source both UI and server read. */
export const creditPriceFor = (lead: Parameters<typeof tierForLead>[0]): number =>
  LEAD_TIER_CREDITS[tierForLead(lead)];

/** A seller's wallet, as read for realtime display. */
export type Wallet = {
  balance: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
  updatedAt?: unknown;
};

/** One row in the credit ledger — every earn and every spend. */
export type CreditTxn = {
  id: string;
  type: "purchase" | "spend" | "refund" | "bonus";
  amount: number;
  balanceAfter: number;
  leadId?: string | null;
  packId?: string | null;
  planId?: string | null;
  reference?: string | null;
  note?: string | null;
  createdAt?: unknown;
};

/** A lead this seller has already paid to unlock (so it can't be charged twice). */
export type LeadUnlock = {
  id: string;
  leadId: string;
  ownerUid: string;
  credits: number;
  createdAt?: unknown;
};
