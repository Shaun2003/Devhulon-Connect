"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { analyticsPageForPath } from "@/lib/analytics-events";
import { trackAnalyticsEvent } from "@/lib/track-analytics";

export default function AnalyticsTracker() {
  const pathname = usePathname();

  useEffect(() => {
    const page = analyticsPageForPath(pathname);
    if (page) trackAnalyticsEvent("page_view", page);
  }, [pathname]);

  return null;
}
