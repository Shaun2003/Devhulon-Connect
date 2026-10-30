"use client";

import { useState } from "react";
import { KIcon } from "@/lib/icons";
import { CREDIT_PACKS } from "@/lib/credits";
import { formatZAR } from "@/lib/plans";

/**
 * The credit-pack purchase grid (marketplace spec §5–§6).
 *
 * Sellers buy credits in advance and spend them unlocking leads. The per-credit
 * price falls as the pack grows — that gradient is deliberate, it is what moves a
 * seller from the starter pack to the one that actually fits their volume. This
 * component only starts a hosted checkout; the wallet is credited by the webhook,
 * never here.
 */
export default function CreditPackGrid({ onBuy }: { onBuy: (packId: string) => void | Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);

  async function buy(id: string) {
    setBusy(id);
    try {
      await onBuy(id);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid sm:grid-cols-3 gap-3 items-stretch">
      {CREDIT_PACKS.map((p) => (
        <div key={p.id} className={`hippo-card p-5 flex flex-col ${p.popular ? "border-2 !border-[#7ac142]" : ""}`}>
          {p.popular && (
            <span className="self-start text-[10px] font-black uppercase tracking-widest bg-[#7ac142] text-[#0b1e33] rounded-full px-2 py-0.5 mb-2">
              Most popular
            </span>
          )}
          <h3 className="text-xs font-black uppercase tracking-[0.16em] text-[#558c2b]">{p.name}</h3>
          <p className="text-3xl font-black text-[#10243e] mt-1">
            {formatZAR(p.price)}
          </p>
          <p className="text-2xl font-black text-[#10243e] mt-2">
            {p.credits}
            <span className="text-sm font-bold text-[#1d3a5f]/50"> credits</span>
          </p>
          <p className="text-xs text-[#1d3a5f]/60 mt-1">{p.tagline}</p>
          <ul className="text-sm mt-4 space-y-2 flex-1 text-[#10243e]">
            {p.features.map((f) => (
              <li key={f} className="flex gap-2">
                <span className="text-[#7ac142] font-black shrink-0"><KIcon name="check" size={14} /></span>
                {f}
              </li>
            ))}
          </ul>
          <button
            disabled={busy !== null}
            onClick={() => buy(p.id)}
            className={`mt-5 text-center text-sm font-extrabold rounded-full px-4 py-3 disabled:opacity-50 ${p.popular ? "btn-hippo" : "border-2 border-[#10243e] text-[#10243e] hover:bg-[#10243e] hover:text-white transition"}`}
          >
            {busy === p.id ? "Starting…" : `Buy ${p.credits} credits `}
          </button>
        </div>
      ))}
    </div>
  );
}
