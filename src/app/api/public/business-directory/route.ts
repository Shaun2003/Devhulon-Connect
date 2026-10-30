import { toBusiness } from "@/data/businesses";
import {
  canReadFirestoreRest,
  fetchPublicBusinessesPage,
  fetchReviewRatings,
} from "@/lib/firestore-rest";
import { applyReviewRatings } from "@/data/businesses";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!canReadFirestoreRest) {
    return Response.json(
      { ok: false, error: "The public business catalogue is not configured." },
      { status: 503 }
    );
  }

  const cursor = new URL(request.url).searchParams.get("cursor") ?? undefined;
  if (cursor && (cursor.includes("/") || cursor.length > 1500)) {
    return Response.json({ ok: false, error: "Invalid page cursor." }, { status: 400 });
  }

  try {
    const [page, ratings] = await Promise.all([
      fetchPublicBusinessesPage(cursor),
      fetchReviewRatings(),
    ]);
    return Response.json({
      ok: true,
      businesses: applyReviewRatings(
        page.businesses.map((row) => toBusiness(String(row.id ?? ""), row)),
        ratings,
      ),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    });
  } catch (error) {
    console.error("[KASI] public business directory query failed:", error);
    return Response.json(
      { ok: false, error: "Could not load businesses. Please try again." },
      { status: 502 }
    );
  }
}
