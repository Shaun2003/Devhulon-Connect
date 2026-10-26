"use client";
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
  const { user, role, loading, signOutNow, unconfigured } = useAuth();
  const [open, setOpen] = useState(false);

  if (unconfigured) {
    return (
      <Link href="/contact" className="text-sm font-bold text-[#10243e] bg-[#f2f6fa] hover:bg-[#e7eef5] rounded-xl px-3.5 py-2 transition">
        Get in touch
      </Link>
    );
  }

  if (loading) return <span className="inline-block h-9 w-20 rounded-xl bg-[#f2f6fa] animate-pulse" aria-hidden />;

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

  const initial = (user.displayName ?? user.email ?? "?").slice(0, 1).toUpperCase();
  return (
    <span className="flex items-center gap-2">
      <div className="relative group">
        <button className="hidden sm:flex items-center gap-1.5 text-sm font-extrabold text-[#10243e] bg-[#f2f6fa] hover:bg-[#e7eef5] rounded-xl px-3 py-2 transition border-none cursor-pointer">
          <span className="grid place-items-center w-5 h-5 rounded-full bg-[#7ac142] text-[10px] font-black text-[#0b1e33]">{initial}</span>
          Profile <span className="text-[10px]">▼</span>
        </button>
        <div className="absolute top-full right-0 mt-2 w-48 bg-white border border-[#e7eef5] rounded-xl shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 flex flex-col overflow-hidden">
          <Link href="/dashboard" className="block px-4 py-2.5 text-sm font-semibold text-[#10243e] hover:bg-[#f2f6fa] hover:text-[#558c2b]">
            {role === "seller" ? "Seller hub" : "My dashboard"}
          </Link>
          {role !== "seller" && (
            <>
              <Link href="/request-quote" className="block px-4 py-2.5 text-sm font-semibold text-[#10243e] hover:bg-[#f2f6fa] hover:text-[#558c2b]">
                Request a quote
              </Link>
            </>
          )}
          <button onClick={signOutNow} className="text-left w-full block px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-[#f2f6fa]">
            Sign out
          </button>
        </div>
      </div>
    </span>
  );
}
