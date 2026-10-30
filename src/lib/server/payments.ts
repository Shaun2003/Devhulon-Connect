/**
 * Payment providers — Paystack and Yoco behind one interface.
 *
 * Secrets live ONLY here (server runtime, non-public env vars). Nothing in this
 * module may be imported by a client component; route handlers call it and the
 * browser only ever receives a hosted checkout URL.
 *
 * Env:
 *   PAYMENT_PROVIDER=paystack|yoco
 *   PAYSTACK_SECRET_KEY=sk_live_… | sk_test_…
 *   YOCO_SECRET_KEY=sk_…
 *   YOCO_WEBHOOK_SECRET=whsec_…      (from Yoco dashboard → Webhooks)
 *
 * Both providers price in ZAR cents, so R300 === 30000.
 */

import crypto from "node:crypto";

export type PaymentProviderId = "paystack" | "yoco";

export type CheckoutRequest = {
  uid: string;
  email: string;
  planId: string;
  period: "monthly" | "annual";
  /** Amount in ZAR cents, resolved server-side from plans.ts (never from client). */
  amountCents: number;
  reference: string;
  callbackUrl: string;
  autoRenew?: boolean;
};

export type CheckoutSession = {
  provider: PaymentProviderId;
  reference: string;
  /** Hosted checkout page to redirect the buyer to. */
  url: string;
  accessCode?: string;
};

export type PaymentEvent =
  | {
      type: "paid";
      uid: string;
      planId: string;
      period: "monthly" | "annual";
      reference: string;
      providerRef?: string;
      authorizationCode?: string;
      authorizationReusable?: boolean;
      authorizationPresent?: boolean;
      customerEmail?: string;
      amountCents?: number;
    }
  | { type: "failed"; uid?: string; reference: string; providerRef?: string }
  | { type: "refunded"; reference: string; amountCents?: number }
  | { type: "ignored"; reason: string };

export const ZAR = (rands: number) => Math.round(rands * 100);

export const activeProvider = (): PaymentProviderId | null => {
  const p = (process.env.PAYMENT_PROVIDER ?? "").trim().toLowerCase();
  if (p === "paystack" || p === "yoco") return p;
  return null;
};

export const isPaymentsConfigured = (): boolean => {
  const p = activeProvider();
  if (p === "paystack") return Boolean(process.env.PAYSTACK_SECRET_KEY);
  if (p === "yoco") return Boolean(process.env.YOCO_SECRET_KEY);
  return false;
};

/** Case-insensitive header read that works across runtimes. */
const header = (h: Headers, name: string) => h.get(name) ?? h.get(name.toLowerCase()) ?? "";

/**
 * Constant-time compare so signature checks can't be brute-forced by timing.
 * Length is compared first because timingSafeEqual throws on length mismatch.
 */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/* ─────────────────────────────── Paystack ─────────────────────────────── */

const PAYSTACK_API = "https://api.paystack.co";

async function paystackCheckout(req: CheckoutRequest): Promise<CheckoutSession> {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw new Error("PAYSTACK_SECRET_KEY is not set.");

  const res = await fetch(`${PAYSTACK_API}/transaction/initialize`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: req.email,
      amount: req.amountCents,
      currency: "ZAR",
      reference: req.reference,
      callback_url: req.callbackUrl,
      ...(req.autoRenew ? { channels: ["card"] } : {}),
      // Anything the webhook needs to activate the right plan for the right user.
      metadata: { uid: req.uid, planId: req.planId, period: req.period, autoRenew: req.autoRenew === true, source: "devhulonconnect" },
    }),
  });

  const json = (await res.json()) as {
    status?: boolean;
    message?: string;
    data?: { authorization_url?: string; access_code?: string; reference?: string };
  };
  if (!res.ok || !json.status || !json.data?.authorization_url) {
    throw new Error(json.message ?? "Paystack could not start the checkout.");
  }
  return {
    provider: "paystack",
    reference: json.data.reference ?? req.reference,
    url: json.data.authorization_url,
    accessCode: json.data.access_code,
  };
}

/** Verify a Paystack webhook: HMAC-SHA512 of the RAW body, keyed with the secret. */
export function verifyPaystackSignature(rawBody: string, headers: Headers): boolean {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return false;
  const provided = header(headers, "x-paystack-signature");
  if (!provided) return false;
  const expected = crypto.createHmac("sha512", secret).update(rawBody, "utf8").digest("hex");
  return safeEqual(expected, provided);
}

/**
 * Paystack's confirmation endpoint — the authoritative "did they actually pay?"
 * check, which we call after the browser returns so the UI can resolve without
 * waiting for the webhook.
 */
