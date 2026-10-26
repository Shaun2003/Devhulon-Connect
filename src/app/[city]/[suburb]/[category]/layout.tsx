import type { Metadata } from "next";
import { getCity, getSuburb } from "@/data/locations";
import { getCategory } from "@/data/categories";
import { pageMeta } from "@/lib/seo";

/**
 * The suburb + category page itself is a client component (it subscribes to
 * realtime listings), and client components cannot export metadata. This layout
 * supplies it instead, so every /{city}/{suburb}/{category} URL — the core
 * local-SEO surface — gets its own title, description and canonical rather than
 * inheriting the homepage's.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ city: string; suburb: string; category: string }>;
}): Promise<Metadata> {
  const { city, suburb, category } = await params;
  const c = getCity(city);
  const s = getSuburb(city, suburb);
  const cat = getCategory(category);
  if (!c || !s || !cat) return { title: "Page not found", robots: { index: false, follow: true } };

  const plural = cat.plural.toLowerCase();
  return pageMeta({
    title: `${cat.plural} in ${s.name}, ${c.name} — compare & get free quotes`,
    description: `${cat.blurb} Compare ${plural} in ${s.name}: ratings, verified badges, opening hours, price guide (${cat.priceGuide.split("·")[0]?.trim() ?? "see page"}) and WhatsApp contacts — then request up to 3 free quotes.`,
    path: `/${city}/${suburb}/${category}`,
    keywords: [`${cat.name} ${s.name}`, `${plural} ${s.name}`, `${plural} near me`, `${cat.name} ${c.name}`],
  });
}

export default function SuburbCategoryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
