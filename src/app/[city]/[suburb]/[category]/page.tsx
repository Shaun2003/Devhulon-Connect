"use client";
import { use } from "react";
import { useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import Gate from "@/components/Gate";
import { getCity, getSuburb, suburbsForCity } from "@/data/locations";
import { getCategory } from "@/data/categories";
import { subscribeBusinessesByCity, useReviewRatings, useRealtime } from "@/lib/realtime";
import BusinessCard from "@/components/BusinessCard";
import ComparisonTable from "@/components/ComparisonTable";
import SaveSearchButton from "@/components/SaveSearchButton";
import { AdSlot } from "@/components/ui";
import { Faq, CtaBand } from "@/components/hippo";
import { isOpenNow } from "@/lib/utils";
import { KIcon } from "@/lib/icons";
import { toBusiness, applyReviewRatings } from "@/data/businesses";
import { SITE_SHORT } from "@/lib/site";

export default function SuburbCategoryPage({ params }: { params: Promise<{ city: string; suburb: string; category: string }> }) {
  const { city, suburb, category } = use(params);
  const c = getCity(city);
  const s = getSuburb(city, suburb);
  const cat = getCategory(category);
  if (!c || !s || !cat) notFound();

  // Realtime: every business a seller adds anywhere in this city appears instantly.
  const all = useRealtime<Record<string, unknown>>((cb) => subscribeBusinessesByCity(city, cb), [], [city]);
  // Ratings are derived from the live reviews — the stored `businesses.rating`
  // cache is not reliably writable, so reading it directly is what made cards
  // here say "no reviews yet" while the business profile showed stars.
  const { ratings } = useReviewRatings();
  // Raw Firestore docs are not `Business` — normalise before they reach
  // BusinessCard/ComparisonTable, which read b.services.slice(...) and
  // b.phone.replace(...) and would throw on a missing field.
  const list = applyReviewRatings(
    (all.rows as unknown as Record<string, unknown>[])
      .map((r) => toBusiness(String(r.id ?? ""), r))
      .filter((b) => b.suburbSlug === suburb && b.categorySlug === category),
    ratings
  );

  const otherSubs = suburbsForCity(city).filter((x) => x.slug !== suburb).slice(0, 4);
  const [openOnly, setOpenOnly] = useState(false);
  // Real FAQs where the category supplies them, otherwise locally-relevant defaults.
  const faqs =
    cat.faqs.length > 0
      ? cat.faqs
      : [
          { q: `How much do ${cat.plural.toLowerCase()} cost in ${s.name}?`, a: cat.priceGuide },
          { q: `How do I find a trusted ${cat.name.toLowerCase()} near me?`, a: `Compare ratings, verified badges, opening hours and real reviews on ${SITE_SHORT}, then request a free quote or WhatsApp the pro directly.` },
          { q: `Does it cost anything to request a quote on ${SITE_SHORT}?`, a: "No — requesting a quote is free and may be shared with up to 3 eligible local businesses. A reply is not guaranteed." },
        ];
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <Gate>
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
        <nav className="text-xs text-[#1d3a5f]/60 flex flex-wrap gap-1">
          <Link href="/" className="hover:underline">Home</Link> <span>/</span>
          <Link href={`/${city}`} className="hover:underline">{c.name}</Link> <span>/</span>
          <span className="font-bold text-[#10243e]">{s.name}</span> <span>/</span>
          <span className="text-[#10243e]">{cat.plural}</span>
        </nav>

        <header className="bg-gradient-to-br from-[#0b1e33] via-[#173d59] to-[#0b1e33] px-4 py-10 text-center relative flex flex-col justify-center min-h-[280px] rounded-[2rem] overflow-hidden sm:py-16 sm:min-h-[340px]">
          <div className="relative z-10 mx-auto flex w-full min-w-0 max-w-4xl flex-col items-center">
            <p className="mt-1 text-xs font-extrabold uppercase tracking-[0.18em] text-[#ffc72c]">
              {s.name} · {c.name} · Compare {list.length} locals
            </p>
            <h1 className="mt-3 break-words text-3xl font-black tracking-tight text-white drop-shadow-xl sm:text-5xl">{cat.plural} in {s.name}</h1>
            <p className="mx-auto mt-3 max-w-3xl break-words text-sm text-white/90 drop-shadow-md sm:mt-4 sm:text-lg">
              {s.blurb} {cat.blurb} Compare prices, hours, ratings and WhatsApp contacts — then request a free quote.
            </p>
            <div className="mt-5 flex w-full flex-wrap items-center justify-center gap-3 sm:mt-8">
              <Link href={`/request-quote?category=${encodeURIComponent(cat.slug)}&need=${encodeURIComponent(cat.plural)}&suburb=${s.slug}`} className="bg-[#7ac142] text-[#0b1e33] font-bold py-3 px-6 rounded-full hover:bg-[#8fd158] transition shadow-lg text-sm">Get {cat.plural.toLowerCase()} quotes — free →</Link>
              <a href="#price-guide" className="inline-flex items-center rounded-full border-2 border-white/40 bg-white/10 px-6 py-3 font-bold text-sm hover:bg-white/20 transition text-white backdrop-blur-sm">See price guide</a>
              {all.live && <span className="chip-live ml-2">Live</span>}
            </div>
          </div>
        </header>

        <section>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 className="text-xl font-black text-[#10243e] tracking-tight">Compare {cat.plural.toLowerCase()} side-by-side</h2>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setOpenOnly((o) => !o)}
                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-extrabold transition border-2 ${openOnly ? "bg-[#7ac142] border-[#7ac142] text-[#0b1e33]" : "border-[#10243e] text-[#10243e] hover:bg-[#10243e] hover:text-white"}`}
              >
                {openOnly ? <><KIcon name="clock" size={13} className="inline shrink-0" /> Open now only</> : <><KIcon name="clock" size={13} className="inline shrink-0" /> Open now</>}
              </button>
              <SaveSearchButton category={cat.slug} suburb={suburb} city={city} />
            </div>
          </div>
          <ComparisonTable businesses={openOnly ? list.filter((b) => isOpenNow(b.hours) !== false) : list} categoryName={cat.name} suburbName={s.name} />
          {openOnly && <p className="text-xs text-[#1d3a5f]/60 mt-2">Filtering by parsed opening hours (SAST) — listings with unclear hours stay visible.</p>}
          {list.length === 0 && (
            <p className="text-sm text-[#1d3a5f]/60 mt-3">No {cat.plural.toLowerCase()} in {s.name} yet — sellers add new listings live, check back soon or <Link href="/list-business" className="underline font-bold text-[#558c2b]">list your business</Link>.</p>
          )}
        </section>

        <section>
          <h2 className="text-xl font-black text-[#10243e] tracking-tight mb-3">Full profiles <span className="text-[#1d3a5f]/50 font-bold">({list.length} listed)</span></h2>
          <div className="grid sm:grid-cols-2 gap-3 items-start">
            {list.map((b) => <BusinessCard key={b.id} b={b} categoryName={cat.name} suburbName={s.name} />)}
          </div>
        </section>

        <AdSlot />

        <section id="price-guide" className="hippo-card overflow-hidden">
          <div className="p-5 sm:p-6">
            <span className="inline-block text-[10px] font-black uppercase tracking-widest bg-[#e8f6d8] text-[#3c6b1d] rounded-full px-2 py-0.5">Local price guide</span>
            <h2 className="text-xl font-black text-[#10243e] mt-2">What {cat.plural.toLowerCase()} cost in {s.name}</h2>
            <div className="mt-4 grid sm:grid-cols-2 gap-2 text-sm items-start">
              {cat.priceGuide.split("·").map((p) => (
                <div key={p} className="rounded-xl bg-[#f2f6fa] px-4 py-3 text-[#1d3a5f]/80"><span className="font-bold text-[#10243e]">{p.trim()}</span></div>
              ))}
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-black text-[#10243e] tracking-tight mb-3">{cat.plural} in {s.name} — FAQs</h2>
          <Faq items={faqs} />
        </section>

        <section>
          <h2 className="text-xl font-black text-[#10243e] tracking-tight mb-3">Nearby areas</h2>
          <div className="flex flex-wrap gap-2">
            {otherSubs.map((o) => (
              <Link key={o.slug} href={`/${city}/${o.slug}/${category}`} className="rounded-full bg-white border border-[#d6e1ec] px-4 py-2 text-sm font-bold text-[#1d3a5f] hover:border-[#7ac142] hover:text-[#558c2b] transition">{cat.plural} in {o.name}</Link>
            ))}
          </div>
        </section>

        <CtaBand />
      </div>
    </Gate>
  );
}