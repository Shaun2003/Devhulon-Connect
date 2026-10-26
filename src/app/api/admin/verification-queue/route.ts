/**
 * GET /api/admin/verification-queue — list all pending verification requests.
 * Admin only.
 */

import { adminFromRequest, apiError } from "@/lib/server/admin";
import { listPendingVerificationRequests } from "@/lib/server/verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await adminFromRequest(req);
  if (!session) return apiError("Admin access required.", 403);

  const requests = await listPendingVerificationRequests();
  return Response.json({ ok: true, requests });
}