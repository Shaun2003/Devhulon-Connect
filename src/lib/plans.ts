/**
 * Subscription plans — SINGLE SOURCE OF TRUTH.
 *
 * This module is intentionally pure (no Firebase imports, no side effects) so the
 * SAME config drives:
 *   • the public pricing page and upgrade modals (client)
 *   • entitlement checks in the UI (client)
 *   • the trusted server (route handlers + Admin SDK), which is the only place
 *     allowed to ACTIVATE a paid plan.
 *
 * Money and limits are declared here and nowhere else, which is what makes the
 * admin-editable-plan requirement (master spec §21) a data change rather than a
 * rewrite. Later these can be mirrored into a `subscription_plans` collection and
 * loaded at boot; the shapes below are already the document shape.
 *
 * ⚠️ NEVER trust a plan written by the browser. `subscriptions/{uid}` is
 * server-write-only (see firestore.rules). The client may only *read* it.
 */

export type PlanId = "starter" | "professional" | "business";
export type BillingPeriod = "monthly" | "annual";

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "expired";

/** Capability keys used for feature gating (master spec §21 / §60). */
export type Capability =
  | "businessListing"
  | "reviews"
  | "serviceAreas"
  | "messages"
  | "unlimitedMessages"
  | "basicAnalytics"
  | "advancedAnalytics"
  | "featuredProfile"
  | "priorityPlacement"
  | "deals"
  | "featuredDeals"
  | "events"
  | "featuredEvents"
  | "jobs"
  | "places"
  | "guides"
  | "profileCustomization"
  | "priorityLeads"
  | "multipleLocations"
  | "teamMembers"
  | "leadExport"
  | "promoFeatures"
  | "prioritySupport"
  /**
   * Legacy capability keys from the pre-marketplace release. Retained as
   * first-class aliases (same tier semantics as before: pro → Professional,
   * premium → Business) so existing listings, forms and gating keep working
   * without a migration. New code should prefer the keys above.
   */
  | "photos"
  | "whatsapp"
  | "website"
  | "priority"
  | "socials"
  | "analytics"
  | "leadForm"
  | "promoArticle"
  | "multiListing";

/** null = unlimited (business plan). */
export type PlanLimits = {
  services: number | null;
  portfolio: number | null;
  /** Matched lead opportunities presented per billing period (spec §48). */
  leadsPerMonth: number | null;
  /** Seller-sent messages allowed per UTC calendar month; null = unlimited. */
  messagesPerMonth: number | null;
  locations: number | null;
  teamMembers: number | null;
};

export type PlanConfig = {
  id: PlanId;
  name: string;
  blurb: string;
  /** Credits added at activation, then replenished monthly while entitled. */
  includedCredits: number;
  /** ZAR, exclusive of VAT — VAT is a billing concern, not a display concern. */
  monthly: number;
  annual: number;
  limits: PlanLimits;
  capabilities: Capability[];
  /** Shown as "MOST POPULAR" in pricing UI. */
  popular?: boolean;
  /** Days of free trial granted on first activation (spec §22). */
  trialDays?: number;
  features: string[];
};

export const TRIAL_DAYS = 7;

