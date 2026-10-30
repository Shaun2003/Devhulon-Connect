"use client";
import { useState, type FormEvent } from "react";
import { submitQuote } from "@/lib/repo";
import { QUOTE_LIMITS, cleanQuoteDraft, validateQuote } from "@/lib/quotes";
import { formatZAR } from "@/lib/plans";
import { KIcon } from "@/lib/icons";
import { useAuth } from "@/components/AuthProvider";
import SignInModal from "@/components/SignInModal";

const inputCls =
  "mt-1 w-full rounded-2xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-4 py-3 text-sm font-normal bg-[#f2f6fa]/40 outline-none";

type QuoteTemplate = {
  id: string;
  label: string;
  price: string;
  vatIncluded: boolean;
  duration: string;
  availability: string;
  message: string;
  inclusions: string;
  exclusions: string;
  warranty: string;
  attachments: string;
};

function isQuoteTemplate(value: unknown): value is QuoteTemplate {
  if (typeof value !== "object" || value === null) return false;
  const template = value as Partial<QuoteTemplate>;
  return (
    typeof template.id === "string" &&
    typeof template.label === "string" &&
    typeof template.price === "string" &&
    typeof template.vatIncluded === "boolean" &&
    typeof template.duration === "string" &&
    typeof template.availability === "string" &&
    typeof template.message === "string" &&
    typeof template.inclusions === "string" &&
    typeof template.exclusions === "string" &&
    typeof template.warranty === "string" &&
    typeof template.attachments === "string"
  );
}

/**
 * Seller quote composer (§16). Renders on a request the seller has ACCEPTED —
 * accept-first is what makes every quote on KASI a real, accountable reply.
 * Validation mirrors firestore.rules, so nothing is silently rejected.
 */
