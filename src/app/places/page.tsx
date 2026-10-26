import type { Metadata } from "next";
import Link from "next/link";
import { places, PLACE_KINDS, getPlaceKind, type PlaceKind } from "@/data/places";
import { getCity, getSuburb } from "@/data/locations";
import { SectionTitle, AdSlot, PageHero } from "@/components/ui";
import { CtaBand } from "@/components/hippo";
import SaveButton from "@/components/SaveButton";
import { getBgUrl } from "@/lib/utils";
import { KIcon } from "@/lib/icons";
import { CommunityPlacesLive } from "@/components/FeedsLive";

export const metadata: Metadata = {
  title: "Places to visit in South Africa | Parks, malls, museums & nature reserves",
  description:
    "Browse parks, shopping centres, libraries, museums, sports venues and nature reserves across South Africa — with opening hours, entry fees and what each place is best for.",
  alternates: { canonical: "/places" },
};

export default async function PlacesPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const { kind } = await searchParams;
  const active = (PLACE_KINDS.some((k) => k.id === kind) ? kind : "all") as PlaceKind | "all";
  const list = active === "all" ? places : places.filter((p) => p.kind === active);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Places in South Africa",
    numberOfItems: list.length,
    itemListElement: list.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: p.name,
      url: `/places/${p.slug}`,
    })),
  };

  return (
    <div className="min-h-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <PageHero
        kicker="What can I do near me?"
        title="Places to go in South Africa"
        sub="Parks, nature reserves, libraries, museums, malls and sports venues \u2014 with opening hours, entry fees and what each spot is best for."
        icon="mapPin"
        crumbs={[{ label: "Home", href: "/" }, { label: "Places" }]}
      />

      <main className="max-w-5xl mx-auto px-4 py-10 space-y-7">
        <CommunityPlacesLive />
        <section>
          <SectionTitle kicker="Filter" title="Browse by type" sub={`${list.length} place${list.length === 1 ? "" : "s"} listed`} />
          <div className="flex flex-wrap gap-2">
            <Link
              href="/places"
              className={`rounded-full px-4 py-2 text-sm font-bold border-2 transition ${
                active === "all"
                  ? "bg-[#10243e] text-white border-[#10243e]"
                  : "border-[#d6e1ec] text-[#1d3a5f] hover:border-[#7ac142]"
              }`}
            >
              <KIcon name="layers" size={14} className="inline shrink-0" /> Everything{" "}
              <span className="opacity-60">({places.length})</span>
            </Link>
          {PLACE_KINDS.map((k) => {
            const count = places.filter((p) => p.kind === k.id).length;
            if (count === 0) return null;
            const isActive = active === k.id;
            return (
              <Link
                key={k.id}
                href={`/places?kind=${k.id}`}
                className={`rounded-full px-4 py-2 text-sm font-bold border-2 transition ${
                  isActive ? "bg-[#10243e] text-white border-[#10243e]" : "border-[#d6e1ec] text-[#1d3a5f] hover:border-[#7ac142]"
                }`}
              >
                <KIcon name={k.icon} size={15} className="shrink-0" /> {k.plural}{" "}
            <span className="opacity-60">({count})</span>
              </Link>
            );
          })}
        </div>
      </section>

      <AdSlot />

      <section className="grid sm:grid-cols-2 gap-4">
        {list.map((p) => {
          const city = getCity(p.citySlug);
          const suburb = getSuburb(p.citySlug, p.suburbSlug);
          const bgUrl = getBgUrl(p.slug);
          return (
            <article key={p.slug} className="bg-white border border-[#e7eef5] rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col h-full relative group">
              <div className="h-40 w-full relative overflow-hidden shrink-0 bg-[#f4f7f6]">
                 <div 
                   className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
                   style={{ backgroundImage: `url('${bgUrl}')` }} 
                 />
                 <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent"></div>
                 <div className="absolute top-3 left-3 flex flex-wrap gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest bg-white/95 text-[#10243e] rounded-full px-2.5 py-1 shadow-sm backdrop-blur">{getPlaceKind(p.kind)?.name ?? p.kind}</span>
                    {p.free && <span className="text-[10px] font-black uppercase tracking-widest bg-[#e8f6d8] text-[#3c6b1d] rounded-full px-2.5 py-1 shadow-sm">Free</span>}
                 </div>
              </div>
              <div className="p-5 flex flex-col flex-1 bg-white relative z-10">
                <h2 className="text-xl font-black text-[#10243e] leading-tight">{p.name}</h2>
                <p className="text-xs font-bold text-[#558c2b] mt-1">
                  {suburb?.name ?? p.suburbSlug.replace(/-/g, " ")}, {city?.name ?? p.citySlug}
                </p>
                <p className="text-sm text-[#1d3a5f]/75 mt-3 flex-1 leading-relaxed">{p.blurb}</p>
                
                <div className="flex gap-4 mt-4 pt-4 border-t border-[#e7eef5]">
                  <div className="flex items-center gap-1.5 text-xs text-[#1d3a5f]/80"><span className="opacity-70 font-bold"><KIcon name="clock" size={14} className="inline shrink-0" /></span> {p.hours.split(',')[0]}</div>
                  <div className="flex items-center gap-1.5 text-xs text-[#1d3a5f]/80"><span className="opacity-70 font-bold"><KIcon name="ticket" size={14} className="inline shrink-0" /></span> {p.entryFee}</div>
                </div>

                <div className="flex flex-wrap items-center gap-2 mt-5">
                  <Link href={`/places/${p.slug}`} className="btn-navy text-xs px-4 py-2 w-fit rounded-full">See details →</Link>
                  <SaveButton type="place" id={p.slug} title={p.name} suburb={suburb?.name ?? p.suburbSlug} slug={p.slug} />
                </div>
              </div>
            </article>
          );
        })}
      </section>

      {list.length === 0 && (
        <p className="hippo-card p-6 text-sm text-[#1d3a5f]/60">
          Nothing listed under that type yet. <Link href="/places" className="font-bold text-[#558c2b] hover:underline">See all places →</Link>
        </p>
      )}

      <section className="hippo-card p-5">
        <h2 className="font-black text-[#10243e]">Looking for a service instead?</h2>
        <p className="text-sm text-[#1d3a5f]/70 mt-1">
          Places are free spaces to visit. If you need someone to do work — a plumber, electrician, salon or
          mechanic — use the business directory or compare quotes from local pros.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <Link href="/search?q=all" className="btn-hippo text-sm">Browse businesses →</Link>
          <Link href="/request-quote" className="btn-sun text-sm">Compare quotes →</Link>
          <Link href="/guides" className="text-sm font-bold text-[#558c2b] hover:underline self-center">Read local guides →</Link>
        </div>
      </section>

      <CtaBand />
      </main>
    </div>
  );
}