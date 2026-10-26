"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  PhoneAuthProvider,
  RecaptchaVerifier,
  linkWithCredential,
  updateProfile,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useAuth } from "@/components/AuthProvider";
import { auth, db } from "@/lib/firebase";
import { ROLE_TERMS_PATH, SIGNUP_TERMS_DETAIL, SIGNUP_TERMS_LABEL } from "@/lib/legal";
import { signupGroups } from "@/lib/matching";
import { zaAreasForCity, zaCitiesForProvince, zaProvinces } from "@/data/za-locations";
import { subscribeSeller, type CheckoutResult } from "@/lib/monetize";
import { useRealtime, subscribeMySubscription } from "@/lib/realtime";
import { usePlans } from "@/components/PlanConfigProvider";
import { verifyCheckout } from "@/lib/monetize";
import type { PlanId } from "@/lib/plans";
import { KIcon } from "@/lib/icons";

type RegistrationStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;

type SellerDraft = {
  step: RegistrationStep;
  completed: boolean;
  name: string;
  email: string;
  phone: string;
  smsVerified: boolean;
  businessName: string;
  businessType: string;
  categoryGroup: string;
  category: string;
  businessEmail: string;
  businessPhone: string;
  province: string;
  city: string;
  suburbs: string[];
  travelRadiusKm: string;
  services: string;
  description: string;
  yearsExperience: string;
  priceNote: string;
  hours: string;
  portfolioTitle: string;
  portfolioDescription: string;
  portfolioImageUrl: string;
  selectedPlan: PlanId | "";
};

const EMPTY_DRAFT: SellerDraft = {
  step: 1,
  completed: false,
  name: "",
  email: "",
  phone: "",
  smsVerified: false,
  businessName: "",
  businessType: "sole-trader",
  categoryGroup: "",
  category: "",
  businessEmail: "",
  businessPhone: "",
  province: "gauteng",
  city: "johannesburg",
  suburbs: [],
  travelRadiusKm: "10",
  services: "",
  description: "",
  yearsExperience: "",
  priceNote: "",
  hours: "",
  portfolioTitle: "",
  portfolioDescription: "",
  portfolioImageUrl: "",
  selectedPlan: "",
};

const STEP_TITLES = [
  "Create seller account",
  "Verify email and phone",
  "Register business",
  "Choose services and areas",
  "Complete seller profile",
  "Select a plan",
  "Activate seller dashboard",
];

function formatZaPhone(value: string): string {
  const clean = value.replace(/[^\d+]/g, "");
  if (clean.startsWith("+27")) return clean;
  if (clean.startsWith("27")) return `+${clean}`;
  if (clean.startsWith("0")) return `+27${clean.slice(1)}`;
  return `+27${clean}`;
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/email-already-in-use/i.test(message)) return "That email already has an account. Sign in to continue.";
  if (/invalid-email/i.test(message)) return "That email address doesn't look right.";
  if (/weak-password/i.test(message)) return "Choose a stronger password.";
  if (/wrong-password|invalid-credential|user-not-found/i.test(message)) return "Wrong email or password.";
  if (/popup-closed|cancelled|popup-blocked/i.test(message)) return "Sign-in did not finish. Please try again.";
  if (/invalid-phone-number/i.test(message)) return "Enter a valid South African mobile number.";
  if (/captcha-check-failed|missing-recaptcha-token/i.test(message)) return "Phone verification could not confirm the CAPTCHA. Please try again.";
  if (/credential-already-in-use/i.test(message)) return "That phone number is already linked to another account.";
  return message;
}

async function recordTermsAcceptance() {
  const user = auth?.currentUser;
  if (!user) throw new Error("Please sign in again before continuing.");
  const token = await user.getIdToken();
  const response = await fetch("/api/legal/accept-terms", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ role: "seller" }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? "We couldn't record your terms acceptance. Please retry.");
  }
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block text-sm font-bold text-[#10243e]">
      {label}
      {children}
      {hint && <span className="mt-1 block text-xs font-normal text-[#1d3a5f]/60">{hint}</span>}
    </label>
  );
}

const inputClass =
  "mt-1 w-full rounded-xl border-2 border-[#e7eef5] bg-white px-4 py-3 text-sm font-normal outline-none transition-colors focus:border-[#7ac142]";

