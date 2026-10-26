import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Private / non-indexable areas: member dashboards, admin tools and
        // query-based search results (avoid index bloat from URL permutations).
        disallow: ["/dashboard", "/admin", "/request-quote", "/search", "/compare-quotes", "/messages"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
