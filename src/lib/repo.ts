import { hasCap } from "@/lib/monetize";
import type { VerificationMethod } from "@/lib/verification";
import { cleanQuoteDraft, normalizeQuoteStatus, validateQuote, QUOTE_STATUS_LABEL, type QuoteDraft } from "./quotes";
import { conversationId, cleanBody, previewText, validateMessage, type Conversation, type MessageKind } from "./messages";
import { cleanPortfolioDraft, cleanServiceAreas, validatePortfolioDraft, type PortfolioDraft } from "./portfolio";
import { bookingToday, bookingWhen, canTransition, cleanBookingDraft, normalizeBookingStatus, validateBooking, BOOKING_STATUS_LABEL } from "./bookings";
import {
  collection, doc, getDoc, getDocs, query, where, limit,
  addDoc, setDoc, serverTimestamp, updateDoc, arrayUnion, arrayRemove, increment, deleteDoc,
} from "firebase/firestore";
import { db, auth, isFirebaseConfigured } from "./firebase";
import { slugify } from "./utils";

export type LeadInput = { need?: string; category?: string; suburb?: string; phone: string; businessId?: string; timeline?: string; budget?: number; name?: string; email?: string; consent?: boolean; };

/**
 * Full lead lifecycle (master spec §15). The match→accept→quote path only ever
 * moves forward in the UI; the rules decide who is allowed to move it.
 */
export type LeadStatus =
  | "new"
  | "viewed"
  | "accepted"
  | "declined"
  | "quoted"
  | "negotiating"
  | "won"
  | "lost"
  | "expired";

/** Statuses a matched seller may set on themselves. */
export const SELLER_LEAD_STATUSES: LeadStatus[] = ["viewed", "accepted", "declined", "negotiating", "won", "lost"];

/**
 * Repository layer — Firestore ONLY. No mock fallbacks: everything the buyer
 * sees is realtime data written by sellers (see realtime.ts for live views).
 * Reference data (suburbs/categories) is seeded from /admin/seed.
 */

function must() {
  if (!db || !isFirebaseConfigured) throw new Error("Firebase not configured — add NEXT_PUBLIC_FIREBASE_* to .env.local and restart.");
  return db;
}

export async function listBusinesses(citySlug: string, suburbSlug: string, categorySlug: string) {
  const d = must();
  // Index-free: one equality filter, rest filtered client-side (works on free Spark).
  const snap = await getDocs(query(collection(d, "businesses"), where("citySlug", "==", citySlug), limit(200)));
  return snap.docs
    .map((doc_): Record<string, unknown> & { id: string } => ({ id: doc_.id, ...(doc_.data() as Record<string, unknown>) }))
    .filter((b) => b.suburbSlug === suburbSlug && b.categorySlug === categorySlug)
    .sort((a, b) => Number(b.rating ?? 0) - Number(a.rating ?? 0));
}

export async function getBusinessById(id: string) {
  const d = must();
  const snap = await getDoc(doc(d, "businesses", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Record<string, unknown>) };
}

export async function listJobs() {
  const d = must();
  const snap = await getDocs(query(collection(d, "jobs"), limit(100)));
  return snap.docs.map((doc_) => ({ id: doc_.id, ...(doc_.data() as Record<string, unknown>) }));
}

export async function listEvents() {
  const d = must();
  const snap = await getDocs(query(collection(d, "events"), limit(100)));
  return snap.docs.map((doc_) => ({ id: doc_.id, ...(doc_.data() as Record<string, unknown>) }));
}

export async function listDeals() {
  const d = must();
  const snap = await getDocs(query(collection(d, "deals"), limit(100)));
  return snap.docs.map((doc_) => ({ id: doc_.id, ...(doc_.data() as Record<string, unknown>) }));
}

export async function listArticles() {
  const d = must();
  const snap = await getDocs(query(collection(d, "articles"), limit(100)));
  return snap.docs.map((doc_) => ({ id: doc_.id, ...(doc_.data() as Record<string, unknown>) }));
}

/**
 * A buyer requests a quote from one business (or, with no id, posts an open
 * request).
 *
 * The `businessId` case is now SERVER-SIDE and METERED — it spends the seller's
 * plan allowance exactly like a broadcast match. It used to write the lead from
 * the browser with no allowance check at all, so "5 leads a month" was untrue
 * for anyone a buyer clicked "Quote" on directly.
 */
export async function submitLead(input: LeadInput) {
  // The server refuses any lead without recorded POPIA consent. Failing here too
  // keeps the error message about consent rather than surfacing a generic 400.
  if (input.consent !== true) {
    throw new Error("Please confirm you're happy for local businesses to contact you about this job.");
  }
  if (input.businessId) {
    // `auth: optional` — posting a request to a business is free and must not
    // require an account, exactly as before. The SELLER's allowance is the
    // metered resource, not the buyer's identity.
    const json = await apiPost("/api/leads/direct", { ...input }, { auth: "optional" });
    return { ok: true as const, id: String(json.id ?? "") };
  }
  // SERVER-SIDE, like every other lead door. This used to call `submitOpenLead`,
  // which wrote the document straight from the browser and required
  // `allow create: if true` on `leads` — a rule that let anyone fabricate a lead
  // addressed to any seller, bypassing the plan allowance entirely. The rules are
  // now server-write-only, so this path no longer exists.
  const json = await apiPost("/api/leads/open", { ...input }, { auth: "required" });
  return { ok: true as const, id: String(json.id ?? "") };
}

/**
 * BARK-STYLE: broadcast a buyer's need straight to the sellers who match it.
 *
 * This is the piece that was missing. Previously `submitLead` only notified a
 * seller when the buyer had already picked one specific business, so a seller
 * who was a perfect fit never heard about the job unless the buyer found them
 * by browsing. Everything else was "pending, admin will look at it".
 *
 * `matchProRequest` instead:
 *   1. ranks every live seller against the need (see `@/lib/matching`),
 *   2. writes ONE lead per matched seller, already addressed to them,
 *   3. drops a notification in each matched seller's inbox so they see it
 *      without admin involvement,
 *   4. returns the matched pros so the buyer gets direct numbers right away.
 *
 * The buyer's own copy of the request is written too, so the request appears in
 * their dashboard and the "posted to N pros" count is honest.
 */
/** Read the caller's Firebase ID token for authenticated API calls. */
async function idToken(): Promise<string | null> {
  const user = auth?.currentUser;
  if (!user) return null;
  return user.getIdToken();
}

/** POST JSON to a server route, attaching the caller's ID token when signed in. */
async function apiPost(
  path: string,
  body: Record<string, unknown>,
  opts: { auth?: "required" | "optional" } = {}
) {
  const token = await idToken();
  if (opts.auth === "required" && !token) throw new Error("Sign in to continue.");
  // An anonymous caller simply sends no Authorization header. A present-but-
  // invalid token is a different case and the server rejects it, so a stale
  // session can't silently downgrade to anonymous.
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { method: "POST", headers, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || json.ok === false) throw new Error(json.error ?? "Request failed.");
  return json as Record<string, unknown>;
}

export async function matchProRequest(input: {
  need: string;
  place?: string;
  categorySlug?: string;
  serviceGroupSlug?: string;
  name?: string;
  email?: string;
  phone: string;
  timeline?: string;
  budget?: number;
  /** Cap how many sellers are notified. Bark alerts a handful, not the city. */
  maxSellers?: number;
  /**
   * The buyer ticked the POPIA disclosure box. Forwarded, not trusted: the server
   * rejects the request without it, so a scripted client cannot skip consent.
   */
  consent?: boolean;
}): Promise<{ ok: true; matched: number; limited: number; allBlocked: boolean; requestId: string }> {
  // SERVER-SIDE DELIVERY.
  //
  // This used to match and write the leads from the browser, which meant the
  // seller's plan allowance was never checked — `consumeLeadOpportunity` existed
  // on the server but nothing called it, so a seller at 5/5 (or on no plan at
  // all) received unlimited leads. Matching and allocation now happen in
  // /api/leads via lib/server/lead-allocation, which gates every seller through
  // the atomic limiter and records a `lead_allocations` audit row.
  const json = await apiPost("/api/leads", { ...input }, { auth: "required" });
  return {
    ok: true,
    matched: Number(json.matched ?? 0),
    limited: Number(json.limited ?? 0),
    allBlocked: json.allBlocked === true,
    requestId: String(json.requestId ?? ""),
  };
}

