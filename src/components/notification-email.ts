/**
 * Email trigger for the notification centre.
 *
 * Why it lives here and nowhere else: the browser only holds the notification
 * id, and the email route is the single place that resolves toUid, applies
 * the type whitelist, enforces the hourly caps, and guards emailedAt so a
 * notification is mailed at most once.
 *
 * It is deliberately asynchronous and void: a mail outage must never turn a
 * notification into a UI error, and it must never retry after a success.
 */

export function triggerNotificationEmail(notificationId: string): void {
  void triggerNotificationEmailAsync(notificationId);
}

export async function triggerNotificationEmailAsync(notificationId: string): Promise<boolean> {
  const res = await fetch("/api/notifications/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notificationId }),
  });
  // The route always answers 200 for a skip too, so a non-2xx means it really
  // failed (transport, not policy). We swallow it — the in-app row is the source
  // of truth; email is the courtesy copy.
  return res.ok;
}

