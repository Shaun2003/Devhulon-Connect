import { clientIp, consumeRateLimit } from "@/lib/server/rate-limit";
import { adminDb } from "@/lib/server/admin";
import { loadSellerCandidates } from "@/lib/server/seller-search";
import { SERVICE_GROUPS } from "@/data/taxonomy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const need = (params.get("need") ?? "").trim();
  const place = (params.get("place") ?? "").trim();
  const requestedGroup = (params.get("serviceGroup") ?? "").trim();
  const serviceGroupSlug = SERVICE_GROUPS.some((group) => group.slug === requestedGroup)
    ? requestedGroup
    : undefined;
  if (need.length < 2 || need.length > 300 || place.length > 120) {
    return Response.json(
      { ok: false, error: "Enter a service and a valid location." },
      { status: 400 },
    );
  }

  if (!adminDb()) {
    return Response.json(
      { ok: false, error: "Seller search is not configured yet." },
      { status: 503 },
    );
  }

  const limit = await consumeRateLimit("sellerSearch", clientIp(request));
  if (!limit.ok) {
    return Response.json(
      { ok: false, error: "Search limit reached. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  try {
    const businesses = await loadSellerCandidates({ need, place, serviceGroupSlug });
    return Response.json(
      { ok: true, businesses },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("[KASI] indexed seller search failed:", error);
    return Response.json(
      { ok: false, error: "Could not load matching pros. Please try again." },
      { status: 502 },
    );
  }
}