export default function SellerRegistration() {
  const router = useRouter();
  const { user, emailVerified, refreshUser, resendVerification, signInEmail, setRole } = useAuth();
  const plans = usePlans();
  const [draft, setDraft] = useState<SellerDraft>(EMPTY_DRAFT);
  const [draftReadyUid, setDraftReadyUid] = useState("");
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [listingConsent, setListingConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [termsPending, setTermsPending] = useState(false);
  const [smsCode, setSmsCode] = useState("");
  const [smsVerificationId, setSmsVerificationId] = useState("");
  const [period, setPeriod] = useState<"monthly" | "annual">("monthly");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentPending, setPaymentPending] = useState(false);
  const recaptchaElement = useRef<HTMLDivElement | null>(null);
  const recaptchaVerifier = useRef<RecaptchaVerifier | null>(null);
  const draftReady = !user || draftReadyUid === user.uid;

  const subscription = useRealtime<Record<string, unknown>>(
    (cb, onError) => (user ? subscribeMySubscription(user.uid, cb as never, onError) : () => {}),
    [],
    [user?.uid],
  );
  const subscriptionDoc = subscription.rows[0] ?? {};
  const subscriptionStatus = String(subscriptionDoc.subscription_status ?? subscriptionDoc.status ?? "");
  const hasActivePlan = ["active", "trialing", "past_due"].includes(subscriptionStatus);
  const activePlan = String(subscriptionDoc.plan ?? "");
  const starterPlan = plans.find((plan) => plan.id === "starter");
  const starterAreaLimit = starterPlan?.limits.locations ?? 1;
  const starterServiceLimit = starterPlan?.limits.services ?? 5;

  const cities = useMemo(() => zaCitiesForProvince(draft.province), [draft.province]);
  const areas = useMemo(() => zaAreasForCity(draft.city), [draft.city]);
  const sortedAreas = useMemo(() => [...areas].sort((a, b) => a.name.localeCompare(b.name)), [areas]);
  const registrationStep = user ? draft.step : 1;
  const suburbsNeeded = draft.suburbs.length;
  const serviceCount = draft.services.split(/[,;\n]+/).filter((value) => value.trim()).length;

  useEffect(() => {
    let alive = true;
    if (!user || !db) return () => { alive = false; };

    getDoc(doc(db, "users", user.uid))
      .then((snapshot) => {
        if (!alive) return;
        const stored = snapshot.data()?.sellerOnboarding;
        const restored = stored && typeof stored === "object"
          ? { ...EMPTY_DRAFT, ...(stored as Partial<SellerDraft>) }
          : { ...EMPTY_DRAFT, step: 2 as RegistrationStep };
        restored.email = user.email ?? restored.email;
        restored.name = restored.name || user.displayName || "";
        restored.categoryGroup ||= signupGroups.find((group) =>
          group.categories.some((category) => category.slug === restored.category)
        )?.slug ?? "";
        if (restored.completed) {
          router.replace("/dashboard?tab=listings");
          return;
        }
        setDraft(restored);
      })
      .catch((e: unknown) => {
        if (alive) setError(`Could not load your saved registration: ${errorMessage(e)}`);
      })
      .finally(() => {
        if (alive) setDraftReadyUid(user.uid);
      });

    return () => { alive = false; };
  }, [user, router]);

  useEffect(() => {
    if (!user || !db || !draftReady || draft.completed) return;
    const firestore = db;
    const timer = window.setTimeout(() => {
      void setDoc(doc(firestore, "users", user.uid), { sellerOnboarding: draft }, { merge: true })
        .catch((e: unknown) => setError(`Could not save your progress: ${errorMessage(e)}`));
    }, 650);
    return () => window.clearTimeout(timer);
  }, [user, draft, draftReady]);

  useEffect(() => {
    if (!user || !draftReady) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("billing") !== "return") return;
    const reference = params.get("reference") ?? "";
    window.setTimeout(() => {
      if (!reference) {
        setError("The payment return did not include a reference. Check your plan in the dashboard before trying again.");
        return;
      }
      setPaymentReference(reference);
      void checkPayment(reference);
    }, 0);
  // checkPayment is declared below and intentionally uses current draft state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, draftReady]);

  useEffect(() => () => {
    recaptchaVerifier.current?.clear();
    recaptchaVerifier.current = null;
  }, []);

  function update<K extends keyof SellerDraft>(key: K, value: SellerDraft[K]) {
    setDraft((current) => ({
      ...current,
      [key]: value,
      ...(key === "phone" && current.phone !== value ? { smsVerified: false } : {}),
    }));
    if (key === "phone") setSmsVerificationId("");
    setError(null);
    setNotice(null);
  }

  async function persist(next: SellerDraft) {
    if (!user || !db) throw new Error("Sign in before saving your registration.");
    await setDoc(doc(db, "users", user.uid), { sellerOnboarding: next }, { merge: true });
    setDraft(next);
  }

  async function checkPayment(reference: string) {
    setBusy(true);
    setError(null);
    try {
      const result = await verifyCheckout(reference);
      if (result.pending) {
        setPaymentPending(true);
        setError("Your payment is being confirmed. Check again shortly.");
        return;
      }
      if (!result.ok) {
        setPaymentPending(false);
        setError(result.message ?? "We couldn't confirm the payment. Please try again or contact support.");
        return;
      }
      const next = { ...draft, step: 7 as RegistrationStep };
      await persist(next);
      setPaymentPending(false);
      setNotice("Payment confirmed. Finish activating your seller profile.");
      window.history.replaceState({}, "", "/register-seller");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "signup" && !agreed) throw new Error("Please accept the terms to create a seller account.");
      await signInEmail("seller", draft.email, password, mode);
      const currentUser = auth?.currentUser;
      if (!currentUser) throw new Error("Your account was created, but sign-in could not be confirmed.");
      if (mode === "signup" && draft.name.trim()) {
        await updateProfile(currentUser, { displayName: draft.name.trim() });
      }
      if (mode === "signup") {
        try {
          await recordTermsAcceptance();
        } catch (e) {
          setTermsPending(true);
          throw e;
        }
      }
      const next = {
        ...draft,
        name: draft.name.trim() || currentUser.displayName || "",
        email: currentUser.email ?? draft.email.trim(),
        businessEmail: draft.businessEmail || currentUser.email || draft.email.trim(),
        businessPhone: draft.businessPhone || draft.phone,
        step: 2 as RegistrationStep,
      };
      await setDoc(doc(db!, "users", currentUser.uid), { sellerOnboarding: next }, { merge: true });
      setDraft(next);
      setTermsPending(false);
      setNotice(mode === "signup" ? "Account created. Verify your email to continue." : "You're signed in. Continue your seller registration.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function retryTerms() {
    setBusy(true);
    setError(null);
    try {
      await recordTermsAcceptance();
      const currentUser = auth?.currentUser;
      if (!currentUser || !db) throw new Error("Please sign in again before continuing.");
      const next = { ...draft, step: 2 as RegistrationStep };
      await setDoc(doc(db, "users", currentUser.uid), { sellerOnboarding: next }, { merge: true });
      setDraft(next);
      setTermsPending(false);
      setNotice("Terms recorded. Verify your email to continue.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function sendSmsCode() {
    if (!auth || !auth.currentUser || !recaptchaElement.current) {
      setError("Sign in before verifying your mobile number.");
      return;
    }
    const phoneNumber = formatZaPhone(draft.phone);
    if (!/^\+27\d{9}$/.test(phoneNumber)) {
      setError("Enter a valid South African mobile number before requesting an SMS code.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      recaptchaVerifier.current ??= new RecaptchaVerifier(auth, recaptchaElement.current, { size: "invisible" });
      const provider = new PhoneAuthProvider(auth);
      const verificationId = await provider.verifyPhoneNumber(phoneNumber, recaptchaVerifier.current);
      setSmsVerificationId(verificationId);
      setNotice(`A verification code was sent to ${phoneNumber}.`);
    } catch (e) {
      recaptchaVerifier.current?.clear();
      recaptchaVerifier.current = null;
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirmSmsCode() {
    if (!auth?.currentUser || !smsVerificationId) return;
    setBusy(true);
    setError(null);
    try {
      const credential = PhoneAuthProvider.credential(smsVerificationId, smsCode.trim());
      await linkWithCredential(auth.currentUser, credential);
      update("smsVerified", true);
      setSmsVerificationId("");
      setSmsCode("");
      setNotice("Mobile number verified.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function continueStep(nextStep: RegistrationStep) {
    if (!user) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (nextStep > draft.step && draft.step === 2 && !emailVerified) throw new Error("Verify your email address before continuing.");
      if (nextStep > draft.step && draft.step === 2 && !/^\+27\d{9}$/.test(formatZaPhone(draft.phone))) {
        throw new Error("Enter a valid South African mobile number to continue.");
      }
      if (nextStep > draft.step && draft.step === 3) {
        if (!draft.businessName.trim()) throw new Error("Enter your business name.");
        if (!draft.categoryGroup || !draft.category) throw new Error("Choose a main service and your specific service.");
        if (!draft.businessPhone.trim()) throw new Error("Enter a business contact number.");
      }
      if (nextStep > draft.step && draft.step === 4) {
        if (!draft.city || draft.suburbs.length === 0) throw new Error("Choose a city and at least one suburb you serve.");
        if (!draft.services.trim()) throw new Error("Add at least one service or keyword.");
      }
      if (nextStep > draft.step && draft.step === 5) {
        if (draft.description.trim().length < 20) throw new Error("Add a profile description of at least 20 characters.");
        if (!draft.hours.trim()) throw new Error("Add your working hours or say that customers should call.");
      }
      await persist({ ...draft, step: nextStep });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function startPlan(planId: PlanId | "trial") {
    if (!user) return;
    const selectedPlan: PlanId = planId === "trial" ? "starter" : planId;
    const supportsAreas = plans.find((plan) => plan.id === selectedPlan)?.limits.locations;
    if (supportsAreas !== null && supportsAreas !== undefined && suburbsNeeded > supportsAreas) {
      setError(`Your selected service areas need a plan that supports ${suburbsNeeded} locations.`);
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await persist({ ...draft, selectedPlan });
      const result: CheckoutResult = await subscribeSeller(
        planId === "trial" ? "free" : planId,
        undefined,
        { period, onboarding: true },
      );
      if (result.url) {
        window.location.href = result.url;
        return;
      }
      if (result.trial) {
        await persist({ ...draft, selectedPlan: "starter", step: 7 });
        setNotice(result.message ?? "Your free trial is active. Finish activating your dashboard.");
        return;
      }
      setError(result.message ?? "We couldn't activate that plan.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function continueWithFreeListing() {
    setBusy(true);
    setError(null);
    try {
      await persist({ ...draft, selectedPlan: "starter", step: 7 });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function activateDashboard() {
    if (!user) return;
    if (!listingConsent) {
      setError("Please consent to publishing your business contact details on the public listing.");
      return;
    }
    const portfolioParts = [draft.portfolioTitle, draft.portfolioDescription, draft.portfolioImageUrl].map((value) => value.trim());
    const hasSomePortfolio = portfolioParts.some(Boolean);
    if (hasSomePortfolio && portfolioParts.some((value) => !value)) {
      setError("Complete the portfolio title, description and image link, or leave all three blank.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await setRole("seller");
      const portfolio = hasSomePortfolio
        ? {
            title: draft.portfolioTitle,
            description: draft.portfolioDescription,
            imageUrl: draft.portfolioImageUrl,
            completedAt: "",
            beforeUrl: "",
            afterUrl: "",
            tags: draft.services.split(/[,;\n]+/).map((value) => value.trim()).filter(Boolean).slice(0, 8),
          }
        : undefined;
      await fetchBusiness({
        name: draft.businessName,
        businessType: draft.businessType,
        category: draft.category,
        phone: draft.businessPhone,
        email: draft.businessEmail || draft.email,
        suburb: draft.suburbs[0] ?? "",
        city: draft.city,
        province: draft.province,
        services: draft.services,
        serviceAreas: draft.suburbs,
        travelRadiusKm: Number(draft.travelRadiusKm),
        desc: draft.description,
        yearsExperience: draft.yearsExperience,
        priceNote: draft.priceNote,
        hours: draft.hours,
        portfolio,
        consent: true,
        onboarding: true,
      });
      await persist({ ...draft, completed: true, step: 7 });
      router.replace("/dashboard?tab=listings");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function fetchBusiness(input: Record<string, unknown>) {
    const currentUser = auth?.currentUser;
    if (!currentUser) throw new Error("Sign in again to activate your seller dashboard.");
    const token = await currentUser.getIdToken();
    const response = await fetch("/api/business", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    });
    const result = await response.json().catch(() => ({})) as { ok?: boolean; error?: string };
    if (!response.ok || !result.ok) throw new Error(result.error ?? "We couldn't create your seller profile.");
  }

  function toggleSuburb(slug: string) {
    const next = draft.suburbs.includes(slug)
      ? draft.suburbs.filter((area) => area !== slug)
      : [...draft.suburbs, slug];
    update("suburbs", next);
  }

  if (!draftReady && user) {
    return <section className="max-w-2xl mx-auto hippo-card p-8 text-center text-sm text-[#1d3a5f]/65">Loading your saved seller registration…</section>;
  }

  return (
    <section className="max-w-2xl mx-auto hippo-card p-5 sm:p-8">
      <div className="text-center">
        <span className="icon-3d icon-3d-lg mx-auto" aria-hidden="true"><KIcon name="building" size={25} /></span>
        <p className="mt-4 text-xs font-extrabold uppercase tracking-[0.16em] text-[#558c2b]">Seller registration · step {registrationStep} of 7</p>
        <h2 className="mt-1 text-2xl sm:text-3xl font-black tracking-tight text-[#10243e]">{STEP_TITLES[registrationStep - 1]}</h2>
      </div>

      <div className="mt-6 grid grid-cols-7 gap-1.5" aria-label={`Step ${registrationStep} of 7`}>
        {STEP_TITLES.map((title, index) => (
          <div key={title} className={`h-1.5 rounded-full ${index + 1 <= registrationStep ? "bg-[#7ac142]" : "bg-[#e7eef5]"}`} />
        ))}
      </div>

      {error && <p className="mt-5 rounded-xl bg-red-50 px-3 py-2.5 text-sm font-bold text-red-700" role="alert">{error}</p>}
      {notice && <p className="mt-5 rounded-xl bg-[#e8f6d8] px-3 py-2.5 text-sm font-bold text-[#3c6b1d]" role="status">{notice}</p>}

      {!user && (
        <>
          <div className="mt-5 flex items-center justify-center gap-2 text-sm">
            <span className="font-bold text-[#10243e]">Seller account</span>
            <span aria-hidden="true" className="text-[#1d3a5f]/35">—</span>
            <button type="button" onClick={() => { setMode((value) => value === "signup" ? "signin" : "signup"); setError(null); }} className="font-bold text-[#558c2b] hover:underline">
              {mode === "signup" ? "Already registered? Sign in" : "New seller? Create an account"}
            </button>
          </div>
          <form onSubmit={createAccount} className="mt-5 space-y-3">
            {mode === "signup" && (
              <>
                <Field label="Full name"><input className={inputClass} autoComplete="name" required minLength={2} value={draft.name} onChange={(e) => update("name", e.target.value)} /></Field>
                <Field label="Mobile number" hint="Include your South African mobile number. SMS verification is optional.">
                  <input className={inputClass} type="tel" autoComplete="tel" required value={draft.phone} onChange={(e) => update("phone", e.target.value)} placeholder="082 123 4567" />
                </Field>
              </>
            )}
            <Field label="Email address"><input className={inputClass} type="email" autoComplete="email" required value={draft.email} onChange={(e) => update("email", e.target.value)} placeholder="you@example.com" /></Field>
            <Field label="Password"><input className={inputClass} type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
            {mode === "signup" && (
              <label className="flex items-start gap-2.5 pt-1 text-xs leading-relaxed text-[#10243e]">
                <input type="checkbox" required checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 rounded border-[#1d3a5f] text-[#558c2b] focus:ring-[#7ac142]" />
                <span>
                  {SIGNUP_TERMS_LABEL}{" "}
                  <Link href="/terms" className="font-bold text-[#558c2b] underline">Terms</Link>
                  {" · "}
                  <Link href="/privacy-policy" className="font-bold text-[#558c2b] underline">Privacy</Link>
                  {" · "}
                  <Link href={ROLE_TERMS_PATH.seller} className="font-bold text-[#558c2b] underline">Seller terms</Link>
                  <span className="mt-1 block text-[#1d3a5f]/65">{SIGNUP_TERMS_DETAIL}</span>
                </span>
              </label>
            )}
            <button type="submit" disabled={busy || (mode === "signup" && !agreed)} className="btn-hippo w-full text-sm disabled:opacity-60">
              {busy ? "Please wait…" : mode === "signup" ? "Create seller account →" : "Sign in and continue →"}
            </button>
          </form>
          {termsPending && (
            <button type="button" disabled={busy} onClick={retryTerms} className="mt-3 w-full rounded-xl border-2 border-[#e7eef5] px-4 py-2.5 text-sm font-bold text-[#10243e] disabled:opacity-60">
              Retry recording terms acceptance
            </button>
          )}
          <p className="mt-4 text-center text-xs text-[#1d3a5f]/55">Your password is never saved in your registration draft.</p>
        </>
      )}

      {user && registrationStep === 2 && (
        <div className="mt-6 space-y-4">
          <div className="rounded-xl border border-[#e7eef5] p-4">
            <p className="font-extrabold text-[#10243e]">Email · {user.email}</p>
            <p className="mt-1 text-sm text-[#1d3a5f]/65">{emailVerified ? "Verified" : "Open the verification link sent to your inbox, then confirm below."}</p>
            {!emailVerified && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" disabled={busy} onClick={async () => {
                  setBusy(true); setError(null);
                  try { await refreshUser(); setNotice("Email verification status refreshed."); }
                  catch (e) { setError(errorMessage(e)); }
                  finally { setBusy(false); }
                }} className="rounded-lg border-2 border-[#e7eef5] px-3 py-2 text-xs font-bold text-[#10243e]">I verified my email</button>
                <button type="button" disabled={busy} onClick={async () => {
                  setBusy(true); setError(null);
                  try { await resendVerification(); setNotice("A new verification link has been sent."); }
                  catch (e) { setError(errorMessage(e)); }
                  finally { setBusy(false); }
                }} className="rounded-lg border-2 border-[#e7eef5] px-3 py-2 text-xs font-bold text-[#10243e]">Resend email link</button>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-[#e7eef5] p-4">
            <Field label="Mobile number" hint="A valid South African number is required to continue; SMS verification is optional.">
              <input className={inputClass} type="tel" autoComplete="tel" value={draft.phone} onChange={(e) => update("phone", e.target.value)} placeholder="082 123 4567" />
            </Field>
            <p className="mt-1 text-sm text-[#1d3a5f]/65">
              {draft.smsVerified ? "Mobile number verified." : "SMS verification is optional. You can continue without an OTP."}
            </p>
            {!draft.smsVerified && draft.phone && (
              <>
                {!smsVerificationId ? (
                  <button type="button" disabled={busy} onClick={sendSmsCode} className="mt-3 rounded-lg border-2 border-[#e7eef5] px-3 py-2 text-xs font-bold text-[#10243e]">
                    {busy ? "Sending…" : "Send optional SMS code"}
                  </button>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <input className="w-40 rounded-lg border-2 border-[#e7eef5] px-3 py-2 text-sm" inputMode="numeric" autoComplete="one-time-code" value={smsCode} onChange={(e) => setSmsCode(e.target.value)} placeholder="SMS code" />
                    <button type="button" disabled={busy || !smsCode.trim()} onClick={confirmSmsCode} className="btn-hippo text-xs disabled:opacity-50">Verify phone</button>
                  </div>
                )}
              </>
            )}
            <div ref={recaptchaElement} />
          </div>

          <div className="flex flex-wrap justify-between gap-3">
            <button type="button" onClick={() => void setRole("seller")} className="text-sm font-bold text-[#558c2b] hover:underline">Seller account selected</button>
            <button type="button" disabled={busy || !emailVerified} onClick={() => void continueStep(3)} className="btn-hippo text-sm disabled:opacity-50">
              {busy ? "Saving…" : "Continue to business →"}
            </button>
          </div>
        </div>
      )}

      {user && registrationStep === 3 && (
        <div className="mt-6 space-y-3">
          <Field label="Business name"><input className={inputClass} required value={draft.businessName} onChange={(e) => update("businessName", e.target.value)} placeholder="e.g. Mokoena Plumbing" /></Field>
          <Field label="Business type">
            <select className={inputClass} value={draft.businessType} onChange={(e) => update("businessType", e.target.value)}>
              <option value="sole-trader">Sole trader</option><option value="company">Registered company</option><option value="partnership">Partnership</option><option value="non-profit">Non-profit</option><option value="other">Other</option>
            </select>
          </Field>
          <Field label="Business category">
            <select className={inputClass} required value={draft.categoryGroup} onChange={(e) => {
              update("categoryGroup", e.target.value);
              update("category", "");
            }}>
              <option value="">Choose a main service</option>
              {signupGroups.map((group) => <option key={group.slug} value={group.slug}>{group.name}</option>)}
            </select>
          </Field>
          <Field label="Specific service">
            <select
              className={inputClass}
              required
              disabled={!draft.categoryGroup}
              value={draft.category}
              onChange={(e) => update("category", e.target.value)}
            >
              <option value="">{draft.categoryGroup ? "Choose a service" : "Choose a main service first"}</option>
              {(signupGroups.find((group) => group.slug === draft.categoryGroup)?.categories ?? []).map((category) => (
                <option key={category.slug} value={category.slug}>{category.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Business contact number"><input className={inputClass} type="tel" required value={draft.businessPhone} onChange={(e) => update("businessPhone", e.target.value)} /></Field>
          <Field label="Business email"><input className={inputClass} type="email" value={draft.businessEmail} onChange={(e) => update("businessEmail", e.target.value)} placeholder={draft.email} /></Field>
          <StepButtons busy={busy} back={() => void continueStep(2)} next={() => void continueStep(4)} />
        </div>
      )}

      {user && registrationStep === 4 && (
        <div className="mt-6 space-y-3">
          <Field label="Province">
            <select className={inputClass} value={draft.province} onChange={(e) => {
              const province = e.target.value;
              const firstCity = zaCitiesForProvince(province)[0]?.slug ?? "";
              update("province", province);
              setDraft((current) => ({ ...current, province, city: firstCity, suburbs: [] }));
            }}>
              {zaProvinces.map((province) => <option key={province.slug} value={province.slug}>{province.name}</option>)}
            </select>
          </Field>
          <Field label="City">
            <select className={inputClass} value={draft.city} onChange={(e) => { update("city", e.target.value); update("suburbs", []); }}>
              {cities.map((city) => <option key={city.slug} value={city.slug}>{city.name}</option>)}
            </select>
          </Field>
          <div>
            <p className="text-sm font-bold text-[#10243e]">Suburbs you serve</p>
            <p className="mt-1 text-xs text-[#1d3a5f]/60">Select at least one. Your plan determines how many areas you can publish.</p>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-56 overflow-y-auto rounded-xl border border-[#e7eef5] p-3">
              {sortedAreas.map((area) => (
                <label key={area.slug} className="flex items-center gap-2 text-xs font-medium text-[#10243e]">
                  <input type="checkbox" checked={draft.suburbs.includes(area.slug)} onChange={() => toggleSuburb(area.slug)} className="h-4 w-4 rounded border-[#1d3a5f] text-[#558c2b] focus:ring-[#7ac142]" />
                  {area.name}
                </label>
              ))}
              {sortedAreas.length === 0 && <p className="col-span-full text-xs text-[#1d3a5f]/60">No suburb list is available for this city; choose another city.</p>}
            </div>
          </div>
          <Field label="Travel radius" hint="Used to describe how far you travel from your selected areas.">
            <select className={inputClass} value={draft.travelRadiusKm} onChange={(e) => update("travelRadiusKm", e.target.value)}>
              {[5, 10, 20, 30, 50, 100].map((radius) => <option key={radius} value={String(radius)}>{radius} km</option>)}
            </select>
          </Field>
          <Field label="Services and search keywords" hint="Separate services with commas. Your plan limits the number of service keywords.">
            <textarea className={inputClass} rows={3} value={draft.services} onChange={(e) => update("services", e.target.value)} placeholder="Emergency repairs, installations, maintenance" />
          </Field>
          <StepButtons busy={busy} back={() => void continueStep(3)} next={() => void continueStep(5)} />
        </div>
      )}

      {user && registrationStep === 5 && (
        <div className="mt-6 space-y-3">
          <Field label="Profile description" hint="Tell customers what you do and why they should choose you.">
            <textarea className={inputClass} rows={4} minLength={20} value={draft.description} onChange={(e) => update("description", e.target.value)} />
          </Field>
          <Field label="Years of experience"><input className={inputClass} type="number" min="0" max="100" value={draft.yearsExperience} onChange={(e) => update("yearsExperience", e.target.value)} /></Field>
          <Field label="Price guide" hint="For example: Call-out from R450 · quotes are free"><input className={inputClass} value={draft.priceNote} onChange={(e) => update("priceNote", e.target.value)} /></Field>
          <Field label="Working hours"><input className={inputClass} value={draft.hours} onChange={(e) => update("hours", e.target.value)} placeholder="Mon–Fri 08:00–17:00, Sat by appointment" /></Field>
          <div className="rounded-xl border border-[#e7eef5] p-4 space-y-3">
            <div><p className="font-extrabold text-[#10243e]">Portfolio project <span className="font-medium text-[#1d3a5f]/55">(optional)</span></p><p className="mt-1 text-xs text-[#1d3a5f]/60">Add one project now; you can add more from your dashboard.</p></div>
            <Field label="Project title"><input className={inputClass} value={draft.portfolioTitle} onChange={(e) => update("portfolioTitle", e.target.value)} /></Field>
            <Field label="Project description"><textarea className={inputClass} rows={2} value={draft.portfolioDescription} onChange={(e) => update("portfolioDescription", e.target.value)} /></Field>
            <Field label="Project image URL" hint="Use a public https image link."><input className={inputClass} type="url" value={draft.portfolioImageUrl} onChange={(e) => update("portfolioImageUrl", e.target.value)} placeholder="https://…" /></Field>
          </div>
          <StepButtons busy={busy} back={() => void continueStep(4)} next={() => void continueStep(6)} />
        </div>
      )}

      {user && registrationStep === 6 && (
        <div className="mt-6 space-y-5">
          {hasActivePlan ? (
            <div className="rounded-xl bg-[#e8f6d8] p-4 text-sm text-[#3c6b1d]">
              Your {activePlan || "current"} subscription is active. Continue to activate your seller profile.
              <button type="button" onClick={() => void continueStep(7)} className="mt-3 block font-extrabold underline">Continue →</button>
            </div>
          ) : (
            <>
              <p className="text-sm text-[#1d3a5f]/70">Start with a one-time eligible 7-day Starter trial or choose a paid subscription. Trial eligibility is checked securely by the billing service.</p>
              <div className="flex items-center justify-center gap-2" role="group" aria-label="Billing period">
                <button type="button" aria-pressed={period === "monthly"} onClick={() => setPeriod("monthly")} className={`rounded-full px-4 py-2 text-xs font-extrabold ${period === "monthly" ? "bg-[#10243e] text-white" : "border-2 border-[#e7eef5] text-[#10243e]"}`}>Monthly</button>
                <button type="button" aria-pressed={period === "annual"} onClick={() => setPeriod("annual")} className={`rounded-full px-4 py-2 text-xs font-extrabold ${period === "annual" ? "bg-[#10243e] text-white" : "border-2 border-[#e7eef5] text-[#10243e]"}`}>Annual</button>
              </div>
              <div className="grid sm:grid-cols-3 gap-3">
                {plans.map((plan) => {
                  const areaCap = plan.limits.locations;
                  const serviceCap = plan.limits.services;
                  const fitsAreas = (areaCap === null || suburbsNeeded <= areaCap)
                    && (serviceCap === null || serviceCount <= serviceCap);
                  return (
                    <article key={plan.id} className={`rounded-xl border-2 p-4 ${plan.popular ? "border-[#7ac142]" : "border-[#e7eef5]"}`}>
                      <p className="text-xs font-black uppercase tracking-wider text-[#558c2b]">{plan.name}</p>
                      <p className="mt-1 text-xl font-black text-[#10243e]">R{(period === "annual" ? plan.annual : plan.monthly).toLocaleString("en-ZA")}<span className="text-xs font-bold text-[#1d3a5f]/55">{period === "annual" ? "/yr" : "/mo"}</span></p>
                      <p className="mt-2 text-xs text-[#1d3a5f]/65">{areaCap === null ? "Unlimited service areas" : `Up to ${areaCap} service ${areaCap === 1 ? "area" : "areas"}`}</p>
                      <button type="button" disabled={busy || !fitsAreas} onClick={() => void startPlan(plan.id)} className="btn-hippo mt-4 w-full text-xs disabled:opacity-50">
                        {busy ? "Please wait…" : `Choose ${plan.name}`}
                      </button>
                      {!fitsAreas && <p className="mt-2 text-[11px] text-red-700">Your selected areas or services need a higher-tier plan.</p>}
                    </article>
                  );
                })}
              </div>
              {plans.some((plan) => plan.id === "starter" &&
                (plan.limits.locations === null || suburbsNeeded <= plan.limits.locations) &&
                (plan.limits.services === null || serviceCount <= plan.limits.services)) && (
                <button type="button" disabled={busy} onClick={() => void startPlan("trial")} className="w-full rounded-xl border-2 border-[#e7eef5] px-4 py-3 text-sm font-extrabold text-[#10243e] disabled:opacity-50">
                  {busy ? "Please wait…" : "Start eligible 7-day free trial"}
                </button>
              )}
              <div className="rounded-xl border border-[#e7eef5] p-4">
                <p className="font-extrabold text-[#10243e]">Eligible free listing</p>
                <p className="mt-1 text-xs text-[#1d3a5f]/65">
                  The first Starter listing can be activated without a subscription, within Starter limits ({starterServiceLimit} services and {starterAreaLimit} service {starterAreaLimit === 1 ? "area" : "areas"}). An active plan is required for the paid lead catalogue and credit unlocks.
                </p>
                <button
                  type="button"
                  disabled={busy || suburbsNeeded > starterAreaLimit || serviceCount > starterServiceLimit}
                  onClick={() => void continueWithFreeListing()}
                  className="mt-3 w-full rounded-xl border-2 border-[#e7eef5] px-4 py-3 text-sm font-extrabold text-[#10243e] disabled:opacity-50"
                >
                  Continue with free Starter listing →
                </button>
                {(suburbsNeeded > starterAreaLimit || serviceCount > starterServiceLimit) && <p className="mt-2 text-[11px] text-red-700">Your selections exceed the Starter listing limits; choose a paid plan.</p>}
              </div>
              {paymentPending && paymentReference && (
                <button type="button" disabled={busy} onClick={() => void checkPayment(paymentReference)} className="w-full rounded-xl border-2 border-[#e7eef5] px-4 py-3 text-sm font-bold text-[#10243e] disabled:opacity-50">Check payment confirmation</button>
              )}
            </>
          )}
          <button type="button" disabled={busy} onClick={() => void continueStep(5)} className="w-full text-sm font-bold text-[#558c2b] hover:underline">← Back to profile</button>
        </div>
      )}

      {user && registrationStep === 7 && (
        <div className="mt-6 space-y-4">
          <div className="rounded-xl bg-[#f2f6fa] p-4 text-sm text-[#10243e]">
            <p className="font-extrabold">Ready to activate</p>
            <ul className="mt-2 space-y-1 text-[#1d3a5f]/70">
              <li>Business: {draft.businessName || "Not set"}</li>
              <li>Services: {draft.services.split(/[,;\n]+/).filter(Boolean).length}</li>
              <li>Service areas: {draft.suburbs.length}</li>
              <li>Plan: {activePlan || draft.selectedPlan || "Not confirmed"}</li>
              <li>Mobile verification: {draft.smsVerified ? "Verified" : "Skipped"}</li>
            </ul>
          </div>
          <label className="flex items-start gap-2.5 text-xs leading-relaxed text-[#10243e]">
            <input type="checkbox" checked={listingConsent} onChange={(e) => setListingConsent(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 rounded border-[#1d3a5f] text-[#558c2b] focus:ring-[#7ac142]" />
            <span>I agree to publish my business contact details on my public listing. Buyers will be able to view the business phone and email I provided.</span>
          </label>
          <button type="button" disabled={busy || !listingConsent} onClick={() => void activateDashboard()} className="btn-hippo w-full text-sm disabled:opacity-50">
            {busy ? "Activating…" : "Activate seller dashboard →"}
          </button>
          <button type="button" disabled={busy} onClick={() => void continueStep(6)} className="w-full text-sm font-bold text-[#558c2b] hover:underline">← Review plan</button>
          <p className="text-center text-xs text-[#1d3a5f]/55">Your dashboard brings together leads, quotes, credits, messages and subscription management.</p>
        </div>
      )}
    </section>
  );
}

function StepButtons({ busy, back, next }: { busy: boolean; back: () => void; next: () => void }) {
  return (
    <div className="flex justify-between gap-3 pt-2">
      <button type="button" disabled={busy} onClick={back} className="rounded-xl border-2 border-[#e7eef5] px-4 py-3 text-sm font-bold text-[#10243e] disabled:opacity-50">← Back</button>
      <button type="button" disabled={busy} onClick={next} className="btn-hippo text-sm disabled:opacity-50">{busy ? "Saving…" : "Continue →"}</button>
    </div>
  );
}
