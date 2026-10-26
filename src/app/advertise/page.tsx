
import { SITE_SHORT } from "@/lib/site";
import { KIcon } from "@/lib/icons";
import Link from "next/link";
import { Faq } from "@/components/hippo";
import { activePlans, TRIAL_DAYS, formatZAR, getPlan } from "@/lib/plans";
import { loadPlanConfig } from "@/lib/server/plan-config";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "Advertise your business — get matched to buyers who need you",
  description:
    "Get in front of people already asking for your service in your area. A verified profile with your prices, hours and photos, matched to local buyer requests automatically, plus WhatsApp and quote enquiries.",
  path: "/advertise",
  keywords: ["advertise local business South Africa", "get more local customers", "featured business listing", "local lead generation"],
});

/**
 * /advertise — the PRE-SIGNUP sales pitch.
 *
 * Deliberately different from /pricing: this page has no subscription state and
 * no upgrade controls, it just argues the value of being listed and funnels into
 * /list-business. /pricing is where an existing seller manages their plan.
 * (See the comment in app/pricing/page.tsx.)
 */
export default async function AdvertisePage() {
  // Install any admin overrides BEFORE reading plans, so this page shows the
  // same prices and limits checkout will charge (§21).
  await loadPlanConfig();
  // Built from plans.ts (the single source of truth) so this page can never
  // drift from the checkout price or the limits the server enforces (§21).
  const tiers = activePlans().map((p) => ({
    name: p.name.toUpperCase(),
    price: `${formatZAR(p.monthly)}/mo`,
    annual: `${formatZAR(p.annual)}/yr`,
    blurb: p.blurb,
    feats: p.features.slice(0, 4),
    cta: { label: `${p.popular ? "Go" : "Start"} ${p.name} →`, href: "/list-business" },
    highlight: Boolean(p.popular),
    trialDays: p.trialDays,
  }));
  const faqs = [
    { q: "Is it really free to list?", a: `Starter includes a ${TRIAL_DAYS}-day free trial with a business profile, services, portfolio and your first lead opportunities. After that it's ${formatZAR(getPlan("starter")?.monthly ?? 199)}/month, and you can cancel anytime.` },
    { q: "Can I upgrade later?", a: "Anytime. Plans are monthly or annual and you can move between Starter, Professional and Business as your workload changes — the server applies the new limits immediately." },
    { q: "How are businesses verified?", a: "We verify listings by phone or WhatsApp before they display a verified badge, and the badge only appears after that check — never automatically." },
    { q: "Do paid plans get more leads?", a: `Lead allowances rise with the plan: ${getPlan("starter")?.limits.leadsPerMonth} matched lead opportunities a month on Starter, ${getPlan("professional")?.limits.leadsPerMonth} on Professional and ${getPlan("business")?.limits.leadsPerMonth} on Business. Ranking still comes from relevance first.` },
  ];
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      <header className="hippo-hero min-w-0 rounded-3xl p-5 text-center text-white anim-rise sm:p-10">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#ffc72c]">Grow your {SITE_SHORT} business</p>
        <h1 className="mt-2 break-words text-3xl font-black tracking-tight sm:text-5xl">Buyers find you by what they need</h1>
        <p className="mx-auto mt-3 max-w-2xl break-words text-sm text-white/75 sm:text-base">List your prices, hours and photos once. When someone nearby needs your trade, we match them to you and alert you — automatically.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link href="/list-business" className="btn-hippo">List your business free →</Link>
          <Link href="/pricing" className="inline-flex items-center rounded-full border-2 border-white/40 px-6 py-3 font-bold text-sm hover:bg-white/10">Compare plans</Link>
        </div>
      </header>

      <div className="grid sm:grid-cols-3 gap-3 items-stretch">
        {tiers.map((t) => (
          <div key={t.name} className={`hippo-card p-6 flex flex-col ${t.highlight ? "border-2 !border-[#7ac142] shadow-[0_24px_50px_-24px_rgba(122,193,66,0.7)]" : ""}`}>
            {t.highlight && <span className="self-start text-[10px] font-black uppercase tracking-widest bg-[#7ac142] text-[#0b1e33] rounded-full px-2 py-0.5 mb-2">Most popular</span>}
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#558c2b]">{t.name}</p>
            <p className="text-3xl font-black text-[#10243e] mt-1">{t.price}</p>
            <p className="text-xs text-[#1d3a5f]/60 mt-1">{t.blurb}</p>
            <p className="text-[11px] font-bold text-[#558c2b] mt-1">
              or {t.annual} <span className="text-[#1d3a5f]/50 font-normal">(2 months free)</span>
            </p>
            {t.trialDays ? (
              <p className="text-[11px] text-[#1d3a5f]/60 mt-0.5">{t.trialDays}-day free trial — no card needed to start.</p>
            ) : null}
            <ul className="text-sm mt-4 space-y-2 flex-1 text-[#10243e]">
              {t.feats.map((f) => <li key={f} className="flex gap-2"><span className="text-[#7ac142] font-black shrink-0"><KIcon name="check" size={14} className="inline shrink-0" /></span>{f}</li>)}
            </ul>
            <Link href={t.cta.href} className={`mt-5 text-center text-sm font-extrabold rounded-full px-4 py-3 ${t.highlight ? "btn-hippo" : "border-2 border-[#10243e] text-[#10243e] hover:bg-[#10243e] hover:text-white transition"}`}>
              {t.cta.label}
            </Link>
          </div>
        ))}
      </div>

      <Faq items={faqs} />
    </div>
  );
}
