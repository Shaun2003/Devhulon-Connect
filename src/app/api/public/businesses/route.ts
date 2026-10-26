import { getCategory } from "@/data/categories";
import {
  canReadFirestoreRest,
  fetchPublicBusinessesByCategory,
} from "@/lib/firestore-rest";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!canReadFirestoreRest) {
    return Response.json(
      { ok: false, error: "The public business catalogue is not configured." },
      { status: 503 }
    );
  }

  const params = new URL(request.url).searchParams;
  const category = (params.get("category") ?? "").trim();
  if (!getCategory(category)) {
    return Response.json(
      { ok: false, error: "Choose a valid service category." },
      { status: 400 }
    );
  }

  const cursor = params.get("cursor") ?? undefined;
  if (cursor && (cursor.includes("/") || cursor.length > 1500)) {
    return Response.json(
      { ok: false, error: "Invalid page cursor." },
      { status: 400 }
    );
  }

  try {
    const page = await fetchPublicBusinessesByCategory(category, cursor);
    return Response.json({ ok: true, ...page });
  } catch (error) {
    console.error("[KASI] public business catalogue query failed:", error);
    return Response.json(
      { ok: false, error: "Could not load more businesses. Please try again." },
      { status: 502 }
    );
  }
}
