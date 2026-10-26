import { adminDb, apiError, sessionFromRequest } from "@/lib/server/admin";
import { entitlementFrom, readSubscription } from "@/lib/server/subscriptions";
import { hasCap } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLLECTIONS = {
  deals: "deals",
  events: "events",
} as const;

type FeaturedCollection = keyof typeof COLLECTIONS;

export async function POST(request: Request) {
  const db = adminDb();
  if (!db) return apiError("Server storage is not configured.", 503);
  const session = await sessionFromRequest(request);
  if (!session) return apiError("Sign in to feature a post.", 401);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const collection = body.collection as FeaturedCollection;
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!Object.hasOwn(COLLECTIONS, collection) || !id || typeof body.featured !== "boolean") {
    return apiError("Choose a deal or event and a valid featured setting.");
  }

  const entitlement = entitlementFrom(await readSubscription(session.uid));
  const capability = collection === "deals" ? "featuredDeals" : "featuredEvents";
  if (!entitlement.entitled || !hasCap(entitlement.plan, capability) || !hasCap(entitlement.plan, "promoFeatures")) {
    return apiError("Featured deals and events are available on the Business plan.", 403);
  }

  const ref = db.collection(COLLECTIONS[collection]).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return apiError("That post no longer exists.", 404);
  if (String(snap.data()?.createdBy ?? "") !== session.uid) {
    return apiError("You can only feature your own posts.", 403);
  }

  await ref.set({ featured: body.featured, updatedAt: new Date().toISOString() }, { merge: true });
  return Response.json({ ok: true, featured: body.featured });
}
