import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "Local deals & specials near you",
  description:
    "This week's vouchers, combos and discounts from vetted local businesses — filtered to your area, so you can compare and book in the same place.",
  path: "/deals",
  keywords: ["local deals", "specials Gauteng", "discounts Western Cape", "vouchers near me"],
});

import { DealsLive } from "@/components/FeedsLive";

export default function DealsPage() {
  return <DealsLive />;
}
