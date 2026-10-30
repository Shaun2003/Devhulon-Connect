import { KIcon } from "@/lib/icons";
import { Fragment } from "react";
import Link from "next/link";
import type { Business } from "@/data/businesses";
import { RatingSummary, Badge } from "@/components/ui";
import { normalizePlanId } from "@/lib/plans";

/**
 * Hippo-style side-by-side comparison matrix for a suburb+category.
 * Compares rating, services, price and hours in one view — the KASI USP.
 * Single flat CSS grid (6 columns shared by every header + row cell) so
 * columns always align; scrolls horizontally on small screens.
 */
const TEMPLATE = "minmax(230px,1.7fr) minmax(90px,0.8fr) minmax(200px,1.6fr) minmax(150px,1.5fr) minmax(120px,1.1fr) minmax(110px,1fr)";

export default function ComparisonTable({
  businesses: list,
  categoryName,
  suburbName,
}: {
  businesses: Business[];
  categoryName: string;
  suburbName: string;
}) {
  if (!list.length) return null;

  const head = "px-4 py-3 text-[11px] font-black uppercase tracking-widest text-white/80";
  const cell = "px-4 py-4 text-sm";

  return (
    <div className="hippo-card overflow-hidden !rounded-2xl">
      <div className="overflow-x-auto">
        <div
          className="min-w-[950px]"
          style={{ display: "grid", gridTemplateColumns: TEMPLATE }}
        >
          {/* Header row */}
          <div key="h-biz" className={`${head} bg-[#10243e] text-white`}>Business</div>
          <div key="h-rate" className={`${head} bg-[#10243e] text-white`}>Rating</div>
          <div key="h-svc" className={`${head} bg-[#10243e] text-white`}>Services</div>
          <div key="h-price" className={`${head} bg-[#10243e] text-white`}>Price point</div>
          <div key="h-hrs" className={`${head} bg-[#10243e] text-white`}>Hours</div>
          <div key="h-cta" className={`${head} bg-[#10243e] text-white`}>Next step</div>

          {list.map((b) => {
            const plan = normalizePlanId(b.plan);
            const premium = plan === "premium";
            const rowBg = premium ? "bg-[#f3f9ec]" : b.verified ? "bg-[#fbfdf8]" : "bg-white";
            return (
              <Fragment key={b.id}>
                <div className={`${cell} ${rowBg} border-t border-[#e7eef5]`}>
                  <Link href={`/business/${b.id}`} className="font-extrabold text-[#10243e] hover:text-[#558c2b] hover:underline leading-tight">
                    {b.name}
                  </Link>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {b.verified && <Badge><KIcon name="check" size={14} className="inline shrink-0" /> Verified</Badge>}
                    {premium && <span className="whitespace-nowrap text-[9px] font-black uppercase tracking-widest bg-[#e8f6d8] text-[#3c6b1d] rounded-full px-2 py-0.5">Premium</span>}
                    {b.featured && <span className="whitespace-nowrap text-[9px] font-black uppercase tracking-widest bg-[#e8f6d8] text-[#3c6b1d] rounded-full px-2 py-0.5">Featured</span>}
                  </div>
                </div>

                <div className={`${cell} ${rowBg} border-t border-[#e7eef5]`}>
                  <RatingSummary rating={b.rating} reviews={b.reviewCount} empty="No reviews" />
                </div>

                <div className={`${cell} ${rowBg} border-t border-[#e7eef5]`}>
                  <ul className="space-y-1 text-[13px] text-[#1d3a5f]/80">
                    {b.services.slice(0, 3).map((s) => (
                      <li key={s} className="flex gap-1.5"><span className="text-[#7ac142]">•</span>{s}</li>
                    ))}
                  </ul>
                </div>

                <div className={`${cell} ${rowBg} border-t border-[#e7eef5] text-[13px] text-[#1d3a5f]/85`}>
                  <p className="line-clamp-2">{b.priceNote}</p>
                </div>

                <div className={`${cell} ${rowBg} border-t border-[#e7eef5] text-[13px] text-[#1d3a5f]/80`}>
                  {b.hours}
                </div>

                <div className={`${cell} ${rowBg} border-t border-[#e7eef5] space-y-2`}>
                  <Link href={`/request-quote?business=${b.id}`} className="block text-center text-xs font-extrabold rounded-lg bg-[#7ac142] text-[#0b1e33] px-2 py-1.5 hover:bg-[#68ad35]">Request a quote</Link>
                </div>
              </Fragment>
            );
          })}
        </div>
      </div>
      <p className="px-4 py-2.5 text-xs text-[#1d3a5f]/50 border-t border-[#e7eef5] bg-[#fbfdf8]">
        Compare {categoryName}s in {suburbName} side-by-side — swipe sideways on mobile. Prices are guides from 2026; confirm exact quotes before you commit.
      </p>
    </div>
  );
}