import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCity, suburbsForCity, cities } from "@/data/locations";
import { categories } from "@/data/categories";
import SearchBar from "@/components/SearchBar";
import { SectionTitle } from "@/components/ui";
import { CtaBand } from "@/components/hippo";
import { getBgUrl } from "@/lib/utils";
import { KIcon, iconForCategory } from "@/lib/icons";
import { pageMeta } from "@/lib/seo";

export function generateStaticParams() {
  return cities
    .filter((c) => suburbsForCity(c.slug).length > 0)
    .map((c) => ({ city: c.slug }));
}

/** Unique title/description/canonical per city hub — never the site default. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ city: string }>;
}): Promise<Metadata> {
  const { city } = await params;
  const c = getCity(city);
  if (!c) return { robots: { index: false, follow: true } };
  const subs = suburbsForCity(city);
  const top = categories.slice(0, 5).map((x) => x.plural.toLowerCase());
  return pageMeta({
    title: `${c.name} — compare ${top.slice(0, 3).join(", ")} across ${subs.length} areas`,
    description: `${c.tagline} Compare ${top.join(", ")} in ${subs.length} ${c.name} areas — ratings, real prices, opening hours and WhatsApp contacts, plus up to 3 free quotes.`,
    path: `/${city}`,
    keywords: [c.name, ...top.slice(0, 4).map((t) => `${t} ${c.name}`), `${c.name} areas`],
  });
}


export default async function CityPage({ params }: { params: Promise<{ city: string }> }) {
  const { city } = await params;
  const c = getCity(city);
  if (!c) notFound();
  const subs = suburbsForCity(city);
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-12">
      <header className="bg-[#0b1e33] relative flex min-h-[270px] flex-col justify-center overflow-hidden rounded-[2rem] px-4 py-10 text-center sm:min-h-[330px] sm:py-16">
        <div 
          className="absolute top-0 left-0 w-full h-full bg-cover bg-center z-0"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1449844908441-8829872d2607?ixlib=rb-4.0.3&auto=format&fit=crop&w=2000&q=80')" }} 
        />
        <div className="absolute top-0 left-0 w-full h-full bg-[#10243e]/85 z-0 pointer-events-none" />
        
        <div className="relative z-10 mx-auto flex w-full min-w-0 max-w-4xl flex-col items-center">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#ffc72c]">City guide</p>
          <h1 className="mt-3 break-words text-3xl font-black tracking-tight text-white drop-shadow-xl sm:mt-4 sm:text-5xl">{c.name} — compare local pros</h1>
          <p className="mx-auto mt-3 max-w-2xl break-words text-sm text-white/90 drop-shadow-md sm:mt-4 sm:text-lg">{c.tagline} Pick your suburb, then a service. Every page has prices, hours and WhatsApp contacts.</p>
          <div className="mt-5 w-full max-w-2xl rounded-3xl bg-white p-2 shadow-xl sm:mt-8">
            <SearchBar citySlug={city} />
          </div>
        </div>
      </header>

      <section>
        <SectionTitle kicker="Areas" title={`Choose your area in ${c.name}`} />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 items-start">
          {subs.map((s) => {
              const bgUrl = getBgUrl(s.slug);
              return (
              <Link key={s.slug} href={`/${city}/${s.slug}`} className="bg-white border border-[#e7eef5] rounded-xl overflow-hidden hover:border-[#7ac142] group transition-all flex flex-col items-start justify-between shadow-sm hover:shadow-md h-full">
                <div className="h-28 w-full bg-[#f4f7f6] relative overflow-hidden">
                   <div 
                     className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
                     style={{ backgroundImage: `url('${bgUrl}')` }} 
                   />
                   <div className="absolute inset-0 bg-[#0b1e33]/10 group-hover:bg-transparent transition-colors duration-300"></div>
                </div>
                <div className="p-4 w-full flex items-center justify-between bg-white z-10 flex-1">
                  <div>
                    <p className="font-bold text-[#10243e] text-[15px]">{s.name}</p>
                    <p className="text-[11px] text-[#1d3a5f]/65 mt-0.5 line-clamp-1">{s.blurb}</p>
                  </div>
                  <span className="text-[#e7eef5] group-hover:text-[#558c2b] transition-colors flex items-center shrink-0 ml-2">
                    <KIcon name="arrowRight" size={16} strokeWidth={2.2} />
                  </span>
                </div>
              </Link>
              )
          })}
        </div>
      </section>

      <section>
        <SectionTitle kicker="Categories" title="Browse by service" sub="Real prices, hours, reviews and WhatsApp — no scraped listings." />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 items-start">
          {categories.map((cat, i) => {
            const bgUrl = getBgUrl(cat.slug);

            return (
              <Link key={cat.slug} href={`/${city}/${subs[0]?.slug ?? ""}/${cat.slug}`} className="bg-white border border-[#e7eef5] rounded-xl overflow-hidden hover:border-[#7ac142] group transition-all flex flex-col items-start justify-between shadow-sm hover:shadow-md h-full relative" style={{ "--d": `${Math.min(i, 8) * 40}ms` } as CSSProperties}>
                <div className="h-28 w-full bg-[#f4f7f6] relative overflow-hidden shrink-0">
                   <div 
                     className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
                     style={{ backgroundImage: `url('${bgUrl}')` }} 
                   />
                   <div className="absolute inset-0 bg-[#0b1e33]/20 group-hover:bg-[#0b1e33]/10 transition-colors duration-300"></div>
                   <div className="absolute bottom-3 left-3 bg-white/95 backdrop-blur rounded-lg p-2 shadow-sm text-[#10243e] group-hover:text-[#7ac142] transition-colors">
                      <KIcon name={iconForCategory(cat.slug)} size={18} strokeWidth={1.5} />
                   </div>
                </div>
                <div className="p-4 w-full flex-1 flex flex-col bg-white z-10">
                  <span className="font-bold text-[#10243e] text-[15px] group-hover:text-[#558c2b] leading-tight block">
                    {cat.plural}
                  </span>
                  <span className="text-xs text-[#1d3a5f]/70 mt-1 block leading-snug flex-1">{cat.blurb}</span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-[#558c2b] mt-3 uppercase tracking-wider">
                    Find pros <KIcon name="arrowRight" size={14} />
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      </section>

      <CtaBand />
    </div>
  );
}
