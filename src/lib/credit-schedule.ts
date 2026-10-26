/** Return the next calendar-month date while retaining the original day anchor. */
export function nextMonthlyCreditAt(current: Date, anchorDay = current.getUTCDate()): string {
  const next = new Date(current);
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(Math.max(1, Math.floor(anchorDay)), lastDay));
  return next.toISOString();
}
