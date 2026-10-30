export function renewalFailurePolicy(
  currentAttempts: number,
  canceled: boolean
): { attempts: number; stopped: boolean; retryAfterDays: number | null } {
  const attempts = (Number.isFinite(currentAttempts) ? Math.max(0, Math.floor(currentAttempts)) : 0) + 1;
  const stopped = canceled || attempts >= 3;
  return {
    attempts,
    stopped,
    retryAfterDays: stopped ? null : attempts === 1 ? 1 : 3,
  };
}

export function purchasedCreditRefundDelta(
  creditsToRevoke: number,
  purchasedBalance: number
): { revoked: number; shortfall: number } {
  const requested = Number.isFinite(creditsToRevoke) ? Math.max(0, Math.floor(creditsToRevoke)) : 0;
  const available = Number.isFinite(purchasedBalance) ? Math.max(0, Math.floor(purchasedBalance)) : 0;
  const revoked = Math.min(requested, available);
  return { revoked, shortfall: requested - revoked };
}

export function isFullRefund(refundAmountCents: number | undefined, paymentAmountCents: number): boolean {
  return Number.isSafeInteger(refundAmountCents) &&
    Number.isSafeInteger(paymentAmountCents) &&
    paymentAmountCents > 0 &&
    refundAmountCents === paymentAmountCents;
}
