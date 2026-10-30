import Link from "next/link";
import type { Business } from "@/data/businesses";
import { categories } from "@/data/categories";
import { suburbs } from "@/data/locations";
import { planRank, normalizePlanId } from "@/lib/plans";
import { RatingSummary } from "@/components/ui";
import { KIcon } from "@/lib/icons";

function businessPhoto(business: Business): string | null {
  if (business.coverImageUrl?.trim()) return business.coverImageUrl;
  return business.photos?.find((photo) => photo.trim().length > 0) ?? null;
}

/** Business card shared by the homepage shortlist and the full business directory. */
export default function HomeBusinessCard({ business }: { business: Business }) {
  const photo = businessPhoto(business);
  const suburb = suburbs.find((item) => item.slug === business.suburbSlug)?.name ?? business.suburbSlug ?? "";
  const category = categories.find((item) => item.slug === business.categorySlug)?.plural ?? business.categorySlug ?? "";

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-[#e7eef5] bg-white shadow-sm transition-shadow hover:shadow-md">
      <div className="relative h-32 w-full shrink-0 overflow-hidden bg-[#f4f7f6]">
        {photo && (
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
            style={{ backgroundImage: `url("${photo}")` }}
          />
        )}
        {photo && <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />}
        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          {category && <span className="rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-[#10243e] shadow-sm backdrop-blur">{category}</span>}
          {normalizePlanId(business.plan) === "premium" && <span className="rounded-full bg-[#e8f6d8] px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-[#3c6b1d] shadow-sm">Premium</span>}
        </div>
        {business.verified && (
          <span className="absolute right-3 top-3 rounded-full bg-[#558c2b] p-1 text-white shadow-lg" aria-label="Verified business">
            <KIcon name="shieldCheck" size={14} strokeWidth={2.2} />
          </span>
        )}
      </div>
      <div className="relative z-10 flex flex-1 flex-col bg-white p-5">
        <h3 className="text-lg font-black leading-tight text-[#10243e]">
          <Link href={`/business/${business.id}`} className="hover:text-[#558c2b] hover:underline">{business.name}</Link>
        </h3>
        <p className="mt-1 text-[11px] font-bold text-[#558c2b]">{suburb}</p>
        <RatingSummary rating={Number(business.rating ?? 0)} reviews={Number(business.reviewCount ?? 0)} countOnly className="mt-2 text-sm" empty="No reviews yet" />
        <p className="mt-3 line-clamp-2 flex-1 text-sm leading-relaxed text-[#1d3a5f]/75">{business.description}</p>
        <div className="mt-5 grid grid-cols-2 gap-2 border-t border-[#e7eef5] pt-4">
          <Link href={`/business/${business.id}`} className="flex items-center justify-center rounded-xl border border-[#d6e1ec] px-2 py-2 text-center text-xs font-extrabold text-[#10243e] hover:border-[#558c2c] hover:text-[#558c2b]">
            View
          </Link>
          <Link href={`/request-quote?business=${business.id}`} className="flex items-center justify-center rounded-xl bg-[#7ac142] px-2 py-2 text-center text-xs font-extrabold text-[#0b1e33] hover:bg-[#68ad35]">
            Request a quote
          </Link>
        </div>
      </div>
    </article>
  );
}

export function businessPlacementRank(business: Business): number {
  return planRank(normalizePlanId(business.plan)) * 1000 +
    (business.featured === true ? 250 : 0) +
    Number(business.rating ?? 0) * 10;
}
