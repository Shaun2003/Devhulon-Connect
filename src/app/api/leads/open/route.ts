/**
 * POST /api/leads/open — a buyer posts an UNADDRESSED request.
 *
 * Why this route exists: `/request-quote` without a `business` parameter used to
 * write the lead straight from the browser (`submitOpenLead` in repo.ts), which
 * required `allow create: if true` on the `leads` collection. That rule let ANY
 * anonymous caller write ANY lead document — including one addressed to a chosen
 * seller with an invented phone number — completely bypassing the plan meter in
 * `consumeLeadOpportunity`. The rules are now closed to server writes only
 * (see firestore.rules), so this is the only way an open request can be created.
 *
 * An open request is deliberately not charged to a seller at creation. Sellers
 * can browse its contact-stripped preview, then pay credits to unlock contact
 * through POST /api/leads/unlock.
 *
 * The caller is identified by their verified ID token. Signing in is required
 * here (unlike the direct-to-a-named-business route) because a buyer with no
 * account cannot receive the replies or the comparison they were promised.
 */

import { adminDb, apiError, sessionFromRequest } from "@/lib/server/admin";
import { guardLeadRequest } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cleanStr = (v: unknown, max: number): string => String(v ?? "").trim().slice(0, max);

export async function POST(req: Request) {
  const db = adminDb();
  if (!db) return apiError("Server storage is not configured.", 503);

  const session = await sessionFromRequest(req);
  if (!session) return apiError("Sign in to post a request.", 401);

  const limited = await guardLeadRequest(req, "leadOpen", session.uid);
  if (limited) return limited;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const need = cleanStr(body.need, 300);
  if (need.length < 2) return apiError("Tell us what you need first.");
  const rawBudget = body.budget;
  const budget = rawBudget === undefined || rawBudget === null || rawBudget === ""
    ? null
    : typeof rawBudget === "number" && Number.isSafeInteger(rawBudget) && rawBudget > 0 && rawBudget <= 5_000_000
      ? rawBudget
      : false;
  if (budget === false) return apiError("Budget must be a whole rand amount between R1 and R5,000,000.");
  const phone = cleanStr(body.phone, 40);
  if (phone.length < 6) return apiError("Add a phone or WhatsApp number so pros can reach you.");

  const createdAt = new Date().toISOString();
  const ref = db.collection("leads").doc();
  // The contact is the product being sold, so it never enters the lead document
  // (clients can read lead docs; rules cannot hide individual fields). It goes
  // to the server-only vault and is revealed by POST /api/leads/unlock after
  // the credit transaction — see lib/server/credits.unlockLeadContact.
  await db.collection("lead_contacts").doc(ref.id).set({
    leadId: ref.id,
    requestId: ref.id,
    phone,
    name: cleanStr(body.name, 80) || null,
    email: cleanStr(body.email, 120) || null,
    requesterUid: session.uid,
    createdAt,
  });
  await ref.set({
    need,
    category: cleanStr(body.category, 60) || null,
    suburb: cleanStr(body.suburb, 120) || null,
    timeline: cleanStr(body.timeline, 60) || null,
    budget,
    // No seller yet — that is what makes this an OPEN request.
    businessId: null,
    businessName: null,
    ownerUid: null,
    requesterUid: session.uid,
    status: "new",
    createdAt,
  });

  return Response.json({ ok: true, id: ref.id });
}