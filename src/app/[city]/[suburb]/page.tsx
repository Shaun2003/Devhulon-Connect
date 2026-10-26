import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCity, getSuburb, suburbsForCity, cities } from "@/data/locations";
import { categories } from "@/data/categories";
import SearchBar from "@/components/SearchBar";
import { SectionTitle } from "@/components/ui";
import { CtaBand } from "@/components/hippo";
import { getBgUrl } from "@/lib/utils";
import { KIcon, iconForCategory } from "@/lib/icons";
import { pageMeta, abs } from "@/lib/seo";
import { SITE_NAME } from "@/lib/site";

/**
 * /{city}/{suburb} — the suburb hub. The homepage "Top Areas" cards and the
 * city hub both point here, and it is the parent of every
 * /{city}/{suburb}/{category} page, so the local-SEO hierarchy is
 * home → city → suburb → suburb + category.
 */
export function generateStaticParams() {
  const out: { city: string; suburb: string }[] = [];
  for (const c of cities) for (const s of suburbsForCity(c.slug)) out.push({ city: c.slug, suburb: s.slug });
  return out;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ city: string; suburb: string }>;
}): Promise<Metadata> {
  const { city, suburb } = await params;
  const c = getCity(city);
  const s = getSuburb(city, suburb);
  if (!c || !s) return { robots: { index: false, follow: true } };
  const top = categories.slice(0, 5).map((x) => x.plural.toLowerCase());
  return pageMeta({
    title: `${s.name}, ${c.name} — compare ${top.slice(0, 3).join(", ")}`,
    description: `${s.blurb} Compare vetted ${top.join(", ")} in ${s.name}: real prices, opening hours, ratings and WhatsApp contacts — then request a free quote.`,
    path: `/${city}/${suburb}`,
    keywords: [s.name, `${c.name}`, ...top.slice(0, 4).map((t) => `${t} ${s.name}`)],
  });
}

function placeLd(s: { name: string; blurb: string; lat: number; lng: number }, cityName: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Place",
    name: `${s.name}, ${cityName}`,
    description: s.blurb,
    address: { "@type": "PostalAddress", addressLocality: cityName, addressRegion: "Gauteng", addressCountry: "ZA" },
    geo: { "@type": "GeoCoordinates", latitude: s.lat, longitude: s.lng },
    containedInPlace: { "@type": "City", name: cityName },
  };
}