export async function submitReview(businessId: string, author: string, rating: number, body: string) {
  const d = must();
  const uid = auth?.currentUser?.uid ?? null;
  const cleanRating = Math.min(5, Math.max(1, Math.round(Number(rating) || 5)));
  const cleanBody = body.trim().slice(0, 2000);
  if (cleanBody.length < 3) throw new Error("Please write a few words about the service.");

  // Stamp the business owner so reply rules + notifications work.
  let businessOwnerUid: string | null = null;
  try {
    const bSnap = await getDoc(doc(d, "businesses", businessId));
    if (bSnap.exists()) {
      const b = bSnap.data() as { ownerUid?: string };
      businessOwnerUid = b.ownerUid ?? null;
      // Never review your own business. Without this a seller could inflate their
      // own rating, and a Profile that reviewed itself would render as independent
      // social proof on a page whose whole purpose is trust.
      if (businessOwnerUid && businessOwnerUid === uid) {
        throw new Error("You can't review your own business.");
      }
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes("your own business")) throw e;
    /* optional */
  }

  // ── Provenance: did this person actually use this business? ──────────────
  // Reviews are the main thing a buyer trusts, and nothing previously connected a
  // review to any real job. Recorded (not enforced) on purpose: requiring a
  // completed booking would exclude the many customers who were served through a
  // phone quote or a walk-in — the majority on a directory. What matters is that
  // the record can now ANSWER the question, so a moderator can spot a review with
  // no matching booking instead of having no signal at all.
  let verifiedBooking: string | null = null;
  if (uid) {
    try {
      const mine = await getDocs(
        query(collection(d, "bookings"), where("buyerUid", "==", uid), where("businessId", "==", businessId), limit(10))
      );
      const done = mine.docs.find((x) => {
        const s = String((x.data() as { status?: string }).status ?? "");
        return s === "completed" || s === "confirmed";
      });
      verifiedBooking = done?.id ?? null;
    } catch {
      /* bookings unavailable — the review is still allowed, just unproven */
    }
  }

  await addDoc(collection(d, "business_reviews"), {
    businessId,
    businessOwnerUid,
    author: author.trim().slice(0, 80) || "Anonymous",
    rating: cleanRating,
    body: cleanBody,
    reviewerUid: uid,
    // Whether this review is backed by a real booking on this platform.
    hasBooking: verifiedBooking !== null,
    bookingId: verifiedBooking,
    helpfulCount: 0,
    helpfulVoters: [],
    status: "live",
    createdAt: serverTimestamp(),
  });
  try {
    await updateDoc(doc(d, "businesses", businessId), { reviewCount: increment(1) });
  } catch { /* counter optional */ }
  // Recompute the aggregate from the live reviews so `rating` can never drift
  // from reality. Previously only `reviewCount` moved, which left a business
  // with a real 5★ review permanently stored as `rating: 0` — the listing then
  // displayed no stars and, worse, emitted a `rating: 0` to the JSON-LD.
  //
  // Awaited, not fire-and-forget: this used to be `void`-ed, so a failure (most
  // often a Firestore rule that predates the `rating` allowance) was invisible
  // and the cache silently never healed. It is best-effort inside — the review
  // is already committed and must never be lost to a counter problem.
  await recomputeBusinessRating(businessId);
  if (businessOwnerUid && businessOwnerUid !== (auth?.currentUser?.uid ?? "")) {
    await createNotification(businessOwnerUid, "review", {
      businessId,
      message: `New ${cleanRating}★ review on your listing — go reply!`,
    });
  }
  return { ok: true as const, verifiedBooking: verifiedBooking !== null };
}

/**
 * Recompute `businesses.rating` (and `reviewCount`) from the live reviews.
 *
 * Reads every review for the business, averages the star values and writes the
 * result back. Best-effort: a failure leaves the previous value rather than
 * breaking the review the buyer just wrote, because the review itself is already
 * committed and the next review re-runs this.
 */
export async function recomputeBusinessRating(businessId: string): Promise<void> {
  const d = must();
  const snap = await getDocs(query(collection(d, "business_reviews"), where("businessId", "==", businessId)));
  const live = snap.docs
    .map((docSnap) => docSnap.data() as { rating?: number; status?: string })
    .filter((r) => (r.status ?? "live") === "live");
  const count = live.length;
  const wantRating = count === 0
    ? 0
    : Math.round((live.reduce((acc, r) => acc + (Number(r.rating) || 0), 0) / count) * 10) / 10;
  try {
    await updateDoc(doc(d, "businesses", businessId), { rating: wantRating, reviewCount: count });
  } catch (err) {
    // Previously swallowed entirely, which is why a stranded `rating: 0` went
    // unnoticed: the review saved, the counter moved, and the recompute failed
    // silently every time. Surface it — the most likely cause is the deployed
    // `firestore.rules` predating the `rating` write permission.
    console.warn(
      `[KASI] rating recompute failed for ${businessId} ` +
        `(wanted rating=${wantRating} count=${count}):`,
      err instanceof Error ? err.message : err
    );
  }
}

export async function setLeadStatus(
  leadId: string,
  status: LeadStatus,
  seller?: { ownerUid: string; businessName?: string; phone?: string; whatsapp?: string }
): Promise<void> {
  const d = must();
  const patch: Record<string, unknown> = { status, updatedAt: serverTimestamp() };
  // Accepted leads carry the seller's contact info so the BUYER sees who replied.
  // Declined leads carry status only — no contact details are exposed.
  if (status === "accepted" && seller) {
    patch.acceptedOwnerUid = seller.ownerUid;
    patch.acceptedBusinessName = seller.businessName ?? null;
    patch.acceptedPhone = seller.phone ?? null;
    patch.acceptedWhatsapp = seller.whatsapp ?? null;
    patch.acceptedAt = serverTimestamp();
  }

  // The buyer's copy of this lead is what the notification deep-links to — read
  // it BEFORE the status write so a read failure never blocks the status change.
  let requesterUid: string | null = null;
  let need = "";
  try {
    const snap = await getDoc(doc(d, "leads", leadId));
    if (snap.exists()) {
      const lead = snap.data() as { requesterUid?: string | null; need?: string };
      requesterUid = lead.requesterUid ?? null;
      need = cleanStr(lead.need, 60);
    }
  } catch { /* the status change still matters without the notify */ }

  await updateDoc(doc(d, "leads", leadId), patch);

  // Seller ACCEPTED or DECLINED → tell the buyer, who otherwise has no signal
  // that a matched pro replied (they don't watch the leads collection).
  if (requesterUid && requesterUid !== (auth?.currentUser?.uid ?? "")) {
    const msg =
      status === "accepted"
        ? `${seller?.businessName || "A local pro"} accepted your${need ? ` “${need}”` : ""} request — a quote is on the way.`
        : status === "declined"
          ? `A pro declined your${need ? ` “${need}”` : ""} request — other matched sellers can still reply.`
          : null;
    if (msg) {
      await createNotification(requesterUid, "lead", {
        message: msg,
        leadId,
        href: "/compare-quotes",
      });
    }
  }
}

/** Free photo-link gallery (no Blaze billing). Appends to businesses/{id}.photos. */
export async function addBusinessPhotoLink(businessId: string, url: string): Promise<void> {
  const d = must();
  const clean = url.trim();
  if (!/^https?:\/\/.+/i.test(clean)) throw new Error("Photo link must start with https://.");
  try {
    await updateDoc(doc(d, "businesses", businessId), { photos: arrayUnion(clean) });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (/permission|PERMISSION/i.test(m)) throw new Error("Only the listing owner can add photos.");
    throw e instanceof Error ? e : new Error("Could not save photo.");
  }
}

/** Owner removes a pasted photo link from their gallery. */
export async function removeBusinessPhotoLink(businessId: string, url: string): Promise<void> {
  const d = must();
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error("Sign in first.");
  try {
    await updateDoc(doc(d, "businesses", businessId), { photos: arrayRemove(url) });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (/permission|PERMISSION/i.test(m)) throw new Error("Only the listing owner can remove photos.");
    throw e instanceof Error ? e : new Error("Could not remove photo.");
  }
}

/**
 * Seller creates their business listing.
 *
 * SERVER-SIDE (POST /api/business). This used to `setDoc` straight from the
 * browser, which made two advertised plan promises unenforceable: Firestore rules
 * cannot COUNT documents, so nothing stopped one account creating unlimited
 * listings, and `limitsFor(plan).services` (5 on Starter, 20 on Professional)
 * was never read by any server code at all. Both quotas are now counted on the
 * server, from the server-owned subscription doc.
 *
 * `input.plan` is still accepted from the form for display purposes but is NOT
 * trusted — the route derives the plan from the subscription and strips
 * capability-locked fields (whatsapp / website / socials / cover photo) itself.
 */
