import { adminDb, adminFromRequest, apiError } from "@/lib/server/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SupportTicket = {
  id: string;
  priority?: boolean;
  createdAt?: string;
  [key: string]: unknown;
};

export async function GET(request: Request) {
  const db = adminDb();
  if (!db) return apiError("Server storage is not configured.", 503);
  if (!await adminFromRequest(request)) return apiError("Admin access required.", 403);

  const snapshot = await db.collection("support_tickets").orderBy("createdAt", "desc").limit(250).get();
  const tickets: SupportTicket[] = snapshot.docs
    .map((doc) => ({ ...doc.data(), id: doc.id } as SupportTicket))
    .sort((a, b) =>
      Number(Boolean(b.priority)) - Number(Boolean(a.priority))
      || String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""))
    );
  return Response.json({ ok: true, tickets });
}

export async function PATCH(request: Request) {
  const db = adminDb();
  if (!db) return apiError("Server storage is not configured.", 503);
  if (!await adminFromRequest(request)) return apiError("Admin access required.", 403);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = typeof body.id === "string" ? body.id.trim() : "";
  const status = typeof body.status === "string" ? body.status : "";
  if (!id || !["open", "in_progress", "resolved"].includes(status)) {
    return apiError("Choose a ticket and valid status.");
  }
  const ref = db.collection("support_tickets").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return apiError("That ticket no longer exists.", 404);
  await ref.set({ status, updatedAt: new Date().toISOString() }, { merge: true });
  return Response.json({ ok: true });
}
