import { FieldValue } from "firebase-admin/firestore";
import { adminDb, apiError, sessionFromRequest } from "@/lib/server/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const db = adminDb();
  if (!db) return apiError("Server storage is not configured.", 503);
  const session = await sessionFromRequest(request);
  if (!session) return apiError("Sign in to cancel seller setup.", 401);

  const userRef = db.collection("users").doc(session.uid);
  const businessQuery = db.collection("businesses")
    .where("ownerUid", "==", session.uid)
    .limit(1);
  const subscriptionRef = db.collection("subscriptions").doc(session.uid);

  const result = await db.runTransaction(async (transaction) => {
    const [user, businesses, subscription] = await Promise.all([
      transaction.get(userRef),
      transaction.get(businessQuery),
      transaction.get(subscriptionRef),
    ]);

    if (!user.exists || user.data()?.role !== "seller") {
      return { ok: false as const, message: "There is no seller setup to cancel." };
    }
    if (!businesses.empty) {
      return { ok: false as const, message: "A business profile is already active. Contact support if you need help changing your account." };
    }

    const plan = String(subscription.data()?.plan ?? "").toLowerCase();
    const status = String(subscription.data()?.subscription_status ?? subscription.data()?.status ?? "").toLowerCase();
    const paidPeriodEnd = Date.parse(String(subscription.data()?.current_period_end ?? ""));
    const paidPeriodStillActive = Number.isFinite(paidPeriodEnd) && paidPeriodEnd > Date.now();
    if (plan === "premium" && (paidPeriodStillActive || (status !== "canceled" && status !== "expired"))) {
      return { ok: false as const, message: "Your Premium plan is still active. Cancel or resolve the plan first, then try again." };
    }

    transaction.update(userRef, {
      role: "buyer",
      sellerOnboarding: FieldValue.delete(),
    });
    return { ok: true as const };
  });

  if (!result.ok) return apiError(result.message, 409);
  return Response.json({ ok: true });
}