export async function createBusiness(input: Record<string, unknown>) {
  if (!auth?.currentUser) throw new Error("Sign in as a seller to list a business.");
  if (input.consent !== true) {
    throw new Error("Please confirm you're happy for your business contact details to be published on this listing.");
  }
  const json = await apiPost("/api/business", { ...input }, { auth: "required" });
  return { ok: true as const, id: String(json.id ?? "") };
}

/** Read the seller's submitted application status (pending/approved/rejected). */
export async function getMyApplication(uid: string): Promise<{ status?: string; businessId?: string; reviewedAt?: string; reviewerNote?: string } | null> {
  if (!db) return null;
  const snap = await getDoc(doc(db, "seller_applications", uid));
  if (!snap.exists) return null;
  return snap.data() as { status?: string; businessId?: string; reviewedAt?: string; reviewerNote?: string };
}

/** ── Community feeds: jobs / events / deals (signed-in posting) ───────── */

function cleanStr(v: unknown, max: number): string {
  return String(v ?? "").trim().slice(0, max);
}

export async function submitJob(input: { title: string; company: string; suburb: string; type: string; pay: string }) {
  const d = must();
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error("Sign in to post a job.");
  const title = cleanStr(input.title, 120);
  const company = cleanStr(input.company, 90);
  if (!title || !company) throw new Error("Job title and company are required.");
  const ref = await addDoc(collection(d, "jobs"), {
    title,
    company,
    suburb: cleanStr(input.suburb, 60) || "South Africa",
    type: cleanStr(input.type, 40) || "Full-time",
    pay: cleanStr(input.pay, 60) || "Negotiable",
    createdBy: uid,
    // Published immediately, NOT "pending".
    //
    // Every one of these feeds wrote `status: "pending"`, and the public list
    // only renders `status === "live"` — so a seller's post was invisible to
    // every buyer until an admin manually approved it. Sellers post, buyers
    // see nothing.
    //
    // That gate is unnecessary here because `firestore.rules` already restricts
    // these collections to SELLER-ONLY + PLAN-GATED (`isSeller()` +
    // `paidSeller(minTier)`): only a paying, registered seller can write here
    // at all, so the author is already known. Moderation becomes PULL-DOWN
    // (an admin sets status to "rejected"/"pending") instead of approve-first,
    // which is the model Bark and most marketplaces use.
    status: "live",
    createdAt: serverTimestamp(),
  });
  return { ok: true as const, id: ref.id };
}

export async function submitEvent(input: { title: string; venue: string; suburb: string; date: string; fee: string }) {
  const d = must();
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error("Sign in to submit an event.");
  const title = cleanStr(input.title, 140);
  if (!title) throw new Error("Event name is required.");
  const ref = await addDoc(collection(d, "events"), {
    title,
    venue: cleanStr(input.venue, 120) || "TBC",
    suburb: cleanStr(input.suburb, 60) || "South Africa",
    date: cleanStr(input.date, 60) || "Date TBC",
    fee: cleanStr(input.fee, 40) || "Free",
    createdBy: uid,
    status: "live", // see submitJob — sellers are already plan-gated in rules
    createdAt: serverTimestamp(),
  });
  return { ok: true as const, id: ref.id };
}

export async function submitDeal(input: { title: string; business: string; suburb: string; detail: string }) {
  const d = must();
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error("Sign in to submit a deal.");
  const title = cleanStr(input.title, 140);
  const business = cleanStr(input.business, 90);
  if (!title || !business) throw new Error("Deal title and business name are required.");
  const ref = await addDoc(collection(d, "deals"), {
    title,
    business,
    suburb: cleanStr(input.suburb, 60) || "South Africa",
    detail: cleanStr(input.detail, 400),
    createdBy: uid,
    status: "live", // see submitJob — sellers are already plan-gated in rules
    createdAt: serverTimestamp(),
  });
  return { ok: true as const, id: ref.id };
}

/**
 * Seller-published place (Business tier — `firestore.rules` `canPublishPlaces()`).
 *
 * Seller-submitted places appear in the public community feed alongside the
 * bundled catalogue. Published immediately (see submitJob) — the rules already
 * restrict this collection to Business-tier sellers, so the author is known.
 */
export async function submitPlace(input: { title: string; suburb: string; kind: string; detail: string; hours: string }) {
  const d = must();
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error("Sign in to add a place.");
  const title = cleanStr(input.title, 140);
  if (!title) throw new Error("Place name is required.");
  const ref = await addDoc(collection(d, "places"), {
    title,
    name: title,
    slug: slugify(title),
    kind: cleanStr(input.kind, 40) || "attraction",
    suburb: cleanStr(input.suburb, 60) || "South Africa",
    detail: cleanStr(input.detail, 600),
    hours: cleanStr(input.hours, 120) || "Hours on request",
    createdBy: uid,
    status: "live",
    createdAt: serverTimestamp(),
  });
  return { ok: true as const, id: ref.id };
}

/**
 * Seller-authored guide. `articles` doubles as the editorial collection, so the
 * `slug` must be unique for `/guides/[slug]` routing — we append a short
 * suffix derived from the doc id, which is only known after the write, so the
 * document is created first and then patched.
 */
export async function submitGuide(input: { title: string; suburb: string; excerpt: string; body: string }) {
  const d = must();
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error("Sign in to write a guide.");
  const title = cleanStr(input.title, 160);
  const excerpt = cleanStr(input.excerpt, 300);
  const body = cleanStr(input.body, 20000);
  if (!title) throw new Error("A title is required.");
  if (body.length < 40) throw new Error("Write at least a paragraph or two.");
  const ref = await addDoc(collection(d, "articles"), {
    title,
    slug: slugify(title),
    suburb: cleanStr(input.suburb, 60) || "South Africa",
    readTime: `${Math.max(1, Math.round(body.split(/\s+/).length / 200))} min read`,
    excerpt: excerpt || body.slice(0, 200),
    body,
    createdBy: uid,
    status: "live", // see submitJob — sellers are already plan-gated in rules
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(d, "articles", ref.id), { slug: `${slugify(title)}-${ref.id.slice(-6)}` });
  return { ok: true as const, id: ref.id };
}

/** ── Favourites (buyer saves a business) ──────────────────────────────── */

export async function toggleFavorite(
  business: { id: string; name?: string; categorySlug?: string; suburbSlug?: string; citySlug?: string }
): Promise<"added" | "removed"> {
  const d = must();
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error("Sign in to save businesses.");
  // A saved BUSINESS is written to `saved_items` with itemType "business", the
  // same collection the header counter, SavedItemsProvider and SaveButton all
  // read. It previously wrote a separate `favorites` collection that nothing
  // outside the buyer dashboard read, so saving a business silently did nothing
  // to the "Saved (n)" badge in the header — the single most confusing symptom
  // of "I can't save things".
  //
  // The legacy `favorites` doc is still removed on toggle-off so old saves don't
  // linger and double-count.
  const ref = doc(d, "saved_items", `${uid}__business__${business.id}`);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await deleteDoc(ref);
    try { await deleteDoc(doc(d, "favorites", `${uid}__${business.id}`)); } catch { /* optional */ }
    // Seller-side analytics counter (§36). Best-effort: a blocked bump never
    // breaks the buyer's save action.
    try { await updateDoc(doc(d, "businesses", business.id), { saves: increment(-1) }); } catch { /* optional */ }
    return "removed";
  }
  // NOTE ON FIELDS: deliberately writes ONLY the field set that the currently
  // DEPLOYED `firestore.rules` already whitelists for `saved_items`. Adding a new
  // key here (e.g. `categorySlug`, `city`) makes the whole write fail with
  // "insufficient permissions" until those rules are published — which is
  // exactly the failure this bug hunt started with. Keep this list in sync with
  // the deployed rules, not with the wish-list in the repo's rules file.
  await setDoc(ref, {
    ownerUid: uid,
    itemType: "business",
    itemId: business.id,
    collection: "businesses",
    title: cleanStr(business.name, 160) || "Business",
    businessId: business.id,
    suburb: business.suburbSlug ?? null,
    slug: null,
    createdAt: serverTimestamp(),
  });
  try { await updateDoc(doc(d, "businesses", business.id), { saves: increment(1) }); } catch { /* optional */ }
  return "added";
}

/**
 * Seller claims an open (broadcast) request.
 *
 * Goes through the server so `consumeLeadOpportunity` runs first. The old
 * version wrote the claim AND tried `increment(1)` on `subscriptions/{uid}` —
 * but that collection is `allow write: if false` (server-write-only), so the
 * counter was rejected every single time and swallowed by the catch, and the
 * rules let ANY signed-in user claim any open lead. Both are now fixed: the cap
 * is enforced before the claim, and the audit row is written server-side.
 */
