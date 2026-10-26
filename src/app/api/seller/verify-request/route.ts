/**
 * POST /api/seller/verify-request — a seller requests verification for their business.
 *
 * The seller submits their ID documents and chooses a verification method.
 * The request lands in `verification_requests/{uid}` with status "pending".
 * An admin reviews it via /api/admin/verification-queue and either approves
 * (writes the VerificationRecord to the business doc) or rejects with a note.
 *
 * This is the seller-side entry point for the Verified badge — a business is
 * never auto-verified on claim; the badge must be earned through review.
 */

import { sessionFromRequest } from "@/lib/server/admin";
import { apiError } from "@/lib/server/admin";
import { requestVerification } from "@/lib/server/verification";
import { VERIFICATION_METHODS, type VerificationMethod } from "@/lib/verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cleanStr = (v: unknown, max: number): string => String(v ?? "").trim().slice(0, max);

export async function POST(req: Request) {
  const session = await sessionFromRequest(req);
  if (!session) return apiError("Sign in to request verification.", 401);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const businessId = cleanStr(body.businessId, 64);
  const businessName = cleanStr(body.businessName, 120);
  const rawMethod = String(body.method ?? "");
  if (!(VERIFICATION_METHODS as readonly string[]).includes(rawMethod)) return apiError("Choose a verification method.");
  const method = rawMethod as VerificationMethod;

  if (!businessId) return apiError("Missing the listing id.");
  if (!businessName) return apiError("Business name is required.");

  const documents = {
    idFront: cleanStr(body.idFrontUrl, 500) || undefined,
    idBack: cleanStr(body.idBackUrl, 500) || undefined,
    proofAddress: cleanStr(body.proofAddressUrl, 500) || undefined,
  };

  const result = await requestVerification({
    uid: session.uid,
    businessId,
    businessName,
    method,
    documents,
  });

  if (!result.ok) return apiError(result.error, 400);

  return Response.json({ ok: true });
}

export async function GET(req: Request) {
  const session = await sessionFromRequest(req);
  if (!session) return apiError("Sign in to view verification status.", 401);

  const { getMyVerificationRequest } = await import("@/lib/server/verification");
  const request = await getMyVerificationRequest(session.uid);

  return Response.json({ ok: true, request });
}