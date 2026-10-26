import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

/** The quote form is a client component; metadata lives here. */
export const metadata: Metadata = pageMeta({
  title: "Request a free quote — up to 3 matched pros, no obligation",
  description:
    "Tell us what service you need and we route it to eligible businesses. Compare up to 3 free quotes side by side — prices, timelines and reviews.",
  path: "/request-quote",
  keywords: ["free quote South Africa", "get quotes local business", "compare quotes home services"],
});

export default function RequestQuoteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
