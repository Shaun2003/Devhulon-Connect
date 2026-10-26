/**
 * /api/credits — the seller's credit wallet.
 *
 * GET  → balance + recent ledger rows + the set of leads already unlocked
 *        (so the UI can show "unlocked" without a second round-trip).
 * POST → start a hosted checkout for a credit pack (action: "checkout").
 *
 * The wallet itself is server-write-only (firestore.rules); the browser reads it
 * through the realtime listener and only ever ASKS to change it here, against a
 * price the server resolves from lib/credits.
 */

import { adminDb, apiError, sessionFromRequest } from "@/lib/server/admin";
import { readWallet } from "@/lib/server/credits";
import { activeProvider, isPaymentsConfigured, startCheckout, ZAR } from "@/lib/server/payments";
import { getCreditPack } from "@/lib/credits";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET the signed-in seller's wallet, ledger and unlocked-lead set. */
export async function GET(req: Request) {
  const db = adminDb();
  if (!db) return apiError("Server storage is not configured.", 503);

  const session = await sessionFromRequest(req);
  if (!session) return apiError("Sign in to view your wallet.", 401);

  const wallet = await readWallet(session.uid);
  const [ledgerSnap, unlocksSnap] = await Promise.all([
    db.collection("credit_ledger").where("ownerUid", "==", session.uid).orderBy("createdAt", "desc").limit(30).get(),
    db.collection("lead_unlocks").where("ownerUid", "==", session.uid).limit(200).get(),
  ]);

  return Response.json({
    ok: true,
    balance: wallet?.balance ?? 0,
    lifetimeEarned: wallet?.lifetimeEarned ?? 0,
    lifetimeSpent: wallet?.lifetimeSpent ?? 0,
    ledger: ledgerSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })),
    unlockedLeadIds: unlocksSnap.docs.map((d) => String((d.data() as { leadId?: string }).leadId ?? "")).filter(Boolean),
  });
}

/**
 * POST — start a hosted checkout for a credit pack.
 *
 * Mirrors /api/billing/checkout exactly: the caller is identified by their ID
 * token, the amount is resolved SERVER-SIDE from the pack catalogue, and a
 * `payments` record is written FIRST so the webhook has an auditable trail. The
 * webhook then calls `grantCreditsForPurchase` — the browser never grants itself
 * credits.
 *
 * The payment record carries `kind: "credits"` and the `packId`, which is how
 * the webhook knows to top up a wallet instead of activating a subscription.
 */
export async function POST(req: Request) {
  const db = adminDb();
  if (!db) return apiError("Server storage is not configured.", 503);

  const session = await sessionFromRequest(req);
  if (!session) return apiError("Sign in to buy credits.", 401);

  if (!isPaymentsConfigured()) {
    return apiError(
      "Card payments are not switched on yet. Set PAYMENT_PROVIDER plus its secret key to buy credits.",
      503
    );
  }

  let body: { packId?: string };
  try {
    body = (await req.json()) as { packId?: string };
  } catch {
    return apiError("Invalid request body.");
  }

  const pack = getCreditPack(String(body.packId ?? ""));
  if (!pack) return apiError("Choose a valid credit pack.");

  const reference = `kasi-credits-${randomUUID()}`;
  const provider = activeProvider();
  const origin = new URL(req.url).origin;
  const callbackUrl = `${origin}/dashboard?tab=wallet&billing=return&reference=${encodeURIComponent(reference)}`;

  // Audit trail first — the webhook resolves the pack from THIS record, so a
  // forged webhook body alone cannot mint credits.
  await db.collection("payments").doc(reference).set({
    reference,
    ownerUid: session.uid,
    email: session.email,
    kind: "credits",
    packId: pack.id,
    credits: pack.credits,
    amount: pack.price,
    amountCents: ZAR(pack.price),
    currency: "ZAR",
    status: "pending",
    provider,
    providerRef: null,
    createdAt: new Date().toISOString(),
  });

  try {
    const checkout = await startCheckout({
      uid: session.uid,
      email: session.email ?? `${session.uid}@kasi.local`,
      planId: `credits-${pack.id}`,
      period: "monthly",
      amountCents: ZAR(pack.price),
      reference,
      callbackUrl,
    });

    await db.collection("payments").doc(reference).set(
      { providerRef: checkout.accessCode ?? null, providerUrl: checkout.url, updatedAt: new Date().toISOString() },
      { merge: true }
    );

    return Response.json({ ok: true, url: checkout.url, reference, provider: checkout.provider });
  } catch (err) {
    await db.collection("payments").doc(reference).set(
      { status: "failed", failureReason: err instanceof Error ? err.message : "checkout-failed", updatedAt: new Date().toISOString() },
      { merge: true }
    );
    return apiError(err instanceof Error ? err.message : "Could not start checkout.", 502);
  }
}
