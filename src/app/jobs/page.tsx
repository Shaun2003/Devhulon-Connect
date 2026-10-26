import { pageMeta } from "@/lib/seo";

import { JobsLive } from "@/components/FeedsLive";

export const metadata = pageMeta({
  title: "Local jobs — vacancies near you",
  description:
    "Fresh vacancies in all 9 provinces: trades, drivers, retail, admin and hospitality. Filter by area, then apply or WhatsApp the employer directly.",
  path: "/jobs",
  keywords: ["jobs South Africa", "jobs Gauteng", "local vacancies", "trades jobs Limpopo"],
});


export default function JobsPage() {
  return <JobsLive />;
}

