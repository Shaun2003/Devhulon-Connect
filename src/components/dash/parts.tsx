"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { listenerHint, type RealtimeError } from "@/lib/realtime";
import SignInModal from "@/components/SignInModal";

/** Shared dashboard panel — live badge + count + children. */
export function Panel({ title, count, live = false, loading = false, children }: { title: string; count?: number; live?: boolean; loading?: boolean; children: ReactNode }) {
  return (
    <section className="hippo-card min-w-0 p-4 sm:p-5">
      <h2 className="flex flex-wrap items-center gap-x-2 gap-y-1 font-black text-[#10243e] break-words">
        {title}{!loading && typeof count === "number" ? ` (${count})` : ""} {live && <span className="chip-live">Live</span>}
      </h2>
      {loading ? (
        <div className="mt-4 space-y-3" role="status" aria-label={`Loading ${title}`}>
          <span className="sr-only">Loading {title}</span>
          {[0, 1, 2].map((item) => (
            <div key={item} className="animate-pulse rounded-xl border border-[#e7eef5] p-3">
              <div className="h-3 w-2/3 rounded bg-[#e7eef5]" />
              <div className="mt-2 h-2.5 w-1/2 rounded bg-[#f2f6fa]" />
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 min-w-0 space-y-2">{children}</div>
      )}
    </section>
  );
}

export function DashboardSkeleton({ title = "Loading your dashboard" }: { title?: string }) {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 sm:px-6 sm:py-8" role="status" aria-label={title}>
      <span className="sr-only">{title}</span>
      <div className="animate-pulse space-y-2">
        <div className="h-3 w-32 rounded bg-[#d6e1ec]" />
        <div className="h-8 w-2/3 max-w-md rounded bg-[#e7eef5]" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="hippo-card animate-pulse space-y-3 p-4 sm:p-5">
            <div className="h-4 w-1/2 rounded bg-[#d6e1ec]" />
            {[0, 1, 2].map((line) => (
              <div key={line} className="rounded-xl border border-[#e7eef5] p-3">
                <div className="h-3 w-2/3 rounded bg-[#e7eef5]" />
                <div className="mt-2 h-2.5 w-1/2 rounded bg-[#f2f6fa]" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function EmptyLine({ what, ctaHref, ctaLabel }: { what: string; ctaHref?: string; ctaLabel?: string }) {
  return (
    <p className="text-sm text-[#1d3a5f]/60">
      {what}{" "}
      {ctaHref && ctaLabel && <Link href={ctaHref} className="font-bold text-[#558c2b] hover:underline">{ctaLabel} </Link>}
    </p>
  );
}

/** Actionable realtime error note (rules / index / config). */
export function ErrorNote({ error }: { error: RealtimeError | null }) {
  if (!error) return null;
  return <p className="text-xs font-bold text-[#a36508] bg-[#fff4d6] rounded-2xl px-3 py-2">{listenerHint(error)}</p>;
}

export function SignInInline() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-hippo text-sm">Sign in / Create account </button>
      <SignInModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}