export const PLANS: PlanConfig[] = [
  {
    id: "starter",
    name: "Starter",
    blurb: "Get discovered and start receiving matched leads.",
    includedCredits: 35,
    monthly: 199,
    annual: 1990,
    popular: false,
    trialDays: TRIAL_DAYS,
    limits: { services: 5, portfolio: 10, leadsPerMonth: 5, messagesPerMonth: 50, locations: 1, teamMembers: 1 },
    capabilities: ["businessListing", "reviews", "serviceAreas", "messages", "basicAnalytics"],
    features: [
      "Business profile",
      "Up to 5 services",
      "Up to 10 portfolio items",
      "5 lead opportunities / month",
      "Basic messaging — 50 seller messages / month",
      "Reviews & ratings",
      "Service areas",
      "Basic analytics",
      "Business listing",
      "7-day free trial",
    ],
  },
  {
    id: "professional",
    name: "Professional",
    blurb: "Stand out, publish content and win more work.",
    includedCredits: 75,
    monthly: 399,
    annual: 3990,
    popular: true,
    limits: { services: 20, portfolio: 50, leadsPerMonth: 15, messagesPerMonth: null, locations: 2, teamMembers: 1 },
    capabilities: [
      "businessListing", "reviews", "serviceAreas", "messages", "unlimitedMessages",
      "basicAnalytics", "advancedAnalytics", "featuredProfile", "priorityPlacement",
      "deals", "events", "jobs", "profileCustomization",
      // legacy aliases
      "photos", "whatsapp", "website", "priority",
    ],
    features: [
      "Everything in Starter",
      "Up to 20 services",
      "Up to 50 portfolio items",
      "15 lead opportunities / month",
      "Unlimited messaging",
      "Featured profile eligibility",
      "Deals & events",
      "Jobs publishing",
      "Advanced analytics",
      "Priority placement eligibility",
      "Multiple service areas",
      "Additional profile customization",
    ],
  },
  {
    id: "business",
    name: "Business",
    blurb: "For teams, multiple locations and maximum reach.",
    includedCredits: 200,
    monthly: 799,
    annual: 7990,
    popular: false,
    limits: { services: null, portfolio: null, leadsPerMonth: 40, messagesPerMonth: null, locations: null, teamMembers: null },
    capabilities: [
      "businessListing", "reviews", "serviceAreas", "messages", "unlimitedMessages",
      "basicAnalytics", "advancedAnalytics", "featuredProfile", "priorityPlacement",
      "deals", "featuredDeals", "events", "featuredEvents", "jobs", "places", "guides",
      "profileCustomization", "priorityLeads", "multipleLocations", "teamMembers",
      "leadExport", "promoFeatures", "prioritySupport",
      // legacy aliases (former PREMIUM-only keys)
      "socials", "analytics", "leadForm", "promoArticle", "multiListing",
    ],
    features: [
      "Everything in Professional",
      "Unlimited services",
      "Unlimited portfolio",
      "40 lead opportunities / month",
      "Priority leads",
      "Multiple locations",
      "Team members",
      "Advanced analytics",
      "Featured deals & events",
      "Places & guides publishing",
      "Promotional features",
      "Lead export",
      "Priority support",
    ],
  },
];

/* ── Admin-editable overrides (master spec §21) ──────────────────────────────
 * Prices, limits, trial length and marketing copy are runtime DATA: an admin
 * edits `subscription_plans/{planId}` and the change applies without a deploy.
 * The PLANS array above stays the built-in default AND the fallback, so an
 * empty, partial or never-seeded collection behaves exactly as before.
 *
 * Plan ids and `capabilities` are deliberately NOT overridable. They are
 * structural: `PLAN_RANK` and `CAP_MIN_PLAN` below are computed once at import
 * and drive every feature gate, so letting an admin invent a tier or move a
 * capability would silently break upgrade logic rather than reconfigure it.
 */

export type PlanOverride = {
  name?: string;
  blurb?: string;
  monthly?: number;
  annual?: number;
  trialDays?: number;
  popular?: boolean;
  /** false hides the plan from the public pricing page WITHOUT deleting it. */
  active?: boolean;
  limits?: Partial<PlanLimits>;
  features?: string[];
};

let PLAN_OVERRIDES: Partial<Record<PlanId, PlanOverride>> = {};

/**
 * Install admin-configured overrides. Called once on client boot and at the top
 * of every server route handler that reads plans (lib/server/plan-config.ts).
 * Passing null/undefined clears them back to the built-in defaults.
 */
export function applyPlanOverrides(next: Partial<Record<PlanId, PlanOverride>> | null | undefined): void {
  PLAN_OVERRIDES = next && typeof next === "object" ? next : {};
}

/** True once any override is live — lets the UI label values "admin-configured". */
export const hasPlanOverrides = (): boolean => Object.keys(PLAN_OVERRIDES).length > 0;

/** A hidden plan stays out of the pricing grid and off checkout. */
export const isPlanActive = (id: PlanId): boolean => PLAN_OVERRIDES[id]?.active !== false;

/** Accept a finite, non-negative number; otherwise keep the built-in default. */
function pickNum(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback;
}

/**
 * `null` means UNLIMITED, so it must survive the merge — `pickNum` would treat
 * it as junk and restore the (finite) default, silently capping a tier the admin
 * intended to be uncapped. Undefined means "not configured": keep the default.
 */
