/**
 * Minimal Firestore REST reader — only ever import this from Server Components.
 * (Guarded by `canReadFirestoreRest`; the browser bundle must never call it.)
 *
 * Why REST and not the Firebase SDK: the client SDK is browser-oriented and the
 * Admin SDK needs a service-account key we deliberately don't ship. The REST
 * API + the public web API key works in Server Components and honours the
 * Firestore rules — businesses/reviews/places are publicly readable, so this
 * only ever sees data a normal visitor could see anyway.
 *
 * Used for crawlable, per-page SEO metadata (title/description/OG/JSON-LD).
 */

import { aggregateReviewRatings, type RatingAgg, type ReviewRow } from "@/data/businesses";

type FsValue = {
  stringValue?: string;
  integerValue?: string;
  doubleValue?: number;
  booleanValue?: boolean;
  timestampValue?: string;
  nullValue?: null;
  arrayValue?: { values?: FsValue[] };
  mapValue?: { fields?: Record<string, FsValue> };
};

/** Firestore typed-value JSON → plain JS. */
function decode(v: FsValue | undefined): unknown {
  if (!v) return undefined;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.timestampValue !== undefined) return v.timestampValue;
  if (v.nullValue !== undefined) return null;
  if (v.arrayValue) return (v.arrayValue.values ?? []).map((x) => decode(x));
  if (v.mapValue) {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v.mapValue.fields ?? {})) out[k] = decode(val);
    return out;
  }
  return undefined;
}

function decodeFields(fields: Record<string, FsValue> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(fields ?? {})) out[k] = decode(val);
  return out;
}

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "";
const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "";

export const canReadFirestoreRest = Boolean(projectId && apiKey);

/**
 * Fetch one publicly-readable document. Returns null when it doesn't exist,
 * when Firebase isn't configured, or when the network call fails.
 *
 * Caching: deliberately NOT cached. These reads back the SEO metadata
 * (title/description/OG/JSON-LD) and the first server render of every listing
 * page, so a cached copy keeps serving a STALE rating — a review landing today
 * could be invisible on the page for minutes, and `aggregateRating` in the
 * JSON-LD would contradict the live page. `cache: "no-store"` also survives a
 * `next build`, which a `revalidate` window does not.
 */
