import { categories, getCategory } from "@/data/categories";
import { CATEGORY_GROUPS, SERVICE_GROUPS } from "@/data/taxonomy";
import type { Business } from "@/data/businesses";
import { hasCap, normalizePlanId } from "@/lib/plans";
import { resolvePlace, resolveProvince, provinceOfCity } from "@/data/za-locations";

/** No bundled sellers: an empty pool means "nothing is matchable right now". */
const NO_SELLERS: Business[] = [];

/**
 * BARK-STYLE PRO MATCHING
 *
 * The old flow was: buyer browses a directory → picks a number → calls. Nothing
 * connected the buyer to the seller, and the seller never learned it happened.
 *
 * This is the "post a need, get matched" flow. A buyer types what they need and
 * where; we rank every seller against that need and hand back direct contact
 * details for the best matches. The request is ALSO written to the matched
 * sellers' inboxes, so the seller is notified automatically — no admin has to
 * approve or forward anything.
 *
 * Matching is pure and synchronous, so the same ranking runs on the server (so
 * crawlers and no-JS visitors see results) and in the browser (live updates).
 */

export type MatchQuery = {
  /** Free text: "burst geyser", "plumber", "nails". */
  need: string;
  /** Free text place: "Observatory", "Bloemfontein", "pretoria north". */
  place?: string;
  /** Optional hard filter that overrides category inference. */
  categorySlug?: string;
  /** Optional parent service group selected by the quote form. */
  serviceGroupSlug?: string;
};

export type MatchedPro = {
  business: Business;
  categorySlug: string;
  categoryName: string;
  /** 0–100, higher is better. Drives ordering. */
  score: number;
  /** Short human "why you matched" chip. */
  reason: string;
  sameArea: boolean;
  keywordHit: boolean;
};

export const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

/** Words that carry no matching signal — stripped before we search. */
const STOPWORDS = new Set([
  "i", "need", "a", "an", "the", "for", "in", "at", "near", "me", "my", "someone",
  "anyone", "please", "looking", "want", "with", "and", "or", "to", "of", "on",
  "get", "find", "hire", "book", "quote", "quotes", "help", "quickly", "urgent",
  "cheap", "cheapest", "best", "good", "around", "somewhere", "area", "services",
]);

/** Meaningful search terms, longest first so "geyser" beats "ge". */
export function keywords(text: string): string[] {
  return norm(text)
    .split(" ")
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    .sort((a, b) => b.length - a.length);
}


/**
 * Colloquial job descriptions → the category that actually does that job.
 *
 * Pure fuzzy scoring cannot get "car service" right: every trade has "service" in
 * its name, so a partial-substring match ranks Cleaning Services above
 * Mechanics. Real marketplaces hand-curate this mapping for exactly that reason,
 * so we do too. Checked BEFORE the fuzzy scorer, which stays the fallback for
 * anything not listed here.
 */