function pickLimit(v: unknown, fallback: number | null): number | null {
  if (v === null) return null;
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback;
}

const cleanText = (v: unknown, max: number): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;

/** Merge one admin override over its built-in default, discarding junk values. */
export function mergePlan(base: PlanConfig, o: PlanOverride | undefined): PlanConfig {
  if (!o) return base;
  const features = Array.isArray(o.features)
    ? o.features.filter((f): f is string => typeof f === "string" && Boolean(f.trim())).map((f) => f.trim().slice(0, 90)).slice(0, 24)
    : null;
  return {
    ...base,
    name: cleanText(o.name, 40) ?? base.name,
    blurb: cleanText(o.blurb, 200) ?? base.blurb,
    monthly: pickNum(o.monthly, base.monthly),
    annual: pickNum(o.annual, base.annual),
    trialDays: pickNum(o.trialDays, base.trialDays ?? 0),
    popular: typeof o.popular === "boolean" ? o.popular : base.popular,
    limits: {
      services: pickLimit(o.limits?.services, base.limits.services),
      portfolio: pickLimit(o.limits?.portfolio, base.limits.portfolio),
      leadsPerMonth: pickLimit(o.limits?.leadsPerMonth, base.limits.leadsPerMonth),
      messagesPerMonth: pickLimit(o.limits?.messagesPerMonth, base.limits.messagesPerMonth),
      locations: pickLimit(o.limits?.locations, base.limits.locations),
      teamMembers: pickLimit(o.limits?.teamMembers, base.limits.teamMembers),
    },
    features: features && features.length ? features : base.features,
  };
}

/** Built-in defaults, ignoring admin overrides (used by the admin "reset" action). */
export const defaultPlan = (id: PlanId | string | null | undefined): PlanConfig | null =>
  PLANS.find((p) => p.id === normalizePlanId(id ?? null)) ?? null;

/** Effective plan config = built-in default merged with the admin override. */
export const getPlan = (id: PlanId | string | null | undefined): PlanConfig | null => {
  const base = defaultPlan(id);
  return base ? mergePlan(base, PLAN_OVERRIDES[base.id]) : null;
};

/** Effective plans for the public pricing page — hidden plans excluded. */
export function activePlans(): PlanConfig[] {
  return PLANS.filter((p) => isPlanActive(p.id)).map((p) => mergePlan(p, PLAN_OVERRIDES[p.id]));
}

export const formatZAR = (n: number) => `R${n.toLocaleString("en-ZA")}`;

/** Annual saving vs paying monthly for 12 months. */
export function annualSaving(plan: PlanConfig): { amount: number; percent: number } {
  const full = plan.monthly * 12;
  const amount = full - plan.annual;
  return { amount, percent: full > 0 ? Math.round((amount / full) * 100) : 0 };
}

/** Effective price for a chosen billing period. */
export const priceFor = (plan: PlanConfig, period: BillingPeriod) =>
  period === "annual" ? plan.annual : plan.monthly;

/** Period length in days, used to compute current_period_end. */
export const periodDays = (period: BillingPeriod) => (period === "annual" ? 365 : 30);

/** Month-equivalent price, for "from R166/mo" style labels on annual plans. */
export const perMonthEquivalent = (plan: PlanConfig, period: BillingPeriod) =>
  period === "annual" ? Math.round(plan.annual / 12) : plan.monthly;

/**
 * Legacy plan ids from the pre-marketplace release. Existing
 * `subscriptions/{uid}` and `businesses/{id}` documents still carry these, so the
 * migration is a pure lookup rather than a data backfill we might get wrong.
 *
 *   free    → starter       (closest equivalent, keeps listings live)
 *   pro     → professional  (same R199 → R399 tier position)
 *   premium → business      (top tier)
 */
const LEGACY_PLAN_MAP: Record<string, PlanId> = {
  free: "starter",
  pro: "professional",
  premium: "business",
};

/** Coerce any stored value (new, legacy, junk, null) to a known PlanId. */
export function normalizePlanId(raw: unknown): PlanId {
  if (typeof raw !== "string") return "starter";
  const key = raw.trim().toLowerCase();
  if (key === "starter" || key === "professional" || key === "business") return key;
  return LEGACY_PLAN_MAP[key] ?? "starter";
}