export async function fetchPublicDoc(
  collectionName: string,
  id: string
): Promise<Record<string, unknown> | null> {
  if (!canReadFirestoreRest || !id) return null;
  const url =
    `https://firestore.googleapis.com/v1/projects/${projectId}` +
    `/databases/(default)/documents/${collectionName}/${encodeURIComponent(id)}?key=${apiKey}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as { fields?: Record<string, FsValue> };
    if (!json.fields) return null;
    return decodeFields(json.fields);
  } catch {
    return null;
  }
}

/**
 * Ratings recomputed from the live review documents (TRUSTED SERVER ONLY).
 *
 * The cached `businesses.rating` / `reviewCount` pair is a denormalised copy
 * that only a client holding the matching Firestore rule permission can
 * maintain. It is also the field that drifted to `rating: 0` while reviews piled
 * up, because the counter increment and the aggregate write were never coupled.
 *
 * `business_reviews` is publicly readable, so the server can always derive the
 * truth from source. That makes display and JSON-LD correct without waiting on a
 * rules deployment.
 *
 * Returns null when reviews cannot be read at all, so callers fall back to the
 * cached values rather than showing a wrong "no reviews".
 */
export async function fetchBusinessRatings(
  businessId: string
): Promise<RatingAgg | null> {
  const all = await fetchReviewRatings();
  if (!all) return null; // read failed — never invent zeroes
  if (!businessId) return null;
  // Absent means "no reviews at all", which is a real answer — not a failure.
  return all[businessId] ?? { rating: 0, reviewCount: 0 };
}

/**
 * Ratings for EVERY business, in one read (TRUSTED SERVER ONLY).
 *
 * Listing pages need the aggregate for many businesses at once, and a
 * per-business call would be one HTTP request per card. This reads the review
 * collection once and folds it into a lookup map.
 *
 * Returns null when the read fails, so callers keep the stored cache rather
 * than replacing real ratings with zeroes.
 *
 * Ceiling: Firestore's REST `pageSize` tops out at 300, so a business with more
 * than 300 reviews is absent from the map and keeps its stored values — the
 * pages that matter here are far below that.
 */
export async function fetchReviewRatings(): Promise<Record<string, RatingAgg> | null> {
  if (!canReadFirestoreRest) return null;
  const url =
    `https://firestore.googleapis.com/v1/projects/${projectId}` +
    `/databases/(default)/documents/business_reviews` +
    `?pageSize=300&key=${apiKey}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      documents?: { name: string; fields?: Record<string, FsValue> }[];
    };
    const rows: ReviewRow[] = (json.documents ?? []).map((d) => decodeFields(d.fields));
    return aggregateReviewRatings(rows);
  } catch {
    return null;
  }
}
/**
 * The review documents for one business (TRUSTED SERVER ONLY).
 *
 * `ReviewsLive` is a client component driven by an `onSnapshot` listener, so the
 * server-rendered HTML always began with its empty state — the page said "No
 * reviews yet" in the delivered HTML and only filled in after hydration. Reading
 * the same publicly-readable collection on the server lets the list render in
 * the first paint, which is also what crawlers and the "no JS" case see.
 *
 * Returns null when reviews cannot be read, so the caller can fall back rather
 * than render a false "no reviews yet".
 */
export async function fetchBusinessReviews(
  businessId: string
): Promise<
  | { id: string; author: string; rating: number; body: string; createdAt?: string }[]
  | null
> {
  if (!canReadFirestoreRest || !businessId) return null;
  const url =
    `https://firestore.googleapis.com/v1/projects/${projectId}` +
    `/databases/(default)/documents/business_reviews` +
    `?pageSize=300&key=${apiKey}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      documents?: { name: string; fields?: Record<string, FsValue> }[];
    };
    const rows = (json.documents ?? [])
      .map((d) => {
        const f = d.fields ?? {};
        const r = f.rating;
        return {
          id: d.name.split("/").pop() ?? "",
          author: f.author?.stringValue ?? "Anonymous",
          rating:
            typeof r?.integerValue === "string"
              ? Number(r.integerValue)
              : typeof r?.doubleValue === "number"
                ? r.doubleValue
                : 0,
          body: f.body?.stringValue ?? "",
          createdAt: f.createdAt?.timestampValue,
        };
      })
      // Newest first, matching `subscribeReviews`' client-side sort.
      .filter((r) => (r.body ?? "").length > 0)
      .sort((a, b) => Date.parse(b.createdAt ?? "") - Date.parse(a.createdAt ?? ""));
    return rows.slice(0, 20);
  } catch {
    return null;
  }
}

/**
 * List publicly-readable documents (max 300 per request — one page is plenty
 * for sitemap hints and "related" blocks).
 *
 * NOTE: this is deliberately ONE PAGE. Callers that need the whole collection
 * (the seller pool behind matching) must use `fetchAllPublicDocuments` below,
 * which follows `pageToken`. Widening this function instead would silently turn
 * cheap SEO-metadata reads into full-collection scans.
 */
export async function fetchPublicCollection(
  collectionName: string,
  pageSize = 300
): Promise<Record<string, unknown>[]> {
  if (!canReadFirestoreRest) return [];
  const url =
    `https://firestore.googleapis.com/v1/projects/${projectId}` +
    `/databases/(default)/documents/${collectionName}?key=${apiKey}&pageSize=${pageSize}`;
  try {
    // Not cached — see the note on `fetchPublicDoc`. These feed category and
    // city counts, so a stale copy also means a stale "12 pros" under the fold.
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      documents?: { name: string; fields?: Record<string, FsValue> }[];
    };
    return (json.documents ?? []).map((d) => ({
      id: d.name.split("/").pop(),
      ...decodeFields(d.fields),
    }));
  } catch {
    return [];
  }
}

export type PublicBusinessPage = {
  businesses: Record<string, unknown>[];
  nextCursor: string | null;
  hasMore: boolean;
};

/**
 * Read one category-filtered business page using Firestore's indexed query API.
 *
 * The cursor follows document name order, so pagination is deterministic and
 * does not require loading the entire public catalogue into a server component.
 * The status filter is applied after reading because legacy live listings may
 * have no `status` field at all.
 */
export async function fetchPublicBusinessesByCategory(
  categorySlug: string,
  cursor?: string,
  pageSize = 50
): Promise<PublicBusinessPage> {
  if (!canReadFirestoreRest) throw new Error("Public Firestore reads are not configured.");
  if (!categorySlug.trim()) throw new Error("A category is required.");
  if (cursor && (cursor.includes("/") || cursor.length > 1500)) {
    throw new Error("Invalid business page cursor.");
  }

  const safePageSize = Math.max(10, Math.min(50, Math.floor(pageSize)));
  const query: Record<string, unknown> = {
    from: [{ collectionId: "businesses" }],
    where: {
      fieldFilter: {
        field: { fieldPath: "categorySlug" },
        op: "EQUAL",
        value: { stringValue: categorySlug },
      },
    },
    orderBy: [{ field: { fieldPath: "__name__" }, direction: "ASCENDING" }],
    limit: safePageSize + 1,
  };

  if (cursor) {
    query.startAt = {
      values: [{
        referenceValue:
          `projects/${projectId}/databases/(default)/documents/businesses/${cursor}`,
      }],
      before: false,
    };
  }

  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ structuredQuery: query }),
      cache: "no-store",
    }
  );
  if (!res.ok) {
    throw new Error(`Firestore category query failed (${res.status}).`);
  }

  const result = (await res.json()) as {
    document?: { name: string; fields?: Record<string, FsValue> };
  }[];
  const documents = result.flatMap((entry) =>
    entry.document ? [entry.document] : []
  );
  const hasMore = documents.length > safePageSize;
  const scanned = documents.slice(0, safePageSize);
  const businesses = scanned
    .map<Record<string, unknown>>((document) => ({
      ...decodeFields(document.fields),
      id: document.name.split("/").pop() ?? "",
    }))
    .filter((business) => String(business.status ?? "live") === "live");

  return {
    businesses,
    nextCursor: hasMore
      ? scanned[scanned.length - 1]?.name.split("/").pop() ?? null
      : null,
    hasMore,
  };
}

