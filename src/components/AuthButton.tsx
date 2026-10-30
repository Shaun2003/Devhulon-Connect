"use client";
/* eslint-disable @next/next/no-img-element -- profile images come from Firebase Storage URLs. */
import { useState } from "react";
import Link from "next/link";
import { useAuth } from "./AuthProvider";
import SignInModal from "./SignInModal";

/**
 * Header auth control. Sits on the WHITE header bar, so it must use dark
 * styles. Signed-in users get a role-aware dashboard link + sign out.
 * Sign-in opens the role-aware modal with each role's supported sign-in options.
 */
export default function AuthButton() {
  const { user, profileName, profilePhotoURL, role, roleLoading, sellerAccountReady, sellerAccountLoading, loading, cancelSellerSetup, signOutNow, unconfigured } = useAuth();
  const [open, setOpen] = useState(false);
  const [cancelingSetup, setCancelingSetup] = useState(false);

  if (unconfigured) {
    return (
      <Link href="/contact" className="text-sm font-bold text-[#10243e] bg-[#f2f6fa] hover:bg-[#e7eef5] rounded-xl px-3.5 py-2 transition">
        Get in touch
      </Link>
    );
  }

  if (loading || (user && roleLoading) || (role === "seller" && sellerAccountLoading)) {
    return <span className="inline-block h-9 w-24 rounded-xl bg-[#f2f6fa] animate-pulse" aria-hidden />;
  }

  if (!user) {
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          className="text-sm font-extrabold text-[#10243e] bg-[#f2f6fa] hover:bg-[#e7eef5] rounded-xl px-3.5 py-2 transition whitespace-nowrap"
        >
          Sign in
        </button>
        <SignInModal open={open} onClose={() => setOpen(false)} />
      </>
    );
  }

  const isSeller = role === "seller";
  const dashboardLabel = isSeller && sellerAccountReady ? "Seller hub" : "Buyer dashboard";
  const initial = (profileName || user.displayName || user.email || "?").slice(0, 1).toUpperCase();
  return (
    <span className="flex items-center gap-2">
      <div className="relative group">
        <button className="hidden sm:flex items-center gap-1.5 text-sm font-extrabold text-[#10243e] bg-[#f2f6fa] hover:bg-[#e7eef5] rounded-xl px-3 py-2 transition border-none cursor-pointer">
          <span className="grid h-6 w-6 place-items-center overflow-hidden rounded-full bg-[#7ac142] text-[10px] font-black text-[#0b1e33]">
            {profilePhotoURL
              ? <img src={profilePhotoURL} alt="" className="h-full w-full object-cover" />
              : initial}
          </span>
          {isSeller ? "Seller profile" : "Buyer profile"} <span className="text-[10px]">▼</span>
        </button>
        <div className="absolute top-full right-0 mt-2 w-48 bg-white border border-[#e7eef5] rounded-xl shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 flex flex-col overflow-hidden">
          <Link href="/dashboard" className="block px-4 py-2.5 text-sm font-semibold text-[#10243e] hover:bg-[#f2f6fa] hover:text-[#558c2b]">
            {dashboardLabel}
          </Link>
          {isSeller && !sellerAccountReady && (
              <>
                <Link href="/register-seller" className="block px-4 py-2.5 text-sm font-semibold text-[#10243e] hover:bg-[#f2f6fa] hover:text-[#558c2b]">
                  Continue seller setup
                </Link>
                <button
                  type="button"
                  disabled={cancelingSetup}
                  onClick={() => {
                    if (!window.confirm("Cancel seller setup and return to your buyer account?")) return;
                    setCancelingSetup(true);
                    void cancelSellerSetup()
                      .catch((error: unknown) => window.alert(error instanceof Error ? error.message : "Could not cancel seller setup."))
                      .finally(() => setCancelingSetup(false));
                  }}
                  className="block w-full px-4 py-2.5 text-left text-sm font-semibold text-[#10243e] hover:bg-[#f2f6fa] disabled:opacity-60"
                >
                  {cancelingSetup ? "Cancelling…" : "Cancel seller setup"}
                </button>
              </>
          )}
          <div className="border-t border-[#e7eef5]" />
          <button onClick={signOutNow} className="text-left w-full block px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-[#f2f6fa]">
            Sign out
          </button>
        </div>
      </div>
    </span>
  );
}
