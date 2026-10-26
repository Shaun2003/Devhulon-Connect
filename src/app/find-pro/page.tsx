import Link from "next/link";
import FindProClient from "./FindProClient";
import { loadSellerPool } from "@/lib/server/seller-pool";
import { SERVICE_GROUPS } from "@/data/taxonomy";
import { PageHero, IconPlate } from "@/components/ui";
import { pageMeta } from "@/lib/seo";
import { SITE_SHORT } from "@/lib/site";
import { adminDb } from "@/lib/server/admin";
import { loadSellerCandidates } from "@/lib/server/seller-search";
import type { Business } from "@/data/businesses";

/**
 * /find-pro — the Bark-style entry point.
 *
 * Previously "Find pros" in the nav pointed at /search, which was a redirector:
 * it threw the visitor into a category index and they then had to browse a
 * directory themselves. This page asks "what + where" and returns matched sellers
 * with their numbers straight away, and posts the need to those sellers so they
 * are notified without any admin step.
 */
export const metadata = pageMeta({
  title: "Find a pro near you — matched to your job in seconds",
  description:
    "Tell us what you need and where. We instantly match you with local plumbers, electricians, mechanics, tutors and more — with ratings, prices and a one-tap Call or WhatsApp button. Free, no waiting.",
  path: "/find-pro",
  keywords: [
    "find a plumber near me",
    "book a local pro",
    "get a quote South Africa",
    "call a tradesperson",
    "find local services",
  ],
});

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: `${SITE_SHORT} — Find a pro`,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Any",
  description:
    "Match a job to vetted local South African pros and contact them directly.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "ZAR" },
  featureList: [
    "Instant matching by service and suburb",
    "Direct call and WhatsApp",
    "Real prices and ratings",
  ],
};

export default async function FindProPage({
  searchParams,
}: {
  searchParams: Promise<{ need?: string; place?: string; city?: string }>;
}) {
  // Pre-fill from the URL so the hero search, the service chips and shared links
  // all land on a page that already shows matched pros.
  const sp = await searchParams;
  const initialNeed = (sp.need ?? "").trim();
  const initialPlace = (sp.place ?? sp.city ?? "").trim();
  // Fetch only the indexed category/location candidates for a populated search.
  // The full catalogue is retained as a compatibility fallback when Admin SDK
  // credentials are not configured.
  let pool: Business[] = [];
  if (initialNeed.length > 1) {
    pool = adminDb()
      ? await loadSellerCandidates({ need: initialNeed, place: initialPlace })
      : await loadSellerPool();
  }

  return (
    <div className="min-h-screen">
      <PageHero
        kicker="Post a job · get matched"
        title="Find a pro near you"
        sub="Tell us what you need and where. We find relevant local businesses and show you their details and contact options so you can choose who to approach."
        icon="search"
        crumbs={[{ label: "Home", href: "/" }, { label: "Find a pro" }]}
      />
      <main className="max-w-6xl mx-auto px-4 py-10 space-y-8">

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <FindProClient initialNeed={initialNeed} initialPlace={initialPlace} initialPool={pool} />

      {/* Cold-start: point people at a service group when nothing is typed yet. */}
      <section>
        <h2 className="text-lg font-black text-[#10243e] mb-3">Or browse by what you need</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {SERVICE_GROUPS.map((g) => (
            <Link
              key={g.slug}
              href={`/services?group=${g.slug}`}
              className="hippo-card p-4 flex items-center gap-3 hover-lift group"
            >
              <IconPlate icon={g.icon} />
              <span className="font-bold text-[#10243e] text-sm leading-tight">{g.name}</span>
            </Link>
          ))}
        </div>
      </section>
      </main>
    </div>
  );
}