/**
 * Spend credits to unlock a lead's contact details (marketplace pay-per-contact).
 *
 * The price is NOT sent — the server recomputes it from the stored lead, so a
 * tampered client can't change what it's charged. Returns the unlocked contact
 * and the conversation id on success; throws with the server's message otherwise
 * (including the 402 "not enough credits" case, which the UI turns into a prompt
 * to buy more).
 */
export async function unlockLead(leadId: string): Promise<{
  credits: number;
  balance: number;
  conversationId: string;
  already: boolean;
  contact: { phone: string; email: string | null; name: string | null };
}> {
  const json = await apiPost("/api/leads/unlock", { leadId }, { auth: "required" });
  return {
    credits: Number(json.credits ?? 0),
    balance: Number(json.balance ?? 0),
    conversationId: String(json.conversationId ?? ""),
    already: Boolean(json.already),
    contact: {
      phone: String((json.contact as { phone?: string } | undefined)?.phone ?? ""),
      email: ((json.contact as { email?: string | null } | undefined)?.email ?? null) as string | null,
      name: ((json.contact as { name?: string | null } | undefined)?.name ?? null) as string | null,
    },
  };
}

/** Start a hosted checkout for a credit pack; returns the URL to redirect to. */
export async function buyCreditPack(packId: string): Promise<{ url: string; reference: string }> {
  const json = await apiPost("/api/credits", { packId }, { auth: "required" });
  return { url: String(json.url ?? ""), reference: String(json.reference ?? "") };
}

/** Engagement counters — rules allow anonymous updates ONLY for these keys. */
export async function trackBusinessEvent(
  businessId: string,
  field: "profileViews" | "phoneClicks" | "whatsappClicks" | "websiteClicks"
): Promise<void> {
  const d = must();
  try {
    await updateDoc(doc(d, "businesses", businessId), { [field]: increment(1) });
  } catch { /* counters are best-effort */ }
}

/** ── Owner listing management (Tier 1) ────────────────────────────────── */

/**
 * Owner edits their own listing. Plan capabilities are re-enforced here (same
 * gate as createBusiness) so a FREE seller can't post locked fields by hand.
 */
export async function updateBusiness(
  businessId: string,
  patch: Record<string, unknown>,
  plan?: string
): Promise<void> {
  const d = must();
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error("Sign in first.");
  const p = plan || "free";
  const safe: Record<string, unknown> = { updatedAt: serverTimestamp() };
  const put = (k: string, v: unknown) => { if (v !== undefined) safe[k] = v; };
  let services: string[] | undefined;

  // Always editable (FREE and up)
  put("name", cleanStr(patch.name, 120));
  put("categorySlug", cleanStr(patch.categorySlug, 60));
  put("suburbSlug", cleanStr(patch.suburbSlug, 60));
  put("citySlug", cleanStr(patch.citySlug, 40));
  put("phone", cleanStr(patch.phone, 30));
  put("address", cleanStr(patch.address, 160));
  put("hours", cleanStr(patch.hours, 120));
  put("description", cleanStr(patch.description, 1200));
  put("priceNote", cleanStr(patch.priceNote, 120));
  if (patch.services !== undefined) {
    services = Array.isArray(patch.services)
      ? patch.services.map((s) => String(s).trim()).filter(Boolean)
      : String(patch.services ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  }

  // PRO and up — WhatsApp button
  if (hasCap(p, "whatsapp")) put("whatsapp", cleanStr(patch.whatsapp, 30));
  // PRO and up — cover photo link (direct uploads are Blaze-only and land in photos[])
  if (hasCap(p, "photos")) put("coverImageUrl", cleanStr(patch.coverImageUrl, 400));
  // PRO and up — website link
  if (hasCap(p, "website")) put("website", cleanStr(patch.website, 300));
  // PREMIUM only — socials
  if (hasCap(p, "socials")) {
    put("facebook", cleanStr(patch.facebook, 300));
    put("instagram", cleanStr(patch.instagram, 300));
  }

  if (Object.keys(safe).length <= 1 && services === undefined) throw new Error("Nothing to update.");
  try {
    if (Object.keys(safe).length > 1) {
      await updateDoc(doc(d, "businesses", businessId), safe);
    }
    if (services !== undefined) {
      await apiPost("/api/business", { action: "services", businessId, services }, { auth: "required" });
    }
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (/permission|PERMISSION/i.test(m)) throw new Error("Only the listing owner can edit this listing.");
    throw e instanceof Error ? e : new Error("Could not save your changes.");
  }
}

/** Owner takes a listing offline (hidden from public feeds) or back online. */
export async function setBusinessLiveStatus(businessId: string, status: "live" | "paused"): Promise<void> {
  const d = must();
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error("Sign in first.");
  try {
    await updateDoc(doc(d, "businesses", businessId), { status, updatedAt: serverTimestamp() });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (/permission|PERMISSION/i.test(m)) throw new Error("Only the listing owner can pause this listing.");
    throw e instanceof Error ? e : new Error("Could not update the listing.");
  }
}

export async function deleteBusiness(businessId: string): Promise<void> {
  const d = must();
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error("Sign in first.");
  await deleteDoc(doc(d, "businesses", businessId));
}

export async function setBusinessStatus(businessId: string, status: "live" | "pending" | "rejected"): Promise<void> {
  const d = must();
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error("Sign in first.");
  await updateDoc(doc(d, "businesses", businessId), { status, updatedAt: serverTimestamp() });
}

/**
 * Admin: verify / unverify a listing (requires `admins/{uid}`). Notifies the owner.
 *
 * SERVER-SIDE via POST /api/admin/verify. This used to be a client-side
 * `updateDoc` of a bare boolean, which could not record WHO verified, WHEN, or
 * HOW — and under the CPA, displaying "Verified" is a factual representation about
 * a business, so "an admin clicked a button" is not a defensible answer if it is
 * ever challenged. The route computes the expiry server-side too, because that
 * window is policy and a client could send any value.
 */
export async function setBusinessVerified(
  businessId: string,
  verified: boolean,
  meta: { method?: VerificationMethod; notes?: string } = {}
): Promise<void> {
  if (!auth?.currentUser) throw new Error("Sign in first.");
  await apiPost(
    "/api/admin/verify",
    { businessId, verified, method: meta.method, notes: meta.notes },
    { auth: "required" }
  );
}

/** Admin moderation for community posts. */
export async function setFeedItemStatus(col: "jobs" | "events" | "deals", id: string, status: "live" | "pending" | "rejected"): Promise<void> {
  const d = must();
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error("Sign in first.");
  await updateDoc(doc(d, col, id), { status, updatedAt: serverTimestamp() });
}

/** Collections a seller may publish to. Guides live in `articles`. */
export type PostCollection = "jobs" | "events" | "deals" | "places" | "guides";

/** Firestore collection name behind a PostCollection. */
const POST_COLLECTION_PATH: Record<PostCollection, string> = {
  jobs: "jobs",
  events: "events",
  deals: "deals",
  places: "places",
  guides: "articles",
};

export async function deleteFeedItem(col: PostCollection, id: string): Promise<void> {
  const d = must();
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error("Sign in first.");
  await deleteDoc(doc(d, POST_COLLECTION_PATH[col], id));
}

/** Toggle featured on an OWN post (premium capability enforced in the UI). */
export async function setFeedItemFeatured(col: PostCollection, id: string, featured: boolean): Promise<void> {
  if (col !== "deals" && col !== "events") {
    throw new Error("Only deals and events can receive featured placement.");
  }
  await apiPost("/api/posts/featured", { collection: col, id, featured }, { auth: "required" });
}

/** ── Claims (Tier 1) ──────────────────────────────────────────────────── */

export async function submitClaim(businessId: string, businessName: string, name: string, phone: string): Promise<void> {
  const d = must();
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error("Sign in to claim a business.");
  await addDoc(collection(d, "business_claims"), {
    businessId,
    businessName: cleanStr(businessName, 120),
    claimantUid: uid,
    claimantName: cleanStr(name, 80),
    phone: cleanStr(phone, 30),
    status: "pending",
    createdAt: serverTimestamp(),
  });
}

/** ── Reports (Tier 5) ─────────────────────────────────────────────────── */

export async function submitReport(target: { type: "business" | "review" | "job" | "event" | "deal"; targetId: string; label?: string; reason: string }): Promise<void> {
  const d = must();
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error("Sign in to report content.");
  if (cleanStr(target.reason, 500).length < 5) throw new Error("Tell us briefly what's wrong.");
  await addDoc(collection(d, "reports"), {
    type: target.type,
    targetId: target.targetId,
    label: target.label ?? null,
    reason: cleanStr(target.reason, 500),
    byUid: uid,
    status: "open",
    createdAt: serverTimestamp(),
  });
}

/** ── Notifications (Tier 3) ───────────────────────────────────────────── */

/**
 * Ask the server to email the recipient of a notification we just wrote.
 *
 * Fire-and-forget, and the browser sends ONLY the id: the recipient, the copy,
 * the type whitelist, the once-per-notification guard and the rate caps all
 * live in POST /api/notifications/email. That is what keeps this a courtesy
 * copy rather than an open mail relay, and a mail outage can never fail the
 * write that produced the notification.
 */
function emailNotification(notificationId: string): void {
  void fetch("/api/notifications/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notificationId }),
  }).catch(() => {
    /* email is best-effort — the in-app row is the source of truth */
  });
}

