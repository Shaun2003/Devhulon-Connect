"use client";
import { KIcon } from "@/lib/icons";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CONSENT_EVENT, readConsent, writeConsent } from "@/lib/consent";
import { SITE_SHORT } from "@/lib/site";

/**
 * Consent banner. Nothing but essential cookies is used until the visitor
 * chooses — required by POPIA and by Google's EU/UK consent policy for ads.
 * Rendered on every page (bottom, non-blocking, never covering content).
 */
export default function CookieConsent() {
  // undefined = still checking localStorage (avoids a flash on revisit)
  const [state, setState] = useState<"checking" | "asking" | "done">("checking");

  useEffect(() => {
    const sync = () => setState(readConsent() ? "done" : "asking");
    sync();
    window.addEventListener(CONSENT_EVENT, sync);
    return () => window.removeEventListener(CONSENT_EVENT, sync);
  }, []);

  if (state !== "asking") return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-3 pb-3 pointer-events-none">
      <div className="pointer-events-auto max-w-3xl mx-auto rounded-2xl bg-[#0b1e33] text-white shadow-2xl border border-white/10 p-4 sm:p-5">
        <p className="text-sm font-bold">Cookies on this site <KIcon name="cakeSlice" size={14} className="inline shrink-0" /></p>
        <p className="text-xs text-white/70 mt-1 leading-5">
          We use essential storage to keep the site working. With your permission we also use Google AdSense to show
          ads — that&rsquo;s one of the ways {SITE_SHORT} stays free for buyers and sellers. We never sell your data.{" "}
          <Link href="/cookie-policy" className="underline hover:text-[#ffc72c]">Cookie policy</Link>
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <button
            onClick={() => { writeConsent("all"); setState("done"); }}
            className="btn-hippo !py-2 !px-4 text-sm"
          >
            Accept all
          </button>
          <button
            onClick={() => { writeConsent("essential"); setState("done"); }}
            className="text-sm font-bold text-white/80 border-2 border-white/25 rounded-full px-4 py-2 hover:bg-white/10"
          >
            Essential only
          </button>
          <span className="text-[11px] text-white/40 self-center">You can change this any time by clearing site data.</span>
        </div>
      </div>
    </div>
  );
}