function crumbLd(city: { name: string; slug: string }, suburbName: string) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: abs("/") },
      { "@type": "ListItem", position: 2, name: city.name, item: abs(`/${city.slug}`) },
      { "@type": "ListItem", position: 3, name: suburbName, item: abs(`/${city.slug}/${suburbName.toLowerCase().replace(/\s+/g, "-")}`) },
    ],
  };
}
export default async function SuburbPage({
  params,
}: {
  params: Promise<{ city: string; suburb: string }>;
}) {
  const { city, suburb } = await params;
  const c = getCity(city);
  const s = getSuburb(city, suburb);
  if (!c || !s) notFound();

  const neighbours = suburbsForCity(city).filter((x) => x.slug !== suburb).slice(0, 8);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(placeLd(s, c.name)) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbLd(c, suburb)) }} />

      <nav className="text-xs text-[#1d3a5f]/60 flex flex-wrap gap-1">
        <Link href="/" className="hover:underline">Home</Link> <span>/</span>
        <Link href={`/${city}`} className="hover:underline">{c.name}</Link> <span>/</span>
        <span className="font-bold text-[#10243e]">{s.name}</span>
      </nav>

      <header className="bg-[#0b1e33] relative flex min-h-[250px] flex-col justify-center overflow-hidden rounded-[2rem] px-4 py-10 text-center sm:min-h-[300px] sm:py-14">
        <div
          className="absolute top-0 left-0 w-full h-full bg-cover bg-center z-0"
          style={{ backgroundImage: `url('${getBgUrl(s.slug)}')` }}
        />
        <div className="absolute top-0 left-0 w-full h-full bg-[#10243e]/85 z-0 pointer-events-none" />
        <div className="relative z-10 mx-auto flex w-full min-w-0 max-w-4xl flex-col items-center">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#ffc72c]">{c.name} suburb guide</p>
          <h1 className="mt-3 break-words text-3xl font-black tracking-tight text-white drop-shadow-xl sm:mt-4 sm:text-5xl">{s.name} — compare local pros</h1>
          <p className="mx-auto mt-3 max-w-2xl break-words text-sm text-white/90 drop-shadow-md sm:mt-4 sm:text-lg">{s.blurb} Pick a service below to see prices, hours, ratings and WhatsApp contacts.</p>
          <div className="mt-5 w-full max-w-2xl rounded-3xl bg-white p-2 shadow-xl sm:mt-8">
            <SearchBar citySlug={city} />
          </div>
        </div>
      </header>

      <section>
        <SectionTitle kicker="Services" title={`Every service in ${s.name}`} sub="Each page lists verified pros with price guides, opening hours and a free quote option." />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 items-start">
          {categories.map((cat, i) => {
            const bgUrl = getBgUrl(cat.slug);
            return (
              <Link
                key={cat.slug}
                href={`/${city}/${suburb}/${cat.slug}`}
                className="bg-white border border-[#e7eef5] rounded-xl overflow-hidden hover:border-[#7ac142] group transition-all flex flex-col items-start justify-between shadow-sm hover:shadow-md h-full relative"
                style={{ "--d": `${Math.min(i, 8) * 40}ms` } as CSSProperties}
              >
                <div className="h-24 w-full bg-[#f4f7f6] relative overflow-hidden shrink-0">
                  <div className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105" style={{ backgroundImage: `url('${bgUrl}')` }} />
                  <div className="absolute inset-0 bg-[#0b1e33]/20 group-hover:bg-[#0b1e33]/10 transition-colors duration-300"></div>
                  <div className="absolute bottom-3 left-3 bg-white/95 backdrop-blur rounded-lg p-2 shadow-sm text-[#10243e] group-hover:text-[#7ac142] transition-colors">
                    <KIcon name={iconForCategory(cat.slug)} size={18} strokeWidth={1.5} />
                  </div>
                </div>
                <div className="p-4 w-full flex-1 flex flex-col bg-white z-10">
                  <span className="font-bold text-[#10243e] text-[15px] group-hover:text-[#558c2b] leading-tight block">{cat.plural}</span>
                  <span className="text-xs text-[#1d3a5f]/70 mt-1 block leading-snug flex-1">{cat.blurb}</span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-[#558c2b] mt-3 uppercase tracking-wider">
                    Find pros <KIcon name="arrowRight" size={14} />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section>
        <SectionTitle kicker="Nearby" title={`Other areas in ${c.name}`} sub="Many pros serve the whole metro, so it is worth comparing the areas next door too." />
        <div className="flex flex-wrap gap-2">
          {neighbours.map((n) => (
            <Link key={n.slug} href={`/${city}/${n.slug}`} className="bg-white border border-[#e7eef5] hover:border-[#7ac142] rounded-full px-4 py-2 text-sm font-bold text-[#10243e] hover:text-[#558c2b] transition shadow-sm">
              {n.name}
            </Link>
          ))}
          <Link href={`/${city}`} className="bg-[#10243e] text-white hover:bg-[#183a60] rounded-full px-4 py-2 text-sm font-bold transition shadow-sm">
            All {c.name} areas
          </Link>
        </div>
      </section>

      <CtaBand />

      <p className="text-[11px] text-[#1d3a5f]/50 text-center">
        {s.name} listings on {SITE_NAME} are compared side-by-side — no pay-to-rank.
      </p>
    </div>
  );
}
