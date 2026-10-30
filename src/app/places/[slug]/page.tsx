import { KIcon } from "@/lib/icons";
import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { places, getPlace, getPlaceKind, type PlaceKind } from "@/data/places";
import { getCity, getSuburb, suburbsForCity } from "@/data/locations";
import { categories } from "@/data/categories";
import { articles } from "@/data/content";
import { SITE_SHORT, SITE_URL } from "@/lib/site";
import { AdSlot, PageHero } from "@/components/ui";
import { CtaBand } from "@/components/hippo";
import SaveButton from "@/components/SaveButton";

export function generateStaticParams() {
  return places.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = getPlace(slug);
  if (!p) return { title: `Place not found | ${SITE_SHORT}` };
  const suburb = getSuburb(p.citySlug, p.suburbSlug);
  const city = getCity(p.citySlug);
  const title = `${p.name} — ${suburb?.name ?? p.suburbSlug}, ${city?.name ?? p.citySlug} | Hours, entry fee & tips | ${SITE_SHORT}`;
  return {
    title,
    description: p.blurb,
    alternates: { canonical: `/places/${p.slug}` },
    openGraph: { title, description: p.blurb, type: "article", url: `${SITE_URL}/places/${p.slug}` },
  };
}

const KIND_SCHEMA: Record<PlaceKind, string> = {
  park: "Park",
  "shopping-centre": "ShoppingCenter",
  library: "Library",
  museum: "Museum",
  attraction: "TouristAttraction",
  sports: "SportsActivityLocation",
  "nature-reserve": "TouristAttraction",
  "public-facility": "GovernmentBuilding",
};

const KIND_PLURAL: Record<PlaceKind, string> = {
  park: "Parks",
  "shopping-centre": "Shopping centres",
  library: "Libraries",
  museum: "Museums",
  attraction: "Attractions",
  sports: "Sports venues",
  "nature-reserve": "Nature reserves",
  "public-facility": "Public facilities",
};

