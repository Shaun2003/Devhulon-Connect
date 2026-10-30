"use client";
import { use, useState, type FormEvent } from "react";
import { matchProRequest, submitLead } from "@/lib/repo";
import { slugify } from "@/lib/utils";
import Link from "next/link";
import { matchCategory } from "@/lib/matching";
import { CATEGORY_GROUPS, SERVICE_GROUPS } from "@/data/taxonomy";
import { TrustBar, PageHero } from "@/components/ui";
import ConsentCheckbox from "@/components/ConsentCheckbox";
import { LEAD_CONSENT_DETAIL, LEAD_CONSENT_LABEL } from "@/lib/legal";
import { KIcon } from "@/lib/icons";
import { PlaceSuggestions } from "@/components/SearchBar";
import { trackAnalyticsEvent } from "@/lib/track-analytics";
import { FieldLabel, RequiredFieldsLegend } from "@/components/forms/FormFields";
import { useAuth } from "@/components/AuthProvider";
import { SignInInline } from "@/components/dash/parts";

export default function RequestQuotePage({ searchParams }: { searchParams: Promise<{ business?: string; need?: string; suburb?: string; category?: string }> }) {
  const sp = use(searchParams);
  const { user, loading } = useAuth();
  const businessId = (sp.business ?? "").trim();
  const initialNeed = (sp.need ?? "").trim();
  const initialCategory = sp.category && CATEGORY_GROUPS[sp.category]
    ? sp.category
    : matchCategory(initialNeed)?.slug;
  const initialServiceGroup = SERVICE_GROUPS.find((group) => group.slug === sp.category)?.slug
    ?? (initialCategory ? CATEGORY_GROUPS[initialCategory] ?? "" : "");
  const [status, setStatus] = useState<string | null>(null);
  const [compareReady, setCompareReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // POPIA consent to disclose the entered details to matched businesses. Required by
  // the server, so this is a real gate rather than a courtesy line.
  const [consent, setConsent] = useState(false);
  const [consentErr, setConsentErr] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Capture the form node BEFORE awaiting (React nulls e.currentTarget after yield).
    const formEl = e.currentTarget;
    const invalidFields = Array.from(formEl.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select"))
      .filter((field) => field.name !== "consent" && !field.disabled && !field.validity.valid);
    if (invalidFields.length > 0) {
      const errors = Object.fromEntries(invalidFields.map((field) => [field.name, field.validationMessage || "Check this field."]));
      setFieldErrors(errors);
      invalidFields[0].focus();
      return;
    }
    setFieldErrors({});
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
      const selectedServiceGroup = businessId ? undefined : String(fd.get("serviceGroupSlug") ?? "");
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
        setStatus(`Sent! Ref ${res.id}. You'll get a notification when the business replies. Check your notifications or compare quotes.`);
        setCompareReady(true);
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
      const serviceSelect = formEl.querySelector<HTMLSelectElement>('select[name="serviceGroupSlug"]');
      if (serviceSelect) serviceSelect.value = "";
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

  if (loading || !user) {
    return (
      <div className="min-h-screen">
        <PageHero
          kicker="Free · 60 seconds · no spam"
          title="Request a free quote"
          sub="Sign in or create a free buyer account so you can track your request and get notified when businesses reply."
          icon="file"
          crumbs={[{ label: "Home", href: "/" }, { label: "Request a quote" }]}
        />
        <main className="mx-auto max-w-2xl px-4 py-10">
          {loading ? (
            <div className="hippo-card animate-pulse space-y-3 p-6" role="status" aria-label="Checking your account">
              <span className="sr-only">Checking your account</span>
              <div className="h-5 w-2/3 rounded bg-[#e7eef5]" />
              <div className="h-4 w-full rounded bg-[#f2f6fa]" />
              <div className="h-10 w-40 rounded-xl bg-[#e7eef5]" />
            </div>
          ) : (
            <section className="hippo-card space-y-4 p-6 text-center">
              <span className="icon-3d icon-3d-sm mx-auto" aria-hidden="true"><KIcon name="bell" size={24} /></span>
              <h2 className="text-xl font-black text-[#10243e]">Sign in to request a quote</h2>
              <p className="text-sm text-[#1d3a5f]/70">
                Your account keeps your requests and seller replies together. We&apos;ll notify you when a business sends a quote, and you can compare every reply from your quote page.
              </p>
              <SignInInline />
            </section>
          )}
        </main>
      </div>
    );
  }

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
      <main className="max-w-6xl mx-auto px-4 py-10 space-y-6">

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
            noValidate
            onInvalidCapture={(event) => {
              const field = event.target;
              if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) {
                setFieldErrors((current) => ({ ...current, [field.name]: field.validationMessage }));
              }
            }}
            onInputCapture={(event) => {
              const field = event.target;
              if ((field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) && field.validity.valid) {
                setFieldErrors((current) => {
                  const next = { ...current };
                  delete next[field.name];
                  return next;
                });
              }
            }}
            className="bg-white rounded-3xl border border-[#e7eef5] shadow-sm p-5 sm:p-8 space-y-6"
          >
            <RequiredFieldsLegend />
            <section>
          <h2 className="flex items-center gap-2.5 text-base font-black text-[#10243e] pb-3 border-b border-[#e7eef5]">
            <span className="icon-3d icon-3d-xs" aria-hidden>
              <KIcon name="search" size={16} />
            </span>
            What do you need?
          </h2>
          <div className="space-y-4 mt-4">
            {!businessId && (
              <FieldLabel label="Service" required error={fieldErrors.serviceGroupSlug}>
                <select
                  name="serviceGroupSlug"
                  required
                  defaultValue={initialServiceGroup}
                  aria-invalid={Boolean(fieldErrors.serviceGroupSlug)}
                  aria-describedby={fieldErrors.serviceGroupSlug ? "field-error-service" : undefined}
                  onChange={() => {
                    setFieldErrors((current) => {
                      const next = { ...current };
                      delete next.serviceGroupSlug;
                      return next;
                    });
                  }}
                  className="mt-1.5 w-full cursor-pointer rounded-xl border-2 border-[#e7eef5] bg-white px-4 py-3 text-sm font-normal outline-none transition-colors focus:border-[#7ac142]"
                >
                  <option value="">Choose the service you need</option>
                  {SERVICE_GROUPS.map((group) => (
                    <option key={group.slug} value={group.slug}>{group.name}</option>
                  ))}
                </select>
              </FieldLabel>
            )}
            <FieldLabel label="Describe the job" required error={fieldErrors.need}>
              <textarea
                required
                name="need"
                minLength={2}
                aria-invalid={Boolean(fieldErrors.need)}
                aria-describedby={fieldErrors.need ? "field-error-describe-the-job" : undefined}
                rows={3}
                defaultValue={initialNeed}
                placeholder="e.g. Need a reliable plumber to fix a burst geyser…"
                className="mt-1.5 w-full rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-4 py-3 text-sm font-normal outline-none transition-colors resize-none"
              />
            </FieldLabel>
            <div className="grid sm:grid-cols-2 gap-4">
            <FieldLabel label="Suburb / area"
              hint="This helps prioritise nearby pros; remote services can match across locations."
            >
              <input
                name="suburb"
                list="sa-request-quote-places"
                defaultValue={sp.suburb ?? ""}
                placeholder="e.g. Gauteng or 0157"
                className="mt-1.5 w-full rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-4 py-3 text-sm font-normal outline-none transition-colors"
              />
            </FieldLabel>
              <FieldLabel label="When do you need it?">
                <select
                  name="timeline"
                  className="mt-1.5 w-full rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-4 py-3 text-sm font-normal bg-white outline-none transition-colors cursor-pointer"
                >
                  <option value="ASAP">As soon as possible</option>
                  <option value="Within a few days">Within a few days</option>
                  <option value="Within a week">Within a week</option>
                  <option value="Flexible">I&apos;m flexible</option>
                </select>
              </FieldLabel>
            </div>
            <FieldLabel label="Your budget" error={fieldErrors.budget}
              hint="Sellers can see your budget on the lead preview before unlocking your contact details."
            >
              <span className="mt-1.5 flex items-center rounded-xl border-2 border-[#e7eef5] focus-within:border-[#7ac142] px-4">
                <span className="text-sm text-[#1d3a5f]/60">R</span>
                <input
                  name="budget"
                  type="number"
                  min="1"
                  max="5000000"
                  step="1"
                  inputMode="numeric"
                  aria-invalid={Boolean(fieldErrors.budget)}
                  aria-describedby={fieldErrors.budget ? "field-error-your-budget" : undefined}
                  placeholder="e.g. 5000"
                  className="w-full px-2 py-3 text-sm font-normal outline-none"
                />
              </span>
            </FieldLabel>
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
            <FieldLabel label="Full name" required error={fieldErrors.name}>
              <input
                required
                name="name"
                minLength={2}
                aria-invalid={Boolean(fieldErrors.name)}
                placeholder="Thandi Mokoena"
                className="mt-1.5 w-full rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-4 py-3 text-sm font-normal outline-none transition-colors"
              />
            </FieldLabel>
            <FieldLabel label="Email" required error={fieldErrors.email}>
              <input
                required
                name="email"
                type="email"
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? "field-error-email" : undefined}
                placeholder="you@example.co.za"
                className="mt-1.5 w-full rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-4 py-3 text-sm font-normal outline-none transition-colors"
              />
            </FieldLabel>
            </div>
            <FieldLabel label="Phone / WhatsApp" required error={fieldErrors.phone}>
              <input
                required
                name="phone"
                type="tel"
                minLength={6}
                aria-invalid={Boolean(fieldErrors.phone)}
                aria-describedby={fieldErrors.phone ? "field-error-phone-whatsapp" : undefined}
                placeholder="082 123 4567"
                className="mt-1.5 w-full rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-4 py-3 text-sm font-normal outline-none transition-colors"
              />
            </FieldLabel>
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
          onInvalid={() => setConsentErr("Consent is required before we can share your details with matched businesses.")}
        />

        <div className="pt-2 space-y-3">
          <button
            disabled={busy}
            className="w-full bg-[#10243e] hover:bg-[#1d3a5f] text-white font-black text-base rounded-xl !py-4 disabled:opacity-60 transition-colors inline-flex items-center justify-center gap-2"
          >
            {busy ? "Sending…" : "Get my quotes — free"}
          </button>

          {status && (
            <div className="text-sm font-bold text-[#3c6b1d] bg-[#e8f6d8] border border-[#3c6b1d]/20 rounded-xl px-4 py-3">
              <p className="flex items-center gap-2">
                <KIcon name="check" size={16} className="shrink-0" />
                {status}
              </p>
              {compareReady && (
                <Link href="/compare-quotes" className="ml-6 mt-1 inline-block text-xs font-extrabold text-[#3c6b1d] underline">
                  Compare quotes 
                </Link>
              )}
            </div>
          )}
          {error && (
            <p role="alert" className="flex items-center gap-2 text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
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
