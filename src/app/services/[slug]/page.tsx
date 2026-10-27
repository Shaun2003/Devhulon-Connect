import type { Metadata } from "next";
import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";
import { categories, getCategory } from "@/data/categories";
import { groupForCategory, subcategoriesFor } from "@/data/taxonomy";
import { zaProvinces } from "@/data/za-locations";
import { toBusiness, applyReviewRatings, type Business, type RatingAgg } from "@/data/businesses";
import { KIcon, iconForCategory } from "@/lib/icons";
import {
  fetchPublicBusinessesByCategory,
  fetchReviewRatings,
  canReadFirestoreRest,
} from "@/lib/firestore-rest";
import { SITE_SHORT } from "@/lib/site";
import { abs } from "@/lib/seo";
import { Faq, CtaBand } from "@/components/hippo";
import { AdSlot } from "@/components/ui";
import { SubcategoryAnchors, ServiceBreadcrumbs } from "@/components/services/ServiceSections";
import ServiceSearch from "@/components/services/ServiceSearch";

/**
 * /services/[slug] — the SEO service-search page (§7, §32).
 *
 * The page shell, metadata and JSON-LD are server-rendered so crawlers and
 * no-JS visitors see real pros, and the LISTINGS themselves are realtime: the
 * server seeds the first paint, then `onSnapshot` in <ServiceSearch> keeps them
 * current without a reload.
 *
 * `generateStaticParams` still declares the known category slugs, but
 * `dynamicParams` is deliberately left at its default (`true`). It used to be
 * `false`, which combined with the uncached (`no-store`) read below made the
 * page impossible to prerender — so the build emitted zero valid params and
 * EVERY /services/<slug> URL returned 404. Unknown slugs are still rejected by
 * `getCategory()` → `notFound()`, so this doesn't trade the 404 for soft-404s.
 */

/**
 * Live-only. There is no bundled sample data, so an empty list is honest: it
 * means no seller has listed in this category yet, and the page says so.
 *
 * The initial page is an indexed category query. More pages are fetched through
 * the public, category-scoped API route; the client listener keeps its capped
 * first slice fresh without requiring a full catalogue read.
 */
async function loadCategoryPage(
  slug: string
): Promise<{
  list: Business[];
  ratings: Record<string, RatingAgg> | null;
  nextCursor: string | null;
  hasMore: boolean;
  loadError: string | null;
}> {
  if (!canReadFirestoreRest) {
    return {
      list: [],
      ratings: null,
      nextCursor: null,
      hasMore: false,
      loadError: "The business catalogue is not configured.",
    };
  }
  try {
    const [page, ratings] = await Promise.all([
      fetchPublicBusinessesByCategory(slug),
      fetchReviewRatings(),
    ]);
    const out: Business[] = [];
    for (const row of page.businesses) {
      const id = String(row.id ?? "");
      if (!id) continue;
      out.push(toBusiness(id, row));
    }
    return {
      list: applyReviewRatings(out, ratings),
      ratings,
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
      loadError: null,
    };
  } catch (error) {
    unstable_rethrow(error);
    console.error("[KASI] service catalogue query failed:", error);
    return {
      list: [],
      ratings: null,
      nextCursor: null,
      hasMore: false,
      loadError: "We couldn't load businesses right now. Please refresh and try again.",
    };
  }
}

