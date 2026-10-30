import type { Metadata } from "next";
import { notFound } from "next/navigation";
import BusinessLive, { type Biz } from "@/components/BusinessLive";
import { getCategory } from "@/data/categories";
import { getCity, getSuburb } from "@/data/locations";
import { fetchPublicDoc, fetchBusinessRatings, fetchBusinessReviews } from "@/lib/firestore-rest";
import { SITE_NAME, SITE_SHORT, SITE_URL } from "@/lib/site";

type BizMeta = {
  id: string;
  name?: string;
  categorySlug?: string;
  suburbSlug?: string;
  citySlug?: string;
  hours?: string;
  description?: string;
  priceNote?: string;
  services?: string[];
  rating?: number;
  reviewCount?: number;
  verified?: boolean;
  plan?: string;
  coverImageUrl?: string;
  photos?: string[];
};

/**
 * Listing data for SEO: live Firestore first (works for seller-created
 * listings), then the bundled seed data. Both are publicly readable, so this
 * never exposes anything a visitor couldn't already see.
 */
async function loadBusiness(id: string): Promise<BizMeta | null> {
  // LIVE ONLY — there is no bundled seed to fall back to.
  const live = await fetchPublicDoc("businesses", id);
  if (live && live.name) {
    if (String(live.status ?? "live") !== "live") return null; // pending/rejected stay out of the index
    const b = live as unknown as BizMeta;
    // Derive rating/reviewCount from the review documents themselves.
    //
    // `businesses.rating` is a denormalised cache that only a client with the
    // matching Firestore write permission can keep in sync, and it had drifted to
    // 0 while real 5-star reviews sat in `business_reviews`. The reviews are
    // publicly readable, so the server can always compute the truth — which fixes
    // both the visible stars and the JSON-LD `aggregateRating` without waiting on
    // a rules deployment. The cached values remain the fallback.
    const derived = await fetchBusinessRatings(id);
    if (derived) {
      b.rating = derived.rating;
      b.reviewCount = derived.reviewCount;
    }
    return b;
  }
  return null;
}

