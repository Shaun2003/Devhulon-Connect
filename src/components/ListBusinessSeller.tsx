
"use client";
import { SITE_SHORT } from "@/lib/site";
import { KIcon } from "@/lib/icons";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import Gate from "@/components/Gate";
import { useAuth } from "@/components/AuthProvider";
import { useRealtime, subscribeMyPlan } from "@/lib/realtime";
import { createBusiness } from "@/lib/repo";
import ConsentCheckbox from "@/components/ConsentCheckbox";
import { LISTING_CONSENT_DETAIL, LISTING_CONSENT_LABEL } from "@/lib/legal";
import {
  subscribeSeller, RANDS, hasCap, CAP_LABEL, CAP_MIN_PLAN,
  type Plan, type PlanId, type Capability,
} from "@/lib/monetize";
import { usePlans } from "@/components/PlanConfigProvider";
import { annualSaving, perMonthEquivalent, priceFor, type BillingPeriod } from "@/lib/plans";
import { zaProvinces, zaCitiesForProvince, zaAreasForCity } from "@/data/za-locations";
import { signupGroups } from "@/lib/matching";
import { TrustBar } from "@/components/ui";

/**
 * Navigate the whole tab to a hosted checkout URL.
 *
 * Defined at module scope rather than inside the component: the
 * react-hooks/immutability lint rule forbids mutating values that live outside a
 * component from within one, and `window.location` is exactly that.
 */
function redirectTo(url: string) {
  window.location.href = url;
}

/**
 * Seller flow: sign in as seller → choose a plan (Starter 7-day trial /
 * Professional / Business) → pay on the provider's hosted checkout → list the
 * business, which goes live for buyers immediately.
 */
export default function ListBusinessSeller() {
  return (
    <Gate seller>
      <SellerFlow />
    </Gate>
  );
}

function SellerFlow() {
  const { user } = useAuth();
  const { rows: subRows, live } = useRealtime<Record<string, unknown>>(
    (cb) => (user ? subscribeMyPlan(user.uid, (r) => cb(r ? [r] : [])) : () => {}),
    [],
    [user?.uid]
  );
  const sub = subRows[0];
  const plan = (sub?.plan as Plan) ?? null;

  if (!live) {
    return (
      <div className="mx-auto w-full max-w-2xl animate-pulse space-y-4 px-4 py-10 sm:py-14" role="status" aria-label="Loading your plan">
        <span className="sr-only">Loading your plan</span>
        <div className="hippo-card space-y-3 p-5 sm:p-6">
          <div className="h-5 w-1/3 rounded bg-[#d6e1ec]" />
          <div className="h-3 w-full rounded bg-[#e7eef5]" />
          <div className="h-3 w-5/6 rounded bg-[#e7eef5]" />
          <div className="h-10 rounded-full bg-[#e7eef5]" />
        </div>
      </div>
    );
  }
  if (!plan) return <PlanChooser />;
  return <ListingForm plan={plan} />;
}

