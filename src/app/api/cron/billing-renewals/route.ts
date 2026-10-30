import { adminDb, apiError } from "@/lib/server/admin";
import { processDueBillingRenewals } from "@/lib/server/billing-renewals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

async function handle(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret) {
    console.error("[DevhulonConnect] billing renewals: CRON_SECRET is not set.");
    return apiError("Billing renewal processing is not configured.", 503);
  }
  const authorization = req.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!safeEqual(token, secret)) return apiError("Unauthorized.", 401);
  if (!adminDb()) return apiError("Server storage is not configured.", 503);

  try {
    const result = await processDueBillingRenewals();
    console.log(`[DevhulonConnect] billing renewals: ${JSON.stringify(result)}`);
    return Response.json({ ok: result.failed === 0, ...result });
  } catch (error) {
    console.error("[DevhulonConnect] billing renewal processing failed:", error);
    return apiError("Billing renewal processing failed.", 500);
  }
}

export const GET = handle;
export const POST = handle;
