import { toBusiness, type Business } from "@/data/businesses";
import { categories } from "@/data/categories";
import { CATEGORY_GROUPS, SERVICE_GROUPS } from "@/data/taxonomy";
import { matchCategory, type MatchQuery } from "@/lib/matching";
import { resolvePlace, resolveProvince, zaCitiesForProvince } from "@/data/za-locations";
import { adminDb } from "./admin";

const EXACT_CATEGORY_PAGE_SIZE = 500;
const GROUP_FALLBACK_PAGE_SIZE = 100;

function candidateCategories(input: MatchQuery): { exact?: string; groupSlugs: string[] } {
  const explicitGroup = SERVICE_GROUPS.find((group) => group.slug === input.serviceGroupSlug);
  const isGroupLabel = Boolean(explicitGroup && (
    input.need.trim().toLowerCase() === explicitGroup.name.toLowerCase()
    || input.need.trim().toLowerCase() === explicitGroup.slug.replace(/-/g, " ")
  ));
  const requestedCategory = categories.some((category) => category.slug === input.categorySlug)
    ? input.categorySlug
    : matchCategory(input.need)?.slug;
  const inferred = isGroupLabel && !input.categorySlug
    ? undefined
    : requestedCategory;
  if (explicitGroup && inferred && CATEGORY_GROUPS[inferred] !== explicitGroup.slug) {
    return { groupSlugs: [] };
  }
  const exact = inferred;
  const group = explicitGroup?.slug ?? (exact ? CATEGORY_GROUPS[exact] : undefined);
  return {
    exact,
    groupSlugs: group && !exact
      ? categories
        .filter((category) => CATEGORY_GROUPS[category.slug] === group)
        .map((category) => category.slug)
      : [],
  };
}

function isLive(data: Record<string, unknown>): boolean {
  return String(data.status ?? "live") === "live";
}

/**
 * Reads only indexed category/location partitions relevant to the search.
 * This avoids scanning every business document for each buyer search.
 */
export async function loadSellerCandidates(input: MatchQuery): Promise<Business[]> {
  const configuredDb = adminDb();
  if (!configuredDb) throw new Error("Server storage is not configured.");
  const db = configuredDb;

  const { exact, groupSlugs } = candidateCategories(input);
  if (!exact && !groupSlugs.length) return [];

  const place = resolvePlace(input.place ?? "");
  const province = place ? undefined : resolveProvince(input.place ?? "");
  const result = new Map<string, Business>();

  async function addQuery(
    categorySlug: string,
    pageSize: number,
    field?: "suburbSlug" | "citySlug",
    value?: string,
    values?: string[],
  ): Promise<void> {
    let query = db.collection("businesses").where("categorySlug", "==", categorySlug);
    if (field && value) query = query.where(field, "==", value);
    if (field && values?.length) query = query.where(field, "in", values);
    const snapshot = await query.limit(pageSize).get();
    for (const document of snapshot.docs) {
      const data = document.data() as Record<string, unknown>;
      if (!isLive(data)) continue;
      result.set(document.id, toBusiness(document.id, data));
    }
  }

  async function queryPartitions(slugs: string[], pageSize: number): Promise<void> {
    if (!slugs.length) return;
    if (place?.area) {
      await Promise.all(slugs.map((slug) => addQuery(slug, pageSize, "suburbSlug", place.area!.slug)));
    }
    if (place?.city) {
      await Promise.all(slugs.map((slug) => addQuery(slug, pageSize, "citySlug", place.city.slug)));
      await Promise.all(slugs.map((slug) => addQuery(slug, pageSize, "suburbSlug", place.city.slug)));
    } else if (province) {
      const citySlugs = zaCitiesForProvince(province.slug).map((city) => city.slug);
      const cityBatches: string[][] = [];
      for (let index = 0; index < citySlugs.length; index += 30) {
        cityBatches.push(citySlugs.slice(index, index + 30));
      }
      await Promise.all(
        slugs.flatMap((slug) =>
          cityBatches.map((cities) => addQuery(slug, pageSize, "citySlug", undefined, cities)),
        ),
      );
    }
    if (result.size < 100) {
      await Promise.all(slugs.map((slug) => addQuery(slug, pageSize)));
    }
  }

  if (exact) {
    await queryPartitions([exact], EXACT_CATEGORY_PAGE_SIZE);
  }
  if (!exact) {
    await queryPartitions(groupSlugs, GROUP_FALLBACK_PAGE_SIZE);
  }

  return [...result.values()];
}
