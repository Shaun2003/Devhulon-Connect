import type { CSSProperties } from "react";
import Link from "next/link";
import { calculators } from "@/data/content";
import { CtaBand } from "@/components/hippo";
import { pageMeta } from "@/lib/seo";
import { PageHero } from "@/components/ui";

export const metadata = pageMeta({
  title: "Free calculators — bond payments, costs & rate checks",
  description:
    "Work out a home-loan instalment, check what a fair rate looks like and estimate a job before you ask for a quote. No sign-up, works on any phone.",
  path: "/tools",
  keywords: ["bond calculator South Africa", "home loan calculator", "cost estimate calculator", "interest rate calculator"],
});


export default function ToolsPage() {
  return (
    <div className="min-h-screen">
      <PageHero
        kicker="Free tools"
        title="Local calculators & tools"
        sub="\u2014\u2014 bond, fuel, solar & salary. No sign-up, no spam."
        icon="calculator"
        crumbs={[{ label: "Home", href: "/" }, { label: "Tools" }]}
      />
      <main className="max-w-6xl mx-auto px-4 py-10 space-y-8">
      <div className="grid sm:grid-cols-2 gap-3 items-start">
        {calculators.map((c, i) => (
          <Link key={c.slug} href={`/tools/${c.slug}`} className="hippo-card p-5 group hover-lift anim-rise flex justify-between items-center gap-3" style={{ "--d": `${i * 60}ms` } as CSSProperties}>
            <span className="min-w-0">
              <p className="font-extrabold text-lg text-[#10243e]">{c.name}</p>
              <p className="text-sm text-[#1d3a5f]/70 mt-1">{c.desc}</p>
            </span>
            <span className="text-[#558c2b] opacity-0 group-hover:opacity-100 transition text-xl font-black">→</span>
          </Link>
        ))}
      </div>
      <CtaBand />
      </main>
    </div>
  );
}
