import assert from "node:assert/strict";
import {
  analyticsPageForPath,
  isAnalyticsEvent,
  isAnalyticsPage,
} from "../src/lib/analytics-events.ts";

assert.equal(analyticsPageForPath("/"), "home");
assert.equal(analyticsPageForPath("/services/plumbers"), "service_detail");
assert.equal(analyticsPageForPath("/find-pro"), "search");
assert.equal(analyticsPageForPath("/request-quote"), "quote_request");
assert.equal(analyticsPageForPath("/admin/analytics"), null);
assert.equal(analyticsPageForPath("/api/analytics/events"), null);
assert.equal(isAnalyticsEvent("page_view"), true);
assert.equal(isAnalyticsEvent("raw-query"), false);
assert.equal(isAnalyticsPage("business_profile"), true);
assert.equal(isAnalyticsPage("user_123"), false);

console.log("All aggregate analytics checks passed.");