export async function verifyPaystackTransaction(reference: string): Promise<
  {
    ok: true;
    amountCents: number;
    metadata: Record<string, unknown>;
    planCode?: string;
    authorizationCode?: string;
    authorizationReusable?: boolean;
    authorizationPresent?: boolean;
    customerEmail?: string;
  } | { ok: false; reason: string }
> {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return { ok: false, reason: "not-configured" };
  const res = await fetch(`${PAYSTACK_API}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secret}` },
    cache: "no-store",
  });
  const json = (await res.json()) as {
    status?: boolean;
    message?: string;
    data?: {
      status?: string;
      amount?: number;
      metadata?: Record<string, unknown>;
      plan?: { plan_code?: string };
      authorization?: { authorization_code?: string; reusable?: boolean };
      customer?: { email?: string };
    };
  };
  if (!res.ok || !json.status || !json.data) return { ok: false, reason: json.message ?? "verify-failed" };
  if (json.data.status !== "success") return { ok: false, reason: json.data.status ?? "not-success" };
  return {
    ok: true,
    amountCents: Number(json.data.amount ?? 0),
    metadata: json.data.metadata ?? {},
    planCode: json.data.plan?.plan_code,
    authorizationCode: json.data.authorization?.authorization_code,
    authorizationReusable: json.data.authorization?.reusable,
    authorizationPresent: Boolean(json.data.authorization),
    customerEmail: json.data.customer?.email,
  };
}

/** Charge a previously authorised reusable Paystack card for a due renewal. */
export async function chargePaystackAuthorization(input: {
  email: string;
  authorizationCode: string;
  amountCents: number;
  reference: string;
  uid: string;
  period: "monthly" | "annual";
}): Promise<{ status: string; reference: string; message?: string }> {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw new Error("PAYSTACK_SECRET_KEY is not set.");
  const response = await fetch(`${PAYSTACK_API}/transaction/charge_authorization`, {
    method: "POST",
    headers: { Authorization: "Bearer " + secret, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: input.email,
      amount: input.amountCents,
      currency: "ZAR",
      authorization_code: input.authorizationCode,
      reference: input.reference,
      metadata: {
        uid: input.uid,
        planId: "premium",
        period: input.period,
        autoRenew: true,
        renewal: true,
        source: "devhulonconnect",
      },
    }),
    cache: "no-store",
  });
  const result = await response.json() as {
    status?: boolean;
    message?: string;
    data?: { status?: string; reference?: string };
  };
  if (!response.ok || !result.status || !result.data) {
    return { status: "failed", reference: input.reference, message: result.message ?? "Renewal charge failed." };
  }
  return {
    status: result.data.status ?? "pending",
    reference: result.data.reference ?? input.reference,
    message: result.message,
  };
}

/* ───────────────────────────────── Yoco ───────────────────────────────── */

const YOCO_API = "https://payments.yoco.com/api";

