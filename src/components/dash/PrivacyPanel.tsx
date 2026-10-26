"use client";

import { useState } from "react";
import Link from "next/link";
import { auth } from "@/lib/firebase";
import { KIcon } from "@/lib/icons";
import { REDACTED } from "@/lib/legal";

/**
 * POPIA self-service erasure control.
 *
 * The privacy policy promises a user can remove their own personal data without
 * emailing anyone. This is that promise, made real: it calls
 * POST /api/privacy/erase, which identifies the caller from their verified ID
 * token (never a body field) and anonymises their records server-side.
 *
 * Why this is a deliberate, confirmed action rather than a link: erasure is
 * irreversible for the personal fields, and it can leave a seller with an
 * anonymised (not deleted) commercial record. A user who clicks without reading
 * cannot undo that, so the confirm states the consequence in plain words.
 *
 * It also re-checks that the user is actually signed in before firing, because the
 * endpoint rejects an absent token — a 401 with no explanation is the worst
 * possible outcome for someone who just asked to be forgotten.
 */
export default function PrivacyPanel({ onErased }: { onErased?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function erase() {
    setError(null);
    const ok = confirm(
      "Erase your personal data?\n\n" +
        "Your name, phone number and email will be removed from every quote request you made, " +
        "and your reviews will be anonymised (your name replaced, account link cleared).\n\n" +
        "We keep the commercial record only in anonymised form — that a request existed and was " +
        "won or lost — because it no longer identifies you.\n\n" +
        "This cannot be undone.",
    );
    if (!ok) return;

    setBusy(true);
    try {
      // Fail fast with a clear message rather than letting the server 401 opaquely.
      if (!auth?.currentUser) {
        setError("Your session has expired. Sign in again, then run erasure.");
        setBusy(false);
        return;
      }
      const token = await auth.currentUser.getIdToken();
      const res = await fetch("/api/privacy/erase", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: "{}",
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string };
      if (!res.ok || json.ok === false) throw new Error(json.error ?? "Erasure failed. Please try again.");
      setDone(json.message ?? "Your personal details have been erased.");
      onErased?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erasure failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="hippo-card p-5" aria-label="Privacy and your data">
      <h2 className="font-black text-[#10243e] flex items-center gap-2">
        <KIcon name="shieldCheck" size={18} className="text-[#558c2b]" />
        Privacy &amp; your data
      </h2>
      <p className="text-xs text-[#1d3a5f]/70 mt-1">
        Under POPIA you can ask us to remove your personal information at any time — you don&apos;t
        need to email anyone and wait. We anonymise rather than delete, so businesses keep a record
        of the job that no longer identifies you.
      </p>

      {done ? (
        <p className="mt-3 rounded-2xl bg-[#e8f6d8] border border-[#3c6b1d]/20 px-4 py-3 text-sm font-bold text-[#3c6b1d]">
          {done}
        </p>
      ) : (
        <button
          onClick={erase}
          disabled={busy}
          className="mt-3 text-sm font-bold border-2 border-red-200 text-red-700 rounded-full px-4 py-2 hover:bg-red-50 disabled:opacity-60"
        >
          {busy ? "Erasing…" : "Erase my personal data"}
        </button>
      )}

      {error && <p className="mt-2 text-sm font-bold text-red-700">{error}</p>}

      <p className="mt-3 text-[11px] text-[#1d3a5f]/50">
        Names are replaced with &ldquo;{REDACTED}&rdquo;. Need something else corrected instead?{" "}
        <Link href="/contact" className="font-bold text-[#558c2b] hover:underline">
          Contact us
        </Link>
        .
      </p>
    </section>
  );
}