"use client";
/* eslint-disable @next/next/no-img-element -- portfolio before/after shots are
   arbitrary seller-supplied remote URLs with an onError→IMG_FALLBACK fallback;
   next/image would need a remotePatterns whitelist for every possible host. */
import { useState } from "react";
import { useRealtime, subscribePortfolio } from "@/lib/realtime";
import { portfolioImage, portfolioPair, type PortfolioItem } from "@/lib/portfolio";
import { IMG_FALLBACK } from "@/lib/utils";
import { KIcon } from "@/lib/icons";

type Row = Record<string, unknown>;

function rowToItem(row: Row): PortfolioItem {
  const list = (v: unknown) => (Array.isArray(v) ? (v as unknown[]).map(String) : []);
  return {
    id: String(row.id ?? ""),
    ownerUid: String(row.ownerUid ?? ""),
    businessId: String(row.businessId ?? ""),
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    completedAt: String(row.completedAt ?? ""),
    beforeUrl: String(row.beforeUrl ?? ""),
    afterUrl: String(row.afterUrl ?? ""),
    imageUrl: String(row.imageUrl ?? ""),
    tags: list(row.tags),
  };
}

/**
 * Public portfolio on a seller profile (§9). Realtime, so a seller's new work
 * sample appears on their live profile without a redeploy. Renders NOTHING when
 * there is nothing to show — a public page should never advertise an empty wall.
 */
export default function PortfolioLive({ businessId }: { businessId: string }) {
  const feed = useRealtime<Row>((cb, onErr) => subscribePortfolio(businessId, cb as never, onErr), [], [businessId]);
  const [view, setView] = useState<Record<string, "before" | "after">>({});

  const items = feed.rows.map(rowToItem).filter((i) => i.title);
  if (items.length === 0) return null;

  const show = items.slice(0, 9);

  return (
    <div className="hippo-card p-5">
      <div className="flex items-center gap-2">
        <KIcon name="camera" size={18} className="text-[#558c2b]" />
        <h2 className="font-black text-[#10243e]">Recent work ({items.length})</h2>
      </div>
      <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3 items-start">
        {show.map((item) => {
          const pair = portfolioPair(item);
          const side: "before" | "after" = view[item.id] ?? "after";
          const src = pair ? (side === "after" ? item.afterUrl : item.beforeUrl) : portfolioImage(item);
          return (
            <article key={item.id} className="rounded-2xl border border-[#e7eef5] overflow-hidden bg-white">
              {src ? (
                <div className="relative">
                  <img
                    src={src}
                    alt={item.title}
                    loading="lazy"
                    onError={(ev) => { ev.currentTarget.src = IMG_FALLBACK; }}
                    className="h-44 w-full object-cover"
                  />
                  {pair && (
                    <div className="absolute top-2 left-2 flex gap-1">
                      {(["before", "after"] as const).map((s) => (
                        <button
                          key={s}
                          onClick={() => setView((v) => ({ ...v, [item.id]: s }))}
                          aria-pressed={side === s}
                          className={`text-[10px] font-black uppercase rounded-full px-2.5 py-1 transition ${
                            side === s ? "bg-[#10243e] text-white" : "bg-white/90 text-[#10243e] hover:bg-white"
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
              <div className="p-3">
                <b className="block text-sm text-[#10243e]">{item.title}</b>
                {item.description ? (
                  <p className="text-xs text-[#1d3a5f]/70 mt-1 line-clamp-3">{item.description}</p>
                ) : null}
                <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px] text-[#1d3a5f]/55">
                  {item.completedAt ? <span>{item.completedAt}</span> : null}
                  {item.tags.slice(0, 3).map((t) => (
                    <span key={t} className="bg-[#f2f6fa] rounded-full px-2 py-0.5 font-bold">#{t}</span>
                  ))}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {items.length > show.length && (
        <p className="text-xs text-[#1d3a5f]/55 mt-3">
          Showing {show.length} of {items.length} — ask the business for more examples of this kind of work.
        </p>
      )}
    </div>
  );
}
