import { KIcon, type IconKey } from "@/lib/icons";
import Link from "next/link";
import type { CSSProperties } from "react";

/**
 * Coverage strip — real, checkable facts.
 *
 * This used to read "4.8/5 from 2,300+ neighbours" beside a row of <KIcon name="mapPin" size={14} className="inline shrink-0" /> chips.
 * That was invented social proof: the review count was not derived from any
 * data and the "areas" were hardcoded. Fake numbers on a marketplace are a
 * trust and legal risk, so it now states only what is actually true.
 */
export function PartnerStrip() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <span className="inline-flex items-center gap-2 text-sm font-bold text-[#10243e]">
        <span className="w-2 h-2 rounded-full bg-[#7ac142]" aria-hidden />
        Live across all 9 provinces
      </span>
      <span className="text-sm text-[#1d3a5f]/60">
        Every pro is listed by their real suburb — so the number you call is local.
      </span>
    </div>
  );
}

/** Hippo-style testimonial cards. */
export function Testimonials() {
  const items = [
    { name: "Lerato M. · Gauteng", text: "Sent one request for a geyser at 7am, had 3 plumbers reply before 9am. Compared callouts and picked. Sorted!", tag: "Plumber" },
    { name: "Johan v.d. Berg · Western Cape", text: "The side-by-side prices saved me R1,800 on a major service. Photos of the inspection report before I paid.", tag: "Mechanic" },
    { name: "Naledi K. · KwaZulu-Natal", text: "Found a kota spot + a tutor + a salon in one place. The WhatsApp button is dangerously convenient.", tag: "Eats" },
  ];
  return (
    <div className="grid sm:grid-cols-3 gap-3 items-start">
      {items.map((t, i) => (
        <figure key={t.name} className="hippo-card p-5 flex flex-col hover-lift anim-rise" style={{ "--d": `${i * 80}ms` } as CSSProperties}>
          <span className="text-amber-500 text-sm"><KIcon name="star" size={14} className="inline shrink-0" /><KIcon name="star" size={14} className="inline shrink-0" /><KIcon name="star" size={14} className="inline shrink-0" /><KIcon name="star" size={14} className="inline shrink-0" /><KIcon name="star" size={14} className="inline shrink-0" /></span>
          <blockquote className="text-sm text-[#10243e] mt-2 leading-6 flex-1">“{t.text}”</blockquote>
          <figcaption className="mt-3 text-xs">
            <span className="font-extrabold text-[#10243e]">{t.name}</span>
            <span className="ml-2 bg-[#e8f6d8] text-[#3c6b1d] font-bold rounded-full px-2 py-0.5">{t.tag}</span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

/** Hippo-style FAQ accordion driving SEO + trust. */
export function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="space-y-2.5">
      {items.map((f) => (
        <details key={f.q} className="hippo-card !rounded-2xl p-4 group">
          <summary className="font-bold text-sm text-[#10243e] cursor-pointer list-none flex items-center justify-between gap-3">
            {f.q}
            <span className="grid place-items-center w-7 h-7 rounded-full bg-[#f2f6fa] group-open:bg-[#10243e] group-open:text-white shrink-0">+</span>
          </summary>
          <p className="text-sm text-[#1d3a5f]/80 mt-2 leading-6">{f.a}</p>
        </details>
      ))}
    </div>
  );
}

/** Big Hippo-style CTA band above footer. */
export function CtaBand() {
  return (
    <div className="hippo-hero rounded-3xl p-6 sm:p-10 text-white flex flex-col lg:flex-row lg:items-center gap-6 overflow-hidden anim-rise">
      <div className="flex-1">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#ffc72c]">Free · 60 seconds · No spam</p>
        <h2 className="text-2xl sm:text-4xl font-black tracking-tight mt-2">One request. Up to 3 local quotes. Zero phonecalls wasted.</h2>
        <p className="text-white/75 mt-2 text-sm sm:text-base max-w-xl">Tell us what you need and where — matched plumbers, mechanics, tutors, cleaners &amp; other providers may respond with their own prices for you to compare.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/request-quote" className="btn-hippo">Compare quotes — free →</Link>
          <Link href="/services" className="inline-flex items-center rounded-full border-2 border-white/40 px-6 py-3 font-bold text-sm hover:bg-white/10">Browse all services</Link>
        </div>
      </div>
      <div className="lg:w-80 shrink-0 grid grid-cols-3 lg:col-span-1 gap-2 items-start">
        {[
          ["users", "Who gets contacted", "Up to 3"],
          ["badgeCheck", "Seller profiles", "Details provided by sellers"],
          ["lock", "Your number shared", "Only for this job"],
        ].map(([ic, k, v]) => (
          <div key={k} className="rounded-2xl bg-white/10 border border-white/15 p-4 text-center lg:text-left">
            <span className="icon-3d icon-3d-sm mx-auto lg:mx-0" aria-hidden>
              <KIcon name={ic as IconKey} size={18} />
            </span>
            <p className="font-black text-lg mt-2">{v}</p>
            <p className="text-xs text-white/65">{k}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