async function yocoCheckout(req: CheckoutRequest): Promise<CheckoutSession> {
  const secret = process.env.YOCO_SECRET_KEY;
  if (!secret) throw new Error("YOCO_SECRET_KEY is not set.");

  const res = await fetch(`${YOCO_API}/checkouts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: req.amountCents,
      currency: "ZAR",
      cancelUrl: req.callbackUrl,
      failureUrl: req.callbackUrl,
      successUrl: req.callbackUrl,
      metadata: { uid: req.uid, planId: req.planId, period: req.period, reference: req.reference, source: "kasi" },
    }),
  });

  const json = (await res.json()) as { id?: string; redirectUrl?: string; message?: string };
  if (!res.ok || !json.redirectUrl) throw new Error(json.message ?? "Yoco could not start the checkout.");
  return { provider: "yoco", reference: req.reference, url: json.redirectUrl, accessCode: json.id };
}

/**
 * Verify a Yoco webhook.
 *
 * Yoco signs webhooks with the Svix scheme: base64(HMAC-SHA256(secret, `${id}.${timestamp}.${rawBody}`))
 * where `secret` is the base64 body of the `whsec_…` value, sent in the
 * `webhook-signature` header as a space-separated list of `v1,<signature>`.
 * Confirm the exact scheme in Yoco → Developers → Webhooks before going live.
 */
export function verifyYocoSignature(rawBody: string, headers: Headers): boolean {
  const rawSecret = process.env.YOCO_WEBHOOK_SECRET;
  if (!rawSecret) return false;

  const id = header(headers, "webhook-id");
  const timestamp = header(headers, "webhook-timestamp");
  const provided = header(headers, "webhook-signature");
  if (!id || !timestamp || !provided) return false;

  // Reject stale deliveries (replay protection) — Svix default tolerance is 5 min.
  const ageMs = Math.abs(Date.now() - Number(timestamp) * 1000);
  if (!Number.isFinite(ageMs) || ageMs > 5 * 60 * 1000) return false;

  const secretBytes = Buffer.from(rawSecret.replace(/^whsec_/, ""), "base64");
  const expected = crypto
    .createHmac("sha256", secretBytes)
    .update(`${id}.${timestamp}.${rawBody}`, "utf8")
    .digest("base64");

  // Header may carry multiple space-separated signatures.
  return provided
    .split(" ")
    .map((part) => part.trim())
    .some((part) => {
      const value = part.includes(",") ? part.slice(part.indexOf(",") + 1) : part;
      return safeEqual(expected, value);
    });
}

/* ───────────────────────────── dispatch layer ──────────────────────────── */

/** Start a hosted checkout with whichever provider is configured. */
export async function startCheckout(req: CheckoutRequest): Promise<CheckoutSession> {
  const provider = activeProvider();
  if (!provider) throw new Error("No payment provider configured — set PAYMENT_PROVIDER and its secret key.");
  return provider === "paystack" ? paystackCheckout(req) : yocoCheckout(req);
}

/**
 * Normalise a provider webhook body into one of our own events.
 *
 * Deliberately defensive: providers add fields, and a malformed body must resolve
 * to `ignored` (HTTP 200) rather than a 500 that triggers endless retries.
 */
export function parseWebhookEvent(provider: PaymentProviderId, body: unknown): PaymentEvent {
  try {
    const b = body as Record<string, unknown>;

    if (provider === "paystack") {
      const event = String(b.event ?? "");
      const data = (b.data ?? {}) as Record<string, unknown>;
      const transaction = (data.transaction ?? {}) as Record<string, unknown>;
      const reference = String(data.reference ?? transaction.reference ?? "");
      const meta = (data.metadata ?? {}) as Record<string, unknown>;

      if (event === "charge.success") {
        const authorization = (data.authorization ?? {}) as Record<string, unknown>;
        const customer = (data.customer ?? {}) as Record<string, unknown>;
        return {
          type: "paid",
          uid: String(meta.uid ?? ""),
          planId: String(meta.planId ?? "starter"),
          period: (meta.period === "annual" ? "annual" : "monthly"),
          reference,
          providerRef: data.plan && typeof data.plan === "object" ? String((data.plan as Record<string, unknown>).plan_code ?? "") : undefined,
          authorizationCode: typeof authorization.authorization_code === "string"
            ? authorization.authorization_code : undefined,
          authorizationReusable: authorization.reusable === true,
          authorizationPresent: Object.keys(authorization).length > 0,
          customerEmail: typeof customer.email === "string" ? customer.email : undefined,
          amountCents: typeof data.amount === "number" ? data.amount : undefined,
        };
      }
      if (event === "charge.failed") return { type: "failed", uid: meta.uid ? String(meta.uid) : undefined, reference };
      if (event.startsWith("refund")) {
        return {
          type: "refunded",
          reference,
          amountCents: typeof data.amount === "number" ? data.amount : undefined,
        };
      }
      return { type: "ignored", reason: `unhandled-paystack-event:${event}` };
    }

    // Yoco
    const type = String(b.type ?? "");
    const payload = (b.payload ?? {}) as Record<string, unknown>;
    const meta = (payload.metadata ?? {}) as Record<string, unknown>;
    const reference = String(meta.reference ?? payload.id ?? "");

    if (type === "payment.succeeded") {
      return {
        type: "paid",
        uid: String(meta.uid ?? ""),
        planId: String(meta.planId ?? "starter"),
        period: (meta.period === "annual" ? "annual" : "monthly"),
        reference,
        providerRef: payload.id ? String(payload.id) : undefined,
        amountCents: typeof payload.amount === "number" ? payload.amount : undefined,
      };
    }
    if (type === "payment.failed") return { type: "failed", uid: meta.uid ? String(meta.uid) : undefined, reference };
    if (type.startsWith("refund")) {
      return {
        type: "refunded",
        reference,
        amountCents: typeof payload.amount === "number" ? payload.amount : undefined,
      };
    }
    return { type: "ignored", reason: `unhandled-yoco-event:${type}` };
  } catch {
    return { type: "ignored", reason: "malformed-body" };
  }
}

/** Verify a webhook against the active provider's signing scheme. */
export function verifyWebhook(rawBody: string, headers: Headers): { ok: boolean; provider: PaymentProviderId | null } {
  const provider = activeProvider();
  if (!provider) return { ok: false, provider: null };
  const ok = provider === "paystack" ? verifyPaystackSignature(rawBody, headers) : verifyYocoSignature(rawBody, headers);
  return { ok, provider };
}