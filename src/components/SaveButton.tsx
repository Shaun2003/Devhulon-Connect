"use client";
import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useSavedItems } from "@/components/SavedItemsProvider";
import SignInModal from "@/components/SignInModal";
import { saveDeal, saveEvent, savePlace, saveGuide, saveJob, unsave } from "@/lib/repo";

export type SaveType = "deal" | "event" | "place" | "guide" | "job";

type Props = {
  type: SaveType;
  /** Firestore doc id, or the static slug for places/guides. */
  id: string;
  title: string;
  suburb?: string;
  businessId?: string;
  slug?: string;
  /** `onDark` renders a light pill for use inside the navy hero header. */
  tone?: "light" | "onDark";
  className?: string;
};

const NOUN: Record<SaveType, string> = { deal: "deal", event: "event", place: "place", guide: "guide", job: "job" };

/**
 * Save / Saved toggle for deals, events, places, guides and jobs (§19).
 * Writes to `saved_items/{uid}__{type}__{id}`, which is exactly the path the
 * buyer dashboard reads and deletes — so inline removal stays in sync.
 */
export default function SaveButton({
  type,
  id,
  title,
  suburb,
  businessId,
  slug,
  tone = "light",
  className = "",
}: Props) {
  const { user } = useAuth();
  const { isSaved } = useSavedItems();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [signInOpen, setSignInOpen] = useState(false);

  // Firestore applies a write to the local snapshot straight away (latency
  // compensation), so this flips as soon as the write is issued — no optimistic
  // mirror state, and nothing to reconcile when the server confirms.
  const shown = id ? isSaved(type, id) : false;

  if (!id) return null;

  async function onClick() {
    if (!user) {
      // Same modal the header/chat use, so signed-out visitors get a real
      // sign-in path instead of dead-end copy.
      setSignInOpen(true);
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      if (shown) {
        await unsave(type, id);
        setMsg(`Removed from saved ${NOUN[type]}s.`);
      } else {
        const meta = { title, suburb, businessId, slug };
        if (type === "deal") await saveDeal(id, meta);
        else if (type === "event") await saveEvent(id, meta);
        else if (type === "place") await savePlace(id, meta);
        else if (type === "guide") await saveGuide(id, meta);
        else await saveJob(id, meta);
        setMsg("Saved — see it in your dashboard ✓");
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not save — try again.");
    } finally {
      setBusy(false);
    }
  }

  const base =
    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-extrabold border-2 transition disabled:opacity-60";
  const palette = shown
    ? tone === "onDark"
      ? "bg-[#ffc72c] text-[#10243e] border-[#ffc72c]"
      : "bg-[#10243e] text-white border-[#10243e]"
    : tone === "onDark"
      ? "border-white/40 text-white hover:bg-white/10"
      : "border-[#d6e1ec] text-[#1d3a5f] hover:border-[#7ac142]";

  return (
    <span className={`inline-flex flex-col items-start gap-1 ${className}`}>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        aria-pressed={shown}
        aria-label={shown ? `Remove ${title} from saved items` : `Save ${title}`}
        className={`${base} ${palette}`}
      >
        
        {busy ? "Saving…" : shown ? "Saved" : "Save"}
      </button>
      {msg && (
        <span className={`text-[10px] font-bold ${tone === "onDark" ? "text-white/80" : "text-[#1d3a5f]/60"}`}>{msg}</span>
      )}
      {/* SignInModal portals to <body>, so nesting it in this inline wrapper is harmless. */}
      <SignInModal open={signInOpen} onClose={() => setSignInOpen(false)} presetRole="buyer" />
    </span>
  );
}
