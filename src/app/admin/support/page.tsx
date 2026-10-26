import type { Metadata } from "next";
import Link from "next/link";
import SupportQueue from "@/components/admin/SupportQueue";
import { SITE_SHORT } from "@/lib/site";

export const metadata: Metadata = {
  title: `Support requests · ${SITE_SHORT} console`,
  robots: { index: false, follow: false },
};

export default function AdminSupportPage() {
  return (
    <main className="max-w-5xl mx-auto px-4 py-8 space-y-5">
      <header className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#558c2b]">Admin console</p>
          <h1 className="text-2xl font-black text-[#10243e]">Support requests</h1>
        </div>
        <Link href="/admin" className="btn-sun text-sm">Back to admin →</Link>
      </header>
      <SupportQueue />
    </main>
  );
}
