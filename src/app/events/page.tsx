import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "What's on — local events across South Africa",
  description:
    "Live gigs, markets, community days, school fundays and family weekends in all 9 provinces. Add your own events and give buyers a reason to get out this week.",
  path: "/events",
  keywords: ["events South Africa", "things to do Gauteng", "weekend markets Cape Town", "local events KZN"],
});

import { EventsLive } from "@/components/FeedsLive";

export default function EventsPage() {
  return <EventsLive />;
}
