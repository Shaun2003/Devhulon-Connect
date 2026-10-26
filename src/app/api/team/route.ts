import { adminAuth, adminDb, apiError, sessionFromRequest } from "@/lib/server/admin";
import { entitlementFrom, readSubscription } from "@/lib/server/subscriptions";
import { hasCap, limitsFor } from "@/lib/plans";
import { queueEmail } from "@/lib/server/email";
import { SITE_SHORT } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const db = adminDb();
  if (!db) return apiError("Server storage is not configured.", 503);
  const session = await sessionFromRequest(request);
  if (!session) return apiError("Sign in to manage your team.", 401);
  const ownerProfile = await db.collection("users").doc(session.uid).get();
  if (String(ownerProfile.data()?.role ?? "") !== "seller") {
    return apiError("A seller account is required to manage a team.", 403);
  }

  const [members, memberOf, entitlement] = await Promise.all([
    db.collection("team_memberships").where("ownerUid", "==", session.uid).limit(500).get(),
    db.collection("team_memberships").where("memberUid", "==", session.uid).limit(500).get(),
    readSubscription(session.uid).then(entitlementFrom),
  ]);
  const incoming = await Promise.all(memberOf.docs.map(async (doc) => {
    const data = doc.data();
    const owner = await db.collection("users").doc(String(data.ownerUid ?? "")).get();
    return {
      id: doc.id,
      ...data,
      ownerName: String(owner.data()?.businessName ?? owner.data()?.name ?? `A ${SITE_SHORT} seller`),
    };
  }));
  const limit = limitsFor(entitlement.plan).teamMembers;
  return Response.json({
    ok: true,
    canManage: entitlement.entitled && hasCap(entitlement.plan, "teamMembers"),
    limit,
    members: members.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    memberOf: incoming,
  });
}

