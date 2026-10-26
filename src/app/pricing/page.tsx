import type { Metadata } from "next";
import Link from "next/link";
import PricingClient from "@/components/billing/PricingClient";
import { SITE_SHORT, SITE_URL } from "@/lib/site";

/**
 * /pricing — the plan comparison and upgrade screen (spec §21/§23).
 *
 * SCOPE, and how it differs from /advertise (this was genuinely unclear before):
 *   • /pricing  = the PRODUCT. What each plan costs, what it unlocks, and the
 *     place an EXISTING signed-in seller comes to to upgrade, downgrade or
 *     cancel. Signed in → the plan grid becomes your live plan + upgrade buttons.
 *   • /advertise = the SALES pitch. A marketing page for someone who has not
 *     signed up yet: why being on KASI is worth it, the numbers, and one CTA
 *     into /list-business. No subscription state, no upgrade controls.
 *
 * Both read prices from plans.ts, so they can never disagree with checkout.
 * Indexable; prices are rendered server-side.
 */
export const metadata: Metadata = {
  title: `Pricing & plans — upgrade or cancel your ${SITE_SHORT} subscription`,
  description:
    "Starter, Professional and Business plans from R199/month. 7-day free trial, monthly or annual billing, cancel anytime. Signed-in sellers can upgrade, downgrade or cancel here.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: `${SITE_SHORT} plans — from R199/month`,
    description: "7-day free trial. Monthly or annual billing. Cancel anytime.",
    url: "/pricing",
    type: "website",
    images: [{ url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630, alt: `${SITE_SHORT} plans and pricing` }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_SHORT} plans — from R199/month`,
    description: "7-day free trial. Monthly or annual billing. Cancel anytime.",
    images: [`${SITE_URL}/opengraph-image`],
  },
};

export default function PricingPage() {
  return (
    <>
      <div className="max-w-6xl mx-auto px-4 pt-10 text-center">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#558c2b]">
          Your subscription
        </p>
        {/* The <h1> is rendered by PricingClient, which already has one — this
            intro must stay an <h2> or the page ships two h1s. */}
        <h2 className="sr-only">Plans &amp; pricing</h2>
        <p className="text-[#1d3a5f]/70 mt-2 max-w-2xl mx-auto">
          Manage or change the plan on your existing listing. New to {SITE_SHORT}?{" "}
          <Link href="/advertise" className="font-bold text-[#558c2b] hover:underline">
            See what being listed is worth
          </Link>{" "}
          first.
        </p>
      </div>
      <PricingClient />
    </>
  );
}
