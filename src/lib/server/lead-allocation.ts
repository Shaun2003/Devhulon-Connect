/**
 * Lead delivery — TRUSTED SERVER ONLY.
 *
 * Why this module exists: `consumeLeadOpportunity` (subscriptions.ts) is the
 * correct atomic limiter, but nothing ever CALLED it. Lead delivery happened
 * entirely in the browser (`matchProRequest` in repo.ts), which meant:
 *
 *   • no subscription check — a seller on no plan received unlimited leads
 *   • no allowance check — a Starter seller at 5/5 kept receiving leads
 *   • no audit trail — no record of who was sold which lead
 *
 * A browser cannot be trusted to police this: the whole point of a paid lead is
 * that the DECISION to sell it happens somewhere the buyer of the product cannot
 * edit. So delivery now runs here, and the browser only posts the request.
 *
 * The limiter itself is unchanged — this module is the enforcement WIRING.
 */

import { adminDb } from "./admin";
import { queueEmail } from "./email";
import { matchPros, matchCategory } from "@/lib/matching";
import { CATEGORY_GROUPS, SERVICE_GROUPS } from "@/data/taxonomy";
import { loadSellerCandidates } from "./seller-search";
import { activateStarter, consumeLeadOpportunity, releaseLeadOpportunity } from "./subscriptions";
import { DEFAULT_ALERTED_PROS, MAX_ALERTED_PROS, CONSENT_VERSION, TERMS_VERSION } from "@/lib/legal";

/** Mirrors repo.ts `cleanStr` without importing the client Firebase SDK. */
const cleanStr = (v: unknown, max: number): string => String(v ?? "").trim().slice(0, max);

const nowIso = () => new Date().toISOString();
const MAX_BUYER_BUDGET = 5_000_000;

function cleanBuyerBudget(value: unknown): number | null | false {
  if (value === undefined || value === null || value === "") return null;
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(amount) && amount > 0 && amount <= MAX_BUYER_BUDGET ? amount : false;
}

/** Why a matched seller did not receive a lead. */
export type SkipReason = "limit" | "not-entitled" | "no-subscription" | "no-owner";

/**
 * A seller without a subscription record is activated on the permanent free
 * Starter tier. The monthly opportunity marker is keyed by the canonical
 * request id, so retries do not consume a second opportunity.
 */
async function consumeWithStarter(uid: string, requestId: string) {
  const first = await consumeLeadOpportunity(uid, requestId);
  if (first.ok || first.reason !== "no-subscription") return first;

  const activated = await activateStarter(uid);
  if (!activated.ok) return first;
  return consumeLeadOpportunity(uid, requestId);
}


/**
 * Hard ceiling on how many sellers ONE buyer request may ever reach.
 *
 * `maxSellers` arrives in the request body, so without a server clamp a caller
 * could post `{ maxSellers: 10000 }` and fan out across the entire seller pool —
 * spending a lead credit on every seller in the database from a single POST.
 * The value is therefore treated as a REQUEST, never as an instruction: it is
 * clamped here, on the trusted side, before any seller is charged.
 *
 * DEFAULT_FANOUT is deliberately lower than MAX_FANOUT. Bark alerts a handful,
 * not the city, and every extra seller is another stranger who receives the
 * buyer's phone number under POPIA — so the default is the product decision and
 * the max is only the ceiling a buyer may opt up to.
 */
export const DEFAULT_FANOUT = DEFAULT_ALERTED_PROS;
export const MAX_FANOUT = MAX_ALERTED_PROS;

/** Clamp any caller-supplied fan-out into [1, MAX_FANOUT]. */
export function clampFanout(raw: unknown): number {
  const n = typeof raw === "number" && Number.isFinite(raw) ? Math.floor(raw) : NaN;
  if (!Number.isFinite(n)) return DEFAULT_FANOUT;
  return Math.min(MAX_FANOUT, Math.max(1, n));
}

export type AllocationResult = {
  ok: true;
  requestId: string;
  allocated: { ownerUid: string; businessId: string; name: string; remaining: number | null }[];
  skipped: { name: string; reason: SkipReason }[];
  /** True when nobody could be served, so the UI can say something useful. */
  allBlocked: boolean;
};

