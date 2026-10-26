import { FieldValue } from "firebase-admin/firestore";
import { isAnalyticsEvent, isAnalyticsPage } from "@/lib/analytics-events";
import { adminDb, apiError } from "@/lib/server/admin";
import { clientIp, consumeRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_LENGTH = 500;

async function readBody(request: Request): Promise<
  { ok: true; body: string } | { ok: false; status: 400 | 413 }
> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_LENGTH) {
    return { ok: false, status: 413 };
  }

  const reader = request.body?.getReader();
  if (!reader) return { ok: false, status: 400 };

  const decoder = new TextDecoder();
  let body = "";
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_LENGTH) {
        await reader.cancel();
        return { ok: false, status: 413 };
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    return { ok: true, body };
  } catch {
    return { ok: false, status: 400 };
  }
}

export async function POST(request: Request) {
  const db = adminDb();
  if (!db) return apiError("Server storage is not configured.", 503);

  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return apiError("Cross-origin analytics requests are not accepted.", 403);
  }

  const limited = await consumeRateLimit("analyticsEvent", clientIp(request));
  if (!limited.ok) {
    return Response.json(
      { ok: false, error: "Too many analytics events." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } }
    );
  }

  const readResult = await readBody(request);
  if (!readResult.ok) {
    return apiError(readResult.status === 413 ? "Analytics event is too large." : "Invalid analytics event.", readResult.status);
  }

  let body: unknown;
  try {
    body = JSON.parse(readResult.body);
  } catch {
    return apiError("Invalid analytics event.", 400);
  }

  if (!body || typeof body !== "object") return apiError("Invalid analytics event.", 400);
  const payload = body as Record<string, unknown>;
  if (!isAnalyticsEvent(payload.event) || !isAnalyticsPage(payload.page)) {
    return apiError("Unsupported analytics event.", 400);
  }

  const day = new Date().toISOString().slice(0, 10);
  const { event, page } = payload;
  const id = `${day}_${event}_${page}`;

  try {
    await db.collection("analytics_daily").doc(id).set({
      day,
      event,
      page,
      count: FieldValue.increment(1),
    }, { merge: true });
    return Response.json({ ok: true }, { status: 202 });
  } catch (error) {
    console.error("[KASI] aggregate analytics write failed:", error);
    return apiError("Could not record the analytics event.", 503);
  }
}
