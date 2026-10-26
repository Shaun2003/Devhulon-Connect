/**
 * /api/business — server-side writes to a seller's own listing (§24).
 *
 * PATCH supports one action:
 *   { action: "service-areas", businessId, areas }
 *
 * POST creates a NEW listing:
 *   { name, category, suburb, city, province, phone, ... }
 *
 * Service areas steer lead matching (spec §14), so the plan cap — Starter 1,
 * Professional 2, Business unlimited — is evaluated here, on the server, from
 * the server-owned subscription doc. The client cannot widen its own matching
 * surface by bypassing the UI.
 *
 * WHY CREATION IS HERE AND NOT IN THE BROWSER: `createBusiness` used to
 * `setDoc` straight from the client. Firestore rules can check ownership and
 * `planClaimOk`, but they CANNOT COUNT DOCUMENTS, so two plan promises were
 * unenforceable while it lived there:
 *
 *   • the number of LISTINGS per account — nothing stopped one seller creating
 *     an unbounded number of profiles;
 *   • the number of SERVICES on a listing — `limitsFor(plan).services` existed
 *     and was shown on the pricing page, but no server code ever read it, so a
 *     Starter seller could publish unlimited services by posting a longer array.
 *
 * Both are counted here with the Admin SDK, from the server-owned subscription.
 */

import { adminDb, apiError, sessionFromRequest } from "@/lib/server/admin";
import { entitlementFrom, readSubscription } from "@/lib/server/subscriptions";
import { hasCap, limitsFor, normalizePlanId, type PlanId } from "@/lib/plans";
import { cleanPortfolioDraft, cleanServiceAreas, validatePortfolioDraft } from "@/lib/portfolio";

export const runtime = "nodejs";

const nowIso = () => new Date().toISOString();

/**
 * Plan a NEW seller is on before they have any subscription at all.
 *
 * The rules already made this call: a brand-new seller has no subscription doc,
 * and demanding one would deadlock the very first action, since the trial is
 * started server-side later. Mirrored here so the listing cap and the service cap
 * still apply on day one instead of being skipped for exactly the sellers who
 * most need a ceiling.
 */
const ONBOARDING_PLAN: PlanId = "starter";

/** Cap how many listings one account may hold. null = unlimited. */
function listingLimitFor(plan: PlanId): number | null {
  return hasCap(plan, "multipleLocations") ? null : 1;
}

export async function PATCH(req: Request) {
  const db = adminDb();
  if (!db) return apiError("Server storage is not configured.", 503);
  const session = await sessionFromRequest(req);
  if (!session) return apiError("Sign in to manage your listing.", 401);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (body.action !== "service-areas" && body.action !== "services") return apiError("Unknown action.", 400);

  const businessId = String(body.businessId ?? "").trim();
  if (!businessId) return apiError("Missing the listing id.");

  const ref = db.collection("businesses").doc(businessId);
  const snap = await ref.get();
  if (!snap.exists) return apiError("That listing no longer exists.", 404);
  const ownerUid = String(snap.data()?.ownerUid ?? "");
  if (!ownerUid) return apiError("That listing has no owner.", 403);
  const isOwner = ownerUid === session.uid;
  if (!isOwner) {
    const membership = await db.collection("team_memberships").doc(`${ownerUid}__${session.uid}`).get();
    const ownerEntitlement = entitlementFrom(await readSubscription(ownerUid));
    if (!membership.exists || membership.data()?.status !== "active" ||
        !ownerEntitlement.entitled || !hasCap(ownerEntitlement.plan, "teamMembers")) {
      return apiError("That listing isn't on your account.", 403);
    }
  }

  const ent = entitlementFrom(await readSubscription(ownerUid));
  if (!ent.entitled) {
    return apiError("The listing owner's plan isn't active right now — renew before editing this listing.", 402);
  }

  if (body.action === "services") {
    if (!Array.isArray(body.services) || body.services.some((value) => typeof value !== "string" || value.trim().length > 100)) {
      return apiError("Services must be a list of names no longer than 100 characters.");
    }
    const services = body.services.map((value) => String(value).trim()).filter(Boolean);
    const limit = limitsFor(ent.plan).services;
    if (limit !== null && services.length > limit) {
      return apiError(`Your ${ent.plan} plan includes ${limit} services — remove some or upgrade.`, 402);
    }
    await ref.set({ services, updatedAt: nowIso() }, { merge: true });
    return Response.json({ ok: true, services });
  }

  const areas = cleanServiceAreas(body.areas);
  const limit = limitsFor(ent.plan).locations;
  if (limit !== null && areas.length > limit) {
    return apiError(
      `Your ${ent.plan} plan covers ${limit} service ${limit === 1 ? "area" : "areas"} — upgrade to cover more of South Africa.`,
      402
    );
  }

  await ref.set({ serviceAreas: areas, updatedAt: nowIso() }, { merge: true });
  return Response.json({ ok: true, areas });
}