export type BroadcastRequest = {
  requesterUid: string;
  need: string;
  place?: string;
  categorySlug?: string;
  serviceGroupSlug?: string;
  name?: string;
  email?: string;
  phone: string;
  timeline?: string;
  budget?: unknown;
  maxSellers?: number;
  /**
   * Explicit POPIA consent to share this buyer's contact details with matched
   * businesses. Required — see the check in `allocateBroadcastLeads`.
   */
  consent?: boolean;
};

/**
 * Match a buyer's need to sellers and deliver to as many as their plans allow.
 *
 * Each seller is gated individually by `consumeLeadOpportunity`, which runs in a
 * Firestore transaction — so if a seller's 5th and 6th lead arrive at the same
 * instant, exactly one wins and the other is recorded as `limit`. Sellers are
 * independent of one another, so the per-seller transactions cannot deadlock.
 *
 * Best-effort per seller by design: one seller's write failing must not cost the
 * buyer their whole request, which is why this is not one big transaction.
 */
export async function allocateBroadcastLeads(
  input: BroadcastRequest
): Promise<AllocationResult | { ok: false; error: string }> {
  const db = adminDb();
  if (!db) return { ok: false, error: "Server storage is not configured." };

  const need = cleanStr(input.need, 300);
  if (need.length < 2) return { ok: false, error: "Tell us what you need first." };
  const phone = cleanStr(input.phone, 40);
  if (phone.length < 6) return { ok: false, error: "Add a phone or WhatsApp number so pros can reach you." };
  const budget = cleanBuyerBudget(input.budget);
  if (budget === false) return { ok: false, error: `Budget must be a whole rand amount between R1 and R${MAX_BUYER_BUDGET.toLocaleString("en-ZA")}.` };

  // ── POPIA: no disclosure without recorded consent ─────────────────────────
  // This request hands one person's phone number, name and email to several
  // independent businesses. That is a disclosure to third parties, which POPIA
  // permits only on specific, informed, unambiguous consent captured at the point
  // of collection. The client sends a boolean; that boolean is NOT evidence, so
  // the moment and the wording version are stamped here, on the trusted side.
  // `consentVersion` is what makes a historic record auditable years later.
  if (input.consent !== true) {
    return { ok: false, error: "Please confirm you're happy for local businesses to contact you about this job." };
  }
  const consentAt = nowIso();

  const pool = await loadSellerCandidates({
    need,
    place: input.place,
    categorySlug: input.categorySlug,
    serviceGroupSlug: input.serviceGroupSlug,
  });
  const matched = matchPros({
    need,
    place: input.place,
    categorySlug: input.categorySlug,
    serviceGroupSlug: input.serviceGroupSlug,
  }, pool);
  // Bark alerts a handful, not the whole city. The count is CLAMPED server-side:
  // the body value is a request, not an instruction (see clampFanout).
  const fanout = clampFanout(input.maxSellers);
  const targets = matched.slice(0, Math.min(fanout, matched.length));
  if (targets.length === 0) return { ok: false, error: "No eligible pros currently offer that service. Try another service or try again later." };

  const createdAt = nowIso();
  const requesterUid = input.requesterUid;

  // The buyer's canonical request record (their dashboard copy). `ownerUid` is
  // null by design, and `status` is "new" — the same open-pool contract the
  // seller-facing query and firestore.rules use (see the status note below).
  //
  // THIS DOCUMENT IS THE UNIT OF WORK. Every seller-facing lead below points back
  // at it via `requestId`, which is what makes "one job, many competing sellers"
  // representable. `awarded*` is written ONLY by POST /api/quotes/award inside a
  // transaction on this doc, so exactly one seller can ever win a request.
  const requestRef = db.collection("leads").doc();
  // THE LINK THAT WAS MISSING — see the requestId notes above.
  //
  // status is "new" (NOT a bespoke "broadcast" value): "new" + ownerUid null is
  // exactly the open-pool contract in firestore.rules and the seller marketplace
  // query, so eligible sellers can see a contact-stripped preview and unlock the
  // buyer through the credit wallet.
  await requestRef.set({
    need,
    category: input.categorySlug ?? (
      input.serviceGroupSlug && CATEGORY_GROUPS[matchCategory(need)?.slug ?? ""] !== input.serviceGroupSlug
        ? null
        : matchCategory(need)?.slug ?? null
    ),
    serviceGroup: SERVICE_GROUPS.some((group) => group.slug === input.serviceGroupSlug)
      ? input.serviceGroupSlug
      : null,
    suburb: cleanStr(input.place, 120) || null,
    timeline: cleanStr(input.timeline, 60) || null,
    budget,
    businessId: null,
    businessName: null,
    ownerUid: null,
    requesterUid,
    status: "new",
    matchedCount: 0,
    createdAt,
    // Consent provenance, recorded once on the request and copied onto every
    // seller-facing lead. POPIA requires demonstrating the lawful basis for a
    // disclosure, so this must be provable from the stored record alone — an
    // unticked checkbox the server simply trusted would not be evidence.
    consentAt,
    consentVersion: CONSENT_VERSION,
    termsVersion: TERMS_VERSION,
    // Award fields start empty and are only ever set by the award route.
    awardedQuoteId: null,
    awardedSellerUid: null,
    awardedBusinessName: null,
    awardedAt: null,
  });

  // ── The contact vault ──────────────────────────────────────────────────────
  // The buyer's phone/email/name is the PRODUCT in the pay-per-contact model,
  // so it is NOT written into any lead document — every lead doc (this request
  // copy and every seller copy below) is readable by clients, and Firestore
  // rules cannot project individual fields. Contact lives here, server-only
  // (`lead_contacts` is write-denied to clients in firestore.rules), and is
  // revealed ONLY by POST /api/leads/unlock after the credit transaction
  // succeeds. Keyed on the REQUEST id, which every seller copy points back to
  // via `requestId`.
  await db.collection("lead_contacts").doc(requestRef.id).set({
    leadId: requestRef.id,
    requestId: requestRef.id,
    phone,
    name: cleanStr(input.name, 80) || null,
    email: cleanStr(input.email, 120) || null,
    requesterUid,
    createdAt,
  });

  const allocated: AllocationResult["allocated"] = [];
  const skipped: AllocationResult["skipped"] = [];

  for (const t of targets) {
    const b = t.business;
    const ownerUid = b.ownerUid;
    if (!ownerUid) {
      skipped.push({ name: b.name, reason: "no-owner" });
      continue;
    }

    // ── The gate. Atomic, server-side, and the only thing that decides. ──
    const verdict = await consumeWithStarter(ownerUid, requestRef.id);
    if (!verdict.ok) {
      skipped.push({
        name: b.name,
        reason: verdict.reason === "no-subscription" ? "no-subscription" : verdict.reason,
      });
      continue;
    }

    try {
      const leadRef = db.collection("leads").doc();
      // NOTE: no phone/email/name here either — see the contact vault above.
      // The seller's copy is a PREVIEW (what the job is, roughly where, when);
      // unlocking it via credits fetches the contact from lead_contacts/{requestId}.
      const leadData = {
        need,
        category: b.categorySlug,
        suburb: b.suburbSlug,
        timeline: cleanStr(input.timeline, 60) || null,
        budget,
        businessId: b.id,
        businessName: b.name,
        ownerUid,
        acceptedOwnerUid: null,
        requesterUid,
        status: "new",
        matchScore: t.score,
        // ── THE LINK THAT WAS MISSING ──
        // Without this, each seller's copy is an orphan: nothing can tell that
        // five leads belong to ONE buyer job, so accepting a quote could never
        // close the other four. It is what makes this a contested request
        // instead of five unrelated ones.
        requestId: requestRef.id,
        // How many sellers this request may reach, so a seller can see whether
        // they are one of several competing bids.
        maxSellers: fanout,
        consentAt,
        consentVersion: CONSENT_VERSION,
        termsVersion: TERMS_VERSION,
        createdAt,
      };
      const allocationRef = db.collection("lead_allocations").doc(`${ownerUid}_${requestRef.id}`);
      const allocationBatch = db.batch();
      allocationBatch.set(leadRef, leadData);
      allocationBatch.set(allocationRef, {
        leadId: leadRef.id,
        requestId: requestRef.id,
        ownerUid,
        requesterUid,
        businessId: b.id,
        plan: verdict.entitlement.plan,
        periodEnd: verdict.entitlement.periodEnd,
        allocationType: "matched",
        status: "delivered",
        createdAt,
      });
      await allocationBatch.commit();

      try {
        await db.collection("notifications").add({
          toUid: ownerUid,
          fromUid: requesterUid,
          type: "lead",
          message: `New ${b.categorySlug.replace(/-/g, " ")} request in ${b.suburbSlug.replace(/-/g, " ")} — reply fast.`,
          businessId: b.id,
          leadId: leadRef.id,
          href: `/dashboard?tab=leads&lead=${leadRef.id}`,
          read: false,
          createdAt,
        });
      } catch (error) {
        console.error("[KASI] could not notify seller about matched lead:", error);
      }

      // SELLER email — the money moment. A seller who is not on the site
      // misses the in-app row entirely; without this the lead rots unread.
      // Best-effort: queueEmail never throws, so a mail outage can't fail delivery.
      queueEmail({
        toUid: ownerUid,
        kind: "lead-new",
        subject: "New job request near you",
        heading: "You have a new job request",
        body:
          "A buyer near " +
          (cleanStr(input.place, 80) || b.suburbSlug.replace(/-/g, " ")) +
          " posted a request. Open your dashboard to accept it before another pro does — first to accept usually wins the job.",
        ctaLabel: "View request",
        ctaHref: "/dashboard?lead=" + leadRef.id,
      });

      allocated.push({
        ownerUid,
        businessId: b.id,
        name: b.name,
        remaining: verdict.entitlement.leadsRemaining,
      });
    } catch (err) {
      // The allowance was already consumed by the transaction, so give it back
      // rather than silently billing a seller for a lead they never received.
      try {
        await releaseLeadOpportunity(ownerUid, requestRef.id);
      } catch (releaseError) {
        console.error("[DevhulonConnect] lead opportunity release failed:", releaseError);
      }
      skipped.push({ name: b.name, reason: "not-entitled" });
      console.warn(`[KASI] lead delivery failed for ${b.id}:`, err instanceof Error ? err.message : err);
    }
  }

  await requestRef.set({ matchedCount: allocated.length }, { merge: true });

  return { ok: true, requestId: requestRef.id, allocated, skipped, allBlocked: allocated.length === 0 };
}

