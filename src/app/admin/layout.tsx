import type { Metadata } from "next";
import { SITE_SHORT } from "@/lib/site";

/** Staff-only console — must never reach the index. */
export const metadata: Metadata = {
  title: `${SITE_SHORT} console`,
  alternates: { canonical: "/admin" },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
