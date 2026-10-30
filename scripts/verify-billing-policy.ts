import {
  isFullRefund,
  renewalFailurePolicy,
  purchasedCreditRefundDelta,
} from "../src/lib/billing-policy.ts";

const checks: Array<[string, boolean]> = [
  ["first renewal failure retries after one day", renewalFailurePolicy(0, false).retryAfterDays === 1],
  ["second renewal failure retries after three days", renewalFailurePolicy(1, false).retryAfterDays === 3],
  ["third renewal failure stops further attempts", renewalFailurePolicy(2, false).stopped],
  ["cancellation stops renewal retries", renewalFailurePolicy(0, true).retryAfterDays === null],
  ["refund revokes only remaining purchased credits", purchasedCreditRefundDelta(12, 7).revoked === 7],
  ["refund records purchased-credit shortfall", purchasedCreditRefundDelta(12, 7).shortfall === 5],
  ["refund never creates negative credit balances", purchasedCreditRefundDelta(4, -2).revoked === 0],
  ["full refund is matched to the original payment amount", isFullRefund(30000, 30000)],
  ["partial refund does not trigger a full credit reversal", !isFullRefund(10000, 30000)],
  ["refund with unknown amount requires review", !isFullRefund(undefined, 30000)],
];

const failed = checks.filter(([, passed]) => !passed);
for (const [description, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${description}`);
}
if (failed.length) process.exitCode = 1;
