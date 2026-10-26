"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/components/AuthProvider";
import { KIcon, type IconKey } from "@/lib/icons";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";
import { SITE_SHORT } from "@/lib/site";

const LINK_ICONS: Record<string, IconKey> = {
  "/dashboard": "profile",
  "/services": "layers",
  "/request-quote": "message",
  "/find-pro": "search",
  "/jobs": "briefcase",
  "/events": "calendar",
  "/deals": "tag",
  "/places": "mapPin",
  "/guides": "file",
};

export default function MobileMenu({
  navLinks,
  exploreLinks,
}: {
  navLinks: { href: string; label: string }[];
  exploreLinks: { href: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const { isAdmin, user, role } = useAuth();
  const profileLabel = user ? (role === "seller" ? "Seller profile" : "My profile") : "Sign in / Profile";
  useBodyScrollLock(open);

  function navigationLink(link: { href: string; label: string }) {
    return (
      <Link
        key={link.href}
        href={link.href}
        onClick={() => setOpen(false)}
        className="group flex min-h-12 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-extrabold text-[#10243e] transition hover:bg-white hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7ac142]"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-[#558c2b] shadow-sm ring-1 ring-[#e7eef5] transition group-hover:bg-[#e8f6d8]">
          <KIcon name={LINK_ICONS[link.href] ?? "layers"} size={17} />
        </span>
        <span className="flex-1">{link.label}</span>
        <KIcon name="arrowRight" size={15} className="text-[#1d3a5f]/30 transition group-hover:translate-x-0.5 group-hover:text-[#558c2b]" />
      </Link>
    );
  }

  return (
    <div className="lg:hidden ml-1 sm:ml-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="grid h-10 w-10 place-items-center rounded-full bg-[#f2f6fa] text-[#10243e] transition hover:bg-[#e7eef5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7ac142] focus-visible:ring-offset-2"
        aria-label="Toggle menu"
        aria-expanded={open}
        aria-controls="mobile-navigation"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default bg-[#0b1e33]/55 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
            aria-label="Close navigation menu"
          />
          <aside
            id="mobile-navigation"
            role="dialog"
            aria-modal="true"
            aria-label="Mobile navigation"
            className="fixed inset-y-0 right-0 z-50 flex h-[100dvh] w-[min(88vw,23rem)] flex-col overflow-y-auto border-l border-white/70 bg-[#f7fafc] shadow-2xl"
          >
            <div className="hippo-hero relative shrink-0 overflow-hidden px-5 pb-5 pt-[max(1rem,env(safe-area-inset-top))] text-white">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <Link
                    href="/"
                    onClick={() => setOpen(false)}
                    aria-label={`${SITE_SHORT} home`}
                    className="inline-flex rounded-xl bg-white p-2 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7ac142] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1e33]"
                  >
                    <Image
                      src="/devhulon-connect-logo.png"
                      alt={SITE_SHORT}
                      width={1600}
                      height={639}
                      priority
                      className="h-auto w-36 max-[360px]:w-32"
                    />
                  </Link>
                  <p className="mt-3 text-xs font-semibold text-white/70">Discover services across South Africa</p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7ac142]"
                  aria-label="Close menu"
                >
                  <KIcon name="close" size={18} />
                </button>
              </div>
            </div>

            <nav className="flex-1 space-y-5 px-4 py-5" aria-label="Mobile navigation">
              <div>
                <p className="mb-2 px-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#558c2b]">Main</p>
                <div className="space-y-1">
                  {navigationLink({ href: "/dashboard", label: profileLabel })}
                  {navLinks.map(navigationLink)}
                </div>
              </div>
              <div>
                <p className="mb-2 px-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#558c2b]">Explore</p>
                <div className="space-y-1">{exploreLinks.map(navigationLink)}</div>
              </div>
              {isAdmin && (
                <div className="border-t border-[#d6e1ec] pt-3">
                  <Link
                    href="/admin"
                    onClick={() => setOpen(false)}
                    className="group flex min-h-12 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-extrabold text-[#10243e] transition hover:bg-white hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7ac142]"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#e8f6d8] text-[#3c6b1d]">
                      <KIcon name="shieldCheck" size={17} />
                    </span>
                    <span className="flex-1">Admin console</span>
                    <KIcon name="arrowRight" size={15} className="text-[#1d3a5f]/30 transition group-hover:translate-x-0.5 group-hover:text-[#558c2b]" />
                  </Link>
                </div>
              )}
            </nav>

            <div className="shrink-0 border-t border-[#e7eef5] px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
              <p className="text-center text-[11px] font-semibold text-[#1d3a5f]/45">{SITE_SHORT} · Connecting buyers and service providers</p>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