/**
 * A seller claiming an OPEN broadcast lead spends allowance too.
 *
 * Without this the cap is trivially bypassed: matched delivery is gated, but any
 * signed-in seller could poll the open pool and claim the same request over and
 * over. Allowance is consumed BEFORE the claim, so a seller at their limit is
 * refused instead of being shown a lead they cannot own.
 */
/**
 * A buyer requesting a quote from ONE named business — the /request-quote flow.
 *
 * Metered on exactly the same allowance as broadcast matching, by explicit
 * product decision. Leaving this path free was the last hole in the cap: a
 * seller could be handed unlimited leads simply by being the listing a buyer
 * happened to click "Quote" on, making "5 leads a month" untrue. One lead,
 * one credit, whichever door it came through.
 *
 * The business is resolved SERVER-side from the id, so a buyer cannot redirect
 * their request to an arbitrary seller to farm a trial or burn someone else's
 * allowance.
 */
export async function createDirectLead(input: {
  requesterUid: string | null;
  businessId: string;
  need?: string;
  suburb?: string;
  name?: string;
  email?: string;
  phone: string;
  timeline?: string;
  budget?: unknown;
  /** Explicit POPIA consent to be contacted by this business. Required. */
  consent?: boolean;
}): Promise<
  | { ok: true; leadId: string; remaining: number | null }
  | { ok: false; error: string; reason?: SkipReason }
