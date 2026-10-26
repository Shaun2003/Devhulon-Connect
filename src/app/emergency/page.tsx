import type { CSSProperties } from "react";
import { emergencyContacts } from "@/data/content";
import { Faq } from "@/components/hippo";
import { PageHero } from "@/components/ui";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "Emergency contacts — 24/7 numbers in Gauteng",
  description:
    "Verified out-of-hours numbers for power failures, water bursts, fire, police and towing across Gauteng — plus exactly what to say when you call.",
  path: "/emergency",
  keywords: ["emergency numbers Gauteng", "power outage report", "water leak emergency Johannesburg", "24 hour plumbers"],
});


const faqs = [
  { q: "I have a power outage — who do I call?", a: "City of Tshwane Power Failures on 012 427 0111. Keep your municipal account number ready — it speeds up the fault log." },
  { q: "Burst pipe / no water in my suburb?", a: "Call the Tshwane water line on 012 358 2111, then a local plumber on /request-quote so you have options while you wait." },
];

export default function EmergencyPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      <PageHero
        kicker="Saved numbers, sorted"
        title="\u2014\u2014 Pretoria"
        sub="Save these numbers. For crime in progress call 10111."
        icon="siren"
        crumbs={[{ label: "Home", href: "/" }, { label: "Emergency" }]}
      />
      <main className="max-w-4xl mx-auto px-4 py-10 space-y-8">
      <ul className="space-y-3">
        {emergencyContacts.map((c, i) => (
          <li key={c.name} className="hippo-card p-4 flex justify-between gap-3 items-center hover-lift anim-rise" style={{ "--d": `${Math.min(i, 8) * 40}ms` } as CSSProperties}>
            <div>
              <p className="font-bold text-[#10243e]">{c.name}</p>
              <p className="text-xs text-[#1d3a5f]/60">{c.note}</p>
            </div>
            <a className="font-black text-[#558c2b] text-lg whitespace-nowrap" href={`tel:${c.number.replace(/\s/g, "")}`}>{c.number}</a>
          </li>
        ))}
      </ul>
      <Faq items={faqs} />
      </main>
    </div>
  );
}
