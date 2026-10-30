import { adminDb, apiError, sessionFromRequest } from "@/lib/server/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Remove buyer-owned requests or received quotes from the buyer dashboard.
 * Records are hidden from the buyer rather than physically deleted so that
 * seller-side quote and billing history remains intact.
 */
export async function POST(req: Request) {
  const db = adminDb();
  if (!db) return apiError("Server storage is not configured.", 503);

  const session = await sessionFromRequest(req);
  if (!session) return apiError("Sign in to manage your dashboard.", 401);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "");
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id || id.includes("/")) return apiError("Choose a valid item.");
  const hiddenAt = new Date().toISOString();

  if (action === "hide-quote") {
    const ref = db.collection("quotes").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return Response.json({ ok: true });
    if (String(snap.data()?.buyerUid ?? "") !== session.uid) {
      return apiError("That quote is not on your account.", 403);
    }
    await ref.set({ hiddenFromBuyer: true, buyerHiddenAt: hiddenAt }, { merge: true });
    return Response.json({ ok: true });
  }

  if (action !== "hide-request") return apiError("Unknown dashboard action.");

  const requestRef = db.collection("leads").doc(id);
  const requestSnap = await requestRef.get();
  if (!requestSnap.exists) return Response.json({ ok: true });
  const requestData = requestSnap.data() ?? {};
  if (String(requestData.requesterUid ?? "") !== session.uid) {
    return apiError("That request is not on your account.", 403);
  }

  const requestId = String(requestData.requestId ?? requestSnap.id);
  const [leadCopies, quotesByRequest, legacyQuotes] = await Promise.all([
    db.collection("leads").where("requestId", "==", requestId).get(),
    db.collection("quotes").where("requestId", "==", requestId).get(),
    db.collection("quotes").where("leadId", "==", requestId).get(),
  ]);
  const batch = db.batch();
  const leadRefs = new Map<string, FirebaseFirestore.DocumentReference>();
  leadRefs.set(requestSnap.id, requestRef);
  for (const doc of leadCopies.docs) {
    if (String(doc.data().requesterUid ?? "") === session.uid) leadRefs.set(doc.id, doc.ref);
  }

  const quoteRefs = new Map<string, FirebaseFirestore.DocumentReference>();
  for (const doc of [...quotesByRequest.docs, ...legacyQuotes.docs]) {
    if (String(doc.data().buyerUid ?? "") === session.uid) quoteRefs.set(doc.id, doc.ref);
  }

  for (const ref of leadRefs.values()) batch.set(ref, { hiddenFromBuyer: true, buyerHiddenAt: hiddenAt }, { merge: true });
  for (const ref of quoteRefs.values()) batch.set(ref, { hiddenFromBuyer: true, buyerHiddenAt: hiddenAt }, { merge: true });
  await batch.commit();

  return Response.json({ ok: true });
}
