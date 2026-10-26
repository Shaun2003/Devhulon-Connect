import type { Metadata } from "next";
import NotificationsClient from "@/components/NotificationsClient";

/**
 * /notifications — the full notification centre behind the header bell.
 * Private (recipient-only reads in firestore.rules), so it is excluded from
 * search exactly like /messages.
 */
export const metadata: Metadata = {
  title: "Notifications",
  description: "New leads, quotes, reviews, bookings and messages that need your attention.",
  alternates: { canonical: "/notifications" },
  robots: { index: false, follow: true },
};

export default function NotificationsPage() {
  return <NotificationsClient />;
}