/** Read a paginated page of all live public businesses, ordered by document id. */
export async function fetchPublicBusinessesPage(
  cursor?: string,
  pageSize = 50
): Promise<PublicBusinessPage> {
  if (!canReadFirestoreRest) throw new Error("Public Firestore reads are not configured.");
  if (cursor && (cursor.includes("/") || cursor.length > 1500)) {
    throw new Error("Invalid business page cursor.");
  }

  const safePageSize = Math.max(10, Math.min(50, Math.floor(pageSize)));
  const query: Record<string, unknown> = {
    from: [{ collectionId: "businesses" }],
    orderBy: [{ field: { fieldPath: "__name__" }, direction: "ASCENDING" }],
    limit: safePageSize + 1,
  };
  if (cursor) {
    query.startAt = {
      values: [{
        referenceValue:
          `projects/${projectId}/databases/(default)/documents/businesses/${cursor}`,
      }],
      before: false,
    };
  }

  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ structuredQuery: query }),
      cache: "no-store",
    }
  );
  if (!res.ok) throw new Error(`Firestore business directory query failed (${res.status}).`);

  const result = (await res.json()) as {
    document?: { name: string; fields?: Record<string, FsValue> };
  }[];
  const documents = result.flatMap((entry) => entry.document ? [entry.document] : []);
  const hasMore = documents.length > safePageSize;
  const scanned = documents.slice(0, safePageSize);
  const businesses = scanned
    .map<Record<string, unknown>>((document) => ({
      ...decodeFields(document.fields),
      id: document.name.split("/").pop() ?? "",
    }))
    .filter((business) => String(business.status ?? "live") === "live");

  return {
    businesses,
    nextCursor: hasMore ? scanned[scanned.length - 1]?.name.split("/").pop() ?? null : null,
    hasMore,
  };
}

/**
 * EVERY document in a collection, following `pageToken` (TRUSTED SERVER ONLY).
 *
 * WHY THIS EXISTS: the seller pool behind matching used to call
 * `fetchPublicCollection("businesses", 300)`, which returns a SINGLE page. That
 * cap is invisible — the matching function has no idea it is looking at a
 * truncated pool — so once a marketplace passes ~300 listings, every seller
 * beyond the first page becomes permanently UNMATCHABLE. Buyers are told "no pros
 * match that yet" while five perfect plumbers sit a page later, and nothing in
 * the code or the UI reveals the truncation. Correctness, not just speed.
 *
 * `maxDocs` is a runaway guard, not a quality knob: Firestore caps a page at 300,
 * so this bounds a pathological collection rather than defining behaviour.
 *
 * Ordering note: Firestore returns documents in key order, which is stable across
 * pages — so a deterministic `pageToken` walk returns a stable result.
 */
export async function fetchAllPublicDocuments(
  collectionName: string,
  opts: { pageSize?: number; maxDocs?: number; maxPages?: number } = {}
): Promise<Record<string, unknown>[]> {
  if (!canReadFirestoreRest) return [];
  const pageSize = Math.min(300, opts.pageSize ?? 300);
  const maxDocs = opts.maxDocs ?? 5000;
  const maxPages = opts.maxPages ?? 20;

  const out: Record<string, unknown>[] = [];
  let pageToken: string | undefined;

  try {
    for (let page = 0; page < maxPages && out.length < maxDocs; page++) {
      const url =
        `https://firestore.googleapis.com/v1/projects/${projectId}` +
        `/databases/(default)/documents/${collectionName}` +
        `?key=${apiKey}&pageSize=${pageSize}` +
        (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "");

      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        // Partial results beat none: if page 3 fails we still return pages 1-2
        // rather than pretending the marketplace is empty (which would make every
        // buyer see "no pros match that yet").
        break;
      }
      const json = (await res.json()) as {
        documents?: { name: string; fields?: Record<string, FsValue> }[];
        nextPageToken?: string;
      };

      for (const d of json.documents ?? []) {
        out.push({ id: d.name.split("/").pop(), ...decodeFields(d.fields) });
      }

      pageToken = json.nextPageToken;
      if (!pageToken) break;
    }
  } catch {
    // Same reasoning as above — return whatever we gathered.
  }

  return out;
}
