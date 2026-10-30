import type { Metadata } from "next";
import Link from "next/link";
import { categories, type Category } from "@/data/categories";
import { SERVICE_GROUPS, groupForCategory } from "@/data/taxonomy";
import { KIcon, iconForCategory } from "@/lib/icons";
import { SITE_SHORT } from "@/lib/site";
import { abs } from "@/lib/seo";
import { getBgUrl } from "@/lib/utils";
import { categoryImage } from "@/data/category-images";
import { PageHero } from "@/components/ui";

export const metadata: Metadata = {
  title: `All Services`,
  description:
    `Browse every service on ${SITE_SHORT} — plumbers, electricians, tutors, driving schools, beauty, mechanics, lawyers, developers and more across South Africa.`,
  alternates: { canonical: abs("/services") },
};

function CategoryCard({ c }: { c: Category }) {
  // Hand-picked category photography (src/data/category-images.ts), falling
  // back to the generic getBgUrl so a newly added category still renders a
  // card instead of an empty banner.
  const bgUrl = categoryImage(c.slug) ?? getBgUrl(c.slug);

  return (
    <Link
      href={`/services/${c.slug}`}
      className="bg-white border border-[#e7eef5] rounded-xl overflow-hidden hover:border-[#7ac142] group transition-all flex flex-col items-start justify-between shadow-sm hover:shadow-md h-full relative"
    >
      <div className="h-28 w-full bg-[#f4f7f6] relative overflow-hidden shrink-0">
         <div 
           className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
           style={{ backgroundImage: `url('${bgUrl}')` }} 
         />
         <div className="absolute inset-0 bg-[#0b1e33]/20 group-hover:bg-[#0b1e33]/10 transition-colors duration-300"></div>
         <div className="absolute bottom-3 left-3 bg-white/95 backdrop-blur rounded-lg p-2 shadow-sm text-[#10243e] group-hover:text-[#7ac142] transition-colors">
            <KIcon name={iconForCategory(c.slug)} size={18} strokeWidth={1.5} />
         </div>
      </div>
      <div className="p-4 w-full flex-1 flex flex-col bg-white z-10">
        <span className="font-bold text-[#10243e] text-[15px] group-hover:text-[#558c2b] leading-tight block">
          {c.plural}
        </span>
        <span className="text-xs text-[#1d3a5f]/70 mt-1 block leading-snug flex-1">{c.blurb}</span>
        <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-[#558c2b] mt-3 uppercase tracking-wider">
          Find pros 
        </span>
      </div>
    </Link>
  );
}

export default function ServicesIndexPage() {
  const groups = SERVICE_GROUPS.map((g) => ({
    ...g,
    cats: categories.filter((c) => groupForCategory(c.slug)?.slug === g.slug),
  })).filter((g) => g.cats.length > 0);
  const ungrouped = categories.filter((c) => !groupForCategory(c.slug));

  return (
    <div className="min-h-screen">
      <PageHero
        kicker={`${categories.length} categories`}
        title="All services near you"
        sub={`${categories.length} service categories across South Africa — plumbers, developers, tutors, driving schools, beauty professionals, mechanics and hundreds of local services.`}
        icon="layers"
        crumbs={[{ label: "Home", href: "/" }, { label: "Services" }]}
      >
        <div className="flex flex-wrap items-center gap-2">
          {SERVICE_GROUPS.map((g) => (
            <a
              key={g.slug}
              href={`#${g.slug}`}
              className="inline-flex items-center gap-1.5 text-xs font-extrabold bg-white/10 hover:bg-white/20 border border-white/20 backdrop-blur-sm rounded-full px-4 py-2 transition text-white shadow-sm"
            >
              <KIcon name={g.icon} size={14} />
              {g.name}
            </a>
          ))}
        </div>
      </PageHero>

      <main className="max-w-6xl mx-auto px-4 py-10 space-y-12">
        {groups.map((g) => (
          <section key={g.slug} id={g.slug} aria-labelledby={`${g.slug}-h`} className="scroll-mt-24">
            <div className="flex items-center gap-3 mb-1">
              <span className="icon-3d" aria-hidden="true">
                <KIcon name={g.icon} size={22} />
              </span>
              <h2 id={`${g.slug}-h`} className="text-xl sm:text-2xl font-black text-[#10243e]">
                {g.name}
              </h2>
            </div>
            <p className="text-sm text-[#1d3a5f]/70 mb-5 ml-[3.75rem]">{g.blurb}</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {g.cats.map((c) => (
                <CategoryCard key={c.slug} c={c} />
              ))}
            </div>
          </section>
        ))}

        {ungrouped.length > 0 && (
          <section aria-labelledby="more-h">
            <h2 id="more-h" className="text-xl sm:text-2xl font-black text-[#10243e] mb-5">
              More services
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {ungrouped.map((c) => (
                <CategoryCard key={c.slug} c={c} />
              ))}
            </div>
          </section>
        )}

        <section className="hippo-card p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
          <div>
            <h2 className="text-lg font-black text-[#10243e]">Provide a service?</h2>
            <p className="text-sm text-[#1d3a5f]/70 mt-1">
              List your business, get matched leads and grow — starts FREE with a 7-day trial.
            </p>
          </div>
          <Link href="/list-business" className="btn-hippo text-sm shrink-0">
            List your business 
          </Link>
        </section>
      </main>
    </div>
  );
}
