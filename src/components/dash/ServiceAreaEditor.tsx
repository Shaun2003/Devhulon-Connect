"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { setServiceAreas } from "@/lib/repo";
import { cleanServiceAreas } from "@/lib/portfolio";
import { limitsFor } from "@/lib/plans";
import { KIcon } from "@/lib/icons";

/**
 * Service-area editor (§9 / §10). Sellers type the suburbs they cover; the
 * PLAN decides how many — 1 on Starter, 2 on Professional, unlimited on
 * Business. The cap is enforced again by /api/business on the server, so this
 * helper text is guidance, not the guardrail.
 */
export default function ServiceAreaEditor({
  businessId,
  businessName,
  current,
  plan,
}: {
  businessId: string;
  businessName: string;
  current: string[];
  plan: string;
}) {
  const limit = limitsFor(plan).locations;
  const [raw, setRaw] = useState(current.join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const cleaned = cleanServiceAreas(raw);
  const over = limit !== null && cleaned.length > limit;

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const saved = await setServiceAreas(businessId, raw);
      setRaw(saved.join(", "));
      setNote(`Service areas updated — ${saved.length} ${saved.length === 1 ? "suburb" : "suburbs"} covered.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your areas.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="rounded-xl border border-[#e7eef5] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <b className="text-sm text-[#10243e]">{businessName}</b>
        <span className="text-xs text-[#1d3a5f]/60">
          {limit === null ? "unlimited areas" : `up to ${limit} ${limit === 1 ? "area" : "areas"} on your plan`}
        </span>
      </div>
      <label className="block text-sm font-bold text-[#10243e] mt-2">
        Suburbs you serve (comma separated)
        <input
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="e.g. Gauteng, Western Cape"
          className="mt-1 w-full rounded-2xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-4 py-2.5 text-sm font-normal bg-[#f2f6fa]/40 outline-none"
        />
      </label>
      {cleaned.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {cleaned.map((a) => (
            <span key={a} className="inline-flex items-center gap-1 text-[11px] font-bold bg-[#f2f6fa] text-[#10243e] rounded-full px-2.5 py-1">
              <KIcon name="mapPin" size={11} /> {a.replace(/-/g, " ")}
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 mt-3">
        <button disabled={busy || over} className="btn-hippo text-sm disabled:opacity-60">
          {busy ? "Saving…" : "Save areas"}
        </button>
        {over && (
          <span className="text-xs font-bold text-[#a36508] bg-[#fff4d6] rounded-2xl px-3 py-2">
            That&apos;s {cleaned.length} areas — your plan covers {limit}. Keep {limit} or{" "}
            <Link href="/advertise" className="underline">upgrade</Link>.
          </span>
        )}
        {error && <span className="text-xs font-bold text-red-700 bg-red-50 rounded-2xl px-3 py-2">{error}</span>}
        {note && <span className="text-xs font-bold text-[#3c6b1d] bg-[#e8f6d8] rounded-2xl px-3 py-2">{note}</span>}
      </div>
    </form>
  );
}
