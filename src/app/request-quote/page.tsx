"use client";
import { use, useState, type FormEvent } from "react";
import { matchProRequest, submitLead } from "@/lib/repo";
import { slugify } from "@/lib/utils";
import Link from "next/link";
import { categories } from "@/data/categories";
import { matchCategory } from "@/lib/matching";
import { CATEGORY_GROUPS, SERVICE_GROUPS } from "@/data/taxonomy";
import { TrustBar, PageHero } from "@/components/ui";
import ConsentCheckbox from "@/components/ConsentCheckbox";
import { LEAD_CONSENT_DETAIL, LEAD_CONSENT_LABEL } from "@/lib/legal";
import { KIcon } from "@/lib/icons";
import { PlaceSuggestions } from "@/components/SearchBar";
import { trackAnalyticsEvent } from "@/lib/track-analytics";

export default function RequestQuotePage({ searchParams }: { searchParams: Promise<{ business?: string; need?: string; suburb?: string; category?: string }> }) {
  const sp = use(searchParams);
  const businessId = (sp.business ?? "").trim();
  const initialNeed = (sp.need ?? "").trim();
  const initialCategory = sp.category && categories.some((category) => category.slug === sp.category)
    ? sp.category
    : matchCategory(initialNeed)?.slug;
  const initialGroup = sp.category && SERVICE_GROUPS.some((group) => group.slug === sp.category)
    ? sp.category
    : initialCategory ? CATEGORY_GROUPS[initialCategory] ?? "" : "";
  const [serviceGroupSlug, setServiceGroupSlug] = useState(initialGroup);
  const [status, setStatus] = useState<string | null>(null);
  const [compareReady, setCompareReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // POPIA consent to disclose the entered details to matched businesses. Required by
  // the server, so this is a real gate rather than a courtesy line.
  const [consent, setConsent] = useState(false);
  const [consentErr, setConsentErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Capture the form node BEFORE awaiting (React nulls e.currentTarget after yield).
    const formEl = e.currentTarget;
    setBusy(true);
    setStatus(null);
    setCompareReady(false);
    setError(null);
    setConsentErr(null);
    if (!consent) {
      setBusy(false);
      setConsentErr("Tick the box so the businesses can lawfully use your details to quote you.");
      return;
    }
    const fd = new FormData(formEl);
    const rawSuburb = String(fd.get("suburb") ?? "");
    try {
      const need = String(fd.get("need") ?? "");
      const selectedServiceGroup = businessId ? undefined : String(fd.get("serviceGroup") ?? "");
      const timeline = String(fd.get("timeline") ?? "");
      const name = String(fd.get("name") ?? "");
      const email = String(fd.get("email") ?? "");
      const phone = String(fd.get("phone") ?? "");
      const rawBudget = String(fd.get("budget") ?? "").trim();
      const budget = rawBudget ? Number(rawBudget) : undefined;
      if (businessId) {
        const res = await submitLead({
          need,
          timeline,
          budget,
          suburb: slugify(rawSuburb) || rawSuburb,
          name,
          email,
          phone,
          businessId,
          consent: true,
        });
        trackAnalyticsEvent("quote_submitted", "quote_request");
        setStatus(`Sent! Ref ${res.id}. The business has received your request; you can also contact them using their profile details.`);
      } else {
        const res = await matchProRequest({
          need,
          timeline,
          place: rawSuburb,
          name,
          email,
          phone,
          consent: true,
          budget,
          serviceGroupSlug: selectedServiceGroup,
        });
        trackAnalyticsEvent("quote_submitted", "quote_request");
        if (res.matched === 0) {
          setStatus(`Your request was saved (Ref ${res.requestId}), but no eligible pros could receive it right now. Please try again later.`);
        } else {
          const pros = res.matched === 1 ? "1 pro" : `${res.matched} pros`;
          setStatus(`Sent! Ref ${res.requestId}. Your request was sent to ${pros}.`);
          setCompareReady(true);
        }
      }
      setBusy(false);
      formEl.reset();
      setServiceGroupSlug("");
      // Reset the tick too: the buyer just consented to share details for THIS
      // request, and leaving it pre-ticked would let the next submit reuse consent
      // that was never given for the next job.
      setConsent(false);
    } catch (e2) {
      setBusy(false);
      setError(e2 instanceof Error ? e2.message : "Could not send. Please try again.");
    }
  }

  const steps = ["Tell us what you need", "We match pros", "Compare & choose"];

  return (
    <div className="min-h-screen">
      <PageHero
        kicker="Free · 60 seconds · no spam"
        title="Request a free quote"
        sub="Choose the service you need and describe the job. Your area helps prioritise nearby pros, while remote services can match across locations."
        icon="file"
        crumbs={[{ label: "Home", href: "/" }, { label: "Request a quote" }]}
      />
      <PlaceSuggestions id="sa-request-quote-places" />
      <main className="max-w-3xl mx-auto px-4 py-10 space-y-6">

      <ol className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2" aria-label="How it works">
        {steps.map((s, i) => (
          <li key={s} className="flex items-center gap-2 min-w-0">
            <span
              className="grid place-items-center w-7 h-7 shrink-0 rounded-full bg-[#10243e] text-white text-xs font-black"
              aria-hidden
            >
              {i + 1}
            </span>
            <span className="text-xs sm:text-sm font-bold text-[#10243e]">{s}</span>
            {i < steps.length - 1 && <span className="w-4 sm:w-8 h-px bg-[#e7eef5] shrink-0" aria-hidden />}
          </li>
        ))}
      </ol>

          <form
        onSubmit={onSubmit}
        className="bg-white rounded-3xl border border-[#e7eef5] shadow-sm p-5 sm:p-8 space-y-6"
      >
        <section>
          <h2 className="flex items-center gap-2.5 text-base font-black text-[#10243e] pb-3 border-b border-[#e7eef5]">
            <span className="icon-3d icon-3d-xs" aria-hidden>
              <KIcon name="search" size={16} />
            </span>
            What do you need?
          </h2>
          <div className="space-y-4 mt-4">
            {!businessId && (
              <label className="block text-sm font-bold text-[#10243e]">
                Service
                <select
                  name="serviceGroup"
                  required
                  value={serviceGroupSlug}
                  onChange={(event) => setServiceGroupSlug(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-4 py-3 text-sm font-normal bg-white outline-none transition-colors"
                >
                  <option value="">Choose the service you need</option>
                  {SERVICE_GROUPS.map((group) => (
                    <option key={group.slug} value={group.slug}>{group.name}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="block text-sm font-bold text-[#10243e]">
              Describe the job
              <textarea
                required
                name="need"
                rows={3}
                defaultValue={initialNeed}
                placeholder="e.g. Need a reliable plumber to fix a burst geyser…"
                className="mt-1.5 w-full rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-4 py-3 text-sm font-normal outline-none transition-colors resize-none"
              />
            </label>
            <div className="grid sm:grid-cols-2 gap-4">
            <label className="block text-sm font-bold text-[#10243e]">
              Suburb / area
              <input
                name="suburb"
                list="sa-request-quote-places"
                defaultValue={sp.suburb ?? ""}
                placeholder="e.g. Gauteng or 0157"
                className="mt-1.5 w-full rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-4 py-3 text-sm font-normal outline-none transition-colors"
              />
              <span className="mt-1 block text-xs font-normal text-[#1d3a5f]/60">
                Optional. This helps prioritise nearby pros; remote services can match across locations.
              </span>
            </label>
              <label className="block text-sm font-bold text-[#10243e]">
                When do you need it?
                <select
                  name="timeline"
                  className="mt-1.5 w-full rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-4 py-3 text-sm font-normal bg-white outline-none transition-colors cursor-pointer"
                >
                  <option value="ASAP">As soon as possible</option>
                  <option value="Within a few days">Within a few days</option>
                  <option value="Within a week">Within a week</option>
                  <option value="Flexible">I&apos;m flexible</option>
                </select>
              </label>
            </div>
            <label className="block text-sm font-bold text-[#10243e]">
              Your budget (optional)
              <span className="mt-1.5 flex items-center rounded-xl border-2 border-[#e7eef5] focus-within:border-[#7ac142] px-4">
                <span className="text-sm text-[#1d3a5f]/60">R</span>
                <input
                  name="budget"
                  type="number"
                  min="1"
                  max="5000000"
                  step="1"
                  inputMode="numeric"
                  placeholder="e.g. 5000"
                  className="w-full px-2 py-3 text-sm font-normal outline-none"
                />
              </span>
              <span className="mt-1 block text-xs font-normal text-[#1d3a5f]/60">
                Sellers can see your budget on the lead preview before unlocking your contact details.
              </span>
            </label>
          </div>
        </section>
        <section>
          <h2 className="flex items-center gap-2.5 text-base font-black text-[#10243e] pb-3 border-b border-[#e7eef5]">
            <span className="icon-3d icon-3d-xs" aria-hidden>
              <KIcon name="users" size={16} />
            </span>
            Your details
          </h2>
          <div className="space-y-4 mt-4">
            <div className="grid sm:grid-cols-2 gap-4">
            <label className="block text-sm font-bold text-[#10243e]">
              Full name
              <input
                required
                name="name"
                placeholder="Thandi Mokoena"
                className="mt-1.5 w-full rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-4 py-3 text-sm font-normal outline-none transition-colors"
              />
            </label>
            <label className="block text-sm font-bold text-[#10243e]">
              Email
              <input
                required
                name="email"
                placeholder="you@example.co.za"
                className="mt-1.5 w-full rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-4 py-3 text-sm font-normal outline-none transition-colors"
              />
            </label>
            </div>
            <label className="block text-sm font-bold text-[#10243e]">
              Phone / WhatsApp
              <input
                required
                name="phone"
                placeholder="082 123 4567"
                className="mt-1.5 w-full rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-4 py-3 text-sm font-normal outline-none transition-colors"
              />
            </label>
          </div>
        </section>

        {/* POPIA: this form discloses the details above to matched businesses, so
            the tick is captured here at the point of collection and re-checked by
            the server. Without it the request is refused. */}
        <ConsentCheckbox
          checked={consent}
          onChange={(v) => { setConsent(v); if (v) setConsentErr(null); }}
          label={LEAD_CONSENT_LABEL}
          detail={LEAD_CONSENT_DETAIL}
          error={consentErr}
        />

        <div className="pt-2 space-y-3">
          <button
            disabled={busy}
            className="w-full bg-[#10243e] hover:bg-[#1d3a5f] text-white font-black text-base rounded-xl !py-4 disabled:opacity-60 transition-colors inline-flex items-center justify-center gap-2"
          >
            {busy ? "Sending…" : "Get my quotes — free"}
            {!busy && <KIcon name="arrowRight" size={18} />}
          </button>

          {status && (
            <div className="text-sm font-bold text-[#3c6b1d] bg-[#e8f6d8] border border-[#3c6b1d]/20 rounded-xl px-4 py-3">
              <p className="flex items-center gap-2">
                <KIcon name="check" size={16} className="shrink-0" />
                {status}
              </p>
              {compareReady && (
                <Link href="/compare-quotes" className="ml-6 mt-1 inline-block text-xs font-extrabold text-[#3c6b1d] underline">
                  Compare quotes →
                </Link>
              )}
            </div>
          )}
          {error && (
            <p className="flex items-center gap-2 text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <KIcon name="info" size={16} className="shrink-0" />
              {error}
            </p>
          )}

          <p className="flex items-start gap-1.5 text-xs text-[#1d3a5f]/55">
            <KIcon name="shieldCheck" size={14} className="shrink-0 mt-0.5" />
            Your number goes only to the businesses matched with your request. We never spam, sell or
            share it.
          </p>
        </div>
      </form>

      <TrustBar />
      </main>
    </div>
  );
}
