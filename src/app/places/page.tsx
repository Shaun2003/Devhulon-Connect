import type { Metadata } from "next";
import Link from "next/link";
import { AdSlot } from "@/components/ui";
import { CtaBand } from "@/components/hippo";
import { CommunityPlacesLive } from "@/components/FeedsLive";

export const metadata: Metadata = {
  title: "Community places in South Africa | DevhulonConnect",
  description:
    "Discover places shared by local businesses and the community. Browse useful details, locations and opening hours from real posts.",
  alternates: { canonical: "/places" },
};

export default function PlacesPage() {
  return (
    <div className="min-h-screen">
      <CommunityPlacesLive />
      <main className="max-w-6xl mx-auto px-4 py-10 space-y-8">
        <AdSlot />

        <section className="hippo-card p-5">
          <h2 className="font-black text-[#10243e]">Looking for a service instead?</h2>
          <p className="text-sm text-[#1d3a5f]/70 mt-1">
            Browse local providers or compare quotes for the work you need.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/search?q=all" className="btn-hippo text-sm">Browse businesses </Link>
            <Link href="/request-quote" className="btn-sun text-sm">Compare quotes </Link>
            <Link href="/guides" className="self-center text-sm font-bold text-[#558c2b] hover:underline">Read local guides </Link>
          </div>
        </section>

        <CtaBand />
      </main>
    </div>
  );
}