export function subscriptionIsEntitled(input: {
  status?: unknown;
  periodEnd?: unknown;
  cancelAtPeriodEnd?: unknown;
}, now = Date.now()): boolean {
  const status = typeof input.status === "string" ? input.status.toLowerCase() : "";
  const periodEnd = typeof input.periodEnd === "string" ? Date.parse(input.periodEnd) : Number.NaN;
  const cancelPending = status === "canceled" && input.cancelAtPeriodEnd === true;
  if (!["active", "trialing", "past_due"].includes(status) && !cancelPending) return false;
  if (input.periodEnd == null || input.periodEnd === "") return !cancelPending;
  return Number.isFinite(periodEnd) && periodEnd > now;
}

export const PLAN_RANK: Record<PlanId, number> = { starter: 0, professional: 1, business: 2 };

export function planRank(plan: PlanId | string | null | undefined): number {
  const p = normalizePlanId(plan ?? null);
  return PLAN_RANK[p];
}

/** Capability → lowest plan that unlocks it. Derived from PLANS, so it can never drift. */
export const CAP_MIN_PLAN: Record<Capability, PlanId> = (() => {
  const out = {} as Record<Capability, PlanId>;
  const order: PlanId[] = ["starter", "professional", "business"];
  for (const cap of PLANS.flatMap((p) => p.capabilities)) {
    out[cap] = order.find((id) => getPlan(id)?.capabilities.includes(cap)) ?? "business";
  }
  return out;
})();

/** Human labels for locked-feature upgrade modals (spec §60). */
export const CAP_LABEL: Record<Capability, string> = {
  businessListing: "Business listing",
  reviews: "Reviews & ratings",
  serviceAreas: "Service areas",
  messages: "Messaging",
  unlimitedMessages: "Unlimited messaging",
  basicAnalytics: "Basic analytics",
  advancedAnalytics: "Advanced analytics",
  featuredProfile: "Featured profile",
  priorityPlacement: "Priority placement",
  deals: "Deals",
  featuredDeals: "Featured deals",
  events: "Events",
  featuredEvents: "Featured events",
  jobs: "Jobs publishing",
  places: "Places publishing",
  guides: "Guides publishing",
  profileCustomization: "Profile customization",
  priorityLeads: "Priority leads",
  multipleLocations: "Multiple locations",
  teamMembers: "Team members",
  leadExport: "Lead export",
  promoFeatures: "Promotional features",
  prioritySupport: "Priority support",
  // legacy alias labels (kept verbatim so existing UI copy doesn't shift)
  photos: "Photo gallery & uploads",
  whatsapp: "WhatsApp button on profile",
  website: "Website link",
  priority: "Priority placement in results",
  socials: "Social media links",
  analytics: "Profile analytics (views & clicks)",
  leadForm: "Custom lead form",
  promoArticle: "Promotional guide article",
  multiListing: "Multiple listings",
};

/** True when the plan unlocks the capability. null/unsubscribed → Starter floor. */
export function hasCap(plan: PlanId | string | null | undefined, cap: Capability): boolean {
  const p = normalizePlanId(plan ?? null);
  return PLAN_RANK[p] >= PLAN_RANK[CAP_MIN_PLAN[cap]];
}

/** Limits for a plan (never null — falls back to the Starter floor). */
export function limitsFor(plan: PlanId | string | null | undefined): PlanLimits {
  return getPlan(normalizePlanId(plan ?? null))?.limits ?? PLANS[0].limits;
}

/** Remaining lead allowance, or null when unlimited (spec §48). */
export function leadAllowance(plan: PlanId | string | null | undefined, leadsUsed: number) {
  const cap = limitsFor(plan).leadsPerMonth;
  if (cap === null) return { limit: null as number | null, used: leadsUsed, remaining: null as number | null, exceeded: false };
  const remaining = Math.max(0, cap - leadsUsed);
  return { limit: cap, used: leadsUsed, remaining, exceeded: leadsUsed >= cap };
}

/** Whole days remaining until an ISO timestamp; 0 when already past. */
export function daysUntil(iso: string | null | undefined, now: Date = new Date()): number {
  if (!iso) return 0;
  const ms = new Date(iso).getTime() - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
}