function PlanChooser() {
  // Admin-configured tiers (§21) — the same effective config checkout will charge.
  // Read here rather than in ListBusinessSeller so the value is in scope for the
  // rendered JSX (it previously compiled as a missing name).
  const plans = usePlans();
  const { user } = useAuth();
  const [busy, setBusy] = useState<PlanId | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [period, setPeriod] = useState<BillingPeriod>("monthly");

  async function go(p: PlanId) {
    if (!user) return;
    setBusy(p);
    setErr(null);
    setNote(null);
    try {
      // Server-side checkout: returns a hosted payment URL, or starts the trial.
      const res = await subscribeSeller(p, undefined, { period });
      if (res.url) {
        redirectTo(res.url); // hand off to the provider's own page
        return;
      }
      if (res.trial) setNote(res.message ?? "Your free trial has started.");
      else if (!res.ok) setErr(res.message ?? "Could not start that plan.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not start that plan.");
    } finally { setBusy(null); }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">
      <header className="hippo-hero min-w-0 rounded-3xl p-5 text-center text-white anim-rise sm:p-10">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#ffc72c]">Grow your {SITE_SHORT} business</p>
        <h2 className="mt-2 break-words text-2xl font-black tracking-tight sm:text-3xl">Choose your plan to start</h2>
        <p className="mx-auto mt-3 max-w-2xl break-words text-sm text-white/75 sm:text-base">Start with a 7-day free trial on Starter. Upgrade any time as your workload grows.</p>
      </header>

      {note && <p className="text-sm font-bold text-[#3c6b1d] bg-[#e8f6d8] rounded-2xl px-4 py-3 text-center">{note} Choose a plan again after paying to continue.</p>}
      {err && <p className="text-sm font-bold text-red-700 bg-red-50 rounded-2xl px-4 py-3 text-center">{err}</p>}

      <div className="flex items-center justify-center gap-2" role="group" aria-label="Billing period">
        <button
          type="button"
          onClick={() => setPeriod("monthly")}
          aria-pressed={period === "monthly"}
          className={`rounded-full px-5 py-2 text-sm font-extrabold transition ${period === "monthly" ? "bg-[#10243e] text-white" : "border-2 border-[#e7eef5] text-[#10243e] hover:border-[#10243e]"}`}
        >
          Monthly
        </button>
        <button
          type="button"
          onClick={() => setPeriod("annual")}
          aria-pressed={period === "annual"}
          className={`rounded-full px-5 py-2 text-sm font-extrabold transition ${period === "annual" ? "bg-[#10243e] text-white" : "border-2 border-[#e7eef5] text-[#10243e] hover:border-[#10243e]"}`}
        >
          Annual <span className="font-black text-[#7ac142]">save ~17%</span>
        </button>
      </div>

      <div className="grid sm:grid-cols-3 gap-3 items-stretch">
        {plans.map((t) => (
          <div key={t.id} className={`hippo-card p-6 flex flex-col ${t.popular ? "border-2 !border-[#7ac142]" : ""}`}>
            {t.popular && <span className="self-start text-[10px] font-black uppercase tracking-widest bg-[#7ac142] text-[#0b1e33] rounded-full px-2 py-0.5 mb-2">Most popular</span>}
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#558c2b]">{t.name}</p>
            <p className="text-3xl font-black text-[#10243e] mt-1">
              {RANDS(priceFor(t, period))}
              <span className="text-sm font-bold text-[#1d3a5f]/50">{period === "annual" ? "/yr" : "/mo"}</span>
            </p>
            {period === "annual" && (
              <p className="text-[11px] font-bold text-[#3c6b1d] mt-1">
                Save {RANDS(annualSaving(t).amount)} — about {RANDS(perMonthEquivalent(t, "annual"))}/mo
              </p>
            )}
            <p className="text-xs text-[#1d3a5f]/60 mt-1">{t.blurb}</p>
            <ul className="text-sm mt-4 space-y-2 flex-1 text-[#10243e]">
              {t.features.map((f) => <li key={f} className="flex gap-2"><span className="text-[#7ac142] font-black shrink-0"><KIcon name="check" size={14} className="inline shrink-0" /></span>{f}</li>)}
            </ul>
            <button disabled={busy !== null} onClick={() => go(t.id)} className={`mt-5 text-center text-sm font-extrabold rounded-full px-4 py-3 disabled:opacity-50 ${t.popular ? "btn-hippo" : "border-2 border-[#10243e] text-[#10243e] hover:bg-[#10243e] hover:text-white transition"}`}>
              {busy === t.id ? "Starting…" : t.id === "starter" ? "Start 7-day free trial →" : `Subscribe — ${RANDS(priceFor(t, period))} →`}
            </button>
            {t.id === "starter" && <p className="text-[10px] text-[#1d3a5f]/50 text-center mt-2">7 days free, then {RANDS(t.monthly)}/mo. Cancel anytime.</p>}
          </div>
        ))}
      </div>
      <TrustBar />
    </div>
  );
}
function ListingForm({ plan }: { plan: Plan }) {
  const [province, setProvince] = useState("gauteng");
  const [city, setCity] = useState("pretoria");
  const [suburb, setSuburb] = useState("");
  const [groupSlug, setGroupSlug] = useState("");
  const [category, setCategory] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  // POPIA: a listing publishes the business's contact details to the public, which
  // is a disclosure and needs explicit consent — not an implied one from pressing
  // "Create listing". The server refuses without it.
  const [consent, setConsent] = useState(false);
  const [consentErr, setConsentErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Capture the <form> DOM node BEFORE awaiting — React nulls e.currentTarget
    // once the synchronous handler yields.
    const formEl = e.currentTarget;
    setBusy(true);
    setErr(null);
    setDone(null);
    setConsentErr(null);
    if (!consent) {
      setBusy(false);
      setConsentErr("Tick the box so we may publish your business contact details on this listing.");
      return;
    }
    const fd = new FormData(formEl);
    try {
      const res = await createBusiness({
        name: String(fd.get("name") ?? ""),
        category: String(fd.get("category") ?? ""),
        phone: String(fd.get("phone") ?? ""),
        suburb: String(fd.get("suburb") ?? ""),
        city,
        address: String(fd.get("address") ?? ""),
        hours: String(fd.get("hours") ?? ""),
        desc: String(fd.get("desc") ?? ""),
        priceNote: String(fd.get("priceNote") ?? ""),
        services: String(fd.get("services") ?? ""),
        email: String(fd.get("email") ?? ""),
        yearEstablished: String(fd.get("yearEstablished") ?? ""),
        registrationNumber: String(fd.get("registrationNumber") ?? ""),
        coverImageUrl: String(fd.get("coverImageUrl") ?? ""),
        whatsapp: String(fd.get("whatsapp") ?? ""),
        website: String(fd.get("website") ?? ""),
        facebook: String(fd.get("facebook") ?? ""),
        instagram: String(fd.get("instagram") ?? ""),
        province,
        plan,
        consent: true,
      });
      setBusy(false);
      setDone(res.id ?? "ok");
      formEl.reset();
      setConsent(false);
    } catch (e2) {
      setBusy(false);
      setErr(e2 instanceof Error ? e2.message : "Could not submit. Please try again.");
    }
  }

  if (done) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
        <span className="text-5xl"><KIcon name="sparkles" size={14} className="inline shrink-0" /></span>
        <h2 className="text-3xl font-black text-[#10243e]">You&apos;re LIVE!</h2>
        <p className="text-sm text-[#1d3a5f]/70">Your business is now in front of buyers in real time. Verification is checked by our team within 24h.</p>
        <div className="flex gap-2 justify-center">
          <Link href="/dashboard" className="btn-hippo text-sm">Go to dashboard →</Link>
        </div>
      </div>
    );
  }

  // ── Plan-gated uploads ─────────────────────────────────────────────────
  const can = (cap: Capability) => hasCap(plan, cap);
  const proLock = !can("photos");

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <header className="hippo-hero min-w-0 rounded-3xl p-5 text-center text-white anim-rise sm:p-8">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#ffc72c]">List your business</p>
        <h2 className="mt-2 break-words text-2xl font-black tracking-tight sm:text-3xl">Go live in 2 minutes</h2>
        <p className="mt-2 break-words text-sm text-white/75">Active plan: <b className="uppercase">{plan}</b> · your listing appears for buyers instantly (realtime).</p>
      </header>

      {/* What this plan unlocks */}
      <div className={`hippo-card p-5 ${proLock ? "border-2 !border-[#ffc72c]" : ""}`}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-black text-[#10243e]">What your {plan.toUpperCase()} plan unlocks</h2>
          <Link href="/advertise" className="text-xs font-bold text-[#558c2b] hover:underline">Compare plans →</Link>
        </div>
        <ul className="mt-3 grid sm:grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          {(Object.keys(CAP_LABEL) as Capability[]).map((cap) => {
            const ok = can(cap);
            return (
              <li key={cap} className={`flex items-center gap-2 ${ok ? "text-[#10243e]" : "text-[#1d3a5f]/45"}`}>
                <span className={ok ? "text-[#7ac142] font-black" : "text-[#1d3a5f]/30"}>{ok ? <KIcon name="check" size={13} /> : <KIcon name="lock" size={13} />}</span>
                <span className={ok ? "font-semibold" : ""}>{CAP_LABEL[cap]}</span>
                {!ok && <span className="text-[10px] font-black uppercase bg-[#fff4d6] text-[#a36508] rounded-full px-1.5 py-0.5">{CAP_MIN_PLAN[cap]}</span>}
              </li>
            );
          })}
        </ul>
        {proLock && <p className="text-xs font-bold text-[#a36508] bg-[#fff4d6] rounded-xl px-3 py-2 mt-3"><KIcon name="sparkles" size={14} className="inline shrink-0" /> Photos, WhatsApp button and priority placement need <b>PRO (R199/mo)</b>. Upgrade below or publish FREE now.</p>}
      </div>

      <ListingFields
        province={province} setProvince={setProvince}
        city={city} setCity={setCity}
        suburb={suburb} setSuburb={setSuburb}
        groupSlug={groupSlug} setGroupSlug={setGroupSlug}
        category={category} setCategory={setCategory}
        busy={busy} err={err} onSubmit={onSubmit} can={can}
        consent={consent} setConsent={setConsent} consentErr={consentErr}
      />
      <TrustBar />
    </div>
  );
}
function ListingFields({
  province, setProvince, city, setCity, suburb, setSuburb,
  groupSlug, setGroupSlug, category, setCategory,
  busy, err, onSubmit, can, consent, setConsent, consentErr,
}: {
  province: string; setProvince: (v: string) => void;
  city: string; setCity: (v: string) => void;
  suburb: string; setSuburb: (v: string) => void;
  groupSlug: string; setGroupSlug: (v: string) => void;
  category: string; setCategory: (v: string) => void;
  busy: boolean;
  err: string | null;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  can: (cap: Capability) => boolean;
  consent: boolean;
  setConsent: (v: boolean) => void;
  consentErr: string | null;
}) {
  return (
    <form onSubmit={onSubmit} className="hippo-card p-5 sm:p-8 space-y-6 !rounded-3xl border border-[#e7eef5] shadow-sm">
      <div>
        <h3 className="text-xl font-black text-[#10243e] mb-4 border-b border-[#e7eef5] pb-2">Business Details</h3>
        <div className="space-y-4">
          <label className="block text-sm font-bold text-[#10243e]">
            Business Name
            <input required name="name" placeholder="e.g. Acme Plumbing Solutions" className="mt-1 w-full rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-4 py-3 text-sm font-normal bg-[#f2f6fa]/40 outline-none transition-colors" />
          </label>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block text-sm font-bold text-[#10243e]">
              What kind of business is it?
              <select
                required
                value={groupSlug}
                onChange={(e) => { setGroupSlug(e.target.value); setCategory(""); }}
                className="mt-1 w-full rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-4 py-3 text-sm font-normal bg-[#f2f6fa]/40 outline-none transition-colors"
              >
                <option value="">Choose a main service…</option>
                {signupGroups.map((g) => (
                  <option key={g.slug} value={g.slug}>{g.name}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-bold text-[#10243e]">
              {groupSlug ? "Your specific service" : "Specific service"}
              <select
                required
                name="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={!groupSlug}
                className="mt-1 w-full rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-4 py-3 text-sm font-normal bg-[#f2f6fa]/40 outline-none transition-colors disabled:opacity-50"
              >
                <option value="">{groupSlug ? "Choose your service…" : "Pick a main service first"}</option>
                {(signupGroups.find((g) => g.slug === groupSlug)?.categories ?? []).map((c) => (
                  <option key={c.slug} value={c.slug}>{c.name}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block text-sm font-bold text-[#10243e]">
              Registration Number (Optional)
              <input name="registrationNumber" placeholder="K2020 / XXXXXX / XX" className="mt-1 w-full rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-4 py-3 text-sm font-normal bg-[#f2f6fa]/40 outline-none transition-colors" />
            </label>
            <label className="block text-sm font-bold text-[#10243e]">
              What do you do? (Description)
              <textarea required name="desc" rows={2} placeholder="Explain what makes your service stand out..." className="mt-1 w-full rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-4 py-3 text-sm font-normal bg-[#f2f6fa]/40 outline-none transition-colors" />
            </label>
          </div>
        </div>
      </div>
      
      <div>
        <h3 className="text-xl font-black text-[#10243e] mb-4 border-b border-[#e7eef5] pb-2">Contact & Location</h3>
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block text-sm font-bold text-[#10243e]">
              Phone Number
              <input required name="phone" inputMode="tel" placeholder="012 546 1234" className="mt-1 w-full rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-4 py-3 text-sm font-normal bg-[#f2f6fa]/40 outline-none transition-colors" />
            </label>
            <label className="block text-sm font-bold text-[#10243e]">
              Email Address
              <input required name="email" type="email" placeholder="hello@yourbusiness.co.za" className="mt-1 w-full rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-4 py-3 text-sm font-normal bg-[#f2f6fa]/40 outline-none transition-colors" />
            </label>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block text-sm font-bold text-[#10243e]">
              Province
              <select
                required
                value={province}
                onChange={(e) => { setProvince(e.target.value); setCity(""); }}
                className="mt-1 w-full rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-4 py-3 text-sm font-normal bg-[#f2f6fa]/40 outline-none transition-colors"
              >
                <option value="">Select a province…</option>
                {zaProvinces.map((p) => (
                  <option key={p.slug} value={p.slug}>{p.name}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-bold text-[#10243e]">
              City / Town
              <select
                required
                value={city}
                onChange={(e) => { setCity(e.target.value); setSuburb(""); }}
                disabled={!province}
                className="mt-1 w-full rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-4 py-3 text-sm font-normal bg-[#f2f6fa]/40 outline-none transition-colors disabled:opacity-50"
              >
                <option value="">{province ? "Select a city…" : "Pick a province first"}</option>
                {zaCitiesForProvince(province).map((c) => (
                  <option key={c.slug} value={c.slug}>{c.name}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block text-sm font-bold text-[#10243e]">
              Suburb / Area
              <select
                required
                name="suburb"
                value={suburb}
                onChange={(e) => setSuburb(e.target.value)}
                disabled={!city}
                className="mt-1 w-full rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-4 py-3 text-sm font-normal bg-[#f2f6fa]/40 outline-none transition-colors disabled:opacity-50"
              >
                <option value="">{city ? "Select an area…" : "Pick a city first"}</option>
                {zaAreasForCity(city).map((s) => (
                  <option key={s.slug} value={s.slug}>{s.name}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-bold text-[#10243e]">
              Year Established (Optional)
              <input name="yearEstablished" type="number" min="1900" max="2100" placeholder="e.g. 2012" className="mt-1 w-full rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-4 py-3 text-sm font-normal bg-[#f2f6fa]/40 outline-none transition-colors" />
            </label>
          </div>
          <label className="block text-sm font-bold text-[#10243e]">
            Physical Address (Optional)
            <input name="address" placeholder="582 Gerrit Maritz St" className="mt-1 w-full rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-4 py-3 text-sm font-normal bg-[#f2f6fa]/40 outline-none transition-colors" />
          </label>
        </div>
      </div>
      <div>
        <h3 className="text-xl font-black text-[#10243e] mb-4 border-b border-[#e7eef5] pb-2">Offering</h3>
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block text-sm font-bold text-[#10243e]">
              Business Hours
              <input name="hours" placeholder="Mon–Sat 07:00–18:00" className="mt-1 w-full rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-4 py-3 text-sm font-normal bg-[#f2f6fa]/40 outline-none transition-colors" />
            </label>
            <label className="block text-sm font-bold text-[#10243e]">
              Price / Rate Guide
              <input name="priceNote" placeholder="Callout R550 / Hourly R650" className="mt-1 w-full rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-4 py-3 text-sm font-normal bg-[#f2f6fa]/40 outline-none transition-colors" />
            </label>
          </div>
          <label className="block text-sm font-bold text-[#10243e]">
            Keywords / Specialties (comma separated)
            <input name="services" placeholder="Leak detection, Geyser installs, Blocked drains" className="mt-1 w-full rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-4 py-3 text-sm font-normal bg-[#f2f6fa]/40 outline-none transition-colors" />
          </label>
        </div>
      </div>
      <div>
        <h3 className="text-xl font-black text-[#10243e] mb-1">Pro Features</h3>
        <p className="text-xs text-[#1d3a5f]/60 mb-4">
          These unlock as you upgrade. Fill in what you have now — you can add the rest later from your
          dashboard without re-listing.
        </p>
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block text-sm font-bold text-[#10243e]">
              Cover photo link{" "}
              <span className="font-normal text-[#1d3a5f]/60">
                {can("photos") ? "(optional, free)" : "\u2014 PRO feature "}
              </span>
              <input
                name="coverImageUrl"
                disabled={!can("photos")}
                placeholder={can("photos") ? "https://…/shopfront.jpg" : "Upgrade to PRO to add photos"}
                className="mt-1 w-full rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-4 py-3 text-sm font-normal bg-[#f2f6fa]/40 outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              />
            </label>
            <label className="block text-sm font-bold text-[#10243e]">
              WhatsApp number{" "}
              <span className="font-normal text-[#1d3a5f]/60">
                {can("whatsapp") ? "(buyers get a one-tap button)" : "\u2014 PRO feature "}
              </span>
              <input
                name="whatsapp"
                inputMode="tel"
                disabled={!can("whatsapp")}
                placeholder={can("whatsapp") ? "27821234567 (international format)" : "Upgrade to PRO for a WhatsApp button"}
                className="mt-1 w-full rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-4 py-3 text-sm font-normal bg-[#f2f6fa]/40 outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              />
            </label>
          </div>

          {/* Business plan only. These used to be written by updateBusiness() but
              were never asked for at signup, so a seller had to publish first and
              then hunt for them. */}
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block text-sm font-bold text-[#10243e]">
              Website{" "}
              <span className="font-normal text-[#1d3a5f]/60">
                {can("website") ? "(optional)" : "— Business plan "}
              </span>
              <input
                name="website"
                type="url"
                disabled={!can("website")}
                placeholder={can("website") ? "https://yourbusiness.co.za" : "Upgrade to Business to add a website"}
                className="mt-1 w-full rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-4 py-3 text-sm font-normal bg-[#f2f6fa]/40 outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              />
            </label>
            <label className="block text-sm font-bold text-[#10243e]">
              Facebook page{" "}
              <span className="font-normal text-[#1d3a5f]/60">
                {can("socials") ? "(optional)" : "— Business plan "}
              </span>
              <input
                name="facebook"
                disabled={!can("socials")}
                placeholder={can("socials") ? "https://facebook.com/yourpage" : "Upgrade to Business to add socials"}
                className="mt-1 w-full rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-4 py-3 text-sm font-normal bg-[#f2f6fa]/40 outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              />
            </label>
          </div>
          <label className="block text-sm font-bold text-[#10243e]">
            Instagram{" "}
            <span className="font-normal text-[#1d3a5f]/60">
              {can("socials") ? "(optional)" : "— Business plan "}
            </span>
            <input
              name="instagram"
              disabled={!can("socials")}
              placeholder={can("socials") ? "https://instagram.com/yourpage" : "Upgrade to Business to add socials"}
              className="mt-1 w-full rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-4 py-3 text-sm font-normal bg-[#f2f6fa]/40 outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            />
          </label>
        </div>
      </div>
      <ConsentCheckbox
        checked={consent}
        onChange={(v) => { setConsent(v); }}
        label={LISTING_CONSENT_LABEL}
        detail={LISTING_CONSENT_DETAIL}
        error={consentErr}
      />
      <button disabled={busy || !consent} className="bg-[#7ac142] hover:bg-[#68a834] text-white font-black w-full !rounded-xl !py-4 text-base disabled:opacity-60 transition shadow-md">{busy ? "Publishing…" : "Publish listing — go live →"}</button>
      {err && <p className="text-sm font-bold text-red-700 bg-red-50 rounded-2xl px-4 py-3">{err}</p>}
    </form>
  );
}