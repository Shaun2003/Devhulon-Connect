"use client";
import { useMemo } from "react";
import Link from "next/link";
import { useRealtime, subscribeTopBusinesses } from "@/lib/realtime";
import { CATEGORY_GROUPS, SERVICE_GROUPS } from "@/data/taxonomy";
import { getBgUrl } from "@/lib/utils";

type Row = Record<string, unknown>;

/** Cover image first, then the first gallery upload; null when they uploaded nothing. */
function sellerPhoto(b: Row): string | null {
  const cover = typeof b.coverImageUrl === "string" ? b.coverImageUrl : "";
  if (cover.trim()) return cover;
  const photos = Array.isArray(b.photos) ? b.photos : [];
  const first = photos.find((p): p is string => typeof p === "string" && p.length > 0);
  return first ?? null;
}

/**
 * Homepage "Explore Services" tiles — LIVE from Firestore, seller photos FIRST.
 *
 * Priority: the cover / gallery photo of the best-rated business in the group
 * (CATEGORY_GROUPS), because that is work a real seller actually uploaded and
 * it updates the moment they upload. When no business in a group has a photo
 * yet — the common case early on, and the reason tiles used to render as
 * featureless navy blanks — the tile falls back to the deterministic stock crop
 * for that group slug (`getBgUrl`), so "Explore Services" always shows an image
 * instead of looking broken. A group never renders empty again.
 */
export default function HomeServiceGroups() {
  const biz = useRealtime<Row>((cb, onErr) => subscribeTopBusinesses(cb as never, onErr), [], []);

  // First photo per group, walking the feed in its best-rated order so the
  // strongest listing with a photo represents the group.
  const groupPhotos = useMemo(() => {
    const out: Record<string, string> = {};
    for (const b of biz.rows) {
      const group = CATEGORY_GROUPS[String(b.categorySlug ?? "")];
      if (!group || out[group]) continue;
      const photo = sellerPhoto(b);
      if (photo) out[group] = photo;
    }
    return out;
  }, [biz.rows]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 items-stretch">
      {SERVICE_GROUPS.map((g) => {
        // Seller photo when one exists; deterministic stock otherwise (same slug
        // → same image on every render, no flicker between loads).
        const photo = groupPhotos[g.slug] ?? getBgUrl(g.slug);

        return (
          <Link
            key={g.slug}
            href={`/services#${g.slug}`}
            className="bg-[#0b1e33] rounded-2xl p-6 hover:shadow-2xl transition-all duration-300 group flex flex-col justify-end items-start text-left overflow-hidden relative min-h-[160px] sm:min-h-[220px]"
          >
            <div
              className="absolute top-0 left-0 w-full h-full bg-cover bg-center transition-transform duration-700 group-hover:scale-110 z-0"
              style={{ backgroundImage: `url('${photo}')` }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0b1e33]/95 via-[#0b1e33]/50 to-black/10 z-10 transition-opacity duration-300 group-hover:opacity-90"></div>
            <div className="relative z-20 w-full">
              <p className="font-extrabold text-white text-lg sm:text-2xl leading-tight group-hover:text-[#7ac142] transition-colors">{g.name}</p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
