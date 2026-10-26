import { LEAD_TIER_CREDITS, creditPriceFor, tierForLead } from "../src/lib/credits.ts";
import { nextMonthlyCreditAt } from "../src/lib/credit-schedule.ts";
import { PLANS, subscriptionIsEntitled } from "../src/lib/plans.ts";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const passed = actual === expected;
  if (!passed) failures++;
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${passed ? "" : ` (got ${String(actual)}, want ${String(expected)})`}`);
}

check("under R3,000 is small", tierForLead({ budget: 2999 }), "small");
check("R3,000 is standard", tierForLead({ budget: 3000 }), "standard");
check("R14,999 is standard", tierForLead({ budget: 14999 }), "standard");
check("R15,000 is large", tierForLead({ budget: 15000 }), "large");
check("R49,999 is large", tierForLead({ budget: 49999 }), "large");
check("R50,000 is major", tierForLead({ budget: 50000 }), "major");
check("large budget uses 40 credits", creditPriceFor({ budget: 50000 }), LEAD_TIER_CREDITS.major);
check("project wording estimates large without budget", tierForLead({ need: "build a business website" }), "large");
check("urgent small repair estimates standard without budget", tierForLead({ need: "fix leaking tap", timeline: "ASAP" }), "standard");
check("generic request estimates small without budget", tierForLead({ need: "help with a job" }), "small");
check("Starter includes 35 monthly credits", PLANS.find((plan) => plan.id === "starter")?.includedCredits, 35);
check("Professional includes 75 monthly credits", PLANS.find((plan) => plan.id === "professional")?.includedCredits, 75);
check("Business includes 200 monthly credits", PLANS.find((plan) => plan.id === "business")?.includedCredits, 200);
check("Starter allows 50 seller messages monthly", PLANS.find((plan) => plan.id === "starter")?.limits.messagesPerMonth, 50);
check("Professional seller messaging is unlimited", PLANS.find((plan) => plan.id === "professional")?.limits.messagesPerMonth, null);
check("Business seller messaging is unlimited", PLANS.find((plan) => plan.id === "business")?.limits.messagesPerMonth, null);
check("active subscription before period end is entitled", subscriptionIsEntitled({ status: "active", periodEnd: "2026-02-01T00:00:00.000Z" }, Date.parse("2026-01-31T23:59:59.000Z")), true);
check("active subscription after period end is not entitled", subscriptionIsEntitled({ status: "active", periodEnd: "2026-02-01T00:00:00.000Z" }, Date.parse("2026-02-01T00:00:01.000Z")), false);
check("scheduled cancellation remains entitled until period end", subscriptionIsEntitled({ status: "canceled", cancelAtPeriodEnd: true, periodEnd: "2026-02-01T00:00:00.000Z" }, Date.parse("2026-01-31T23:59:59.000Z")), true);
check("immediate cancellation is not entitled", subscriptionIsEntitled({ status: "canceled", cancelAtPeriodEnd: false, periodEnd: "2026-02-01T00:00:00.000Z" }, Date.parse("2026-01-31T23:59:59.000Z")), false);
check(
  "monthly credit date clamps at February then returns to the original day",
  nextMonthlyCreditAt(new Date("2026-01-31T12:00:00.000Z"), 31),
  "2026-02-28T12:00:00.000Z",
);
check(
  "monthly credit date preserves the original day after February",
  nextMonthlyCreditAt(new Date("2026-02-28T12:00:00.000Z"), 31),
  "2026-03-31T12:00:00.000Z",
);

if (failures > 0) process.exitCode = 1;
else console.log("All credit pricing checks passed.");
