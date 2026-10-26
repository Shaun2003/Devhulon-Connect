/**
 * /api/portfolio — portfolio items with a SERVER-ENFORCED plan quota (§24).
 *
 * Why a route handler instead of direct Firestore writes: rules can verify
 * ownership and entitlement, but they cannot COUNT documents, so "10 items on
 * Starter / 50 on Professional / unlimited on Business" is not expressible in
 * them. Here the caller is resolved from their verified ID token, the plan comes
 * from the server-owned subscription doc, and the existing items are counted with
 * the Admin SDK before anything is written — so a tampered client cannot exceed
 * its allowance by calling Firestore directly (rules block that path).
 *
 *   POST   { businessId, title, description, completedAt, beforeUrl, afterUrl, imageUrl, tags }
 *   PATCH  { id, ...same fields }
 *   DELETE ?id=<itemId>
 */

import { adminDb, apiError, sessionFromRequest } from "@/lib/server/admin";
import { entitlementFrom, readSubscription } from "@/lib/server/subscriptions";
import { limitsFor } from "@/lib/plans";
import { cleanPortfolioDraft, validatePortfolioDraft } from "@/lib/portfolio";

export const runtime = "nodejs";

const nowIso = () => new Date().toISOString();

/** Confirm the caller owns the listing an item belongs to. */
async function ownsListing(uid: string, businessId: string): Promise<"ok" | "missing" | "denied"> {
  const db = adminDb();
  if (!db) return "missing";
  const snap = await db.collection("businesses").doc(businessId).get();
  if (!snap.exists) return "missing";
  return String(snap.data()?.ownerUid ?? "") === uid ? "ok" : "denied";
}

export async function POST(req: Request) {
  const db = adminDb();
  if (!db) return apiError("Server storage is not configured.", 503);
  const session = await sessionFromRequest(req);
  if (!session) return apiError("Sign in to manage your portfolio.", 401);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const businessId = String(body.businessId ?? "").trim();
  if (!businessId) return apiError("Missing the listing this item belongs to.");

  const ownership = await ownsListing(session.uid, businessId);
  if (ownership === "missing") return apiError("That listing no longer exists.", 404);
  if (ownership === "denied") return apiError("That listing isn't on your account.", 403);

  const draft = cleanPortfolioDraft(body);
  const issues = validatePortfolioDraft(draft);
  if (issues.length > 0) return apiError(issues[0]);

  const ent = entitlementFrom(await readSubscription(session.uid));
  if (!ent.entitled) {
    return apiError("Your plan isn't active right now — renew or restart to keep adding portfolio items.", 402);
  }

  // The quota check (the part rules cannot do).
  const limit = limitsFor(ent.plan).portfolio;
  if (limit !== null) {
    const agg = await db.collection("portfolio").where("ownerUid", "==", session.uid).count().get();
    if (agg.data().count >= limit) {
      return apiError(
        `Your ${ent.plan} plan includes ${limit} portfolio items. Upgrade your plan for more space — your existing items stay live.`,
        402
      );
    }
  }

  const ref = db.collection("portfolio").doc();
  await ref.set({
    ...draft,
    ownerUid: session.uid,
    businessId,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
  return Response.json({ ok: true, id: ref.id });
}

export async function PATCH(req: Request) {
  const db = adminDb();
  if (!db) return apiError("Server storage is not configured.", 503);
  const session = await sessionFromRequest(req);
  if (!session) return apiError("Sign in to manage your portfolio.", 401);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(body.id ?? "").trim();
  if (!id) return apiError("Missing the portfolio item id.");

  const ref = db.collection("portfolio").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return apiError("That portfolio item no longer exists.", 404);
  if (String(snap.data()?.ownerUid ?? "") !== session.uid) return apiError("That item isn't yours.", 403);

  const draft = cleanPortfolioDraft(body);
  const issues = validatePortfolioDraft(draft);
  if (issues.length > 0) return apiError(issues[0]);

  // ownerUid/businessId are deliberately NOT writable — an item can never be
  // moved onto another seller's profile.
  await ref.set({ ...draft, updatedAt: nowIso() }, { merge: true });
  return Response.json({ ok: true, id });
}

export async function DELETE(req: Request) {
  const db = adminDb();
  if (!db) return apiError("Server storage is not configured.", 503);
  const session = await sessionFromRequest(req);
  if (!session) return apiError("Sign in to manage your portfolio.", 401);

  const id = new URL(req.url).searchParams.get("id")?.trim() ?? "";
  if (!id) return apiError("Missing the portfolio item id.");

  const ref = db.collection("portfolio").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return Response.json({ ok: true, id }); // already gone
  if (String(snap.data()?.ownerUid ?? "") !== session.uid) return apiError("That item isn't yours.", 403);

  await ref.delete();
  return Response.json({ ok: true, id });
}
