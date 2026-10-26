import Link from "next/link";
import type { Category } from "@/data/categories";
import type { ServiceGroup, Subcategory } from "@/data/taxonomy";

/** Sub-service anchor chips (deep-link SEO anchors). */
export function SubcategoryAnchors({
  category,
  items,
}: {
  category: Category;
  items: Subcategory[];
}) {
  if (!items.length) return null;
  return (
    <nav aria-label={`${category.name} services`} className="flex flex-wrap gap-2">
      {items.map((s) => (
        <Link
          key={s.slug}
          href={`/services/${category.slug}#${s.slug}`}
          className="rounded-full border border-[#d6e1ec] bg-white px-3 py-1.5 text-xs font-bold text-[#1d3a5f] transition hover:border-[#7ac142] hover:text-[#10243e]"
        >
          {s.name}
        </Link>
      ))}
    </nav>
  );
}

/** Breadcrumb trail (SEO: breadcrumbs + internal linking). */
export function ServiceBreadcrumbs({
  group,
  category,
  cityName,
}: {
  group?: ServiceGroup;
  category: Category;
  cityName?: string;
}) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs font-semibold text-white/65">
        <li><Link href="/" className="hover:text-white">Home</Link></li>
        <li aria-hidden>/</li>
        <li><Link href="/services" className="hover:text-white">Services</Link></li>
        {group && (
          <>
            <li aria-hidden>/</li>
            <li><Link href={`/services#${group.slug}`} className="hover:text-white">{group.name}</Link></li>
          </>
        )}
        <li aria-hidden>/</li>
        <li aria-current="page" className="break-words text-white">{cityName ? `${category.name} in ${cityName}` : category.name}</li>
      </ol>
    </nav>
  );
}
