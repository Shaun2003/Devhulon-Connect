import type { Metadata } from "next";
import PricingClient from "@/components/billing/PricingClient";
import { SITE_SHORT, SITE_URL } from "@/lib/site";

/**
 * /pricing — the plan comparison and upgrade screen (spec §21/§23).
 *
 * The single product page for plan details, onboarding, and seller upgrades.
 * Prices are rendered server-side from the same plan configuration as checkout.
 */
export const metadata: Metadata = {
  title: `Pricing & plans — Starter and Premium on ${SITE_SHORT}`,
  description:
    "Start with Starter for free or choose Premium for R300/month, 300 monthly credits and unlimited eligible lead opportunities.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: `${SITE_SHORT} plans — Starter and Premium`,
    description: "Starter is free. Premium is R300/month. Compare plans and lead credits.",
    url: "/pricing",
    type: "website",
    images: [{ url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630, alt: `${SITE_SHORT} plans and pricing` }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_SHORT} plans — Starter and Premium`,
    description: "Starter is free. Premium is R300/month. Compare plans and lead credits.",
    images: [`${SITE_URL}/opengraph-image`],
  },
};

export default function PricingPage() {
  return <PricingClient />;
}
