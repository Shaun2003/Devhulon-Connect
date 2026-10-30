"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { DashboardSkeleton } from "@/components/dash/parts";
import BuyerDashboard from "@/components/dash/BuyerDashboard";
import SellerDashboard from "@/components/dash/SellerDashboard";
import AccountSettings from "@/components/dash/AccountSettings";
import { PageHero } from "@/components/ui";
import { verifyCheckout } from "@/lib/monetize";

/** Routes /dashboard to the buyer or seller hub based on the realtime role. */
export function DashboardRouter({
  billingReturn = false,
  reference,
  initialSellerTab,
}: {
  billingReturn?: boolean;
  reference?: string;
  initialSellerTab?: "leads" | "marketplace" | "settings";
}) {
  const { role, user, loading, roleLoading, sellerAccountReady, sellerAccountLoading } = useAuth();
  const [verificationAttempt, setVerificationAttempt] = useState(0);
  const [paymentStatus, setPaymentStatus] = useState<"idle" | "confirmed" | "pending" | "error">("idle");
  const [paymentMessage, setPaymentMessage] = useState("");
  const verificationStatus = paymentStatus === "idle"
    ? loading || user ? "checking" : "error"
    : paymentStatus;
  const verificationMessage = paymentStatus === "idle" && !loading && !user
    ? "Sign in with the account used for checkout to verify this payment."
    : paymentMessage;

  useEffect(() => {
    if (!billingReturn || !reference || loading) return;
    if (!user?.uid) return;

    let active = true;
    void verifyCheckout(reference).then((result) => {
      if (!active) return;
      if (result.ok) {
        setPaymentStatus("confirmed");
        return;
      }
      if (result.pending) {
        setPaymentStatus("pending");
        setPaymentMessage("Paystack has not confirmed this payment yet. Wait a moment, then check again.");
        return;
      }
      setPaymentStatus("error");
      setPaymentMessage(result.message ?? "We could not confirm this payment. Check the payment in Paystack, then try again.");
    }).catch((error: unknown) => {
      if (!active) return;
      setPaymentStatus("error");
      setPaymentMessage(error instanceof Error ? error.message : "We could not verify this payment.");
    });

    return () => { active = false; };
  }, [billingReturn, reference, loading, user?.uid, verificationAttempt]);

  if (loading || roleLoading || (role === "seller" && sellerAccountLoading)) return <DashboardSkeleton />;
  return (
    <>
      {billingReturn && (
        <div className="max-w-2xl mx-auto px-4 mb-6">
          <div className={`hippo-card p-4 border-l-4 ${verificationStatus === "error" ? "border-red-500" : "border-[#7ac142]"}`}>
            <p className="text-sm font-bold text-[#10243e]" role="status" aria-live="polite">
              {verificationStatus === "checking" && "Checking your Paystack payment…"}
              {verificationStatus === "confirmed" && <>Payment confirmed. Your plan is active. View it on the <Link href="/pricing" className="underline">pricing page</Link>.</>}
              {verificationStatus === "pending" && verificationMessage}
              {verificationStatus === "error" && verificationMessage}
            </p>
            {(verificationStatus === "pending" || verificationStatus === "error") && user && reference && (
              <button
                type="button"
                onClick={() => setVerificationAttempt((attempt) => attempt + 1)}
                className="mt-3 rounded-full border-2 border-[#10243e] px-4 py-2 text-xs font-extrabold text-[#10243e] hover:bg-[#10243e] hover:text-white"
              >
                Check payment again
              </button>
            )}
            {reference && (
              <p className="text-xs text-[#1d3a5f]/55 mt-1 font-mono">Reference: {reference}</p>
            )}
          </div>
        </div>
      )}
      {role === "seller" && !sellerAccountReady && initialSellerTab === "settings"
        ? (
          <div className="min-h-screen">
            <PageHero kicker="Account" title="Account settings" />
            <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
              <AccountSettings />
            </main>
          </div>
        )
        : role === "seller" && sellerAccountReady
        ? <SellerDashboard key={initialSellerTab ?? "default"} initialTab={initialSellerTab} />
        : <BuyerDashboard key={initialSellerTab === "settings" ? "settings" : "overview"} initialSection={initialSellerTab === "settings" ? "settings" : "overview"} />}
    </>
  );
}