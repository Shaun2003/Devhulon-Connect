import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { categories } from "@/data/categories";
import { cities, suburbs } from "@/data/locations";
import { SITE_SHORT } from "@/lib/site";

/**
 * /search is a dispatcher, not a page: the answer to "plumbers in Sandton" is a
 * real indexable URL, so we resolve the free-text query against the known
 * taxonomy and redirect to it. Every target below is a route that exists — a
 * place that cannot be resolved falls back to the national /services index
 * instead of inventing a URL that would 404.
 */
export const metadata: Metadata = {
  title: "Search",
  description: `Search ${SITE_SHORT} for local businesses by service and area.`,
  alternates: { canonical: "/search" },
  robots: { index: false, follow: true },
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();

function findCategory(q: string) {
  if (!q) return undefined;
  return (
    categories.find((c) => c.slug === q) ??
    categories.find(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.plural.toLowerCase().includes(q) ||
        q.includes(c.slug.replace(/-/g, " ")) ||
        c.slug.replace(/-/g, " ").includes(q),
    ) ??
    categories.find((c) =>
      q.split(" ").some((w) => w.length > 2 && (c.name.toLowerCase().includes(w) || c.slug.includes(w))),
    )
  );
}

/** Free-text location → the suburb/city URL segment the visitor actually meant. */
function findPlace(q: string): { city: string; suburb?: string } | undefined {
  const n = norm(q);
  if (!n) return undefined;
  const slug = n.replace(/\s+/g, "-");
  const suburb =
    suburbs.find((s) => s.slug === slug) ??
    suburbs.find((s) => norm(s.name) === n) ??
    suburbs.find((s) => norm(s.name).includes(n) || n.includes(norm(s.name)));
  if (suburb) return { city: suburb.citySlug, suburb: suburb.slug };
  const city =
    cities.find((c) => c.slug === slug) ??
    cities.find((c) => norm(c.name) === n) ??
    cities.find((c) => norm(c.name).includes(n) || n.includes(norm(c.name)));
  if (city) return { city: city.slug };
  return undefined;
}

/**
 * Pull a place out of the free-text query itself ("plumbers in sandton").
 * Tries the whole string first, then each word and adjacent word pair, so a
 * multi-word service name doesn't stop the location from being found.
 */
function findPlaceInText(q: string) {
  if (!q) return undefined;
  const words = q.split(" ").filter(Boolean);
  const candidates = [q, ...words];
  for (let i = 0; i < words.length - 1; i++) candidates.push(`${words[i]} ${words[i + 1]}`);
  for (const c of candidates) {
    // Skip tokens that are clearly the service, not the place.
    if (words.length > 1 && (c === "in" || c === "near" || c === "around")) continue;
    const hit = findPlace(c);
    if (hit) return hit;
  }
  return undefined;
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; suburb?: string; city?: string }>;
}) {
  const sp = await searchParams;
  const q = norm(sp.q ?? "");
  const cat = findCategory(q);
  // Explicit ?suburb=/?city= wins; otherwise mine the free-text query so
  // "plumbers in sandton" resolves to the suburb, not just the service.
  const place = findPlace(sp.suburb ?? "") ?? (sp.city ? findPlace(sp.city) : undefined) ?? findPlaceInText(q);

  // Nothing recognisable typed → send the visitor to the browsable index.
  if (!cat && !place) redirect("/services");

  const catSlug = (cat ?? categories[0]).slug;
  if (place?.suburb) redirect(`/${place.city}/${place.suburb}/${catSlug}`);
  // City-level hit: the city hub is the page that lists every service in it.
  if (place?.city) redirect(`/${place.city}`);
  redirect(`/services/${catSlug}`);
}