export async function createNotification(
  toUid: string,
  type: string,
  payload: { businessId?: string; message: string; leadId?: string; href?: string }
): Promise<void> {
  const d = must();
  if (!toUid) return;
  try {
    const ref = await addDoc(collection(d, "notifications"), {
      toUid,
      // Rules require the sender to be identifiable: without fromUid a
      // notification addressed to ANOTHER user is rejected outright.
      fromUid: auth?.currentUser?.uid ?? null,
      type,
      message: cleanStr(payload.message, 200),
      businessId: payload.businessId ?? null,
      // Deep links land the recipient on the exact screen that needs action.
      leadId: payload.leadId ?? null,
      href: payload.href ?? null,
      read: false,
      createdAt: serverTimestamp(),
    });
    emailNotification(ref.id);
  } catch { /* notifications are best-effort */ }
}

export async function markNotificationRead(id: string): Promise<void> {
  const d = must();
  await updateDoc(doc(d, "notifications", id), { read: true });
}

/**
 * Mark every unread notification for the signed-in user as read in one pass.
 *
 * Each doc is its own rules evaluation (`toUid == request.auth.uid`), so there
 * is no bulk API in Firestore — but this is still bounded by the same page the
 * bell and /notifications list subscribe to, so it stays a handful of writes.
 * Best-effort: a partial failure leaves the rest unread rather than throwing
 * after the user saw "all read".
 */
export async function markAllNotificationsRead(ids: string[]): Promise<void> {
  const d = must();
  if (!auth?.currentUser) return;
  await Promise.all(
    ids
      .filter((id) => id)
      .map((id) => updateDoc(doc(d, "notifications", id), { read: true }).catch(() => {}))
  );
}

/**
 * Delete ONE notification. Rules only allow the RECIPIENT (`toUid == caller`)
 * to delete, so a failed call here means either a wrong id or not your
 * notification — both surface as a permission error to the UI.
 */
export async function deleteNotification(id: string): Promise<void> {
  const d = must();
  if (!auth?.currentUser) throw new Error("Sign in first.");
  await deleteDoc(doc(d, "notifications", id));
}

/**
 * Clear ALL of the signed-in user's notifications (the /notifications
 * "Clear all" action). Firestore has no per-user bulk delete from the client,
 * so this is one delete per doc — same recipient-only rule as above applies to
 * every row. Best-effort per doc so one rejection can't wedge the loop.
 */
export async function clearNotifications(ids: string[]): Promise<void> {
  const d = must();
  if (!auth?.currentUser) throw new Error("Sign in first.");
  await Promise.all(
    ids
      .filter((id) => id)
      .map((id) => deleteDoc(doc(d, "notifications", id)).catch(() => {}))
  );
}

/** ── Saved searches (Tier 3) ──────────────────────────────────────────── */

export async function saveSearch(category: string, suburb: string, city: string): Promise<void> {
  const d = must();
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error("Sign in to save searches.");
  const id = `${uid}__${city}__${suburb}__${category}`;
  await setDoc(doc(d, "saved_searches", id), {
    ownerUid: uid,
    category,
    suburb,
    city,
    label: `${category} · ${suburb}`,
    createdAt: serverTimestamp(),
  });
}

export async function deleteSavedSearch(id: string): Promise<void> {
  const d = must();
  if (!auth?.currentUser) throw new Error("Sign in first.");
  await deleteDoc(doc(d, "saved_searches", id));
}

/** ── Saved items (§19): save/remove any content type ──────────────────── */

export async function saveItem(
  col: "deals" | "events" | "places" | "articles" | "jobs",
  id: string,
  type: "deal" | "event" | "place" | "guide" | "job",
  meta?: { title?: string; businessId?: string; suburb?: string; slug?: string }
): Promise<"saved" | "unsaved"> {
  const d = must();
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error("Sign in to save items.");
  const ref = doc(d, "saved_items", `${uid}__${type}__${id}`);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await deleteDoc(ref);
    return "unsaved";
  }
  await setDoc(ref, {
    ownerUid: uid,
    itemType: type,
    itemId: id,
    collection: col,
    title: cleanStr(meta?.title ?? "", 160) || type,
    businessId: meta?.businessId ?? null,
    suburb: meta?.suburb ?? null,
    slug: meta?.slug ?? null,
    createdAt: serverTimestamp(),
  });
  return "saved";
}

/** Convenience wrappers that call saveItem with the right type (§19). */
export async function saveDeal(id: string, meta?: { title?: string; businessId?: string; suburb?: string }): Promise<"saved" | "unsaved"> {
  return saveItem("deals", id, "deal", meta);
}
export async function saveEvent(id: string, meta?: { title?: string; suburb?: string }): Promise<"saved" | "unsaved"> {
  return saveItem("events", id, "event", meta);
}
export async function savePlace(id: string, meta?: { title?: string; suburb?: string }): Promise<"saved" | "unsaved"> {
  return saveItem("places", id, "place", meta);
}
export async function saveGuide(id: string, meta?: { title?: string; suburb?: string; slug?: string }): Promise<"saved" | "unsaved"> {
  return saveItem("articles", id, "guide", meta);
}
export async function saveJob(id: string, meta?: { title?: string; suburb?: string }): Promise<"saved" | "unsaved"> {
  return saveItem("jobs", id, "job", meta);
}
export async function unsave(type: string, id: string): Promise<void> {
  const d = must();
  const uid = auth?.currentUser?.uid;
  if (!uid) return;
  await deleteDoc(doc(d, "saved_items", `${uid}__${type}__${id}`));
}


/** ── Guide editor (Tier 4, admin) ─────────────────────────────────────── */

export async function markReviewHelpful(reviewId: string): Promise<void> {
  const d = must();
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error("Sign in to vote.");
  await updateDoc(doc(d, "business_reviews", reviewId), {
    helpfulCount: increment(1),
    helpfulVoters: arrayUnion(uid),
  });
}

export async function replyToReview(reviewId: string, reply: string): Promise<void> {
  const d = must();
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error("Sign in first.");
  const clean = cleanStr(reply, 500);
  if (clean.length < 2) throw new Error("Write a short reply first.");

  // Read the review first: the reviewer + business are on the doc, and a failed
  // read must not block the reply itself.
  let reviewerUid: string | null = null;
  let businessId: string | null = null;
  try {
    const snap = await getDoc(doc(d, "business_reviews", reviewId));
    if (snap.exists()) {
      const r = snap.data() as { reviewerUid?: string | null; businessId?: string | null };
      reviewerUid = r.reviewerUid ?? null;
      businessId = r.businessId ?? null;
    }
  } catch { /* reply still posts without the notify */ }

  await updateDoc(doc(d, "business_reviews", reviewId), { reply: clean, repliedAt: serverTimestamp() });

  // Owner replied → tell the reviewer. Both sides of a review conversation only
  // work if the other party knows there IS one.
  if (reviewerUid && reviewerUid !== uid) {
    await createNotification(reviewerUid, "review", {
      message: "The business replied to your review — read it back.",
      businessId: businessId ?? undefined,
      href: businessId ? `/business/${businessId}` : undefined,
    });
  }
}

/** ── Guide editor (Tier 4, admin) ─────────────────────────────────────── */

