import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "Original local guides — suburbs, prices and how-to",
  description:
    "Guides written for one suburb at a time: what it costs, who to call, where to eat and how to solve it yourself. Written by people who actually live there.",
  path: "/guides",
  keywords: ["South Africa suburb guides", "Gauteng local guides", "local cost guides", "South Africa how-to"],
});

import { GuidesLive } from "@/components/FeedsLive";

export default function GuidesPage() {
  return <GuidesLive />;
}
