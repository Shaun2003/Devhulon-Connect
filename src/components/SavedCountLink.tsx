"use client";
import { KIcon } from "@/lib/icons";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { useSavedItems } from "@/components/SavedItemsProvider";

/**
 * Header shortcut to the buyer dashboard's saved list (§19), carrying a live
 * count straight from SavedItemsProvider — no extra Firestore query. Renders
 * nothing when signed out or when the list is empty, so the header stays clean.
 */
export default function SavedCountLink() {
  const { user } = useAuth();
  const { count } = useSavedItems();
  if (!user || count === 0) return null;
  return (
    <Link
      href="/dashboard#saved"
      aria-label={`Saved items (${count})`}
      className="relative w-9 h-9 grid place-items-center rounded-xl bg-[#f2f6fa] hover:bg-[#e7eef5] text-[#10243e] transition"
    >
      <KIcon name="tag" size={18} className="shrink-0" />
      <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-[#7ac142] text-[#0b1e33] text-[10px] font-black">
        {count > 99 ? "99+" : count}
      </span>
    </Link>
  );
}