export async function saveGuideArticle(input: { slug: string; title: string; excerpt: string; suburb: string; readTime: string; body: string }): Promise<string> {
  const d = must();
  const slug = cleanStr(input.slug, 80).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  if (!slug) throw new Error("Slug is required (used in the URL).");
  if (cleanStr(input.title, 140).length < 5) throw new Error("Title is required.");
  await setDoc(doc(d, "articles", slug), {
    slug,
    title: cleanStr(input.title, 140),
    excerpt: cleanStr(input.excerpt, 300),
    suburb: cleanStr(input.suburb, 60) || "South Africa",
    readTime: cleanStr(input.readTime, 20) || "5 min",
    body: cleanStr(input.body, 20000),
    updatedAt: new Date().toISOString(),
  }, { merge: true });
  return slug;
}

/** ── Admin actions ────────────────────────────────────────────────────── */

/**
 * Approve a claim → transfer ownership, notify the claimant.
 *
 * ⚠️ This NO LONGER SETS `verified: true`.
 *
 * It used to. Proving you own a listing is NOT the same as proving the business
 * exists and is contactable — which is precisely what `/about` says the Verified
 * badge means ("our team has confirmed the business exists and is reachable"). So
 * claiming a listing was a one-click route to a Verified badge with nobody having
 * checked anything, and the "verification" trail said nothing about who did what.
 *
 * Ownership and verification are now separate decisions. The badge is granted by
 * `POST /api/admin/verify`, which records who verified, when, and by what method.
 * Approving a claim deliberately leaves an existing badge alone: if the listing was
 * already verified, the badge stays — but it was earned before, not because of this.
 */
export async function approveClaim(claimId: string, claim: { businessId?: string; claimantUid?: string }): Promise<void> {
  const d = must();
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error("Sign in first.");
  const bizId = claim.businessId ?? "";
  if (!bizId || !claim.claimantUid) throw new Error("Claim is missing business/claimant info.");
  // `verified` and `verification` are deliberately NOT written.
  await updateDoc(doc(d, "businesses", bizId), { ownerUid: claim.claimantUid, status: "live", updatedAt: serverTimestamp() });
  await updateDoc(doc(d, "business_claims", claimId), { status: "approved", decidedAt: serverTimestamp() });
  await createNotification(
    claim.claimantUid,
    "claim",
    { businessId: bizId, message: "Your claim was approved — the listing is now yours ✓" }
  );
}

export async function rejectClaim(claimId: string): Promise<void> {
  const d = must();
  // Read BEFORE the write: the claimant uid lives on the doc, and a failed read
  // must not stop the rejection itself.
  let claimantUid: string | null = null;
  try {
    const snap = await getDoc(doc(d, "business_claims", claimId));
    if (snap.exists()) claimantUid = (snap.data() as { claimantUid?: string | null }).claimantUid ?? null;
  } catch { /* rejection still lands without the notify */ }

  await updateDoc(doc(d, "business_claims", claimId), { status: "rejected", decidedAt: serverTimestamp() });

  // Rejection without a word leaves the claimant refreshing a dead form. Tell
  // them so they know the outcome and can improve the proof they resubmit.
  if (claimantUid && claimantUid !== (auth?.currentUser?.uid ?? "")) {
    await createNotification(claimantUid, "claim", {
      message: "Your listing claim was rejected — the listing stays with its current owner.",
      href: "/dashboard",
    });
  }
}

export async function resolveReport(id: string): Promise<void> {
  const d = must();
  await updateDoc(doc(d, "reports", id), { status: "resolved", resolvedAt: serverTimestamp() });
}

/* ═══════════════════════════════════════════════════════════════════════════
 * QUOTE ENGINE (master spec §14–§17)
 * ───────────────────────────────────────────────────────────────────────────
 * Flow: buyer requests → matched seller ACCEPTS → seller QUOTES → buyer
 * COMPARES → buyer accepts/declines. A quote can only exist after an accept,
 * which is what keeps every quote on the platform a real, accountable reply.
 *
 * Every read/write here is re-validated by firestore.rules, and list queries
 * always include a `uid` equality so the rules stay satisfiable (Firestore
 * evaluates rules per document, so an unconstrained list would be denied).
 * ═════════════════════════════════════════════════════════════════════════ */

/** The seller's own listing (name/phone) for buyer-visible context. */
async function ownBusinessLite(d: ReturnType<typeof must>, uid: string) {
  try {
    const snap = await getDocs(query(collection(d, "businesses"), where("ownerUid", "==", uid), limit(1)));
    const first = snap.docs[0];
    if (!first) return null;
    const data = first.data() as { name?: string; phone?: string; whatsapp?: string; verified?: boolean };
    return {
      id: first.id,
      name: data.name ?? "",
      phone: data.phone ?? "",
      whatsapp: data.whatsapp ?? "",
      verified: data.verified === true,
    };
  } catch { return null; }
}

export type SubmitQuoteInput = QuoteDraft & { leadId: string };

/**
 * Seller sends a quote for a request they have already ACCEPTED (§16).
 * Accept-first is enforced here AND in the rules — a seller cannot quote a
 * request they declined or never took, and the buyer always knows who replied.
 */