const JOB_ALIASES: Record<string, string> = {
  // Plumbing
  "burst geyser": "plumbers", "geyser": "plumbers", "geysers": "plumbers",
  "new geyser": "plumbers", "burst pipe": "plumbers", "leak": "plumbers",
  "leaking": "plumbers", "blocked drain": "plumbers", "blocked drains": "plumbers",
  "drain": "plumbers", "tap": "plumbers", "toilet": "plumbers",
  "pipe": "plumbers", "plumbing": "plumbers", "plumber": "plumbers",
  // Electrical
  "electrician": "electricians", "electric": "electricians", "electrical": "electricians",
  "wiring": "electricians", "db board": "electricians", "dbboard": "electricians",
  "distribution board": "electricians", "co certificate": "electricians",
  "coc": "electricians", "tripping breaker": "electricians",
  "fault finding": "electricians", "faultfinding": "electricians",
  // Automotive
  "car service": "mechanics", "car servicing": "mechanics", "service car": "mechanics",
  "car repair": "mechanics", "car repairs": "mechanics", "mechanic": "mechanics",
  "motor mechanic": "mechanics", "servicing": "mechanics", "brakes": "mechanics",
  "clutch": "mechanics", "roadworthy": "mechanics", "diagnostics": "mechanics",
  "car wash": "car-wash", "valet": "car-wash", "detailing": "car-wash",
  "tyres": "tyres", "wheel alignment": "tyres",
  "panel beater": "panel-beaters", "accident repair": "panel-beaters",
  // Home services
  "cleaning": "cleaning-services", "clean": "cleaning-services",
  "deep clean": "cleaning-services", "domestic cleaning": "cleaning-services",
  "house cleaning": "cleaning-services", "office cleaning": "cleaning-services",
  "maid": "cleaning-services", "cleaner": "cleaning-services",
  "painting": "painting", "painter": "painting",
  "garden": "gardening", "gardener": "gardening", "gardening": "gardening",
  "lawn": "gardening", "landscaping": "gardening", "pruning": "gardening",
  "handyman": "handyman", "odd jobs": "handyman",
  "builder": "construction", "building": "construction", "bricklayer": "construction",
  "renovation": "construction", "renovations": "construction",
  "locksmith": "locksmiths", "lock": "locksmiths", "locks": "locksmiths", "key cutting": "locksmiths",
  "pest control": "pest-control", "termite": "pest-control",
  "appliance": "appliance-repair", "fridge": "appliance-repair", "washing machine": "appliance-repair",
  "solar": "solar-installers", "alarm": "security", "gate motor": "gates-garages",
  // Beauty & lifestyle
  "hair": "beauty-salons", "hairdresser": "beauty-salons", "salon": "beauty-salons",
  "barber": "beauty-salons", "nails": "beauty-salons", "manicure": "beauty-salons",
  "spa": "beauty-salons", "massage": "beauty-salons",
  "restaurant": "restaurants", "takeaway": "restaurants",
  "doctor": "doctors-dentists", "dentist": "doctors-dentists", "clinic": "doctors-dentists",
  "gym": "gyms", "fitness": "gyms",
  // Education
  "tutor": "tutors", "tuition": "tutors", "lessons": "tutors",
  "driving school": "driving-schools", "driving lessons": "driving-schools",
  "piano": "music-teachers", "music lessons": "music-teachers", "guitar": "music-teachers",
  "computer classes": "training", "first aid": "training",
  // Technology & professional
  "website": "web-development", "web design": "web-development",
  "logo": "graphic-design", "designer": "graphic-design", "seo": "digital-marketing",
  "it support": "it-support", "computer repair": "computer-repair",
  "lawyer": "lawyers", "attorney": "lawyers",
  "accountant": "accountants", "bookkeeping": "accountants",
};

/** Exact alias hit, then the longest leading phrase ("car service in pta" → mechanics). */
function aliasFor(n: string): string | undefined {
  if (JOB_ALIASES[n]) return JOB_ALIASES[n];
  const words = n.split(" ");
  for (let len = Math.min(4, words.length); len >= 1; len--) {
    const phrase = words.slice(0, len).join(" ");
    if (JOB_ALIASES[phrase]) return JOB_ALIASES[phrase];
  }
  return undefined;
}