> {
  const db = adminDb();
  if (!db) return { ok: false, error: "Server storage is not configured." };

  const businessId = cleanStr(input.businessId, 64);
  if (!businessId) return { ok: false, error: "Pick a business to send this to." };
  const phone = cleanStr(input.phone, 40);
  if (phone.length < 6) return { ok: false, error: "Add a phone or WhatsApp number so the pro can reach you." };
  const budget = cleanBuyerBudget(input.budget);
  if (budget === false) return { ok: false, error: `Budget must be a whole rand amount between R1 and R${MAX_BUYER_BUDGET.toLocaleString("en-ZA")}.` };

  // Same POPIA test as the broadcast path: naming ONE business is still a
  // disclosure to a third party, so the buyer must have agreed to be contacted.
  // A direct request is lower-impact than a broadcast, but it is not exempt.
  if (input.consent !== true) {
    return { ok: false, error: "Please confirm you're happy for this business to contact you about the job." };
  }
  const consentAt = nowIso();

  const bizSnap = await db.collection("businesses").doc(businessId).get();
  if (!bizSnap.exists) return { ok: false, error: "That business is no longer listed." };
  const biz = bizSnap.data() as {
    name?: string; ownerUid?: string; categorySlug?: string; suburbSlug?: string; status?: string;
  };
  if (String(biz.status ?? "live") !== "live") {
    return { ok: false, error: "That business is not currently accepting requests." };
  }
  if (!biz.ownerUid) {
    return { ok: false, error: "That listing has no owner yet, so requests can't be delivered." };
  }

  const leadRef = db.collection("leads").doc();
  const verdict = await consumeWithStarter(biz.ownerUid, leadRef.id);
  if (!verdict.ok) {
    const atLimit = verdict.reason === "limit" || verdict.reason === "not-entitled" || verdict.reason === "no-subscription";
    return {
      ok: false,
      reason: verdict.reason === "no-subscription" ? "no-subscription" : verdict.reason,
      // 402-class messaging is phrased for the BUYER, who did nothing wrong —
      // telling them the pro is full is more useful than a generic failure, and
      // it never reveals the pro's plan or billing state in detail.
      error: atLimit
        ? "That business has received its full allowance of requests for this period and isn't taking more right now. Try another local pro, or check back next period."
        : "That business can't take requests right now. Try another local pro.",
    };
  }

  const createdAt = nowIso();
  // Contact goes to the vault, not the lead doc — same pay-per-contact rule as
  // the broadcast path: even a buyer who named ONE business still has their
  // number locked behind the unlock (the seller copy is a preview).
  await db.collection("lead_contacts").doc(leadRef.id).set({
    leadId: leadRef.id,
    requestId: leadRef.id,
    phone,
    name: cleanStr(input.name, 80) || null,
    email: cleanStr(input.email, 120) || null,
    requesterUid: input.requesterUid,
    createdAt,
  });
  const leadData = {
    need: cleanStr(input.need, 300) || null,
    category: biz.categorySlug ?? null,
    suburb: cleanStr(input.suburb, 120) || biz.suburbSlug || null,
    timeline: cleanStr(input.timeline, 60) || null,
    budget,
    businessId,
    businessName: biz.name ?? null,
    ownerUid: biz.ownerUid,
    requesterUid: input.requesterUid,
    status: "new",
    // A direct request is its own request (no fan-out), so requestId === leadId.
    requestId: leadRef.id,
    consentAt,
    consentVersion: CONSENT_VERSION,
    termsVersion: TERMS_VERSION,
    createdAt,
  };
  const allocationRef = db.collection("lead_allocations").doc(`${biz.ownerUid}_${leadRef.id}`);
  const allocationBatch = db.batch();
  allocationBatch.set(leadRef, leadData);
  allocationBatch.set(allocationRef, {
    leadId: leadRef.id,
    requestId: leadRef.id,
    ownerUid: biz.ownerUid,
    requesterUid: input.requesterUid,
    businessId,
    plan: verdict.entitlement.plan,
    periodEnd: verdict.entitlement.periodEnd,
    allocationType: "direct",
    status: "delivered",
    createdAt,
  });
  try {
    await allocationBatch.commit();
  } catch (error) {
    await releaseLeadOpportunity(biz.ownerUid, leadRef.id);
    throw error;
  }

  try {
    await db.collection("notifications").add({
      toUid: biz.ownerUid,
      fromUid: input.requesterUid,
      type: "lead",
      message: `New quote request for ${biz.name ?? "your business"}.`,
      businessId,
      leadId: leadRef.id,
      href: `/dashboard?tab=leads&lead=${leadRef.id}`,
      read: false,
      createdAt,
    });
  } catch (error) {
    console.error("[KASI] could not notify seller about direct lead:", error);
  }

  // SELLER email for the direct path — same money-moment reasoning.
  queueEmail({
    toUid: biz.ownerUid,
    kind: "lead-new",
    subject: "New direct request for your business",
    heading: "A buyer requested you directly",
    body: "A buyer asked specifically for your business. Open your dashboard to respond — direct requests convert well, so reply fast.",
    ctaLabel: "View request",
    ctaHref: "/dashboard?lead=" + leadRef.id,
  });

  return { ok: true, leadId: leadRef.id, remaining: verdict.entitlement.leadsRemaining };
}
