"use client";

import type { AnalyticsEvent, AnalyticsPage } from "@/lib/analytics-events";

export function trackAnalyticsEvent(event: AnalyticsEvent, page: AnalyticsPage): void {
  void fetch("/api/analytics/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, page }),
    credentials: "omit",
    keepalive: true,
  }).then((response) => {
    if (!response.ok && response.status !== 429) {
      console.warn(`[KASI] aggregate analytics event rejected (${response.status}).`);
    }
  }).catch((error: unknown) => {
    console.warn("[KASI] aggregate analytics request failed:", error);
  });
}
