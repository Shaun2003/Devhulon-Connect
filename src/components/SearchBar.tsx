"use client";
import { useState } from "react";
import { KIcon } from "@/lib/icons";
import { SERVICE_GROUPS } from "@/data/taxonomy";
import { zaPlaceSuggestions } from "@/data/za-locations";
import { trackAnalyticsEvent } from "@/lib/track-analytics";

export function PlaceSuggestions({ id }: { id: string }) {
  return (
    <datalist id={id}>
      {zaPlaceSuggestions.map((place) => (
        <option key={`${place.value}-${place.label}`} value={place.value} label={place.label} />
      ))}
    </datalist>
  );
}

/**
 * The hero search.
 *
 * Redesigned to be minimal and professional: no emoji, no stacked floating
 * labels, no oversized pill with a giant button. One bordered field, a single
 * dividing rule, and a compact action. Submits straight to /find-pro so a
 * searcher lands on matched pros with numbers, not a category index.
 */
export default function SearchBar({ citySlug = "all" }: { citySlug?: string }) {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");

  return (
    <form
      action="/find-pro"
      method="get"
      onSubmit={() => trackAnalyticsEvent("search_submitted", "search")}
      className="w-full max-w-2xl bg-white rounded-2xl border border-[#e2e8f0] shadow-[0_8px_28px_-14px_rgba(16,36,62,0.35)] focus-within:border-[#7ac142] focus-within:shadow-[0_8px_28px_-10px_rgba(122,193,66,0.45)] transition-all duration-200"
    >
      <div className="flex flex-col sm:flex-row sm:items-stretch">
        <label className="flex-1 flex items-center gap-3 px-4 py-3.5">
          <KIcon name="search" size={18} className="text-[#558c2b] shrink-0" />
          <span className="flex-1 min-w-0">
            <span className="sr-only">Service needed</span>
            <input
              name="need"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              required
              placeholder="What do you need? e.g. a plumber"
              className="w-full bg-transparent outline-none text-[15px] text-[#10243e] placeholder:text-[#1d3a5f]/40"
            />
          </span>
        </label>

        <span className="hidden sm:block w-px bg-[#e2e8f0]" aria-hidden />

        <label className="flex-1 flex items-center gap-3 px-4 py-3.5 sm:border-l sm:border-[#e2e8f0]">
          <KIcon name="mapPin" size={18} className="text-[#558c2b] shrink-0" />
          <span className="flex-1 min-w-0">
            <span className="sr-only">Location</span>
            <input
              name="place"
              list="sa-service-places"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={citySlug && citySlug !== "all" ? `Suburb in ${citySlug}` : "Suburb or town"}
              className="w-full bg-transparent outline-none text-[15px] text-[#10243e] placeholder:text-[#1d3a5f]/40"
            />
          </span>
        </label>

        <div className="px-3 pb-3 sm:px-0 sm:pb-0 sm:pr-3 flex">
          <button
            type="submit"
            className="w-full sm:w-auto sm:h-full bg-[#10243e] hover:bg-[#1d3a5f] text-white font-bold text-sm rounded-xl sm:rounded-r-none px-5 py-3 transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap"
          >
            Find pros
            <KIcon name="arrowRight" size={16} />
          </button>
        </div>
      </div>
      <PlaceSuggestions id="sa-service-places" />

      {/* Carry the city being browsed through, so a city page never leaks elsewhere. */}
      {citySlug && citySlug !== "all" && <input type="hidden" name="city" value={citySlug} />}
    </form>
  );
}

/** Compact icon row of popular services, shown under the hero on the homepage. */
export function QuickServiceChips() {
  return (
    <div className="flex flex-wrap items-center gap-2 justify-center">
      <span className="text-xs font-bold text-white/55">Popular:</span>
      {SERVICE_GROUPS.slice(0, 5).map((g) => (
        <a
          key={g.slug}
          href={`/find-pro?need=${encodeURIComponent(g.name)}`}
          onClick={() => trackAnalyticsEvent("search_submitted", "search")}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-bold text-white/85 hover:bg-white/20 hover:border-white/40 transition-colors"
        >
          <KIcon name={g.icon} size={13} />
          {g.name}
        </a>
      ))}
    </div>
  );
}