export async function submitQuote(input: SubmitQuoteInput): Promise<{ ok: true; id: string }> {
  const d = must();
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error("Sign in to send a quote.");

  const leadId = String(input.leadId ?? "").trim();
  if (!leadId) throw new Error("This quote isn't linked to a request.");
  const issues = validateQuote(input);
  if (issues.length > 0) throw new Error(issues[0]);

  const leadSnap = await getDoc(doc(d, "leads", leadId));
  if (!leadSnap.exists()) throw new Error("That request is no longer available.");
  const lead = leadSnap.data() as { ownerUid?: string | null; requesterUid?: string | null; requestId?: string | null };
  if (!lead.ownerUid || lead.ownerUid !== uid) {
    throw new Error("Accept the request first — quotes only come from the business that took it on.");
  }
  const buyerUid = String(lead.requesterUid ?? "");
  if (!buyerUid) {
    throw new Error("This request has no signed-in buyer, so the quote can't be tracked. Ask them to sign in and re-request.");
  }
  // A quote must carry the PARENT request id, not just this seller's lead id.
  // That is what lets /compare-quotes list every competing seller's offer for one
  // job, and what lets the award cascade find and close the rival leads. Older
  // leads predate the field, so fall back to the lead itself (a request of one).
  const requestId = String(lead.requestId ?? "") || leadId;

  const clean = cleanQuoteDraft(input);
  const mine = await ownBusinessLite(d, uid);
  const ref = await addDoc(collection(d, "quotes"), {
    leadId,
    requestId,
    buyerUid,
    sellerUid: uid,
    businessId: mine?.id ?? null,
    ...clean,
    status: "sent",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Lead moves to `quoted` so dashboard filters and counters stay truthful.
  await updateDoc(doc(d, "leads", leadId), {
    status: "quoted",
    quotedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await createNotification(buyerUid, "quote", {
    message: `${mine?.name || "A local pro"} sent you a quote — compare it side-by-side.`,
    businessId: mine?.id,
    leadId,
    href: `/compare-quotes?lead=${leadId}`,
  });
  return { ok: true, id: ref.id };
}

/**
 * Buyer accepts or declines a quote (§17). Deliberately does NOT pick a winner
 * for them: the buyer is the only one who can close the request, and declining
 * one quote leaves the others untouched so they can still compare.
 */
export async function decideQuote(
  quoteId: string,
  decision: "accepted" | "declined",
  response?: string
): Promise<{ ok: true }> {
  const d = must();
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error("Sign in to decide on a quote.");

  const snap = await getDoc(doc(d, "quotes", quoteId));
  if (!snap.exists()) throw new Error("That quote no longer exists.");
  const q = snap.data() as {
    buyerUid?: string; sellerUid?: string; leadId?: string; requestId?: string; status?: string;
  };
  if (q.buyerUid !== uid) throw new Error("Only the buyer who requested this can decide.");
  const status = normalizeQuoteStatus(q.status);
  if (status !== "sent") throw new Error(`That quote is already ${QUOTE_STATUS_LABEL[status].toLowerCase()}.`);

  // ── ACCEPT goes to the server ──────────────────────────────────────────
  // Accepting is the moment the whole request resolves, so it must be ONE atomic
  // operation that also stands every rival down. From the browser it was a single
  // `updateDoc` on the winner's own lead, which left the other sellers' leads
  // stuck at "quoted" forever — dead leads chasing a job that was already won.
  if (decision === "accepted") {
    await apiPost("/api/quotes/award", { quoteId, requestId: q.requestId ?? q.leadId }, { auth: "required" });
    return { ok: true };
  }

  // ── DECLINE stays local ─────────────────────────────────────────────────
  // Declining one offer deliberately leaves the request open so the buyer can
  // still compare the others — nothing to cascade, so no server round-trip.
  await updateDoc(doc(d, "quotes", quoteId), {
    status: decision,
    buyerResponse: cleanStr(response, 400) || null,
    decidedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  if (q.leadId) {
    // Declining only closes THAT quote — the request is lost once every quote has
    // been declined, never before (§15). Scoped to the PARENT request so a
    // decline on one seller's lead correctly sees a rival's quote still open.
    const parentId = q.requestId ?? q.leadId;
    const rest = await getDocs(
      query(collection(d, "quotes"), where("buyerUid", "==", uid), where("requestId", "==", parentId), limit(20))
    );
    const stillOpen = rest.docs.some(
      (x) => x.id !== quoteId && normalizeQuoteStatus((x.data() as { status?: string }).status) === "sent"
    );
    // Buyer updates their own lead: rules pin ownerUid/requesterUid, so this is
    // the one field the buyer legitimately moves.
    await updateDoc(doc(d, "leads", q.leadId), {
      status: stillOpen ? "quoted" : "lost",
      updatedAt: serverTimestamp(),
    });
  }

  if (q.sellerUid) {
    await createNotification(q.sellerUid, "quote-declined", {
      message: "A buyer declined your quote — check the request for feedback.",
      leadId: q.leadId,
      href: "/dashboard",
    });
  }
  return { ok: true };
}

/** Seller pulls their own quote back (dates changed, job misread, etc.). */
export async function withdrawQuote(quoteId: string, reason?: string): Promise<void> {
  const d = must();
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error("Sign in first.");
  const snap = await getDoc(doc(d, "quotes", quoteId));
  if (!snap.exists()) throw new Error("That quote no longer exists.");
  const q = snap.data() as { sellerUid?: string; leadId?: string; status?: string; buyerUid?: string | null };
  if (q.sellerUid !== uid) throw new Error("Only the business that sent this quote can withdraw it.");
  if (normalizeQuoteStatus(q.status) !== "sent") throw new Error("Only a quote awaiting a decision can be withdrawn.");

  await updateDoc(doc(d, "quotes", quoteId), {
    status: "withdrawn",
    withdrawnReason: cleanStr(reason, 200) || null,
    updatedAt: serverTimestamp(),
  });

  // The buyer is mid-comparison when this happens — a quote silently vanishing
  // from the compare table looks like a bug from their side. Tell them, with a
  // deep link back to the comparison so the remaining quotes stay one tap away.
  if (q.buyerUid && q.buyerUid !== uid) {
    await createNotification(q.buyerUid, "quote", {
      message: "A seller withdrew their quote — the rest of your comparison is unchanged.",
      leadId: q.leadId,
      href: "/compare-quotes",
    });
  }

  // Hand the request back to "accepted" so the seller can quote again.
  if (q.leadId) {
    const mine = await getDocs(
      query(collection(d, "quotes"), where("sellerUid", "==", uid), where("leadId", "==", q.leadId), limit(20))
    );
    const anyOpen = mine.docs.some(
      (x) => x.id !== quoteId && normalizeQuoteStatus((x.data() as { status?: string }).status) === "sent"
    );
    if (!anyOpen) {
      await updateDoc(doc(d, "leads", q.leadId), { status: "accepted", updatedAt: serverTimestamp() });
    }
  }
}

/** Matched seller opens a request — powers the §15 "Viewed" pipeline step. */
export async function markLeadViewed(leadId: string): Promise<void> {
  const d = must();
  const uid = auth?.currentUser?.uid;
  if (!uid) return; // viewing is best-effort and never blocks the UI
  try {
    const snap = await getDoc(doc(d, "leads", leadId));
    if (!snap.exists()) return;
    const lead = snap.data() as { status?: string; ownerUid?: string | null };
    if (lead.ownerUid !== uid) return;           // only the matched seller moves it
    if (String(lead.status ?? "new") !== "new") return;
    await updateDoc(doc(d, "leads", leadId), {
      status: "viewed",
      viewedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch { /* best-effort */ }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * MESSAGING (master spec §18)
 * ───────────────────────────────────────────────────────────────────────────
 * One thread per (buyer, seller, business) pair — the id is deterministic, so
 * navigating between a listing, a quote and the inbox always lands in the SAME
 * conversation instead of spawning duplicates. Rules keep both reads and writes
 * to participants only; the sender is pinned to the caller.
 * ═════════════════════════════════════════════════════════════════════════ */

export async function ensureConversation(input: {
  otherUid: string;
  businessId?: string | null;
  businessName?: string | null;
  leadId?: string | null;
}): Promise<string> {
  const d = must();
  const user = auth?.currentUser;
  if (!user) throw new Error("Sign in to send a message.");
  const uid = user.uid;
  const otherUid = String(input.otherUid ?? "").trim();
  if (!otherUid) throw new Error("This business hasn't linked an owner account yet — try their phone or WhatsApp.");
  if (otherUid === uid) throw new Error("That's your own listing.");

  const cid = conversationId(uid, otherUid, input.businessId ?? null);
  const ref = doc(d, "conversations", cid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      participants: [uid, otherUid].sort(),
      names: { [uid]: user.displayName ?? "Neighbour" },
      businessId: input.businessId ?? null,
      businessName: input.businessName ?? null,
      leadId: input.leadId ?? null,
      lastMessage: null,
      lastSenderUid: null,
      lastAt: null,
      status: "open",
      createdBy: uid,
      createdAt: serverTimestamp(),
    });
  }
  return cid;
}

export async function sendMessage(
  cid: string,
  body: string,
  opts?: { kind?: MessageKind; attachments?: string[] }
): Promise<{ ok: true; id: string; messagesRemaining: number | null }> {
  const d = must();
  const user = auth?.currentUser;
  if (!user) throw new Error("Sign in to send a message.");
  const uid = user.uid;
  const problem = validateMessage(body);
  if (problem) throw new Error(problem);

  const convRef = doc(d, "conversations", cid);
  const convSnap = await getDoc(convRef);
  if (!convSnap.exists()) throw new Error("That conversation is no longer available.");
  const conv = convSnap.data() as Conversation;
  if (!conv.participants.includes(uid)) throw new Error("You're not part of this conversation.");
  if (conv.status === "blocked") throw new Error("This conversation is blocked — unblock it to continue.");

  const clean = cleanBody(body);
  const token = await user.getIdToken();
  const response = await fetch("/api/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      conversationId: cid,
      body: clean,
      kind: opts?.kind ?? "text",
      attachments: opts?.attachments ?? [],
    }),
  });
  const result = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    id?: string;
    messagesRemaining?: number | null;
    error?: string;
  };
  if (!response.ok || result.ok !== true || !result.id) {
    throw new Error(result.error ?? "Message didn't send — check your connection.");
  }

  const other = conv.participants.find((p) => p !== uid);
  if (other) {
    // The per-pair 15-minute bucket in rate-limit.ts (applied server-side) is
    // what keeps a hot sidebar from turning mail into a firehose.
    await createNotification(other, "message", {
      message: `New message: ${previewText(clean, 80)}`,
      businessId: conv.businessId ?? undefined,
      leadId: conv.leadId ?? undefined,
      href: `/messages?c=${cid}`,
    });
  }
  return {
    ok: true,
    id: result.id,
    messagesRemaining: typeof result.messagesRemaining === "number" ? result.messagesRemaining : null,
  };
}

/** Mark the thread as read up to now for the caller (drives the unread badge). */
export async function markConversationRead(cid: string): Promise<void> {
  const d = must();
  const uid = auth?.currentUser?.uid;
  if (!uid) return;
  try {
    await updateDoc(doc(d, "conversations", cid), { [`readAt.${uid}`]: serverTimestamp() });
  } catch { /* best-effort */ }
}

/** Block or unblock a thread (§38 safety). Only the blocker can undo it. */
export async function setConversationStatus(cid: string, status: "open" | "blocked"): Promise<void> {
  const d = must();
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error("Sign in first.");
  const snap = await getDoc(doc(d, "conversations", cid));
  if (!snap.exists()) throw new Error("That conversation no longer exists.");
  const conv = snap.data() as Conversation & { blockedBy?: string | null };
  if (!conv.participants.includes(uid)) throw new Error("You're not part of this conversation.");
  if (status === "open" && conv.blockedBy && conv.blockedBy !== uid) {
    throw new Error("Only the person who blocked this conversation can unblock it.");
  }
  await updateDoc(doc(d, "conversations", cid), { status, blockedBy: status === "blocked" ? uid : null });
}

/** Report a conversation for moderation (lands in the admin queue). */
export async function reportConversation(cid: string, reason: string): Promise<void> {
  const d = must();
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error("Sign in to report.");
  if (cleanStr(reason, 500).length < 5) throw new Error("Tell us briefly what's wrong.");
  await addDoc(collection(d, "reports"), {
    type: "message",
    targetId: cid,
    label: "Conversation",
    reason: cleanStr(reason, 500),
    reporterUid: uid,
    status: "open",
    createdAt: serverTimestamp(),
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
 * PORTFOLIO + SERVICE AREAS (master spec §9 / §10, enforced per §24)
 * ───────────────────────────────────────────────────────────────────────────
 * These mutations go through the Next.js API routes (/api/portfolio,
 * /api/business) instead of direct Firestore writes. The routes resolve the
 * caller from their verified ID token and check the server-owned subscription
 * doc, so a tampered client cannot exceed its plan quota by calling Firestore
 * directly (the rules also deny that path).
 * ═════════════════════════════════════════════════════════════════════════ */

/** ID token for authenticated API calls (mirrors the billing flow). */
async function apiToken(): Promise<string | null> {
  const user = auth?.currentUser;
  if (!user) return null;
  return user.getIdToken();
}

async function apiFetch(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: Record<string, unknown>
): Promise<{ ok: boolean; [key: string]: unknown }> {
  const token = await apiToken();
  if (!token) throw new Error("Sign in first.");
  const res = await fetch(path, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { ok: boolean; error?: string; [k: string]: unknown };
  if (!res.ok || json.ok !== true) throw new Error(json.error ?? "Request failed. Please try again.");
  return json;
}

/** Add a portfolio item to one of your listings (quota checked on the server). */
export async function addPortfolioItem(input: { businessId: string } & PortfolioDraft): Promise<{ ok: true; id: string }> {
  const issues = validatePortfolioDraft(input);
  if (issues.length > 0) throw new Error(issues[0]);
  const businessId = String(input.businessId ?? "").trim();
  if (!businessId) throw new Error("Missing the listing this item belongs to.");
  const json = await apiFetch("/api/portfolio", "POST", { businessId, ...cleanPortfolioDraft(input) });
  return { ok: true, id: String(json.id ?? "") };
}

/** Edit your own portfolio item (ownership re-checked on the server). */
export async function updatePortfolioItem(id: string, draft: PortfolioDraft): Promise<void> {
  const issues = validatePortfolioDraft(draft);
  if (issues.length > 0) throw new Error(issues[0]);
  await apiFetch("/api/portfolio", "PATCH", { id, ...cleanPortfolioDraft(draft) });
}

/** Delete your own portfolio item. */
export async function deletePortfolioItem(id: string): Promise<void> {
  if (!id) throw new Error("Missing the portfolio item id.");
  const token = await apiToken();
  if (!token) throw new Error("Sign in first.");
  const res = await fetch(`/api/portfolio?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || !json.ok) throw new Error(json.error ?? "Could not delete that item.");
}

/**
 * Replace the service areas of one of your listings (plan cap checked on the
 * server). Returns the cleaned list the server actually stored.
 */
export async function setServiceAreas(businessId: string, areas: unknown): Promise<string[]> {
  const business = String(businessId ?? "").trim();
  if (!business) throw new Error("Missing the listing id.");
  const json = await apiFetch("/api/business", "PATCH", {
    action: "service-areas",
    businessId: business,
    areas: cleanServiceAreas(areas),
  });
  return Array.isArray(json.areas) ? (json.areas as unknown[]).map(String) : cleanServiceAreas(areas);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * BOOKINGS (master spec §39)
 * ───────────────────────────────────────────────────────────────────────────
 * Buyer requests a slot on a business; the seller confirms, reschedules,
 * completes or marks a no-show; the buyer can cancel while it's live. Every
 * transition is re-validated by firestore.rules (role-pinned field sets), and
 * the counterpart always gets a notification with a deep link.
 * ═════════════════════════════════════════════════════════════════════════ */

export async function createBooking(input: {
  businessId: string;
  date: string;
  time: string;
  durationHours: number;
  note?: string;
}): Promise<{ ok: true; id: string }> {
  const d = must();
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error("Sign in to request a booking.");

  const issues = validateBooking(input);
  if (issues.length > 0) throw new Error(issues[0]);

  const businessId = String(input.businessId ?? "").trim();
  if (!businessId) throw new Error("Missing the business to book.");
  const bizSnap = await getDoc(doc(d, "businesses", businessId));
  if (!bizSnap.exists()) throw new Error("That business no longer exists.");
  const biz = bizSnap.data() as { ownerUid?: string; name?: string };
  const sellerUid = String(biz.ownerUid ?? "");
  if (!sellerUid) throw new Error("This business hasn't claimed its listing yet — try WhatsApp or a call.");
  if (sellerUid === uid) throw new Error("That's your own listing — use the seller hub to manage your diary.");

  const clean = cleanBookingDraft(input);
  const ref = await addDoc(collection(d, "bookings"), {
    buyerUid: uid,
    sellerUid,
    businessId,
    businessName: biz.name ?? null,
    ...clean,
    status: "requested",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await createNotification(sellerUid, "booking", {
    message: `New booking request: ${bookingWhen(clean)}`,
    businessId,
    href: "/dashboard",
  });
  return { ok: true, id: ref.id };
}

/** Seller decision on a booking (§39). Status machine enforced here + rules. */
export async function sellerBookingAction(
  bookingId: string,
  status: "confirmed" | "rescheduled" | "cancelled" | "completed" | "no-show",
  opts?: { sellerNote?: string; date?: string; time?: string }
): Promise<void> {
  const d = must();
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error("Sign in first.");

  const snap = await getDoc(doc(d, "bookings", bookingId));
  if (!snap.exists()) throw new Error("That booking no longer exists.");
  const b = snap.data() as {
    sellerUid?: string; buyerUid?: string; status?: string;
    date?: string; time?: string; durationHours?: number; businessId?: string;
  };
  if (b.sellerUid !== uid) throw new Error("Only the booked business can do that.");

  const from = normalizeBookingStatus(b.status);
  if (!canTransition(from, status, "seller")) {
    throw new Error(`A ${BOOKING_STATUS_LABEL[from].toLowerCase()} booking can't move to ${BOOKING_STATUS_LABEL[status].toLowerCase()}.`);
  }

  const when = { date: b.date, time: b.time, durationHours: b.durationHours };
  const patch: Record<string, unknown> = {
    status,
    sellerNote: cleanStr(opts?.sellerNote, 200) || null,
    decidedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (status === "rescheduled") {
    const date = String(opts?.date ?? "").trim();
    const time = String(opts?.time ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      throw new Error("Give the new date and time.");
    }
    if (date < bookingToday()) throw new Error("The new date is in the past.");
    patch.date = date;
    patch.time = time;
  }
  await updateDoc(doc(d, "bookings", bookingId), patch);

  await createNotification(b.buyerUid ?? "", "booking", {
    message:
      status === "confirmed" ? `Your booking is confirmed — ${bookingWhen(when)}` :
      status === "rescheduled" ? `Your booking was moved — ${bookingWhen({ ...when, date: patch.date, time: patch.time })}` :
      status === "completed" ? "Your booking is marked complete — a review helps your neighbours choose." :
      status === "no-show" ? "The business marked this booking as a no-show." :
      "Your booking was cancelled by the business.",
    businessId: b.businessId,
    href: "/dashboard",
  });
  // The buyer never watches the bookings collection, so without the email the
  // whole request reads as a dead end — createNotification queues it.
}

/** Buyer cancels their own live booking (requested or confirmed). */
export async function buyerCancelBooking(bookingId: string, note?: string): Promise<void> {
  const d = must();
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error("Sign in to cancel a booking.");
  const snap = await getDoc(doc(d, "bookings", bookingId));
  if (!snap.exists()) throw new Error("That booking no longer exists.");
  const b = snap.data() as { buyerUid?: string; sellerUid?: string; status?: string };
  if (b.buyerUid !== uid) throw new Error("Only the buyer who made this booking can cancel it.");
  const from = normalizeBookingStatus(b.status);
  if (!canTransition(from, "cancelled", "buyer")) {
    throw new Error(`A ${BOOKING_STATUS_LABEL[from].toLowerCase()} booking can't be cancelled.`);
  }
  await updateDoc(doc(d, "bookings", bookingId), {
    status: "cancelled",
    buyerNote: cleanStr(note, 200) || null,
    decidedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await createNotification(b.sellerUid ?? "", "booking", {
    message: "A booking was cancelled by the buyer.",
    href: "/dashboard",
  });
  // The seller never watches the bookings collection either — the cancellation
  // email for that row is queued by createNotification.
}
