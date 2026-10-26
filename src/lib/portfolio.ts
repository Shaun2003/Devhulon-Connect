/**
 * Portfolio — a seller's proof of work (master spec §9 / §10).
 *
 * Pure module (no Firebase imports) so the SAME limits and validation are used
 * by the seller UI, the API route that enforces the plan quota on the server,
 * and firestore.rules field checks.
 *
 * Images are LINK based on purpose: direct Storage uploads need a Blaze plan,
 * and pasted https links keep the free tier usable end to end.
 */

export type PortfolioItem = {
  id: string;
  ownerUid: string;
  businessId: string;
  title: string;
  description: string;
  /** "2026-03" or an ISO date — free text so sellers can be as precise as they like. */
  completedAt: string;
  /** Before/after pair for the work types where that tells the story. */
  beforeUrl: string;
  afterUrl: string;
  /** Single main image, used when there's no before/after pair. */
  imageUrl: string;
  tags: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type PortfolioDraft = {
  title: string;
  description: string;
  completedAt: string;
  beforeUrl: string;
  afterUrl: string;
  imageUrl: string;
  tags: string[];
};

export const PORTFOLIO_LIMITS = {
  title: 120,
  description: 800,
  completedAt: 40,
  url: 500,
  tags: 8,
  tagLength: 24,
} as const;

export function isHttpUrl(v: unknown): boolean {
  return /^https?:\/\/.+/i.test(String(v ?? "").trim());
}

/** Trim + clamp a submitted draft into exactly the stored shape. */
export function cleanPortfolioDraft(d: Partial<PortfolioDraft> & Record<string, unknown>): PortfolioDraft {
  const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
  const tags = (Array.isArray(d.tags) ? d.tags : String(d.tags ?? "").split(/[\n,;]+/))
    .map((t) => String(t).trim().slice(0, PORTFOLIO_LIMITS.tagLength))
    .filter(Boolean)
    .filter((t, i, all) => all.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === i)
    .slice(0, PORTFOLIO_LIMITS.tags);
  return {
    title: str(d.title, PORTFOLIO_LIMITS.title),
    description: str(d.description, PORTFOLIO_LIMITS.description),
    completedAt: str(d.completedAt, PORTFOLIO_LIMITS.completedAt),
    beforeUrl: str(d.beforeUrl, PORTFOLIO_LIMITS.url),
    afterUrl: str(d.afterUrl, PORTFOLIO_LIMITS.url),
    imageUrl: str(d.imageUrl, PORTFOLIO_LIMITS.url),
    tags,
  };
}

/** Human problems for a draft (empty array = valid). */
export function validatePortfolioDraft(d: Partial<PortfolioDraft>): string[] {
  const issues: string[] = [];
  const title = String(d.title ?? "").trim();
  if (title.length < 2) issues.push("Give the project a title (e.g. “Geyser swap — Annlin”).");
  else if (title.length > PORTFOLIO_LIMITS.title) issues.push(`Keep the title under ${PORTFOLIO_LIMITS.title} characters.`);
  if (String(d.description ?? "").trim().length < 10) issues.push("Add a sentence or two about the job.");

  const imageUrl = String(d.imageUrl ?? "").trim();
  const before = String(d.beforeUrl ?? "").trim();
  const after = String(d.afterUrl ?? "").trim();
  if (before && !isHttpUrl(before)) issues.push("The “before” link must start with http(s)://.");
  if (after && !isHttpUrl(after)) issues.push("The “after” link must start with http(s)://.");
  if (imageUrl && !isHttpUrl(imageUrl)) issues.push("The image link must start with http(s)://.");
  if (!imageUrl && !after && !before) issues.push("Add at least one image link (a photo is what makes this credible).");
  return issues;
}

/**
 * How many portfolio items the plan allows, and what's left.
 * `null` limit = unlimited (Business). This is the SAME function the API route
 * uses to reject over-quota writes, so the UI copy can never promise more than
 * the server allows.
 */
export function portfolioCapacity(
  limit: number | null,
  used: number
): { limit: number | null; used: number; remaining: number | null; full: boolean } {
  if (limit === null) return { limit: null, used, remaining: null, full: false };
  const remaining = Math.max(0, limit - used);
  return { limit, used, remaining, full: used >= limit };
}

/** The picture to show for an item: after-shot, else the single image, else before. */
export function portfolioImage(item: PortfolioItem): string {
  return item.afterUrl || item.imageUrl || item.beforeUrl || "";
}

export function portfolioPair(item: PortfolioItem): boolean {
  return Boolean(item.beforeUrl && item.afterUrl);
}

/**
 * Service areas (spec §9 / §10) — the suburbs a seller serves.
 *
 * Pure sanitiser shared by the UI and the server route, so both agree on what
 * a "clean" area list looks like. Slug form (e.g. `pretoria-north`) matches the
 * suburb identifiers already used across listings, feeds and search.
 */
export function cleanServiceAreas(raw: unknown, hardCap = 20): string[] {
  const parts = Array.isArray(raw) ? raw : String(raw ?? "").split(/[\n,;]+/);
  const out: string[] = [];
  for (const part of parts) {
    const v = String(part)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    if (!v) continue;
    if (!out.includes(v)) out.push(v);
    if (out.length >= hardCap) break;
  }
  return out;
}
