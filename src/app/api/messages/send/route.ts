import { Timestamp } from "firebase-admin/firestore";
import { cleanBody, previewText, validateMessage, type MessageKind } from "@/lib/messages";
import { limitsFor } from "@/lib/plans";
import { adminDb, apiError, sessionFromRequest } from "@/lib/server/admin";
import { entitlementFrom, readSubscription } from "@/lib/server/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const db = adminDb();
  if (!db) return apiError("Server storage is not configured.", 503);
  const session = await sessionFromRequest(request);
  if (!session) return apiError("Sign in to send a message.", 401);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const conversationId = typeof body.conversationId === "string" ? body.conversationId.trim() : "";
  const messageBody = typeof body.body === "string" ? body.body : "";
  if (!conversationId || conversationId.includes("/") || conversationId.length > 200) {
    return apiError("Choose a valid conversation.");
  }
  const problem = validateMessage(messageBody);
  if (problem) return apiError(problem);

  const kind: MessageKind = body.kind === "quote" || body.kind === "job" ? body.kind : "text";
  if (body.kind !== undefined && !["text", "quote", "job"].includes(String(body.kind))) {
    return apiError("Choose a valid message type.");
  }
  const attachments = body.attachments === undefined ? [] : body.attachments;
  if (!Array.isArray(attachments) || attachments.length > 5 ||
      attachments.some((item) => typeof item !== "string" || item.length > 500)) {
    return apiError("Messages may include up to five valid attachments.");
  }

  const userProfile = await db.collection("users").doc(session.uid).get();
  const isSeller = String(userProfile.data()?.role ?? "") === "seller";
  let messageLimit: number | null = null;
  if (isSeller) {
    const entitlement = entitlementFrom(await readSubscription(session.uid));
    if (!entitlement.entitled) {
      return apiError("An active subscription is required to send seller messages.", 403);
    }
    messageLimit = limitsFor(entitlement.plan).messagesPerMonth;
  }
  const limitedSeller = isSeller && messageLimit !== null;

  const conversationRef = db.collection("conversations").doc(conversationId);
  const messageRef = conversationRef.collection("messages").doc();
  const usageRef = db.collection("message_usage").doc(session.uid);
  const monthKey = new Date().toISOString().slice(0, 7);
  const clean = cleanBody(messageBody);

  const result = await db.runTransaction(async (transaction) => {
    const conversation = await transaction.get(conversationRef);
    if (!conversation.exists) return { error: "That conversation is no longer available.", status: 404 };
    const data = conversation.data() ?? {};
    const participants = Array.isArray(data.participants) ? data.participants : [];
    if (!participants.includes(session.uid)) {
      return { error: "You're not part of this conversation.", status: 403 };
    }
    if (data.status === "blocked") {
      return { error: "This conversation is blocked — unblock it to continue.", status: 403 };
    }

    const usage = limitedSeller ? await transaction.get(usageRef) : null;
    const usageData = usage?.data() ?? {};
    const sentThisMonth = usageData.monthKey === monthKey && Number.isSafeInteger(usageData.count)
      ? Number(usageData.count)
      : 0;
    if (limitedSeller && messageLimit !== null && sentThisMonth >= messageLimit) {
      return {
        error: `You've used your ${messageLimit} seller messages this month. Upgrade to Professional for unlimited messaging.`,
        status: 403,
      };
    }

    const now = Timestamp.now();
    transaction.create(messageRef, {
      senderUid: session.uid,
      body: clean,
      kind,
      attachments,
      readBy: [session.uid],
      createdAt: now,
    });
    transaction.update(conversationRef, {
      lastMessage: previewText(clean),
      lastSenderUid: session.uid,
      lastAt: now,
    });
    if (limitedSeller) {
      transaction.set(usageRef, {
        ownerUid: session.uid,
        monthKey,
        count: sentThisMonth + 1,
        updatedAt: now,
      });
    }

    return {
      id: messageRef.id,
      messagesRemaining: limitedSeller && messageLimit !== null ? messageLimit - sentThisMonth - 1 : null,
    };
  });

  if ("error" in result && typeof result.error === "string") {
    return apiError(result.error, typeof result.status === "number" ? result.status : 400);
  }
  return Response.json({ ok: true, ...result });
}
