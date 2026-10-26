import { KIcon } from "@/lib/icons";
import Link from "next/link";
import { categories } from "@/data/categories";
import { cities } from "@/data/locations";
import { zaProvinces } from "@/data/za-locations";
import { SITE_SHORT } from "@/lib/site";

export const metadata = { title: "Page not found" };

/**
 * Branded 404 — keeps visitors inside the funnel by offering the top
 * categories and city hubs instead of a dead end (also better for SEO than
 * a bare error: no soft-404, real 404 status, clear navigation).
 *
 * The suggestions are province-wide ("Plumbers in Gauteng", …) rather than
 * pinned to Pretoria suburbs. The launch metros are real, but a 404 visitor
 * could be anywhere in the country, and offering them a suburb in a province
 * they may not live in was the wrong funnel. Each chip now deep-links into the
 * matching flow with BOTH the service and the province pre-filled.
 */
export default function NotFound() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16 space-y-6 text-center">
      <span className="icon-3d icon-3d-xl mx-auto">
        <KIcon name="search" size={40} strokeWidth={1.6} />
      </span>
      <h1 className="text-3xl sm:text-4xl font-black text-[#10243e] tracking-tight">
        Eish — we can&rsquo;t find that page
      </h1>
      <p className="text-sm text-[#1d3a5f]/70 max-w-xl mx-auto">
        The listing may have been removed, paused by its owner, or the link is wrong. Try one of these instead —
        browsing {SITE_SHORT} is free and needs no account.
      </p>

      <div className="flex flex-wrap justify-center gap-2">
        <Link href="/" className="btn-navy text-sm">Home</Link>
        <Link href="/request-quote" className="btn-hippo text-sm">Compare quotes</Link>
        <Link href="/search" className="btn-sun text-sm">Search</Link>
        <Link href="/locations" className="text-sm font-bold text-[#10243e] border-2 border-[#10243e] rounded-full px-4 py-2 hover:bg-[#10243e] hover:text-white">All areas</Link>
      </div>

      <section className="hippo-card p-5 text-left">
        <h2 className="font-black text-[#10243e]">Popular across South Africa</h2>
        <div className="flex flex-wrap gap-2 mt-3">
          {categories.slice(0, 6).map((c) => (
            <Link
              key={c.slug}
              href={`/find-pro?need=${encodeURIComponent(c.plural)}&place=${encodeURIComponent(zaProvinces[0].name)}`}
              className="rounded-full border-2 border-[#d6e1ec] px-3 py-1.5 text-sm font-bold text-[#1d3a5f] hover:border-[#7ac142]"
            >
              {c.icon} {c.plural} in {zaProvinces[0].name}
            </Link>
          ))}
        </div>
        <h2 className="font-black text-[#10243e] mt-5">Browse by province</h2>
        <div className="flex flex-wrap gap-2 mt-2">
          {zaProvinces.map((p) => (
            <Link
              key={p.slug}
              href={`/find-pro?place=${encodeURIComponent(p.name)}`}
              className="text-sm font-bold text-[#558c2b] hover:underline"
            >
              Pros in {p.name}
            </Link>
          ))}
        </div>
        <h2 className="font-black text-[#10243e] mt-5">City hubs</h2>
        <div className="flex flex-wrap gap-3 mt-2">
          {cities.filter((c) => c.tagline !== "Coming soon.").map((c) => (
            <Link key={c.slug} href={`/${c.slug}`} className="text-sm font-bold text-[#558c2b] hover:underline">
              {c.name}
            </Link>
          ))}
          <Link href="/jobs" className="text-sm font-bold text-[#558c2b] hover:underline">Jobs</Link>
          <Link href="/events" className="text-sm font-bold text-[#558c2b] hover:underline">Events</Link>
          <Link href="/places" className="text-sm font-bold text-[#558c2b] hover:underline">Places</Link>
          <Link href="/guides" className="text-sm font-bold text-[#558c2b] hover:underline">Guides</Link>
        </div>
      </section>
    </div>
  );
}