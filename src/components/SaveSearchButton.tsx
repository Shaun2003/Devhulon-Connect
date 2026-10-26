"use client";
import { KIcon } from "@/lib/icons";
import { useState } from "react";
import { saveSearch } from "@/lib/repo";
import { useAuth } from "@/components/AuthProvider";
import SignInModal from "@/components/SignInModal";

/** <KIcon name="bell" size={14} className="inline shrink-0" /> Save a category+suburb search — shows up in the buyer dashboard with live counts. */
export default function SaveSearchButton({ category, suburb, city }: { category: string; suburb: string; city: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSave() {
    setBusy(true);
    try {
      await saveSearch(category, suburb, city);
      setMsg("Saved — see it in your dashboard ✓");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    return (
      <>
        <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#10243e] px-4 py-2 text-sm font-extrabold text-[#10243e] hover:bg-[#10243e] hover:text-white transition">
          <KIcon name="bell" size={14} className="inline shrink-0" /> Save search
        </button>
        <SignInModal open={open} onClose={() => setOpen(false)} />
      </>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button onClick={onSave} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#10243e] px-4 py-2 text-sm font-extrabold text-[#10243e] hover:bg-[#10243e] hover:text-white transition disabled:opacity-60">
        {busy ? "Saving…" : <><KIcon name="bell" size={15} className="inline shrink-0" /> Save this search</>}
      </button>
      {msg && <span className="text-xs font-bold text-[#3c6b1d]">{msg}</span>}
    </span>
  );
}