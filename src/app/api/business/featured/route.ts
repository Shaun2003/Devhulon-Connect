import { adminDb, apiError, sessionFromRequest } from "@/lib/server/admin";
import { entitlementFrom, readSubscription } from "@/lib/server/subscriptions";
import { hasCap } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const db = adminDb();
  if (!db) return apiError("Server storage is not configured.", 503);
  const session = await sessionFromRequest(request);
  if (!session) return apiError("Sign in to feature your profile.", 401);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const businessId = typeof body.businessId === "string" ? body.businessId.trim() : "";
  if (!businessId || typeof body.featured !== "boolean") return apiError("Choose a listing and featured setting.");

  const entitlement = entitlementFrom(await readSubscription(session.uid));
  if (!entitlement.entitled || !hasCap(entitlement.plan, "featuredProfile")) {
    return apiError("Featured profile placement is available on Premium.", 403);
  }
  const ref = db.collection("businesses").doc(businessId);
  const snap = await ref.get();
  if (!snap.exists) return apiError("That listing no longer exists.", 404);
  if (String(snap.data()?.ownerUid ?? "") !== session.uid) return apiError("You can only feature your own listing.", 403);

  await ref.set({ featured: body.featured, updatedAt: new Date().toISOString() }, { merge: true });
  return Response.json({ ok: true, featured: body.featured });
}
