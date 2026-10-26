import { adminDb, apiError, sessionFromRequest } from "@/lib/server/admin";
import { entitlementFrom, readSubscription } from "@/lib/server/subscriptions";
import { hasCap } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cleanText = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

export async function POST(request: Request) {
  const db = adminDb();
  if (!db) return apiError("Server storage is not configured.", 503);
  const session = await sessionFromRequest(request);
  if (!session) return apiError("Sign in to contact support.", 401);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const subject = cleanText(body.subject, 120);
  const message = cleanText(body.message, 3000);
  if (subject.length < 4) return apiError("Subject must be at least 4 characters.");
  if (message.length < 20) return apiError("Please provide at least 20 characters of detail.");

  const entitlement = entitlementFrom(await readSubscription(session.uid));
  const day = new Date().toISOString().slice(0, 10);
  const rateRef = db.collection("support_rate_limits").doc(session.uid);
  const ticketRef = db.collection("support_tickets").doc();
  const ticket = {
    ownerUid: session.uid,
    email: session.email,
    subject,
    message,
    plan: entitlement.plan,
    priority: entitlement.entitled && hasCap(entitlement.plan, "prioritySupport"),
    status: "open",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const allowed = await db.runTransaction(async (transaction) => {
    const rate = await transaction.get(rateRef);
    const data = rate.data() ?? {};
    const count = data.day === day ? Number(data.count ?? 0) : 0;
    if (count >= 5) return false;
    transaction.set(rateRef, { day, count: count + 1, updatedAt: new Date().toISOString() });
    transaction.create(ticketRef, ticket);
    return true;
  });

  if (!allowed) return apiError("You have reached today's support request limit. Try again tomorrow.", 429);
  return Response.json({ ok: true, ticketId: ticketRef.id, priority: ticket.priority });
}
