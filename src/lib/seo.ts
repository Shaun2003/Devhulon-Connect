import type { Metadata } from "next";
import { SITE_URL, SITE_NAME } from "./site";
import { fetchPublicDoc, canReadFirestoreRest } from "./firestore-rest";
import type { Business } from "@/data/businesses";

/**
 * Shared SEO helpers (Tier 1).
 *
 * Every indexable page gets: unique title, unique description, canonical URL,
 * Open Graph + Twitter card. Keeping this in one place means a new page can't
 * accidentally ship duplicate/no metadata — which is the most common reason
 * local directories never rank.
 */

/** Absolute canonical + OG URL for a path ("" → home). */
export function abs(path = ""): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_URL.replace(/\/$/, "")}${clean === "/" ? "" : clean}`;
}

type PageMetaInput = {
  title: string;
  description: string;
  path: string;
  /** OG image (absolute or site-relative). Falls back to the site icon. */
  image?: string | null;
  /** Set true for thin/duplicate pages that must not be indexed. */
  noIndex?: boolean;
  keywords?: string[];
  type?: "website" | "article";
  publishedTime?: string;
};

/** Build a complete, consistent Metadata object for a page. */
export function pageMeta({
  title,
  description,
  path,
  image,
  noIndex,
  keywords,
  type = "website",
  publishedTime,
}: PageMetaInput): Metadata {
  const url = abs(path);
  // Pages that set `openGraph` explicitly suppress the opengraph-image.tsx file
  // convention, so we point at that generated route ourselves. A page with a real
  // photo (a business profile) still wins by passing `image`.
  const ogImage = image ? (image.startsWith("http") ? image : abs(image)) : abs("/opengraph-image");
  return {
    title,
    description,
    keywords,
    alternates: { canonical: url },
    robots: noIndex ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: {
      title: `${title} · ${SITE_NAME}`,
      description,
      url,
      siteName: SITE_NAME,
      locale: "en_ZA",
      type,
      /**
     * Share image. Defaults to the generated app/opengraph-image.tsx card; a
     * page with its own photo (business profile, place) passes `image` instead.
     */
    images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
      ...(publishedTime ? { publishedTime } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} · ${SITE_NAME}`,
      description,
      images: [ogImage],
    },
  };
}

/** JSON-LD BreadcrumbList for a page trail. */
export function breadcrumbLd(trail: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: t.name,
      item: abs(t.path),
    })),
  };
}

/** WebSite + SearchAction — lets Google show a sitelinks searchbox. */
export function websiteLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: abs("/"),
    potentialAction: {
      "@type": "SearchAction",
      target: `${abs("/search")}?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

/**
 * Resolve a business for metadata: bundled seed data first (instant, no
 * network), then the public Firestore REST reader for seller-created listings.
 * Returns null when the listing doesn't exist.
 */
export async function resolveBusiness(id: string): Promise<Partial<Business> & { id: string } | null> {
  // LIVE ONLY. There is no bundled seed to fall back to, so a listing that is
  // not in Firestore does not exist.
  if (canReadFirestoreRest) {
    const live = await fetchPublicDoc("businesses", id);
    if (live && String(live.status ?? "live") === "live") {
      return { id, ...(live as Partial<Business>) };
    }
  }
  return null;
}
