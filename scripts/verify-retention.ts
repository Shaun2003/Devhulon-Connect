/**
 * Standalone verification of the retention AGE logic.
 *
 * Run with:  node --experimental-strip-types scripts/verify-retention.ts
 *
 * WHY A SCRIPT AND NOT A TEST SUITE: the project has no test runner and this
 * codebase deliberately ships zero test dependencies. Adding a runner for one
 * check would be heavier than the check. This exercises the REAL exported
 * helpers — not reimplementations — so a pass genuinely means the shipped logic
 * is correct, which is the only thing worth asserting about code that deletes
 * user data.
 *
 * Paths are relative with explicit `.ts` extensions because Node runs this
 * directly and does not resolve the `@/` alias or extensionless specifiers. The
 * tiny resolver hook below teaches Node the project's `@/*` → `src/*` mapping so
 * the REAL modules can be imported unmodified — reimplementing their logic here
 * would prove nothing about the shipped code.
 *
 * The Firestore-touching passes cannot be verified without a live project, so
 * this covers the decision layer: which documents are in scope for expiry and
 * redaction, and that every `createdAt` shape is understood.
 */

import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";

// Map the project's `@/*` alias onto `src/*`, adding the `.ts` extension Node
// needs. Registered before any project module is imported.
register(pathToFileURL(path.resolve(import.meta.dirname, "./alias-hook.mjs")));

const { isOlderThan, retentionDaysRemaining, OPEN_STATUSES } = await import(
  "../src/lib/server/retention.ts"
);
const { LEAD_OPEN_EXPIRY_DAYS, LEAD_RETENTION_DAYS } = await import("../src/lib/legal.ts");
const { toMillis } = await import("../src/lib/analytics.ts");

const DAY = 86_400_000;
let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`}`);
}

const NOW = new Date("2026-09-15T12:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

/* ── createdAt shapes actually present in the dataset ─────────────────────── */

// 1. ISO string — what every server route writes today.
check("ISO string is understood", toMillis("2026-09-01T00:00:00.000Z"), Date.parse("2026-09-01T00:00:00.000Z"));

// 2. Firestore Timestamp — what older client-side writes used.
const fakeTimestamp = { toMillis: () => Date.parse("2026-09-01T00:00:00.000Z"), seconds: 1788480000 };
check("Firestore Timestamp is understood", toMillis(fakeTimestamp), Date.parse("2026-09-01T00:00:00.000Z"));
check("Timestamp `.seconds` fallback", toMillis({ seconds: 1000 }), 1000_000);

// 3. Date and epoch millis.
check("Date object", toMillis(daysAgo(1)), NOW.getTime() - DAY);
check("epoch millis", toMillis(NOW.getTime()), NOW.getTime());

// 4. Garbage must never be treated as a date — a false 0 would make everything
//    look infinitely old and get live leads deleted.
check("garbage string is not a date", toMillis("not-a-date"), 0);
check("null is not a date", toMillis(null), 0);
check("undefined is not a date", toMillis(undefined), 0);
check("empty object is not a date", toMillis({}), 0);

/* ── Expiry window (LEAD_OPEN_EXPIRY_DAYS) ────────────────────────────────── */

check("expiry threshold is 30 days", LEAD_OPEN_EXPIRY_DAYS, 30);

check("40-day-old open lead EXPIRES", isOlderThan(daysAgo(40).toISOString(), LEAD_OPEN_EXPIRY_DAYS, NOW), true);
check("20-day-old open lead survives", isOlderThan(daysAgo(20).toISOString(), LEAD_OPEN_EXPIRY_DAYS, NOW), false);
check("exactly-30-day-old lead survives (boundary is exclusive)", isOlderThan(daysAgo(30).toISOString(), LEAD_OPEN_EXPIRY_DAYS, NOW), false);
check("31-day-old lead expires", isOlderThan(daysAgo(31).toISOString(), LEAD_OPEN_EXPIRY_DAYS, NOW), true);

/* ── Retention window (LEAD_RETENTION_DAYS) ───────────────────────────────── */

check("retention threshold is 180 days", LEAD_RETENTION_DAYS, 180);
check("200-day-old lead is REDACTED", isOlderThan(daysAgo(200).toISOString(), LEAD_RETENTION_DAYS, NOW), true);
check("100-day-old lead survives", isOlderThan(daysAgo(100).toISOString(), LEAD_RETENTION_DAYS, NOW), false);
check("180-day-old lead survives (boundary is exclusive)", isOlderThan(daysAgo(180).toISOString(), LEAD_RETENTION_DAYS, NOW), false);

// A brand-new Timestamp lead must NOT be redaction-eligible — this is the exact
// bug that would destroy live data if `toMillis` returned 0 for unknown shapes.
check("Timestamp-typed new lead is NOT redaction-eligible", isOlderThan({ toMillis: () => NOW.getTime() }, LEAD_RETENTION_DAYS, NOW), false);

/* ── The critical safety property ─────────────────────────────────────────── */

// Anything with an unreadable timestamp must be SKIPPED, never swept. If this
// ever flips to true, the sweep would delete live leads.
check("UNREADABLE timestamp is skipped, not swept", isOlderThan("corrupt", LEAD_RETENTION_DAYS, NOW), false);
check("missing timestamp is skipped, not swept", isOlderThan(undefined, LEAD_OPEN_EXPIRY_DAYS, NOW), false);

/* ── Statuses the expiry pass considers open ──────────────────────────────── */

check(
  "open statuses are exactly new/viewed/broadcast",
  [...OPEN_STATUSES].sort(),
  ["broadcast", "new", "viewed"]
);
// Anything a seller engaged with must NOT be closed as "unanswered" — the sweep
// only ever touches leads nobody worked.
for (const engaged of ["accepted", "quoted", "won", "lost", "negotiating", "expired"]) {
  check(`"${engaged}" is not in the expiry scope`, (OPEN_STATUSES as readonly string[]).includes(engaged), false);
}

/* ── Countdown copy ───────────────────────────────────────────────────────── */

check("retention countdown for a 10-day-old lead", retentionDaysRemaining(daysAgo(10).toISOString(), 180, NOW), 170);
check("retention countdown clamps at 0", retentionDaysRemaining(daysAgo(400).toISOString(), 180, NOW), 0);
check("retention countdown for unreadable date falls back to full", retentionDaysRemaining("corrupt", 180, NOW), 180);

console.log(failures === 0 ? "\nAll retention checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);