/** Best category for a free-text need, scored across name/plural/slug. */
export function matchCategory(need: string): { slug: string; name: string } | undefined {
  const n = norm(need);
  if (!n) return undefined;
  const words = n.split(" ").filter(Boolean);
  // Longest word first, so in "burst geyser" the distinctive "geyser" is tested
  // before the generic "burst" — otherwise neither word hits a category name and
  // the whole query falls through to a spurious partial match.
  const terms = words.filter((w) => w.length > 2).sort((a, b) => b.length - a.length);

  // Curated aliases win outright — they encode what people actually type.
  const alias = aliasFor(n);
  if (alias) {
    const c = getCategory(alias);
    if (c) return { slug: c.slug, name: c.plural };
  }

  const scoreOf = (c: (typeof categories)[number]) => {
    const name = c.name.toLowerCase();
    const plural = c.plural.toLowerCase();
    const slugWords = c.slug.replace(/-/g, " ");
    let s = 0;
    if (name === n || plural === n || c.slug === n) s += 100;
    if (plural.includes(n) || name.includes(n)) s += 60;
    if (n.includes(plural) || n.includes(name)) s += 40;

    for (const w of terms) {
      if (w.length < 3) continue;
      let hit = 0;
      if (name.includes(w)) hit += 14;
      if (plural.includes(w)) hit += 14;
      if (slugWords.includes(w)) hit += 10;
      // Singular/plural: "plumber" must hit the "plumbers" category.
      if (name.includes(`${w}s`) || plural.includes(`${w}s`)) hit += 8;
      // Stemmed prefix: "geysers" vs "geyser", "electrical" vs "electrician".
      if (w.length > 4 && (name.startsWith(w.slice(0, Math.max(4, w.length - 2))) ||
        plural.startsWith(w.slice(0, Math.max(4, w.length - 2))))) hit += 6;
      if (hit > 0) s += hit;
    }
    return s;
  };

  let best: (typeof categories)[number] | undefined;
  let bestScore = 0;
  for (const c of categories) {
    const s = scoreOf(c);
    // Ties must not be broken arbitrarily — prefer a LONGER category name so a
    // specific trade beats a broad one, and fall back to the first on a true tie.
    if (s > bestScore || (s === bestScore && s > 0 && best && c.name.length > best.name.length)) {
      bestScore = s;
      best = c;
    }
  }
  return best ? { slug: best.slug, name: best.plural } : undefined;
}

/**
 * Rank sellers against a need.
 *
 * Signals, in weight order:
 *   • same category (essential — a dentist must never answer a plumbing request)
 *   • same suburb/area as the buyer (the "local" promise)
 *   • the pro's own services/description text contains the search terms
 *   • rating + review count (trust)
 *   • paid-plan features (WhatsApp, verified) as a light tiebreaker
 */
