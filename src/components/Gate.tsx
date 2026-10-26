"use client";
import { KIcon } from "@/lib/icons";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import SignInModal from "@/components/SignInModal";
import { isFirebaseConfigured } from "@/lib/firebase";
import { SITE_SHORT } from "@/lib/site";

/**
 * Gate modes:
 *  - PUBLIC content (default): buyers browse everything WITHOUT an account.
 *    A soft sign-in nudge banner shows on top; content is never blocked.
 *  - seller: true → real gate (sign in as a seller to manage listings).
 */
export default function Gate({ children, seller = false }: { children: ReactNode; seller?: boolean }) {
  const { user, role, loading } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [err] = useState<string | null>(null);

  // ── Public mode: never block browsing ──────────────────────────────────
  if (!seller) {
    return (
      <>
        {!isFirebaseConfigured && (
          <div className="bg-[#fff4d6] text-[#a36508] text-xs font-bold text-center px-4 py-2">
            Demo mode — add NEXT_PUBLIC_FIREBASE_* to .env.local to go live.
          </div>
        )}
        {children}
      </>
    );
  }

  // ── Seller mode ─────────────────────────────────────────────────────────
  if (!isFirebaseConfigured) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <h2 className="text-3xl font-black text-[#10243e]">{SITE_SHORT} needs Firebase</h2>
        <p className="text-[#1d3a5f]/70 mt-3">
          Add your <code>NEXT_PUBLIC_FIREBASE_*</code> vars to <code>.env.local</code> and restart <code>npm run dev</code>.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-5 px-4 py-10 sm:py-14" role="status" aria-label="Loading seller access">
        <span className="sr-only">Loading seller access</span>
        <div className="hippo-hero animate-pulse space-y-3 rounded-3xl p-5 sm:p-8">
          <div className="h-3 w-24 rounded bg-white/20" />
          <div className="h-7 w-3/4 rounded bg-white/25" />
          <div className="h-3 w-full rounded bg-white/15" />
          <div className="h-3 w-5/6 rounded bg-white/15" />
        </div>
        <div className="hippo-card animate-pulse space-y-3 p-5 sm:p-6">
          <div className="h-5 w-1/3 rounded bg-[#d6e1ec]" />
          <div className="h-3 w-full rounded bg-[#e7eef5]" />
          <div className="h-10 rounded-full bg-[#e7eef5]" />
        </div>
      </div>
    );
  }

  if (user && role === "seller") return <>{children}</>;

  // Signed in but not a seller → offer the switch
  if (user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <h2 className="text-3xl font-black text-[#10243e]">Become a seller</h2>
        <p className="text-[#1d3a5f]/70 mt-3">List and manage businesses on {SITE_SHORT} — starts FREE.</p>
        <Link href="/register-seller" className="btn-hippo mt-6 inline-flex">
          Register as seller →
        </Link>
        <p className="text-xs text-[#1d3a5f]/50 mt-3">Your buyer features stay available in <Link href="/dashboard" className="font-bold text-[#558c2b] hover:underline">your dashboard</Link>.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-14">
      <div className="hippo-hero rounded-3xl p-5 text-center text-white anim-rise sm:p-8">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#ffc72c]">For sellers</p>
        <h2 className="mt-2 break-words text-2xl font-black tracking-tight sm:text-3xl">Sign in to list your business</h2>
        <p className="mt-2 break-words text-sm text-white/75">Sign in with email to create listings, receive leads and manage your plan. New sellers can start the complete registration from the sign-in form.</p>
      </div>
      {err && <p className="text-sm font-bold text-red-700 bg-red-50 rounded-2xl px-4 py-3 text-center mt-4">{err}</p>}
      <div className="hippo-card p-6 text-center mt-6">
        <span className="text-4xl"><KIcon name="building" size={14} className="inline shrink-0" /></span>
        <p className="font-extrabold text-[#10243e] text-lg mt-2">I&apos;m a Seller</p>
        <p className="text-sm text-[#1d3a5f]/70 mt-1">List my business &amp; get leads. Starts FREE — upgrade when the phone rings.</p>
        <button onClick={() => setShowModal(true)} className="btn-hippo w-full mt-4 text-sm">
          Sign in as Seller →
        </button>
      </div>
      <p className="text-xs text-[#1d3a5f]/50 text-center mt-6">
        Just browsing? Everything on {SITE_SHORT} is open — no account needed.
      </p>
      <SignInModal open={showModal} onClose={() => setShowModal(false)} presetRole="seller" />
    </div>
  );
}