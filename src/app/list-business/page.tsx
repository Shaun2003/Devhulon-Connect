import ListBusinessSeller from "@/components/ListBusinessSeller";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "List your business — get found by local customers",
  description:
    "Build a verified profile with your prices, hours and photos, then receive enquiries from buyers comparing locals in your area. Live in minutes, cancel any time.",
  path: "/list-business",
  keywords: ["list my business South Africa", "get more local customers", "verified business profile", "local leads"],
});

/**
 * Server component on purpose. The seller flow itself is auth-gated client JS,
 * but this page is indexable and in the sitemap. The interactive signup stays
 * hydrated while the surrounding business-intro content is server rendered.
 */
export default function ListBusinessPage() {
  return (
    <div className="min-h-screen">
      <main id="start">
        <ListBusinessSeller />
      </main>
    </div>
  );
}
