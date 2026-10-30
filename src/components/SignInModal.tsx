"use client";
import { KIcon } from "@/lib/icons";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useAuth, type Role } from "@/components/AuthProvider";
import { SITE_SHORT } from "@/lib/site";
import { RequiredFieldsLegend } from "@/components/forms/FormFields";
import {
  ROLE_TERMS_PATH,
  SIGNUP_TERMS_DETAIL,
  SIGNUP_TERMS_LABEL,
} from "@/lib/legal";

/**
 * Records terms acceptance for the signed-in caller.
 *
 * Best-effort by design: the account already exists by the time this runs, so a
 * failure here must not trap the user in a broken modal. The acceptance is
 * recorded on the NEXT visit if it fails now, and a person who cannot sign in is a
 * far worse outcome than a missing evidence row.
 */
async function recordTermsAcceptance(role: "buyer" | "seller") {
  try {
    const user = (await import("@/lib/firebase")).auth?.currentUser;
    if (!user) return;
    const token = await user.getIdToken();
    await fetch("/api/legal/accept-terms", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ role }),
    });
  } catch {
    /* never block sign-in on this */
  }
}

function friendly(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (/invalid-credential|wrong-password|user-not-found/i.test(raw)) return "Wrong email or password.";
  if (/email-already-in-use/i.test(raw)) return "That email already has an account — switch to Sign in.";
  if (/weak-password/i.test(raw)) return "Password too weak — use at least 6 characters.";
  if (/invalid-email/i.test(raw)) return "That email address doesn't look right.";
  if (/popup-closed|cancelled|popup-blocked/i.test(raw)) return "Google sign-in didn't finish — try again or use email below.";
  if (/unauthorized-domain/i.test(raw)) return "This domain isn't authorised in Firebase Auth → Settings → Authorized domains.";
  if (/too-many-requests/i.test(raw)) return "Too many attempts — wait a minute and try again.";
  return raw;
}

/**
 * Sign-in modal: asks Buyer or Seller first, then the supported sign-in methods.
 * presetRole skips the chooser (e.g. the seller gate).
 */
