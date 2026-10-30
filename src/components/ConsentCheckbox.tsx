"use client";

import Link from "next/link";
import { CONSENT_VERSION } from "@/lib/legal";

/**
 * Explicit, unticked POPIA consent checkbox.
 *
 * Why this exists and why it is NOT a "by continuing you agree" line: a buyer
 * request hands their phone number, name and email to up to five independent
 * businesses. That is a disclosure to third parties, and POPIA requires it to rest
 * on specific, informed, unambiguous consent captured AT THE POINT of collection.
 * A link in a terms page is not that. The tick is also genuinely required, not
 * decorative — the server refuses the request without it.
 *
 * `error` is wired so a rejected submit explains WHY rather than silently
 * failing, which is the difference between a consent prompt people respect and
 * one they learn to dismiss.
 */
export default function ConsentCheckbox({
  name = "consent",
  checked,
  onChange,
  label,
  detail,
  error,
  onInvalid,
}: {
  name?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  detail: string;
  error?: string | null;
  onInvalid?: () => void;
}) {
  return (
    <div className={`rounded-2xl border p-3 ${error ? "border-red-300 bg-red-50" : "border-[#d6e1ec] bg-[#f7fafc]"}`}>
      <label className="flex items-start gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          name={name}
          required
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          onInvalid={() => onInvalid?.()}
          aria-required="true"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${name}-error` : undefined}
          className="mt-0.5 w-4 h-4 shrink-0 accent-[#558c2b]"
        />
        <span className="text-xs text-[#10243e] leading-snug">
          <b>{label} <span className="font-black text-red-600" aria-hidden="true">*</span></b>{" "}
          <span className="text-[#1d3a5f]/70">{detail}</span>{" "}
          <Link href="/privacy-policy" className="font-bold text-[#558c2b] hover:underline">
            Privacy Policy
          </Link>
          .
        </span>
      </label>
      {error && <p id={`${name}-error`} className="text-xs font-bold text-red-700 mt-2" role="alert">{error}</p>}
      <p className="text-[10px] text-[#1d3a5f]/45 mt-2">Consent version {CONSENT_VERSION}</p>
    </div>
  );
}