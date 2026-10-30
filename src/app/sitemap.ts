import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { suburbs, cities } from "@/data/locations";
import { categories } from "@/data/categories";
import { articles, calculators } from "@/data/content";
import { places } from "@/data/places";
import { fetchPublicCollection, canReadFirestoreRest } from "@/lib/firestore-rest";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = SITE_URL;
  const urls: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },

    // Core sections
    { url: `${base}/services`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/pricing`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/guides`, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/jobs`, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/events`, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/deals`, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/places`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/locations`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/emergency`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/tools`, changeFrequency: "weekly", priority: 0.6 },

    // Conversion + business pages
    { url: `${base}/list-business`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/request-quote`, changeFrequency: "monthly", priority: 0.7 },    // Trust / legal (required for AdSense approval)
    { url: `${base}/about`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/contact`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/privacy-policy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/cookie-policy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/seller-terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/buyer-terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/refund-policy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/community-guidelines`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/acceptable-use`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/complaints`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/subscription-terms`, changeFrequency: "yearly", priority: 0.3 },
  ];

  // Tools (calculators)
  for (const t of calculators)
    urls.push({ url: `${base}/tools/${t.slug}`, changeFrequency: "monthly", priority: 0.5 });

  // Service search pages — one per category (§7, §32)
  for (const cat of categories)
    urls.push({ url: `${base}/services/${cat.slug}`, changeFrequency: "daily", priority: 0.8 });

  // City hubs — only cities that actually have suburbs/coverage
  for (const c of cities) {
    if (!suburbs.some((s) => s.citySlug === c.slug)) continue;
    urls.push({ url: `${base}/${c.slug}`, changeFrequency: "daily", priority: 0.9 });
  }

  // Suburb hub pages — /{city}/{suburb} (indexable since the hub page shipped)
  for (const s of suburbs)
    urls.push({ url: `${base}/${s.citySlug}/${s.slug}`, changeFrequency: "weekly", priority: 0.8 });


  // Suburb × category pages (the core local SEO surface)
  for (const s of suburbs)
    for (const cat of categories.slice(0, 6))
      urls.push({ url: `${base}/${s.citySlug}/${s.slug}/${cat.slug}`, changeFrequency: "weekly", priority: 0.8 });

  // Local guides
  for (const a of articles)
    urls.push({ url: `${base}/guides/${a.slug}`, changeFrequency: "weekly", priority: 0.7 });

  // Places (parks, malls, museums, nature reserves)
  for (const p of places)
    urls.push({ url: `${base}/places/${p.slug}`, changeFrequency: "monthly", priority: 0.6 });

  // ── Business profiles ────────────────────────────────────────────────────
  // Every LIVE seller-created listing from Firestore. Pending/rejected listings
  // are excluded so Google never indexes a half-empty page. There is no bundled
  // seed any more, so this is the only source of profile URLs.
  const listedIds = new Set<string>();
  if (canReadFirestoreRest) {
    const live = await fetchPublicCollection("businesses", 300);
    for (const row of live) {
      const id = String(row.id ?? "");
      const status = String(row.status ?? "live");
      if (!id || status !== "live" || listedIds.has(id)) continue;
      listedIds.add(id);
      urls.push({
        url: `${base}/business/${id}`,
        changeFrequency: "weekly",
        priority: 0.7,
        ...(row.updatedAt ? { lastModified: new Date(String(row.updatedAt)) } : {}),
      });
    }
  }

  return urls;
}
