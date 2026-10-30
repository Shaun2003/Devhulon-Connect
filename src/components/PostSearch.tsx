"use client";

import { useState } from "react";
import { KIcon } from "@/lib/icons";
import type { Role } from "@/components/AuthProvider";

const SEARCH_FIELDS = [
  "title", "name", "detail", "description", "desc", "excerpt", "summary", "company", "business",
  "venue", "suburb", "city", "province", "category", "type", "pay", "fee",
  "date", "validUntil", "readTime", "address", "location", "openingHours",
  "requirements", "organizer", "tags", "services", "serviceAreas",
] as const;

export function matchesPostSearch<T extends Record<string, unknown>>(post: T, search: string): boolean {
  const term = search.trim().toLocaleLowerCase();
  if (!term) return true;
  return SEARCH_FIELDS.some((field) => String(post[field] ?? "").toLocaleLowerCase().includes(term));
}

export default function PostSearch({
  role,
  value,
  onChange,
  label = "posts",
}: {
  role: Role;
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  if (role === "seller") return null;

  return (
    <div className="flex min-w-0 items-center gap-2">
      {open && (
        <input
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={`Search ${label}`}
          aria-label={`Search ${label}`}
          autoFocus
          className="min-w-0 w-36 rounded-xl border border-[#d6e1ec] bg-white px-3 py-2 text-sm text-[#10243e] outline-none focus:border-[#7ac142] sm:w-48"
        />
      )}
      <button
        type="button"
        onClick={() => {
          if (open) onChange("");
          setOpen(!open);
        }}
        aria-label={open ? `Close ${label} search` : `Search ${label}`}
        aria-expanded={open}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#d6e1ec] bg-white text-[#1d3a5f] transition hover:border-[#7ac142] hover:text-[#558c2b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7ac142]"
      >
        <KIcon name={open ? "close" : "search"} size={16} />
      </button>
    </div>
  );
}