export async function POST(request: Request) {
  const db = adminDb();
  const auth = adminAuth();
  if (!db || !auth) return apiError("Server storage is not configured.", 503);
  const session = await sessionFromRequest(request);
  if (!session) return apiError("Sign in to manage your team.", 401);
  const ownerProfile = await db.collection("users").doc(session.uid).get();
  if (String(ownerProfile.data()?.role ?? "") !== "seller") {
    return apiError("A seller account is required to manage a team.", 403);
  }

  const entitlement = entitlementFrom(await readSubscription(session.uid));
  if (!entitlement.entitled || !hasCap(entitlement.plan, "teamMembers")) {
    return apiError("Team members are available on the Business plan.", 403);
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = body.role === "manager" || body.role === "editor" ? body.role : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return apiError("Enter a valid team member email.");
  if (!role) return apiError("Choose a team role.");

  let invitee;
  try {
    invitee = await auth.getUserByEmail(email);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "auth/user-not-found") {
      return apiError(`That person must create and verify a ${SITE_SHORT} seller account before you can add them.`);
    }
    console.error("[KASI] team member lookup failed:", error);
    return apiError("Could not verify that account right now.", 503);
  }
  if (!invitee.emailVerified) return apiError("The team member must verify their email before being added.");
  if (invitee.uid === session.uid) return apiError("You already own this team.");

  const userDoc = await db.collection("users").doc(invitee.uid).get();
  if (String(userDoc.data()?.role ?? "") !== "seller") {
    return apiError("Team members must have a seller account.");
  }

  const membershipId = `${session.uid}__${invitee.uid}`;
  const membershipRef = db.collection("team_memberships").doc(membershipId);
  const seatLimit = limitsFor(entitlement.plan).teamMembers;
  const membership = {
    ownerUid: session.uid,
    memberUid: invitee.uid,
    email,
    name: invitee.displayName ?? email,
    role,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  const ownerName = String(ownerProfile.data()?.name ?? session.email ?? `A ${SITE_SHORT} seller`);
  const notification = db.collection("notifications").doc();
  const membershipResult = await db.runTransaction(async (transaction) => {
    const [existing, currentMembers] = await Promise.all([
      transaction.get(membershipRef),
      transaction.get(db.collection("team_memberships").where("ownerUid", "==", session.uid)),
    ]);
    const existingStatus = String(existing.data()?.status ?? (existing.exists ? "active" : ""));
    if (existing.exists && existingStatus !== "declined") return { error: "already" as const };

    const occupiedSeats = currentMembers.docs.filter((doc) => {
      const status = String(doc.data().status ?? "active");
      return status === "active" || status === "pending";
    }).length;
    if (seatLimit !== null && occupiedSeats >= seatLimit) return { error: "limit" as const };

    transaction.set(membershipRef, membership);
    transaction.create(notification, {
      toUid: invitee.uid,
      fromUid: session.uid,
      type: "team-invitation",
      message: `${ownerName} invited you to join their ${SITE_SHORT} business team as a ${role}.`,
      href: "/dashboard",
      read: false,
      createdAt: new Date().toISOString(),
    });
    return { member: { id: membershipId, ...membership } };
  });
  if (membershipResult.error === "already") return apiError("That seller already has an active membership or a pending invitation.", 409);
  if (membershipResult.error === "limit") {
    return apiError(`Your plan includes ${seatLimit} team member${seatLimit === 1 ? "" : "s"}. Upgrade to add more.`, 403);
  }
  queueEmail({
    toUid: invitee.uid,
    kind: "team-invitation",
    subject: `A ${SITE_SHORT} team invitation is waiting for you`,
    heading: "Team invitation request",
    body: `${ownerName} invited you to join their team as a ${role}. Sign in to ${SITE_SHORT}, open your seller dashboard and accept or decline the request. Shared listing access is only enabled after you accept.`,
    ctaLabel: "Review team invitation",
    ctaHref: "/dashboard",
  });
  return Response.json({ ok: true, member: membershipResult.member });
}

export async function PATCH(request: Request) {
  const db = adminDb();
  if (!db) return apiError("Server storage is not configured.", 503);
  const session = await sessionFromRequest(request);
  if (!session) return apiError("Sign in to respond to a team invitation.", 401);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const ownerUid = typeof body.ownerUid === "string" ? body.ownerUid.trim() : "";
  const memberUid = typeof body.memberUid === "string" ? body.memberUid.trim() : "";
  const decision = body.decision === "accept" || body.decision === "decline" ? body.decision : "";
  if (!ownerUid || !memberUid || !decision) return apiError("Choose whether to accept or decline this invitation.");
  if (session.uid !== memberUid) return apiError("Only the invited seller can respond to this request.", 403);

  const membershipRef = db.collection("team_memberships").doc(`${ownerUid}__${memberUid}`);
  const ownerProfileRef = db.collection("users").doc(ownerUid);
  const [ownerProfile, subscription] = await Promise.all([
    ownerProfileRef.get(),
    decision === "accept" ? readSubscription(ownerUid) : Promise.resolve(null),
  ]);
  if (String(ownerProfile.data()?.role ?? "") !== "seller") return apiError("The inviting account is no longer a seller.", 409);
  const ownerName = String(ownerProfile.data()?.name ?? ownerProfile.data()?.businessName ?? "The seller");
  const entitlement = subscription ? entitlementFrom(subscription) : null;
  const seatLimit = entitlement ? limitsFor(entitlement.plan).teamMembers : null;

  const notification = db.collection("notifications").doc();
  const result = await db.runTransaction(async (transaction) => {
    const membershipSnapshot = await transaction.get(membershipRef);
    if (!membershipSnapshot.exists) return { error: "missing" as const };
    if (String(membershipSnapshot.data()?.status ?? "") !== "pending") return { error: "resolved" as const };

    let activeSeatCount = 0;
    if (decision === "accept") {
      if (!entitlement?.entitled || !hasCap(entitlement.plan, "teamMembers")) return { error: "plan" as const };
      const roster = await transaction.get(db.collection("team_memberships").where("ownerUid", "==", ownerUid));
      activeSeatCount = roster.docs.filter((doc) => String(doc.data().status ?? "active") === "active").length;
      if (seatLimit !== null && activeSeatCount >= seatLimit) return { error: "limit" as const };
    }

    const updatedAt = new Date().toISOString();
    transaction.update(membershipRef, {
      status: decision === "accept" ? "active" : "declined",
      respondedAt: updatedAt,
    });
    transaction.create(notification, {
      toUid: ownerUid,
      fromUid: memberUid,
      type: "team-invitation-response",
      message: `${String(membershipSnapshot.data()?.name ?? session.email ?? "The invited seller")} ${decision === "accept" ? "accepted" : "declined"} your team invitation.`,
      href: "/dashboard",
      read: false,
      createdAt: updatedAt,
    });
    return { status: decision === "accept" ? "active" : "declined" };
  });

  if (result.error === "missing") return apiError("This team invitation no longer exists.", 404);
  if (result.error === "resolved") return apiError("This team invitation has already been answered.", 409);
  if (result.error === "plan") return apiError(`${ownerName} no longer has an active Business plan with team access.`, 409);
  if (result.error === "limit") return apiError(`${ownerName}'s team has no available seats right now.`, 409);
  return Response.json({ ok: true, status: result.status });
}

export async function DELETE(request: Request) {
  const db = adminDb();
  if (!db) return apiError("Server storage is not configured.", 503);
  const session = await sessionFromRequest(request);
  if (!session) return apiError("Sign in to manage your team.", 401);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const ownerUid = typeof body.ownerUid === "string" ? body.ownerUid.trim() : "";
  const memberUid = typeof body.memberUid === "string" ? body.memberUid.trim() : "";
  if (!ownerUid || !memberUid) return apiError("Missing team member information.");
  if (session.uid !== ownerUid && session.uid !== memberUid) return apiError("You cannot change this team.", 403);

  const ref = db.collection("team_memberships").doc(`${ownerUid}__${memberUid}`);
  const snap = await ref.get();
  if (!snap.exists) return apiError("That team membership no longer exists.", 404);
  await ref.delete();
  return Response.json({ ok: true });
}
