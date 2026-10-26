import type { Metadata } from "next";
import MessagesClient from "@/components/messages/MessagesClient";

/**
 * /messages — private, participant-only inbox (§18), so it is deliberately
 * excluded from search. The interesting SEO surface stays on services, guides
 * and business profiles.
 */
export const metadata: Metadata = {
  title: "Messages",
  description: "Chat with local businesses about your quote, dates and details.",
  alternates: { canonical: "/messages" },
  robots: { index: false, follow: true },
};

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; to?: string; business?: string; name?: string }>;
}) {
  const sp = await searchParams;
  return (
    <MessagesClient
      initialCid={(sp.c ?? "").trim() || undefined}
      toUid={(sp.to ?? "").trim() || undefined}
      businessId={(sp.business ?? "").trim() || undefined}
      businessName={(sp.name ?? "").trim() || undefined}
    />
  );
}
