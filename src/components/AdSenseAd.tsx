"use client";
import { useEffect, useRef } from "react";

/**
 * Google AdSense adapter.
 * - Set NEXT_PUBLIC_ADSENSE_CLIENT (ca-pub-…) in .env.local to serve real ads.
 * - Until then, leaves no empty ad placeholder in the page.
 * Google's own guidance: keep ad count below content, label the unit, no accidental clicks.
 * Each ad unit needs its own slot ID (create one in AdSense → Ads → Ad units).
 */
const CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? "";
const SLOT = process.env.NEXT_PUBLIC_ADSENSE_SLOT ?? "";

export default function AdSenseAd({ slot, label = "Advertisement" }: { slot?: string; label?: string }) {
  const pushed = useRef(false);
  const adSlot = slot ?? SLOT;
  useEffect(() => {
    if (!CLIENT || !adSlot || pushed.current) return;
    pushed.current = true;
    try {
      const w = window as unknown as { adsbygoogle?: unknown[] };
      w.adsbygoogle = w.adsbygoogle ?? [];
      w.adsbygoogle.push({});
    } catch {
      /* non-fatal: ad just won't render */
    }
  }, [adSlot]);

  if (!CLIENT || !adSlot) return null;
  return (
    <div className="w-full overflow-hidden" aria-label={label}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-[#1d3a5f]/40 pb-1">{label}</p>
      <ins
        className="adsbygoogle"
        style={{ display: "block", minHeight: "90px" }}
        data-ad-client={CLIENT}
        data-ad-slot={adSlot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}