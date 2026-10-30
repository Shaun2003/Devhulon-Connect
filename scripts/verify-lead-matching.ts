import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import type { Business } from "../src/data/businesses.ts";

register(pathToFileURL(path.resolve(import.meta.dirname, "./alias-hook.mjs")));

const { matchPros } = await import("../src/lib/matching.ts");

function business(id: string, categorySlug: string): Business {
  return {
    id,
    name: id,
    categorySlug,
    suburbSlug: "pretoria-cbd",
    citySlug: "pretoria",
    hours: "",
    rating: 4.5,
    reviewCount: 10,
    services: [],
    description: "",
    priceNote: "",
  };
}

const plumber = business("plumber", "plumbers");
const cleaner = business("cleaner", "cleaning-services");
const developer = business("developer", "web-development");
const plumbingRequest = "I need a plumber to fix a leaking tap";

assert.deepEqual(
  matchPros({ need: plumbingRequest, serviceGroupSlug: "home-services" }, [plumber, cleaner, developer])
    .map((match) => match.business.id),
  ["plumber"],
  "A recognized service request must only match businesses in that exact service.",
);

assert.deepEqual(
  matchPros({ need: plumbingRequest, serviceGroupSlug: "technology" }, [developer]),
  [],
  "A request that conflicts with the selected main service must not be sent elsewhere.",
);

assert.deepEqual(
  matchPros({ need: plumbingRequest, serviceGroupSlug: "home-services" }, [cleaner]),
  [],
  "No sibling-service fallback should occur when the requested service has no sellers.",
);

console.log("All service-specific lead matching checks passed.");