export function generateStaticParams() {
  return categories.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const cat = getCategory(slug);
  if (!cat) return {};
  const title = `${cat.plural} near you — compare local pros & get free quotes`;
  const description = `${cat.blurb} Compare local ${cat.plural.toLowerCase()} side-by-side — ratings, prices, hours and reviews — then request a free quote. ${cat.priceGuide.split("·")[0]?.trim() ?? ""}`;
  return {
    title,
    description,
    alternates: { canonical: abs(`/services/${cat.slug}`) },
    keywords: [cat.name.toLowerCase(), `${cat.plural.toLowerCase()} near me`, `find a ${cat.name.toLowerCase()} South Africa`, "local services prices"],
    openGraph: {
      title,
      description,
      url: abs(`/services/${cat.slug}`),
      type: "website",
      images: [{ url: abs("/opengraph-image"), width: 1200, height: 630, alt: `${cat.plural} on ${SITE_SHORT}` }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [abs("/opengraph-image")],
    },
  };
}

export default async function ServicePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cat = getCategory(slug);
  if (!cat) notFound();

  const { list, ratings, nextCursor, hasMore, loadError } = await loadCategoryPage(slug);
  const group = groupForCategory(slug);
  const subs = subcategoriesFor(slug);

  // "By area" lists the 9 PROVINCES, not suburbs.
  //
  // It previously derived areas from whatever suburbs the live listings sat in,
  // and fell back to a hardcoded `suburbsForCity("pretoria").slice(0, 8)` when a
  // category had none — which is how a page ended up advertising "Electricians
  // in Akasia" to every visitor in the country, including the eight whose
  // province never had a listing.
  //
  // Every province is listed and deep-links into matching with the province
  // pre-filled; counts are omitted because this page only loads one catalogue page.
  const areas = zaProvinces.map((p) => ({
    slug: p.slug,
    name: p.name,
    href: `/find-pro?need=${encodeURIComponent(cat.plural)}&place=${encodeURIComponent(p.name)}`,
  }));

  const related = (group ? categories.filter((c) => groupForCategory(c.slug)?.slug === group.slug) : categories)
    .filter((c) => c.slug !== slug)
    .slice(0, 6);

  const faqs =
    cat.faqs.length > 0
      ? cat.faqs
      : [
          { q: `How much do ${cat.plural.toLowerCase()} cost near me?`, a: cat.priceGuide },
          { q: "How do I choose a pro?", a: `Compare ratings, verification details where available, opening hours and customer reviews side-by-side on ${SITE_SHORT}, then contact a business or request a free quote.` },
          { q: "Does requesting a quote cost anything?", a: `No — requesting a quote on ${SITE_SHORT} is free. A request may be shared with up to three matched, eligible businesses.` },
        ];
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
  const crumbsLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: abs("/") },
      { "@type": "ListItem", position: 2, name: "Services", item: abs("/services") },
      { "@type": "ListItem", position: 3, name: cat.plural, item: abs(`/services/${cat.slug}`) },
    ],
  };

  return (
    <div className="min-h-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbsLd) }} />

      <div className="hippo-hero text-white">
        <div className="mx-auto w-full max-w-6xl min-w-0 px-4 pt-6 pb-8 sm:px-6 sm:pt-8 sm:pb-10">
          <ServiceBreadcrumbs group={group} category={cat} />
          <p className="mt-4 text-xs font-extrabold uppercase tracking-[0.18em] text-[#ffc72c] sm:mt-5">
            {group ? group.name + " · " : ""}Compare {list.length > 0 ? `${list.length}${hasMore ? "+" : ""} local listings` : "local pros"}
          </p>
          <h1 className="mt-2 break-words text-3xl font-black tracking-tight sm:text-4xl">
            {cat.plural} near you
          </h1>
          <p className="mt-2 max-w-2xl break-words text-sm text-white/75 sm:text-base">
            {cat.blurb} Compare ratings, prices, hours and reviews side-by-side, then request a quote that may reach up to three matched, eligible businesses.
          </p>
          <div className="mt-4 min-w-0">
            <SubcategoryAnchors category={cat} items={subs} />
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-6xl min-w-0 space-y-8 px-4 py-8 sm:space-y-10 sm:px-6 sm:py-10">
        <ServiceSearch
          key={cat.slug}
          items={list}
          categoryName={cat.plural}
          categorySlug={cat.slug}
          initialRatings={ratings}
          initialCursor={nextCursor}
          initialHasMore={hasMore}
          initialLoadError={loadError}
        />

        <AdSlot />

        <section id="price-guide" className="hippo-card overflow-hidden" aria-labelledby="svc-price-h">
          <div className="p-5 sm:p-6">
            <span className="inline-block text-[10px] font-black uppercase tracking-widest bg-[#e8f6d8] text-[#3c6b1d] rounded-full px-2 py-0.5">
              Local price guide
            </span>
            <h2 id="svc-price-h" className="text-xl font-black text-[#10243e] mt-2">
              What {cat.plural.toLowerCase()} cost
            </h2>
            <div className="mt-4 grid sm:grid-cols-2 gap-2 text-sm items-start">
              {cat.priceGuide.split("·").map((p) => (
                <div key={p} className="rounded-xl bg-[#f2f6fa] px-4 py-3 text-[#1d3a5f]/80">
                  <span className="font-bold text-[#10243e]">{p.trim()}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="svc-faq-h">
          <h2 id="svc-faq-h" className="text-xl font-black text-[#10243e] tracking-tight mb-3">
            {cat.plural} — FAQs
          </h2>
          <Faq items={faqs} />
        </section>

        <section aria-labelledby="svc-areas-h">
          <h2 id="svc-areas-h" className="text-xl font-black text-[#10243e] tracking-tight mb-3">
            {cat.plural} by area
          </h2>
          <div className="flex flex-wrap gap-2">
            {areas.map((a) => (
              <Link
                key={a.slug}
                href={a.href}
                className="rounded-full bg-white border border-[#d6e1ec] px-4 py-2 text-sm font-bold text-[#1d3a5f] hover:border-[#7ac142] hover:text-[#558c2b] transition"
              >
                {cat.plural} in {a.name}
              </Link>
            ))}
          </div>
        </section>

        <section aria-labelledby="svc-related-h">
          <h2 id="svc-related-h" className="text-xl font-black text-[#10243e] tracking-tight mb-3">
            Related services
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {related.map((c) => (
              <Link key={c.slug} href={`/services/${c.slug}`} className="hippo-card hover-lift p-4 flex items-center gap-3 group">
                <span className="icon-3d shrink-0" aria-hidden="true">
                  <KIcon name={iconForCategory(c.slug)} size={20} />
                </span>
                <span className="font-extrabold text-sm text-[#10243e] group-hover:text-[#558c2b] group-hover:underline">
                  {c.plural}
                </span>
              </Link>
            ))}
          </div>
        </section>

        <CtaBand />

      </main>
    </div>
  );
}