export default function SignInModal({ open, onClose, presetRole }: { open: boolean; onClose: () => void; presetRole?: Role }) {
  const router = useRouter();
  const { signIn, signInSellerGoogle, signInSellerEmail, signInEmail, resetPassword } = useAuth();
  const [role, setRole] = useState<Role>(presetRole ?? null);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  // "reset" replaces the form with the forgot-password flow (spec §46).
  // "verify" is the post-signup panel telling new users to check their inbox.
  const [panel, setPanel] = useState<"form" | "reset" | "verify">("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Terms acceptance, signup only. Starts UNCHECKED every time the modal opens —
  // a pre-ticked box is not consent, it is a formality that looks like consent.
  const [agreed, setAgreed] = useState(false);

  if (!open) return null;

  function openSellerRegistration() {
    onClose();
    router.push("/register-seller");
  }

  async function google() {
    if (!role) return;
    if (role === "seller" && mode !== "signin") return;
    if (mode === "signup" && !agreed) {
      setErr("Please accept the terms to create an account.");
      return;
    }
    setBusy(true); setErr(null);
    try {
      if (role === "seller") {
        await signInSellerGoogle();
      } else {
        await signIn(role);
        if (mode === "signup") await recordTermsAcceptance(role);
      }
      onClose();
    } catch (e) { setErr(friendly(e)); } finally { setBusy(false); }
  }
  async function emailSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const invalidField = Array.from(e.currentTarget.querySelectorAll<HTMLInputElement>("input"))
      .find((field) => !field.disabled && !field.validity.valid);
    if (invalidField) {
      invalidField.setAttribute("aria-invalid", "true");
      invalidField.setAttribute("aria-describedby", "auth-error");
      setErr(`${invalidField.labels?.[0]?.innerText.replace("*", "").trim() ?? "This field"}: ${invalidField.validationMessage || "Check this field."}`);
      invalidField.focus();
      return;
    }
    if (!role) return;
    if (role === "seller" && mode === "signup") {
      openSellerRegistration();
      return;
    }
    // Signup ONLY. Requiring a tick on every sign-in would train people to click
    // it without reading — which destroys the evidentiary value of the record.
    if (mode === "signup" && !agreed) {
      setErr("Please accept the terms to create an account.");
      return;
    }
    setBusy(true); setErr(null);
    try {
      if (role === "seller" && mode === "signin") {
        await signInSellerEmail(email, password);
      } else {
        await signInEmail(role, email, password, mode);
      }
      if (mode === "signup") {
        // Stay open on the verification panel — the account is created, but the
        // user should know a confirmation email is on its way.
        setPanel("verify");
      } else {
        onClose();
      }
    } catch (e2) { setErr(friendly(e2)); } finally { setBusy(false); }
  }
  async function resetSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const invalidField = Array.from(e.currentTarget.querySelectorAll<HTMLInputElement>("input"))
      .find((field) => !field.disabled && !field.validity.valid);
    if (invalidField) {
      invalidField.setAttribute("aria-invalid", "true");
      invalidField.setAttribute("aria-describedby", "auth-error");
      setErr(`Email: ${invalidField.validationMessage || "Enter a valid email address."}`);
      invalidField.focus();
      return;
    }
    setBusy(true); setErr(null); setNotice(null);
    try {
      await resetPassword(email);
      setNotice("If that email has an account, a reset link is on its way. Check your inbox (and spam).");
    } catch (e2) { setErr(friendly(e2)); } finally { setBusy(false); }
  }

  // Portalled to <body>: call sites include feed cards and the sticky header,
  // which sit inside stacking contexts / transformed ancestors. Without this a
  // `fixed` overlay gets clipped or painted under later siblings.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#0b1e33]/60 p-4 backdrop-blur-md" onClick={onClose}>
      <div
        className="hippo-card relative my-auto w-full max-w-md overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sign-in-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="hippo-hero relative px-6 pb-5 pt-6 text-white">
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7ac142]"
          >
            <KIcon name="close" size={17} />
          </button>
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-white/70">Welcome to {SITE_SHORT}</p>
          <h2 id="sign-in-modal-title" className="mt-2 max-w-xs text-2xl font-black tracking-tight text-white">{role ? (mode === "signup" ? "Create your account" : "Sign in") : `How will you use ${SITE_SHORT}?`}</h2>
          {!role && <p className="mt-2 max-w-sm text-sm leading-5 text-white/75">Choose the experience that best fits what you need.</p>}
        </div>
        <div className="p-5 sm:p-6">

        {/* Role chooser */}
        {!role && (
          <div className="grid gap-3 sm:grid-cols-2">
            {([["buyer", "search", "I'm a Buyer", "Find & compare local pros, jobs & events"], ["seller", "building", "I'm a Seller", "List my business & get leads"]] as const).map(([r, icon, title, sub]) => (
              <button key={r} onClick={() => { setRole(r); setMode("signin"); }} className="group rounded-2xl border border-[#e7eef5] bg-white p-4 text-left shadow-[0_5px_18px_-16px_rgba(11,30,51,0.55)] transition hover:border-[#7ac142] hover:bg-[#f8fbf4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7ac142]">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#e8f6d8] text-[#558c2b] transition group-hover:bg-white">
                  <KIcon name={icon} size={21} />
                </span>
                <p className="mt-3 font-extrabold text-[#10243e]">{title}</p>
                <p className="mt-1 text-xs leading-5 text-[#1d3a5f]/65">{sub}</p>
              </button>
            ))}
          </div>
        )}

        {role && panel === "form" && (
          <div className="mt-4 space-y-3">
            {!presetRole && (
              <button onClick={() => { setRole(null); setMode("signin"); }} className="text-xs font-bold text-[#558c2b] hover:underline">← {role === "buyer" ? "Buyer" : "Seller"} — change</button>
            )}
            {(role === "buyer" || (role === "seller" && mode === "signin")) && (
              <>
                <button onClick={google} disabled={busy} className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-[#e7eef5] bg-white hover:bg-[#f2f6fa] px-4 py-3 text-sm font-extrabold text-[#10243e] disabled:opacity-60 transition">
                  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden className="shrink-0">
                    <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9Z"/>
                    <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.1-4 1.1-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24Z"/>
                    <path fill="#FBBC05" d="M5.4 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.4a12 12 0 0 0 0 10.8l4-3.1Z"/>
                    <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8Z"/>
                  </svg> {role === "seller" ? "Sign in with Google" : "Continue with Google"}
                </button>
                <div className="flex items-center gap-3 text-xs text-[#1d3a5f]/50">
                  <span className="h-px bg-[#e7eef5] flex-1" /> or email <span className="h-px bg-[#e7eef5] flex-1" />
                </div>
              </>
            )}
            <form
              onSubmit={emailSubmit}
              noValidate
              onInvalidCapture={(event) => {
                const field = event.target;
                if (field instanceof HTMLInputElement) {
                  field.setAttribute("aria-invalid", "true");
                  setErr(`${field.labels?.[0]?.innerText.replace("*", "").trim() ?? "This field"}: ${field.validationMessage}`);
                }
              }}
              onInputCapture={(event) => {
                const field = event.target;
                if (field instanceof HTMLInputElement && field.validity.valid) {
                  field.removeAttribute("aria-invalid");
                  field.removeAttribute("aria-describedby");
                  setErr(null);
                }
              }}
              className="space-y-2"
            >
              <RequiredFieldsLegend />
              <label className="block text-xs font-bold text-[#10243e]">
                Email <span className="font-black text-red-600" aria-hidden="true">*</span>
                <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="mt-1 w-full rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-3 py-2.5 text-sm font-normal outline-none" />
              </label>
              <label className="block text-xs font-bold text-[#10243e]">
                Password <span className="font-black text-red-600" aria-hidden="true">*</span>
                <input type="password" required minLength={6} autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" className="mt-1 w-full rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-3 py-2.5 text-sm font-normal outline-none" />
              </label>
              {/* Signup ONLY, and never pre-ticked — a pre-ticked box is not
                  consent, it is a formality dressed as consent. */}
              {mode === "signup" && (
                <label className="flex items-start gap-2.5 rounded-xl bg-[#f7fafc] border-2 border-[#e7eef5] p-3 cursor-pointer">
                  <input
                    type="checkbox"
                    required
                    checked={agreed}
                    onChange={(e) => { setAgreed(e.target.checked); setErr(null); }}
                    onInvalid={() => setErr("Accept the terms to create an account.")}
                    className="mt-0.5 w-4 h-4 shrink-0 accent-[#558c2b]"
                  />
                  <span className="text-xs text-[#10243e] leading-snug">
                    <b><span className="mr-1 font-black text-red-600" aria-hidden="true">*</span>{SIGNUP_TERMS_LABEL}</b>{" "}
                    <span className="text-[#1d3a5f]/70">{SIGNUP_TERMS_DETAIL}</span>{" "}
                    <Link href="/terms" target="_blank" className="font-bold text-[#558c2b] hover:underline">Terms</Link>
                    {" · "}
                    <Link href="/privacy-policy" target="_blank" className="font-bold text-[#558c2b] hover:underline">Privacy</Link>
                    {role && (
                      <>
                        {" · "}
                        <Link href={ROLE_TERMS_PATH[role]} target="_blank" className="font-bold text-[#558c2b] hover:underline">
                          {role === "seller" ? "Seller terms" : "Buyer terms"}
                        </Link>
                      </>
                    )}
                  </span>
                </label>
              )}
              <button type="submit" disabled={busy} className="btn-hippo w-full text-sm disabled:opacity-60">
                {busy ? "…" : mode === "signup" ? (role === "seller" ? "Create seller account " : "Create buyer account ") : role === "seller" ? "Sign in as seller " : "Sign in as buyer "}
              </button>
              {mode === "signin" && (
                <p className="text-xs text-center">
                  <button type="button" onClick={() => { setPanel("reset"); setErr(null); setNotice(null); }} className="font-bold text-[#1d3a5f]/70 hover:underline">
                    Forgot your password?
                  </button>
                </p>
              )}
            </form>
            {role === "seller" ? (
              <p className="text-xs text-center text-[#1d3a5f]/60">
                New to {SITE_SHORT}?{" "}
                <Link
                  href="/register-seller"
                  onClick={onClose}
                  className="font-bold text-[#558c2b] hover:underline"
                >
                  Create seller account 
                </Link>
              </p>
            ) : (
              <p className="text-xs text-center text-[#1d3a5f]/60">
                {mode === "signin" ? `New to ${SITE_SHORT}? ` : "Already have an account? "}
                <button onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setErr(null); }} className="font-bold text-[#558c2b] hover:underline">
                  {mode === "signin" ? "Create one" : "Sign in"}
                </button>
              </p>
            )}
            {err && <p id="auth-error" role="alert" className="text-sm font-bold text-red-700 bg-red-50 rounded-xl px-3 py-2">{err}</p>}
            <p className="text-[11px] text-[#1d3a5f]/50 text-center">Free · no spam · your role can be changed later from the dashboard.</p>
          </div>
        )}

        {role && panel === "reset" && (
          <div className="mt-4 space-y-3">
            <button onClick={() => { setPanel("form"); setErr(null); setNotice(null); }} className="text-xs font-bold text-[#558c2b] hover:underline">← Back to sign in</button>
            <p className="text-sm text-[#1d3a5f]/70">Enter your email and we&apos;ll send a password-reset link.</p>
            <form
              onSubmit={resetSubmit}
              noValidate
              onInvalidCapture={(event) => {
                const field = event.target;
                if (field instanceof HTMLInputElement) {
                  field.setAttribute("aria-invalid", "true");
                  setErr(`Email: ${field.validationMessage}`);
                }
              }}
              onInputCapture={(event) => {
                const field = event.target;
                if (field instanceof HTMLInputElement && field.validity.valid) {
                  field.removeAttribute("aria-invalid");
                  field.removeAttribute("aria-describedby");
                  setErr(null);
                }
              }}
              className="space-y-2"
            >
              <RequiredFieldsLegend />
              <label className="block text-xs font-bold text-[#10243e]">
                Email <span className="font-black text-red-600" aria-hidden="true">*</span>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" className="mt-1 w-full rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-3 py-2.5 text-sm font-normal outline-none" />
              </label>
              <button type="submit" disabled={busy} className="btn-hippo w-full text-sm disabled:opacity-60">
                {busy ? "Sending…" : "Send reset link "}
              </button>
            </form>
            {notice && <p className="text-sm font-bold text-green-800 bg-green-50 rounded-xl px-3 py-2">{notice}</p>}
            {err && <p id="auth-error" role="alert" className="text-sm font-bold text-red-700 bg-red-50 rounded-xl px-3 py-2">{err}</p>}
          </div>
        )}

        {role && panel === "verify" && (
          <div className="mt-4 space-y-3 text-center">
            <span className="icon-3d mx-auto" aria-hidden>
              <KIcon name="check" size={28} strokeWidth={2.4} />
            </span>
            <h3 className="font-black text-[#10243e]">Check your inbox</h3>
            <p className="text-sm text-[#1d3a5f]/70">
              Account created{email ? <> for <b>{email}</b></> : ""} — we sent a verification
              email to confirm it&apos;s really you. Click the link inside, then continue below.
            </p>
            <button onClick={onClose} className="btn-hippo w-full text-sm">Continue </button>
          </div>
        )}
        </div>
      </div>
    </div>,
    document.body
  );
}