export function matchPros(query: MatchQuery, pool: Business[] = NO_SELLERS): MatchedPro[] {
  const need = query.need?.trim() ?? "";
  const place = resolvePlace(query.place ?? "");
  const terms = keywords(need);

  const inferredCategory = query.categorySlug ?? matchCategory(need)?.slug;
  const explicitGroup = SERVICE_GROUPS.some((group) => group.slug === query.serviceGroupSlug)
    ? query.serviceGroupSlug
    : undefined;
  const selectedGroup = explicitGroup ?? (inferredCategory ? CATEGORY_GROUPS[inferredCategory] : undefined);
  const wantedCategory = explicitGroup && CATEGORY_GROUPS[inferredCategory ?? ""] !== explicitGroup
    ? undefined
    : inferredCategory;
  const cat = wantedCategory ? getCategory(wantedCategory) : undefined;
  const groupSlug = selectedGroup ?? (wantedCategory ? CATEGORY_GROUPS[wantedCategory] : undefined);
  const hasExactCategory = Boolean(wantedCategory) &&
    pool.some((business) => business.categorySlug === wantedCategory);

  const out: MatchedPro[] = [];
  // A province ("plumbers in Gauteng") is a coarser location than a suburb but
  // far more useful than no location at all. `resolvePlace` cannot express it —
  // it returns a single city — so it is resolved separately and scored as a
  // weaker "same province" signal, below same-suburb but above nothing.
  const province = resolveProvince(query.place ?? "");

  for (const b of pool) {
    // A detected trade narrows group matches to that trade when available.
    // Without a detected trade, the selected top-level service group is the
    // matching scope and keyword relevance determines the order.
    const isExact = b.categorySlug === wantedCategory;
    const isSameGroup = Boolean(groupSlug) && CATEGORY_GROUPS[b.categorySlug] === groupSlug;
    const broadGroupMatch = Boolean(explicitGroup && !wantedCategory);
    if (hasExactCategory && !isExact) continue;
    if (!isExact && !isSameGroup) continue;
    // For inferred trades, sibling categories need a keyword hit. A top-level
    // group selection without a detected trade can match any provider in it.
    if (!isExact && !terms.length && !broadGroupMatch) continue;

    const bCat = getCategory(b.categorySlug);
    const haystack = norm(
      [b.name, b.description, (b.services ?? []).join(" "), bCat?.name ?? "", bCat?.plural ?? ""].join(" "),
    );
    const keywordHit = terms.some((t) => haystack.includes(t));
    if (!isExact && !keywordHit && !broadGroupMatch) continue;

    const sameArea = Boolean(place?.area && b.suburbSlug === place.area.slug);
    const sameCity = Boolean(
      place?.city && (b.citySlug === place.city.slug || b.suburbSlug === place.city.slug),
    );
    // True when the buyer named a province and this pro trades in it. Checked
    // against the CITY's province, not the seller's own free-text, so it holds
    // for every listing regardless of how the suburb slug is spelled.
    const sameProvince = Boolean(
      province && b.citySlug && provinceOfCity(b.citySlug)?.slug === province.slug,
    );

    let score = 0;
    if (isExact) score += 50;
    else score += 10; // group sibling — weak by design
    if (sameArea) score += 30;
    else if (sameCity) score += 12;
    else if (sameProvince) score += 8; // right province, different city
    if (keywordHit) score += 25;
    score += Math.min(10, Number(b.rating ?? 0));
    score += Math.min(5, Number(b.reviewCount ?? 0) / 40);
    if (b.verified) score += 4;
    if (hasCap(normalizePlanId(b.plan ?? null), "whatsapp")) score += 3;
    if (hasCap(normalizePlanId(b.plan ?? null), "priorityLeads")) score += 8;

    if (score <= 0) continue;

    const reason = keywordHit
      ? sameArea ? `Specialises in ${need}` : `${cat?.plural ?? "Local pro"} near you`
      : sameArea ? `Based in ${place?.area?.name}` : `${cat?.plural ?? "Local pro"} in your area`;

    out.push({
      business: b,
      categorySlug: b.categorySlug,
      categoryName: bCat?.plural ?? "Local pro",
      score: Math.min(100, Math.round(score)),
      reason,
      sameArea,
      keywordHit,
    });
  }

  out.sort(
    (x, y) => y.score - x.score || Number(y.business.rating ?? 0) - Number(x.business.rating ?? 0),
  );
  return out;
}

/** Grouped picker for the seller signup form: service group → its categories. */
export const signupGroups = SERVICE_GROUPS.map((g) => ({
  ...g,
  categories: categories.filter((c) => CATEGORY_GROUPS[c.slug] === g.slug),
})).filter((g) => g.categories.length > 0);

/**
 * `loadSellerPool` used to live here, next to the pure ranking functions.
 *
 * It MOVED to `@/lib/server/seller-pool` because this module is also in the
 * BROWSER bundle (`FindProClient` and `ListBusinessSeller` import `matchPros` /
 * `signupGroups`), and the loader depends on the server-only REST reader and the
 * server-side cache. Importing a `lib/server/*` module from a module that ships to
 * browsers is the kind of thing that works today and breaks the moment someone
 * adds a server-only dependency to it — so the boundary is now explicit.
 *
 * The pure, isomorphic ranking (`matchPros`, `matchCategory`, `keywords`) stays
 * here, because ranking the same rows on the server and in the browser is a
 * feature: the server-rendered results and the live-updating results cannot
 * disagree.
 */

export const groupForSlug = (slug: string) => SERVICE_GROUPS.find((g) => g.slug === slug);
