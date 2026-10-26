import { adminDb, adminFromRequest, apiError } from "@/lib/server/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const db = adminDb();
  if (!db) return apiError("Server storage is not configured.", 503);

  const admin = await adminFromRequest(request);
  if (!admin) return apiError("Admin access required.", 403);

  const requestedDays = Number(new URL(request.url).searchParams.get("days") ?? 30);
  const days = [7, 30, 90].includes(requestedDays) ? requestedDays : 30;
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - (days - 1));
  const since = start.toISOString().slice(0, 10);

  try {
    const snapshot = await db.collection("analytics_daily")
      .where("day", ">=", since)
      .orderBy("day", "asc")
      .limit(5000)
      .get();

    const daily = new Map<string, {
      day: string;
      pageViews: number;
      searches: number;
      quoteSubmissions: number;
      pages: Record<string, number>;
    }>();

    for (const doc of snapshot.docs) {
      const data = doc.data() as {
        day?: unknown;
        event?: unknown;
        page?: unknown;
        count?: unknown;
      };
      if (typeof data.day !== "string" || typeof data.event !== "string") continue;
      let row = daily.get(data.day);
      if (!row) {
        row = { day: data.day, pageViews: 0, searches: 0, quoteSubmissions: 0, pages: {} };
        daily.set(data.day, row);
      }
      const count = typeof data.count === "number" && Number.isFinite(data.count) ? data.count : 0;
      if (data.event === "page_view") {
        row.pageViews += count;
        if (typeof data.page === "string") {
          row.pages[data.page] = (row.pages[data.page] ?? 0) + count;
        }
      } else if (data.event === "search_submitted") {
        row.searches += count;
      } else if (data.event === "quote_submitted") {
        row.quoteSubmissions += count;
      }
    }

    return Response.json({ ok: true, days, daily: [...daily.values()] });
  } catch (error) {
    console.error("[KASI] aggregate analytics query failed:", error);
    return apiError("Could not load analytics.", 503);
  }
}
