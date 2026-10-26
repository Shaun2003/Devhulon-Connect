import Link from "next/link";
import type { Business } from "@/data/businesses";
import { waLink } from "@/lib/utils";
import { RatingSummary, Badge } from "./ui";
import { KIcon, iconForCategory } from "@/lib/icons";
import { normalizePlanId } from "@/lib/plans";
import { SITE_SHORT } from "@/lib/site";

/**
 * Directory card for a business.
 *
 * Uses the shared service-page icon system (KIcon) rather than emoji, so one
 * trade has one icon everywhere, and flags bundled sample listings so a buyer
 * can never mistake placeholder data for a real, callable business.
 */
export default function BusinessCard({
  b,
  categoryName,
  suburbName,
}: {
  b: Business;
  categoryName: string;
  suburbName: string;
}) {
  const plan = normalizePlanId(b.plan);
  const planLabel = plan === "business" ? "Business sponsored" : plan === "professional" ? "Professional" : null;

  return (
    <article className="hippo-card flex w-full min-w-0 flex-col gap-3 p-4 hover-lift anim-rise !rounded-2xl">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="icon-3d icon-3d-sm shrink-0"
            aria-hidden
          >
            <KIcon name={iconForCategory(b.categorySlug)} size={20} />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-widest text-[#1d3a5f]/50 truncate">
              {categoryName} · {suburbName}
            </p>
            <h3 className="font-black text-base sm:text-lg leading-tight text-[#10243e] break-words">
              <Link href={`/business/${b.id}`} className="hover:text-[#558c2b] hover:underline">
                {b.name}
              </Link>
            </h3>
            <RatingSummary rating={b.rating} reviews={b.reviewCount} countOnly empty="No reviews yet" />
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1 sm:shrink-0 sm:flex-col sm:items-end">
          {b.verified && <Badge><KIcon name="check" size={14} className="inline shrink-0" /> Verified</Badge>}
          {planLabel && (
            <span className="text-[10px] font-black uppercase tracking-widest bg-[#10243e] text-[#ffc72c] rounded-full px-2 py-0.5">
              {planLabel}
            </span>
          )}
          {b.featured && <span className="text-[10px] font-black uppercase tracking-widest bg-[#e8f6d8] text-[#3c6b1d] rounded-full px-2 py-0.5">Featured</span>}
        </div>
      </div>

      <p className="min-w-0 text-sm text-[#1d3a5f]/75 line-clamp-2">{b.description}</p>

      <div className="flex min-w-0 flex-wrap gap-1.5">
        {b.services.slice(0, 3).map((s) => (
          <span
            key={s}
            className="text-[11px] bg-[#f2f6fa] text-[#1d3a5f]/70 rounded-full px-2.5 py-0.5 font-semibold"
          >
            {s}
          </span>
        ))}
      </div>

      <div className="flex min-w-0 flex-col gap-1 text-xs text-[#1d3a5f]/55">
        <span className="flex items-start gap-1.5">
          <KIcon name="mapPin" size={13} className="shrink-0 mt-0.5" />
          <span className="min-w-0 break-words">{b.address}</span>
        </span>
        <span className="flex items-start gap-1.5">
          <KIcon name="clock" size={13} className="shrink-0 mt-0.5" />
          <span className="min-w-0 break-words">{b.hours}</span>
        </span>
      </div>

      <div className="mt-auto flex min-w-0 flex-col gap-2 pt-1 sm:flex-row">
        <a
          href={`tel:${b.phone.replace(/\s/g, "")}`}
          className="inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 break-words rounded-xl border-2 border-[#10243e] px-3 py-2.5 text-center text-sm font-extrabold text-[#10243e] transition hover:bg-[#10243e] hover:text-white"
        >
          <KIcon name="phone" size={15} /> {b.phone}
        </a>
        {b.whatsapp && (
          <a
            target="_blank"
            rel="noreferrer"
            href={waLink(b.whatsapp, `Hi ${b.name}, I found you on ${SITE_SHORT}. I need help with…`)}
            className="inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 break-words rounded-xl bg-[#25D366] px-3 py-2.5 text-center text-sm font-extrabold text-white hover:brightness-95"
          >
            <KIcon name="message" size={15} /> WhatsApp
          </a>
        )}
        <Link
          href={`/request-quote?business=${b.id}`}
          className="inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 break-words rounded-xl bg-[#7ac142] px-3 py-2.5 text-center text-sm font-extrabold text-[#0b1e33] hover:bg-[#68ad35]"
        >
          <KIcon name="file" size={15} /> Quote
        </Link>
      </div>
    </article>
  );
}
