import { CREDIT_PACKS, CREDIT_VALUE_ZAR, LEAD_TIER_CREDITS, creditPriceFor, tierForLead } from "../src/lib/credits.ts";
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
check("small jobs meet the 10-credit minimum", LEAD_TIER_CREDITS.small, 10);
check("standard jobs cost 20 credits", LEAD_TIER_CREDITS.standard, 20);
check("large projects cost 40 credits", LEAD_TIER_CREDITS.large, 40);
check("major projects cost 80 credits", LEAD_TIER_CREDITS.major, 80);
check("major budget unlock costs 80 credits", creditPriceFor({ budget: 50000 }), 80);
check("one credit is valued at R2", CREDIT_VALUE_ZAR, 2);
for (const pack of CREDIT_PACKS) {
  check(`${pack.name} costs R2 per credit`, pack.price / pack.credits, 2);
}
check("project wording estimates large without budget", tierForLead({ need: "build a business website" }), "large");
check("urgent small repair estimates standard without budget", tierForLead({ need: "fix leaking tap", timeline: "ASAP" }), "standard");
check("generic request estimates small without budget", tierForLead({ need: "help with a job" }), "small");
check("Starter includes 35 monthly credits", PLANS.find((plan) => plan.id === "starter")?.includedCredits, 35);
check("Starter is free", PLANS.find((plan) => plan.id === "starter")?.monthly, 0);
check("Starter allows 3 lead opportunities", PLANS.find((plan) => plan.id === "starter")?.limits.leadsPerMonth, 3);
check("Starter remains entitled without a paid period", subscriptionIsEntitled({ plan: "starter", status: "expired" }), true);
check("Premium costs R300 monthly", PLANS.find((plan) => plan.id === "premium")?.monthly, 300);
check("Premium includes 300 monthly credits", PLANS.find((plan) => plan.id === "premium")?.includedCredits, 300);
check("Premium has unlimited lead opportunities", PLANS.find((plan) => plan.id === "premium")?.limits.leadsPerMonth, null);
check("Starter allows 50 seller messages monthly", PLANS.find((plan) => plan.id === "starter")?.limits.messagesPerMonth, 50);
check("Premium seller messaging is unlimited", PLANS.find((plan) => plan.id === "premium")?.limits.messagesPerMonth, null);
check("active Premium subscription before period end is entitled", subscriptionIsEntitled({ plan: "premium", status: "active", periodEnd: "2026-02-01T00:00:00.000Z" }, Date.parse("2026-01-31T23:59:59.000Z")), true);
check("active Premium subscription after period end is not entitled", subscriptionIsEntitled({ plan: "premium", status: "active", periodEnd: "2026-02-01T00:00:00.000Z" }, Date.parse("2026-02-01T00:00:01.000Z")), false);
check("scheduled cancellation remains entitled until period end", subscriptionIsEntitled({ plan: "premium", status: "canceled", cancelAtPeriodEnd: true, periodEnd: "2026-02-01T00:00:00.000Z" }, Date.parse("2026-01-31T23:59:59.000Z")), true);
check("immediate cancellation is not entitled", subscriptionIsEntitled({ plan: "premium", status: "canceled", cancelAtPeriodEnd: false, periodEnd: "2026-02-01T00:00:00.000Z" }, Date.parse("2026-01-31T23:59:59.000Z")), false);
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