export default async function PlacePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = getPlace(slug);
  if (!p) notFound();

  const suburb = getSuburb(p.citySlug, p.suburbSlug);
  const city = getCity(p.citySlug);
  const nearby = places.filter((x) => x.slug !== p.slug && x.citySlug === p.citySlug).slice(0, 4);
  const guides = articles.slice(0, 3);
  const serviceLinks = categories.slice(0, 6);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": KIND_SCHEMA[p.kind],
    name: p.name,
    description: p.blurb,
    address: { "@type": "PostalAddress", streetAddress: p.address, addressLocality: city?.name ?? p.citySlug, addressRegion: "Gauteng", addressCountry: "ZA" },
    geo: { "@type": "GeoCoordinates", latitude: p.lat, longitude: p.lng },
    isAccessibleForFree: p.free,
    ...(p.free ? {} : { publicAccess: true }),
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Places", item: `${SITE_URL}/places` },
      { "@type": "ListItem", position: 3, name: p.name },
    ],
  };

  return (
    <div className="min-h-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />

      <PageHero
        kicker={KIND_PLURAL[p.kind].replace(/s$/, "") + (p.free ? " · Free entry" : "")}
        title={p.name}
        sub={p.blurb}
        icon={getPlaceKind(p.kind)?.icon ?? "mapPin"}
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Places", href: "/places" },
          { label: p.name },
        ]}
      />

      <main className="max-w-4xl mx-auto px-4 py-10 space-y-8">
        <p className="text-sm font-bold text-[#558c2b] -mt-4">
          <KIcon name="mapPin" size={14} className="inline shrink-0" /> {suburb?.name ?? p.suburbSlug.replace(/-/g, " ")}, {city?.name ?? p.citySlug}
        </p>
        <div className="flex flex-wrap gap-2 mt-4">
          {p.bestFor.map((b) => (
            <span key={b} className="text-xs font-bold rounded-full bg-[#fff4d6] text-[#a36508] px-3 py-1">{b}</span>
          ))}
        </div>
        <SaveButton
          className="mt-4"
          type="place"
          id={p.slug}
          title={p.name}
          suburb={suburb?.name ?? p.suburbSlug}
          slug={p.slug}
        />
        <AdSlot />

      <div className="grid sm:grid-cols-2 gap-4 items-start">
        <div className="hippo-card p-5 text-sm space-y-2 text-[#1d3a5f]/80">
          <h2 className="font-black text-[#10243e] text-base">Visit information</h2>
          <p><KIcon name="mapPin" size={14} className="inline shrink-0" /> {p.address}</p>
          <p><KIcon name="clock" size={14} className="inline shrink-0" /> {p.hours}</p>
          <p><KIcon name="ticket" size={14} className="inline shrink-0" /> {p.entryFee}</p>
        </div>
        <div className="hippo-card p-5">
          <h2 className="font-black text-[#10243e] text-base">Where it is</h2>
          <p className="text-sm text-[#1d3a5f]/70 mt-1">
            {suburb?.blurb ?? `Located in ${suburb?.name ?? p.suburbSlug}.`}
          </p>
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`}
            target="_blank"
            rel="noreferrer"
            className="btn-navy text-sm mt-3 inline-flex"
          >
            Open in Google Maps 
          </a>
        </div>
      </div>

      <section className="hippo-card p-5">
        <h2 className="font-black text-[#10243e]">About {p.name}</h2>
        <div className="text-sm leading-7 text-[#1d3a5f]/85 mt-2 space-y-3">
          {p.about.map((para) => (
            <p key={para.slice(0, 30)}>{para}</p>
          ))}
        </div>
      </section>

      <section className="hippo-card p-5">
        <h2 className="font-black text-[#10243e]">Need a service while you&rsquo;re here?</h2>
        <p className="text-sm text-[#1d3a5f]/70 mt-1">Local pros who work in {suburb?.name ?? p.suburbSlug.replace(/-/g, " ")}:</p>
        <div className="flex flex-wrap gap-2 mt-3">
          {serviceLinks.map((c) => (
            <Link
              key={c.slug}
              href={`/${p.citySlug}/${p.suburbSlug}/${c.slug}`}
              className="rounded-full border-2 border-[#d6e1ec] px-3 py-1.5 text-sm font-bold text-[#1d3a5f] hover:border-[#7ac142]"
            >
              <KIcon name={c.icon} size={15} className="inline shrink-0" /> {c.plural} in {suburb?.name ?? p.suburbSlug.replace(/-/g, " ")}
            </Link>
          ))}
        </div>
      </section>

      <AdSlot />

      {nearby.length > 0 && (
        <section>
          <h2 className="font-black text-[#10243e] mb-3">More places in {city?.name ?? p.citySlug}</h2>
          <div className="grid sm:grid-cols-2 gap-3 items-start">
            {nearby.map((n, i) => (
              <Link key={n.slug} href={`/places/${n.slug}`} className="hippo-card p-4 hover-lift anim-rise" style={{ "--d": `${i * 60}ms` } as CSSProperties}>
                <p className="font-black text-[#10243e] text-sm">{n.name}</p>
                <p className="text-xs text-[#1d3a5f]/60 mt-1">{n.blurb}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="hippo-card p-5">
        <h2 className="font-black text-[#10243e]">Other areas in {city?.name ?? p.citySlug}</h2>
        <div className="flex flex-wrap gap-3 mt-3">
          {suburbsForCity(p.citySlug).map((s) => (
            <Link key={s.slug} href={`/${s.citySlug}/${s.slug}/plumbers`} className="text-sm font-bold text-[#558c2b] hover:underline">
              {s.name}
            </Link>
          ))}
        </div>
      </section>

      {guides.length > 0 && (
        <section className="hippo-card p-5">
          <h2 className="font-black text-[#10243e]">Related local guides</h2>
          <ul className="mt-3 space-y-2">
            {guides.map((g) => (
              <li key={g.slug}>
                <Link href={`/guides/${g.slug}`} className="text-sm font-semibold text-[#558c2b] hover:underline">{g.title}</Link>
                <span className="text-xs text-[#1d3a5f]/50"> · {g.suburb}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <details className="hippo-card p-4">
        <summary className="text-xs font-bold text-[#1d3a5f]/60 cursor-pointer"> Report wrong information for this place</summary>
        <p className="text-xs text-[#1d3a5f]/60 mt-2">
          Hours or entry fees changed? <Link href="/contact" className="font-bold text-[#558c2b] hover:underline">Tell us</Link> and we&rsquo;ll correct it.
        </p>
      </details>

      <CtaBand />
      </main>
    </div>
  );
}