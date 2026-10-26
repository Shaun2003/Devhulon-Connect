import { KIcon } from "@/lib/icons";
import Link from "next/link";
import ListBusinessSeller from "@/components/ListBusinessSeller";
import { Faq } from "@/components/hippo";
import { PageHero } from "@/components/ui";
import { activePlans, TRIAL_DAYS, formatZAR, getPlan } from "@/lib/plans";
import { loadPlanConfig } from "@/lib/server/plan-config";
import { pageMeta } from "@/lib/seo";
import { SITE_SHORT } from "@/lib/site";

export const metadata = pageMeta({
  title: "List your business — get found by local customers",
  description:
    "Build a verified profile with your prices, hours and photos, then receive enquiries from buyers comparing locals in your area. Live in minutes, cancel any time.",
  path: "/list-business",
  keywords: ["list my business South Africa", "get more local customers", "verified business profile", "local leads"],
});

/**
 * Server component on purpose. The seller flow itself is auth-gated client JS,
 * but this page is indexable and in the sitemap — so the plan, price and FAQ
 * copy is rendered on the server and only the interactive signup is hydrated.
 * That way crawlers get real content instead of a sign-in box.
 */
export default async function ListBusinessPage() {
  // Install admin overrides before reading plans so the copy below can never
  // disagree with what checkout actually charges (§21).
  await loadPlanConfig();
  const tiers = activePlans().map((p) => ({
    name: p.name,
    price: `${formatZAR(p.monthly)}/mo`,
    annual: `${formatZAR(p.annual)}/yr`,
    blurb: p.blurb,
    feats: p.features.slice(0, 4),
    trialDays: p.trialDays,
    popular: Boolean(p.popular),
  }));

  const faqs = [
    {
      q: "How much does it cost to list my business?",
      a: `Starter is ${formatZAR(getPlan("starter")?.monthly ?? 199)}/month and includes a ${TRIAL_DAYS}-day free trial — no card needed to start. Professional and Business cost more and unlock more photos, more leads and priority placement.`,
    },
    {
      q: "How quickly is my listing live?",
      a: "Your profile appears in search as soon as you publish, with no approval delay. The verified badge is added after we confirm your business by phone or WhatsApp — usually within 24 hours.",
    },
    {
      q: "What do buyers see?",
      a: "Your name, category, suburb, rating, opening hours, services, photos and your price guide — the same layout buyers see on the suburb and category pages they are already browsing.",
    },
    {
      q: "Can I cancel any time?",
      a: "Yes. Plans are monthly or annual and you can cancel from your dashboard at any time. Your listing stays visible while the plan is active.",
    },
    {
      q: "Do you charge per lead?",
      a: "No. Your plan includes an allowance of matched lead opportunities each month — you are not billed per enquiry, and enquiries are free to reply to.",
    },
  ];

  return (
    <div className="min-h-screen">
      <PageHero
        kicker="For local businesses"
        title={`List your business on ${SITE_SHORT}`}
        sub="Reach buyers who are already comparing pros in your suburb. Add your prices, hours and photos, then take enquiries by phone, WhatsApp or a free quote request."
        icon="building"
        crumbs={[{ label: "Home", href: "/" }, { label: "List your business" }]}
      >
        <div className="flex flex-wrap gap-2">
          <Link href="#start" className="btn-hippo">Start free \u2192</Link>
          <Link href="/advertise" className="inline-flex items-center rounded-full border-2 border-white/40 px-6 py-3 font-bold text-sm hover:bg-white/10">
            Compare plans
          </Link>
        </div>
      </PageHero>

      <main className="max-w-6xl mx-auto px-4 py-10 space-y-8">

      <div className="grid sm:grid-cols-3 gap-3 items-stretch">
        {tiers.map((t) => (
          <div key={t.name} className={`hippo-card p-6 flex flex-col ${t.popular ? "border-2 !border-[#7ac142]" : ""}`}>
            {t.popular && <span className="self-start text-[10px] font-black uppercase tracking-widest bg-[#7ac142] text-[#0b1e33] rounded-full px-2 py-0.5 mb-2">Most popular</span>}
            <h2 className="text-xs font-black uppercase tracking-[0.16em] text-[#558c2b]">{t.name}</h2>
            <p className="text-3xl font-black text-[#10243e] mt-1">
              {t.price}
              <span className="text-sm font-bold text-[#1d3a5f]/50"> or {t.annual}</span>
            </p>
            <p className="text-xs text-[#1d3a5f]/60 mt-1">{t.blurb}</p>
            {t.trialDays ? <p className="text-[11px] text-[#1d3a5f]/60 mt-1">{t.trialDays}-day free trial.</p> : null}
            <ul className="text-sm mt-4 space-y-2 flex-1 text-[#10243e]">
              {t.feats.map((f) => <li key={f} className="flex gap-2"><span className="text-[#7ac142] font-black shrink-0"><KIcon name="check" size={14} className="inline shrink-0" /></span>{f}</li>)}
            </ul>
            <Link href="#start" className={`mt-5 text-center text-sm font-extrabold rounded-full px-4 py-3 ${t.popular ? "btn-hippo" : "border-2 border-[#10243e] text-[#10243e] hover:bg-[#10243e] hover:text-white transition"}`}>
              Get started →
            </Link>
          </div>
        ))}
      </div>

      <Faq items={faqs} />

      {/* The only hydrated part of the page: the auth-gated signup flow. */}
      <section id="start" className="pt-4">
        <h2 className="text-2xl sm:text-3xl font-black text-[#10243e] text-center">Create your listing</h2>
        <p className="text-sm text-[#1d3a5f]/70 text-center mt-2 max-w-xl mx-auto">
          Sign in, pick your plan and publish. Your profile goes live for buyers in your area immediately.
        </p>
        <div className="mt-6">
          <ListBusinessSeller />
        </div>
      </section>
      </main>
    </div>
  );
}

