import type { Metadata } from "next";
import CompareQuotesClient from "@/components/quotes/CompareQuotesClient";
import { pageMeta } from "@/lib/seo";

/**
 * /compare-quotes — the buyer's decision screen (§17).
 * Private by nature (it shows one buyer's own requests and quotes), so it is
 * deliberately excluded from search: indexable SEO lives on /services/[slug],
 * /guides and the profile pages instead of thin private pages.
 */
export const metadata: Metadata = pageMeta({
  title: "Compare quotes — see every reply side by side",
  description:
    "Compare the quotes local professionals sent you side-by-side: price, warranty, availability, reviews and response time.",
  path: "/compare-quotes",
  noIndex: true,
});

export default async function CompareQuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ lead?: string }>;
}) {
  const sp = await searchParams;
  const lead = (sp.lead ?? "").trim();
  return <CompareQuotesClient initialLeadId={lead || undefined} />;
}
