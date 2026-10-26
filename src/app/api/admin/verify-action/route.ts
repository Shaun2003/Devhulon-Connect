/**
 * POST /api/admin/verify-action — approve or reject a seller verification request.
 * Admin only.
 *
 * Body:
 *   { uid, action: "approve" | "reject", businessId, method?, notes? }
 */

import { adminFromRequest, apiError } from "@/lib/server/admin";
import { approveVerification, rejectVerification } from "@/lib/server/verification";
import { VERIFICATION_METHODS, type VerificationMethod } from "@/lib/verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cleanStr = (v: unknown, max: number): string => String(v ?? "").trim().slice(0, max);

export async function POST(req: Request) {
  const session = await adminFromRequest(req);
  if (!session) return apiError("Admin access required.", 403);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const uid = cleanStr(body.uid, 64);
  const action = String(body.action ?? "");
  const businessId = cleanStr(body.businessId, 64);
  const rawMethod = String(body.method ?? "");
  const method = ((VERIFICATION_METHODS as readonly string[]).includes(rawMethod) ? rawMethod : "documents") as VerificationMethod;
  const notes = cleanStr(body.notes, 300) || undefined;

  if (!uid) return apiError("Missing the seller id.");
  if (action !== "approve" && action !== "reject") return apiError("Action must be approve or reject.");
  if (!businessId) return apiError("Missing the listing id.");

  if (action === "approve") {
    if (!(VERIFICATION_METHODS as readonly string[]).includes(rawMethod)) return apiError("Choose a verification method.");
    const result = await approveVerification({
      uid,
      businessId,
      reviewedBy: session.uid,
      method,
      notes,
    });
    if (!result.ok) return apiError(result.error, 400);
    return Response.json({ ok: true, action: "approved" });
  } else {
    if (!notes) return apiError("A rejection note is required.");
    const result = await rejectVerification({
      uid,
      businessId,
      reviewedBy: session.uid,
      notes,
    });
    if (!result.ok) return apiError(result.error, 400);
    return Response.json({ ok: true, action: "rejected" });
  }
}