export const ANALYTICS_EVENTS = [
  "page_view",
  "search_submitted",
  "quote_submitted",
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

export const ANALYTICS_PAGES = [
  "home",
  "directory",
  "service_detail",
  "search",
  "quote_request",
  "quote_comparison",
  "business_profile",
  "dashboard",
  "content",
] as const;

export type AnalyticsPage = (typeof ANALYTICS_PAGES)[number];

export function analyticsPageForPath(pathname: string): AnalyticsPage | null {
  if (pathname === "/") return "home";
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/")) return null;
  if (pathname === "/services") return "directory";
  if (pathname.startsWith("/services/")) return "service_detail";
  if (pathname === "/find-pro" || pathname === "/search") return "search";
  if (pathname === "/request-quote") return "quote_request";
  if (pathname.startsWith("/compare-quotes")) return "quote_comparison";
  if (pathname.startsWith("/business/")) return "business_profile";
  if (pathname.startsWith("/dashboard")) return "dashboard";
  return "content";
}

export function isAnalyticsEvent(value: unknown): value is AnalyticsEvent {
  return typeof value === "string" && ANALYTICS_EVENTS.includes(value as AnalyticsEvent);
}

export function isAnalyticsPage(value: unknown): value is AnalyticsPage {
  return typeof value === "string" && ANALYTICS_PAGES.includes(value as AnalyticsPage);
}