/** Human-readable place + category labels used in titles and schema. */
function describe(b: BizMeta) {
  const cat = getCategory(b.categorySlug ?? "");
  const suburb = getSuburb(b.citySlug ?? "pretoria", b.suburbSlug ?? "");
  const city = getCity(b.citySlug ?? "pretoria");
  const suburbName = suburb?.name ?? ((b.suburbSlug ?? "").replace(/-/g, " ") || "Gauteng");
  const cityName = city?.name ?? "Gauteng";
  return {
    catName: cat?.name ?? "Local business",
    catPlural: cat?.plural ?? "Local services",
    suburbName,
    cityName,
    where: `${suburbName}, ${cityName}`,
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const b = await loadBusiness(id);
  if (!b) {
    return { title: `Listing not found | ${SITE_NAME}`, robots: { index: false, follow: true } };
  }
  const { catName, suburbName, cityName } = describe(b);
  const rating = Number(b.rating ?? 0);
  const reviews = Number(b.reviewCount ?? 0);

  // e.g. "Northside Plumbing & Geysers — Plumber in Pretoria North, Pretoria"
  const title = `${b.name} — ${catName} in ${suburbName}, ${cityName}`;
  const description = (
    b.description?.trim() ||
    `${b.name} in ${suburbName}, ${cityName}. Opening hours, services, prices and reviews for this ${catName.toLowerCase()}. Request a quote through ${SITE_SHORT}.`
  ).slice(0, 300);
  const image = b.coverImageUrl || b.photos?.[0];
  const url = `${SITE_URL}/business/${id}`;

  return {
    title,
    description,
    alternates: { canonical: `/business/${id}` },
    keywords: [
      `${catName} ${suburbName}`,
      `${catName} ${cityName}`,
      b.name ?? "",
      ...(b.services ?? []).slice(0, 5),
    ].filter(Boolean),
    openGraph: {
      type: "profile",
      title,
      description,
      url,
      siteName: SITE_NAME,
      locale: "en_ZA",
      // No cover photo? Fall back to the branded generated card so a shared link
      // still renders a proper 1200x630 preview instead of a bare text card.
      images: image
        ? [{ url: image, alt: `${b.name} in ${suburbName}` }]
        : [{ url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630, alt: `${b.name} on ${SITE_SHORT}` }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(image ? { images: [image] } : { images: [`${SITE_URL}/opengraph-image`] }),
    },
    other:
      rating > 0 && reviews > 0
        ? { "rating:average": String(rating), "rating:count": String(reviews) }
        : {},
  };
}

export default async function BusinessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await loadBusiness(id);
  // A real 404, not a 200 with an empty shell.
  //
  // This page previously rendered `<BusinessLive>` regardless of whether the
  // listing existed, so /business/<any-garbage> answered 200 with an empty
  // profile. That is a soft-404: search engines index a page that says nothing,
  // it competes with real listings, and it wastes crawl budget on a URL nobody
  // can ever reach. `generateMetadata` already returned
  // `robots:{index:false}` for this case, but a 200 body still gets indexed as
  // a thin page — the status code is what has to be right.
  if (!b) notFound();

  const base = SITE_URL;
  // Reviews read on the server so the list is in the first paint. `ReviewsLive`
  // still subscribes for live updates; this just removes the empty first frame
  // that made a reviewed business advertise "No reviews yet".
  const initialReviews = b ? await fetchBusinessReviews(id) : null;

  // Structured data rendered on the SERVER (not by client JS) so crawlers get it
  // even with JavaScript disabled. Only asserts facts we actually hold.
  let jsonLd: Record<string, unknown> | null = null;
  let breadcrumbLd: Record<string, unknown> | null = null;

  if (b) {
    const { catName, catPlural, suburbName, cityName } = describe(b);
    const rating = Number(b.rating ?? 0);
    const reviews = Number(b.reviewCount ?? 0);
    const image = b.coverImageUrl || b.photos?.[0];
    jsonLd = {
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      "@id": `${base}/business/${id}`,
      name: b.name,
      description: b.description,
      ...(image ? { image } : {}),
      address: {
        "@type": "PostalAddress",
        addressLocality: cityName,
        addressRegion: "Gauteng",
        addressCountry: "ZA",
      },
      areaServed: { "@type": "City", name: cityName },
      ...(b.hours ? { openingHours: b.hours } : {}),
      ...(b.services?.length
        ? { makesOffer: b.services.map((s) => ({ "@type": "Offer", name: s })) }
        : {}),
      ...(rating > 0 && reviews > 0
        ? {
            aggregateRating: {
              "@type": "AggregateRating",
              ratingValue: rating.toFixed(1),
              reviewCount: reviews,
              bestRating: 5,
            },
          }
        : {}),
      ...(b.priceNote ? { priceRange: b.priceNote } : {}),
      knowsAbout: catName,
      location: { "@type": "Place", name: `${suburbName}, ${cityName}` },
    };
    breadcrumbLd = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: base },
        {
          "@type": "ListItem",
          position: 2,
          name: cityName,
          item: `${base}/${b.citySlug ?? "pretoria"}`,
        },
        {
          "@type": "ListItem",
          position: 3,
          name: catPlural,
          item: `${base}/${b.citySlug ?? "pretoria"}/${b.suburbSlug ?? ""}/${b.categorySlug ?? ""}`,
        },
        { "@type": "ListItem", position: 4, name: b.name ?? "Business" },
      ],
    };
  }

  return (
    <>
      {jsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      )}
      {breadcrumbLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
        />
      )}
      {/* `b` and the review list were both already fetched on the server — hand them
          down so the profile renders in the SSR HTML instead of showing
          "No reviews yet" until the client listener connects. */}
      <BusinessLive
        id={id}
        initial={(b ?? undefined) as unknown as Biz}
        initialReviews={initialReviews ?? undefined}
      />
    </>
  );
}