const cleanStr = (v: unknown, max: number): string => String(v ?? "").trim().slice(0, max);

/**
 * POST — create a seller's listing, with the plan's LISTING and SERVICE caps
 * enforced here (rules cannot count documents).
 */
export async function POST(req: Request) {
  const db = adminDb();
  if (!db) return apiError("Server storage is not configured.", 503);
  const session = await sessionFromRequest(req);
  if (!session) return apiError("Sign in to list your business.", 401);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (body.onboarding === true && !session.emailVerified) {
    return apiError("Verify your email address before activating your seller profile.", 403);
  }

  // POPIA: publishing a listing makes the business's contact details publicly
  // visible to anyone searching KASI. That is a disclosure and needs explicit
  // consent, captured at the point of collection — the server refuses without it,
  // so a scripted client cannot create a public listing by skipping the tick.
  if (body.consent !== true) {
    return apiError("Please confirm you're happy for your business contact details to be published on this listing.");
  }

  const name = cleanStr(body.name, 120);
  const categorySlug = cleanStr(body.category, 60);
  if (!name) return apiError("Business name is required.");
  if (!categorySlug) return apiError("Category is required.");

  const docId = body.onboarding === true
    ? `seller-${session.uid}`
    : `biz-${Date.now().toString(36)}-${session.uid.slice(0, 6)}`;
  const businessRef = db.collection("businesses").doc(docId);
  if (body.onboarding === true) {
    const existing = await businessRef.get();
    if (existing.exists) {
      if (String(existing.data()?.ownerUid ?? "") !== session.uid) return apiError("That seller profile cannot be accessed.", 403);
      return Response.json({ ok: true, id: docId, alreadyCreated: true });
    }
  }

  const sub = await readSubscription(session.uid);
  const ent = entitlementFrom(sub);
  // A seller with no subscription yet is on the onboarding plan, so the caps
  // below still bite on day one instead of being skipped.
  const plan: PlanId = sub ? normalizePlanId(ent.plan) : ONBOARDING_PLAN;

  // ── Quota 1: how many listings may this account hold? ──
  // The original client-side `createBusiness` had no ceiling at all, so one
  // account could publish unlimited profiles and swamp matching for everyone.
  const listingLimit = listingLimitFor(plan);
  if (listingLimit !== null) {
    const owned = await db.collection("businesses").where("ownerUid", "==", session.uid).count().get();
    if (owned.data().count >= listingLimit) {
      return apiError(
        `Your ${plan} plan includes ${listingLimit} listing. Upgrade to Business for multiple listings.`,
        402
      );
    }
  }

  // ── Quota 2: how many services may one listing carry? ──
  // `limitsFor(plan).services` was advertised on the pricing page but never read
  // by any server code, so this promise was purely cosmetic.
  const services = cleanStr(body.services, 2000)
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const serviceLimit = limitsFor(plan).services;
  if (serviceLimit !== null && services.length > serviceLimit) {
    return apiError(
      `Your ${plan} plan includes ${serviceLimit} service${serviceLimit === 1 ? "" : "s"} — trim the list or upgrade.`,
      402
    );
  }

  const serviceAreas = cleanServiceAreas(body.serviceAreas);
  const locationLimit = limitsFor(plan).locations;
  if (locationLimit !== null && serviceAreas.length > locationLimit) {
    return apiError(
      `Your ${plan} plan covers ${locationLimit} service ${locationLimit === 1 ? "area" : "areas"} — choose a plan that supports your selected areas.`,
      402
    );
  }

  const portfolioInput = body.portfolio && typeof body.portfolio === "object"
    ? body.portfolio as Record<string, unknown>
    : null;
  const portfolio = portfolioInput ? cleanPortfolioDraft(portfolioInput) : null;
  if (portfolioInput && portfolio) {
    const issues = validatePortfolioDraft(portfolioInput);
    if (issues.length > 0) return apiError(issues[0]);
    const portfolioLimit = limitsFor(plan).portfolio;
    if (portfolioLimit !== null) {
      const ownedItems = await db.collection("portfolio").where("ownerUid", "==", session.uid).count().get();
      if (ownedItems.data().count >= portfolioLimit) {
        return apiError(`Your ${plan} plan includes ${portfolioLimit} portfolio items.`, 402);
      }
    }
  }

  const now = nowIso();
  const businessData = {
    id: docId,
    ownerUid: session.uid,
    name,
    businessType: cleanStr(body.businessType, 50),
    categorySlug,
    suburbSlug: cleanStr(body.suburb, 60),
    citySlug: cleanStr(body.city, 40) || "south-africa",
    provinceSlug: cleanStr(body.province, 60),
    phone: cleanStr(body.phone, 40),
    email: cleanStr(body.email, 120),
    address: cleanStr(body.address, 200),
    hours: cleanStr(body.hours, 120) || "Call for hours",
    description: cleanStr(body.desc, 2000),
    priceNote: cleanStr(body.priceNote, 120) || "Price on request",
    services,
    serviceAreas,
    travelRadiusKm: Math.max(0, Math.min(500, Number(body.travelRadiusKm) || 0)),
    yearsExperience: cleanStr(body.yearsExperience, 20),
    yearEstablished: cleanStr(body.yearEstablished, 20),
    registrationNumber: cleanStr(body.registrationNumber, 60),
    // Capability-locked fields are stripped server-side against the SERVER's plan
    // reading. The client sent a `plan` value too, but that was self-asserted;
    // gating on it here would let a Starter seller claim Professional features.
    whatsapp: hasCap(plan, "whatsapp") ? cleanStr(body.whatsapp, 40) || cleanStr(body.phone, 40) : "",
    website: hasCap(plan, "website") ? cleanStr(body.website, 200) : "",
    facebook: hasCap(plan, "socials") ? cleanStr(body.facebook, 200) : "",
    instagram: hasCap(plan, "socials") ? cleanStr(body.instagram, 200) : "",
    coverImageUrl: hasCap(plan, "photos") ? cleanStr(body.coverImageUrl, 400) : "",
    photos: [],
    rating: 0,
    reviewCount: 0,
    verified: false,
    // A seller can never author their own plan. The listing mirrors the plan the
    // SERVER owns, which is also what `planClaimOk` enforces in the rules.
    plan,
    status: "live",
    createdAt: now,
    updatedAt: now,
  };
  const batch = db.batch();
  batch.set(businessRef, businessData);
  if (portfolio) {
    const portfolioRef = db.collection("portfolio").doc();
    batch.set(portfolioRef, {
      ...portfolio,
      ownerUid: session.uid,
      businessId: docId,
      createdAt: now,
      updatedAt: now,
    });
  }
  await batch.commit();

  return Response.json({ ok: true, id: docId });
}
