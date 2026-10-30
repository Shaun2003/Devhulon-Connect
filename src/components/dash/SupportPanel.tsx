"use client";

import { useState, type FormEvent } from "react";
import { auth } from "@/lib/firebase";
import { hasCap, normalizePlanId } from "@/lib/plans";
import { SITE_SHORT } from "@/lib/site";

export default function SupportPanel({ plan }: { plan: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const priority = hasCap(normalizePlanId(plan), "prioritySupport");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(null); setMessage(null);
    const form = event.currentTarget;
    const fields = new FormData(form);
    try {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) throw new Error("Sign in to contact support.");
      const response = await fetch("/api/support", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ subject: fields.get("subject"), message: fields.get("message") }),
      });
      const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; ticketId?: string };
      if (!response.ok || result.ok !== true) throw new Error(result.error ?? "Could not submit your request.");
      form.reset();
      setMessage(`Support request ${result.ticketId} submitted${priority ? " with Business priority" : ""}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not submit your request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-[#e7eef5] bg-[#f8fafc] p-3 text-sm text-[#1d3a5f]/75">
        {priority
          ? "Your requests are marked as Premium priority for the support team. No response-time guarantee is implied."
          : `Send a support request to the ${SITE_SHORT} team. Premium plan requests are marked as priority.`}
      </div>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {message && <p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{message}</p>}
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm font-bold text-[#10243e]">
          Subject
          <input name="subject" required minLength={4} maxLength={120} className="mt-1 w-full rounded-xl border-2 border-[#e7eef5] px-3 py-2.5 font-normal" />
        </label>
        <label className="block text-sm font-bold text-[#10243e]">
          What do you need help with?
          <textarea name="message" required minLength={20} maxLength={3000} rows={6} className="mt-1 w-full rounded-xl border-2 border-[#e7eef5] px-3 py-2.5 font-normal" />
        </label>
        <button disabled={busy} className="btn-hippo text-sm disabled:opacity-50">{busy ? "Submitting…" : "Submit support request"}</button>
      </form>
    </section>
  );
}