export default function QuoteComposer({
  leadId,
  requestSummary,
  onSent,
}: {
  leadId: string;
  requestSummary?: string;
  onSent?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [price, setPrice] = useState("");
  const [vatIncluded, setVatIncluded] = useState(true);
  const [duration, setDuration] = useState("");
  const [availability, setAvailability] = useState("");
  const [message, setMessage] = useState("");
  const [inclusions, setInclusions] = useState("");
  const [exclusions, setExclusions] = useState("");
  const [warranty, setWarranty] = useState("");
  const [attachments, setAttachments] = useState("");
  const { user } = useAuth();
  const [signInOpen, setSignInOpen] = useState(false);
  const [templates, setTemplates] = useState<QuoteTemplate[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");

  function openComposer() {
    setError(null);
    if (user?.uid) {
      try {
        const raw = window.localStorage.getItem(`kasi-quote-templates:${user.uid}`);
        const parsed: unknown = raw === null ? [] : JSON.parse(raw);
        if (!Array.isArray(parsed)) throw new Error("Saved quote templates have an invalid format.");
        setTemplates(parsed.filter(isQuoteTemplate).slice(-10));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load saved quote templates.");
      }
    }
    setOpen(true);
  }

  function toggleComposer() {
    if (open) {
      setOpen(false);
      setError(null);
    } else {
      openComposer();
    }
  }

  function quoteTemplateValues(): Omit<QuoteTemplate, "id" | "label"> {
    return {
      price,
      vatIncluded,
      duration,
      availability,
      message,
      inclusions,
      exclusions,
      warranty,
      attachments,
    };
  }

  function applyTemplate(id: string) {
    const template = templates.find((item) => item.id === id);
    if (!template) return;
    setSelectedTemplate(id);
    setPrice(template.price);
    setVatIncluded(template.vatIncluded);
    setDuration(template.duration);
    setAvailability(template.availability);
    setMessage(template.message);
    setInclusions(template.inclusions);
    setExclusions(template.exclusions);
    setWarranty(template.warranty);
    setAttachments(template.attachments);
    setError(null);
  }

  function saveTemplate() {
    const label = templateName.trim().slice(0, 50);
    if (!user?.uid) {
      setError("Sign in again to save a quote template.");
      return;
    }
    if (!label) {
      setError("Enter a name for this quote template.");
      return;
    }
    const template: QuoteTemplate = {
      id: Date.now().toString(36),
      label,
      ...quoteTemplateValues(),
    };
    const next = [
      ...templates.filter((item) => item.label.toLowerCase() !== label.toLowerCase()),
      template,
    ].slice(-10);
    try {
      window.localStorage.setItem(`kasi-quote-templates:${user.uid}`, JSON.stringify(next));
      setTemplates(next);
      setSelectedTemplate(template.id);
      setTemplateName("");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this quote template in your browser.");
    }
  }

  function deleteTemplate() {
    if (!user?.uid || !selectedTemplate) return;
    const next = templates.filter((item) => item.id !== selectedTemplate);
    try {
      window.localStorage.setItem(`kasi-quote-templates:${user.uid}`, JSON.stringify(next));
      setTemplates(next);
      setSelectedTemplate("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete this quote template.");
    }
  }

  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const issues = validateQuote({ price, duration, message });
    if (issues.length > 0) { setError(issues[0]); return; }
    setBusy(true);
    setError(null);
    try {
      const clean = cleanQuoteDraft({
        price, vatIncluded, duration, availability, message,
        inclusions, exclusions, warranty, attachments,
      });
      await submitQuote({ leadId, ...clean });
      setDone(`Quote sent — ${formatZAR(clean.price)}${clean.vatIncluded ? " incl. VAT" : " excl. VAT"}`);
      setPrice(""); setDuration(""); setAvailability(""); setMessage("");
      setInclusions(""); setExclusions(""); setWarranty(""); setAttachments("");
      setOpen(false);
      onSent?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the quote.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-[#e7eef5] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="block text-sm font-bold text-[#10243e] min-w-0">{requestSummary ?? "This request"}</span>
        <button
          type="button"
          onClick={() => {
            if (!user?.uid) {
              setSignInOpen(true);
              return;
            }
            toggleComposer();
          }}
          className="ml-auto text-xs font-extrabold text-[#558c2b] hover:underline"
          aria-expanded={open}
        >
          {!user?.uid ? "Sign in to send a quote" : open ? "Close" : done ? "Send another quote" : "Send a quote "}
        </button>
      </div>

      {done && !open && (
        <p className="mt-2 text-xs font-bold text-[#3c6b1d] bg-[#e8f6d8] rounded-2xl px-3 py-2 inline-flex items-center gap-1.5">
          <KIcon name="badgeCheck" size={14} /> {done}
        </p>
      )}
      {error && !open && <p className="mt-2 text-xs font-bold text-red-700 bg-red-50 rounded-2xl px-3 py-2">{error}</p>}

      {open && (
        <form onSubmit={send} className="mt-3 space-y-3">
          <div className="rounded-xl bg-[#f2f6fa] p-3 space-y-2">
            <label className="block text-xs font-extrabold text-[#10243e]">
              Reuse a quote template
              <select
                value={selectedTemplate}
                onChange={(event) => {
                  if (event.target.value) applyTemplate(event.target.value);
                  else {
                    setSelectedTemplate("");
                    setPrice("");
                    setVatIncluded(true);
                    setDuration("");
                    setAvailability("");
                    setMessage("");
                    setInclusions("");
                    setExclusions("");
                    setWarranty("");
                    setAttachments("");
                  }
                }}
                className="mt-1 w-full rounded-xl border border-[#d6e1ec] bg-white px-3 py-2 text-sm font-normal"
              >
                <option value="">Start with a blank quote</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>{template.label}</option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
                maxLength={50}
                aria-label="Quote template name"
                placeholder="Name this quote template"
                className="min-w-0 flex-1 rounded-xl border border-[#d6e1ec] bg-white px-3 py-2 text-xs"
              />
              <button type="button" onClick={saveTemplate} className="rounded-xl border border-[#10243e] px-3 py-2 text-xs font-bold text-[#10243e]">
                Save template
              </button>
              {selectedTemplate && (
                <button type="button" onClick={deleteTemplate} className="rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-700">
                  Delete
                </button>
              )}
            </div>
            <p className="text-[10px] text-[#1d3a5f]/60">
              Templates are saved in this browser for your account and do not sync to other devices.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block text-sm font-bold text-[#10243e]">
              Your price (R) *
              <input
                required
                name="price"
                inputMode="numeric"
                value={price}
                onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))}
                placeholder="e.g. 1850"
                className={inputCls}
              />
              <span className="block text-[11px] font-normal text-[#1d3a5f]/60 mt-1">Whole rands — no spaces, no “R”.</span>
            </label>
            <label className="block text-sm font-bold text-[#10243e]">
              Estimated duration *
              <input required value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="e.g. 2–3 days" maxLength={QUOTE_LIMITS.duration} className={inputCls} />
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm font-bold text-[#10243e]">
            <input type="checkbox" checked={vatIncluded} onChange={(e) => setVatIncluded(e.target.checked)} className="w-4 h-4 accent-[#7ac142]" />
            Price includes VAT
          </label>

          <label className="block text-sm font-bold text-[#10243e]">
            Earliest availability
            <input value={availability} onChange={(e) => setAvailability(e.target.value)} placeholder="e.g. Tue 23 Sep, mornings" maxLength={QUOTE_LIMITS.availability} className={inputCls} />
          </label>

          <label className="block text-sm font-bold text-[#10243e]">
            Message to the buyer *
            <textarea
              required
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, QUOTE_LIMITS.message))}
              placeholder="Explain what you'll do, how you'll do it and any assumptions."
              className={inputCls}
            />
            <span className="block text-[11px] font-normal text-[#1d3a5f]/60 mt-1">{message.length}/{QUOTE_LIMITS.message}</span>
          </label>

          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block text-sm font-bold text-[#10243e]">
              Included (one per line)
              <textarea rows={3} value={inclusions} onChange={(e) => setInclusions(e.target.value)} placeholder={"Materials\nLabour\nClean-up"} className={inputCls} />
            </label>
            <label className="block text-sm font-bold text-[#10243e]">
              Not included (one per line)
              <textarea rows={3} value={exclusions} onChange={(e) => setExclusions(e.target.value)} placeholder={"Old-part removal\nAfter-hours callouts"} className={inputCls} />
            </label>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block text-sm font-bold text-[#10243e]">
              Warranty / guarantee
              <input value={warranty} onChange={(e) => setWarranty(e.target.value)} placeholder="e.g. 12-month workmanship guarantee" maxLength={QUOTE_LIMITS.warranty} className={inputCls} />
            </label>
            <label className="block text-sm font-bold text-[#10243e]">
              Attachment links (optional)
              <textarea rows={2} value={attachments} onChange={(e) => setAttachments(e.target.value)} placeholder="https://… (photos, draft quote PDF)" className={inputCls} />
              <span className="block text-[11px] font-normal text-[#1d3a5f]/60 mt-1">https:// links only — max {QUOTE_LIMITS.attachments}.</span>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button disabled={busy} className="btn-hippo text-sm disabled:opacity-60">
              {busy ? "Sending…" : "Send quote to buyer "}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-sm font-bold text-[#1d3a5f]/70 hover:underline">
              Cancel
            </button>
            {error && <span className="text-xs font-bold text-red-700 bg-red-50 rounded-2xl px-3 py-2">{error}</span>}
          </div>
          <p className="text-[11px] text-[#1d3a5f]/60">
            The buyer sees this beside every other quote on the request. They choose — we never rank a winner.
          </p>

        </form>
      )}
      <SignInModal open={signInOpen} onClose={() => setSignInOpen(false)} presetRole="seller" />
    </div>
  );
}
