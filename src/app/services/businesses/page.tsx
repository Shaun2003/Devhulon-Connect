import type { Metadata } from "next";
import Link from "next/link";
import { applyReviewRatings, toBusiness, type Business } from "@/data/businesses";
import { SERVICE_GROUPS } from "@/data/taxonomy";
import { fetchPublicBusinessesPage, fetchReviewRatings } from "@/lib/firestore-rest";
import { PageHero } from "@/components/ui";
import BusinessDirectory from "@/components/services/BusinessDirectory";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "All local businesses by service | DevhulonConnect",
  description: "Browse listed local businesses grouped by their main service, including technology, home services, education and more.",
  alternates: { canonical: "/services/businesses" },
};

export default async function BusinessDirectoryPage() {
  let businesses: Business[] = [];
  let nextCursor: string | null = null;
  let hasMore = false;
  let error: string | null = null;

  try {
    const [page, ratings] = await Promise.all([
      fetchPublicBusinessesPage(),
      fetchReviewRatings(),
    ]);
    businesses = applyReviewRatings(
      page.businesses.map((row) => toBusiness(String(row.id ?? ""), row)),
      ratings,
    );
    nextCursor = page.nextCursor;
    hasMore = page.hasMore;
  } catch (cause) {
    console.error("[KASI] initial business directory query failed:", cause);
    error = cause instanceof Error ? cause.message : "Could not load businesses.";
  }

  const groups = SERVICE_GROUPS.map(({ slug, name, blurb }) => ({ slug, name, blurb }));
  return (
    <div className="min-h-screen">
      <PageHero
        kicker="Business directory"
        title="Browse local businesses by service"
        sub="Explore listed businesses grouped by their main service. Open a profile to learn more or request a quote."
        icon="building"
        crumbs={[{ label: "Home", href: "/" }, { label: "Businesses" }]}
      >
        <div className="flex flex-wrap gap-2">
          {groups.map((group) => (
            <Link
              key={group.slug}
              href={`#${group.slug}`}
              className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-extrabold text-white transition hover:bg-white/20"
            >
              {group.name}
            </Link>
          ))}
        </div>
      </PageHero>
      <main className="mx-auto max-w-6xl space-y-10 px-4 py-10">
        <BusinessDirectory
          groups={groups}
          initialBusinesses={businesses}
          initialCursor={nextCursor}
          initialHasMore={hasMore}
          initialError={error}
        />
      </main>
    </div>
  );
}
