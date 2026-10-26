"use client";
import { useState, type FormEvent } from "react";
import { submitReview } from "@/lib/repo";

export default function ReviewForm({ businessId }: { businessId: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Capture the form node BEFORE awaiting (React nulls e.currentTarget after yield).
    const formEl = e.currentTarget;
    setMsg(null);
    setErr(null);
    setBusy(true);
    const fd = new FormData(formEl);
    try {
      await submitReview(businessId, String(fd.get("author") ?? "Anonymous"), Number(fd.get("rating") ?? 5), String(fd.get("body") ?? ""));
      setMsg("Thanks! Your review is live below.");
      formEl.reset();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not submit review. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={onSubmit} className="rounded-2xl border bg-white p-5 space-y-3">
      <h2 className="font-bold">Leave a review</h2>
      <div className="grid sm:grid-cols-2 gap-3">
        <input name="author" maxLength={80} placeholder="Your name" className="rounded-xl border px-3 py-2 text-sm" />
        <select name="rating" className="rounded-xl border px-3 py-2 text-sm" defaultValue="5">
          {[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{r} stars</option>)}
        </select>
      </div>
      <textarea name="body" required minLength={3} maxLength={2000} rows={3} placeholder="How was the service, price, punctuality?" className="w-full rounded-xl border px-3 py-2 text-sm" />
      <button disabled={busy} className="rounded-xl bg-green-800 text-white text-sm font-bold px-4 py-2.5 disabled:opacity-50">{busy ? "Submitting…" : "Submit review"}</button>
      {msg && <p className="text-sm font-semibold text-green-800">{msg}</p>}
      {err && <p className="text-sm font-semibold text-red-700">{err}</p>}
    </form>
  );
}
