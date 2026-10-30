import { KIcon } from "@/lib/icons";
import Link from "next/link";
import { notFound } from "next/navigation";
import { provinces, cities, suburbsForCity, citiesForProvince } from "@/data/locations";
import { categories } from "@/data/categories";
import { pageMeta } from "@/lib/seo";
import { PageHero } from "@/components/ui";
import { SITE_SHORT } from "@/lib/site";

export const metadata = pageMeta({
  title: "Every area we cover — cities, suburbs and towns",
  description:
    "Pick a city, then a suburb. Each area page lists the vetted pros, price guides, opening hours and reviews for that street-level area — not a nationwide list.",
  path: "/locations",
  keywords: ["areas Gauteng", "Western Cape suburbs", "KwaZulu-Natal areas", "local service areas"],
});


/**
 * Province → city → suburb → category index. Only cities with real suburb
 * coverage are listed (no empty doorway pages).
 */
export default function LocationsPage() {
  const covered = provinces
    .map((p) => ({ province: p, cities: citiesForProvince(p.slug).filter((c) => suburbsForCity(c.slug).length > 0) }))
    .filter((g) => g.cities.length > 0);
  if (covered.length === 0) notFound();

  return (
    <div className="min-h-screen">
      <PageHero
        kicker="Every area we cover"
        title={`All ${SITE_SHORT} areas in South Africa`}
        sub="Every suburb we list, grouped by city. Pick your area to see the pros and prices around you."
        icon="mapPin"
        crumbs={[{ label: "Home", href: "/" }, { label: "Locations" }]}
      />

      <main className="max-w-6xl mx-auto px-4 py-10 space-y-8">
        {covered.map((g) => (
          <section key={g.province.slug} aria-labelledby={`prov-${g.province.slug}`}>
            <h2 id={`prov-${g.province.slug}`} className="text-xl font-black text-[#10243e] tracking-tight mb-3">
              {g.province.name}
            </h2>
            <div className="space-y-5">
            {g.cities.map((c) => {
              const subs = suburbsForCity(c.slug);
              return (
                <div key={c.slug} className="hippo-card p-5">
                  <Link href={`/${c.slug}`} className="font-black text-lg text-[#10243e] hover:text-[#558c2b]">{c.name} <span className="text-xs font-bold text-[#558c2b]">View city hub </span></Link>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {subs.map((s) => (
                      <Link key={s.slug} href={`/${c.slug}/${s.slug}/plumbers`} className="rounded-full bg-[#f2f6fa] px-3 py-1.5 text-[13px] font-bold text-[#1d3a5f] hover:bg-[#10243e] hover:text-white transition">
                        <KIcon name="mapPin" size={14} className="inline shrink-0" /> {s.name}
                      </Link>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-[#558c2b]">
                    {categories.slice(0, 6).map((cat) => (
                      <Link key={cat.slug} href={`/${c.slug}/${subs[0]?.slug}/${cat.slug}`} className="hover:underline">{cat.plural}</Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <p className="text-sm text-[#1d3a5f]/60">More cities coming soon: {cities.filter((c) => suburbsForCity(c.slug).length === 0).map((c) => c.name).join(", ")}.</p>
      </main>
    </div>
  );
}