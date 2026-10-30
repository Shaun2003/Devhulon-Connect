import { adminAuth, adminDb, apiError, sessionFromRequest } from "@/lib/server/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  const db = adminDb();
  const auth = adminAuth();
  if (!db || !auth) return apiError("Account settings are not configured on the server.", 503);

  const session = await sessionFromRequest(request);
  if (!session) return apiError("Sign in to update your account settings.", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Provide valid account settings.", 400);
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return apiError("Provide valid account settings.", 400);
  }
  const updates = body as Record<string, unknown>;
  if (Object.keys(updates).some((key) => !["displayName", "phoneNumber", "photoURL"].includes(key))) {
    return apiError("Unsupported account setting.", 400);
  }
  const hasName = Object.hasOwn(updates, "displayName");
  const hasPhone = Object.hasOwn(updates, "phoneNumber");
  const hasPhoto = Object.hasOwn(updates, "photoURL");
  if (!hasName && !hasPhone && !hasPhoto) return apiError("No account changes were provided.", 400);

  const displayName = hasName ? String(updates.displayName).trim() : undefined;
  if (displayName !== undefined && (displayName.length < 2 || displayName.length > 80)) {
    return apiError("Your name must be between 2 and 80 characters.", 400);
  }
  let phoneNumber: string | undefined;
  if (hasPhone) {
    const rawPhone = String(updates.phoneNumber).trim();
    if (rawPhone) {
      const digits = rawPhone.replace(/[^\d+]/g, "");
      if (!/^(?:\+27\d{9}|0\d{9})$/.test(digits)) {
        return apiError("Enter a valid South African number, for example 082 123 4567.", 400);
      }
      phoneNumber = digits.startsWith("+27") ? digits : `+27${digits.slice(1)}`;
    } else {
      phoneNumber = "";
    }
  }
  let photoURL: string | undefined;
  if (hasPhoto) {
    photoURL = String(updates.photoURL).trim();
    if (photoURL) {
      try {
        const photo = new URL(photoURL);
        if (photo.protocol !== "https:" || photo.hostname !== "firebasestorage.googleapis.com" || photo.pathname.length > 2048 || photoURL.length > 4096) {
          return apiError("Choose a valid uploaded profile photo.", 400);
        }
      } catch {
        return apiError("Choose a valid uploaded profile photo.", 400);
      }
    }
  }

  try {
    const userRecord = await auth.getUser(session.uid);
    const authUpdates: { displayName?: string; photoURL?: string } = {};
    if (displayName !== undefined) authUpdates.displayName = displayName;
    if (photoURL !== undefined) authUpdates.photoURL = photoURL;
    if (Object.keys(authUpdates).length) await auth.updateUser(session.uid, authUpdates);
    const profileUpdates: Record<string, string> = { updatedAt: new Date().toISOString() };
    if (displayName !== undefined) profileUpdates.name = displayName;
    if (phoneNumber !== undefined) profileUpdates.phoneNumber = phoneNumber;
    if (photoURL !== undefined) profileUpdates.photoURL = photoURL;
    try {
      await db.collection("users").doc(session.uid).set(profileUpdates, { merge: true });
    } catch (error) {
      try {
        if (Object.keys(authUpdates).length) {
          await auth.updateUser(session.uid, {
            ...(displayName !== undefined ? { displayName: userRecord.displayName ?? "" } : {}),
            ...(photoURL !== undefined ? { photoURL: userRecord.photoURL ?? "" } : {}),
          });
        }
      } catch (rollbackError) {
        console.error("[account/settings] Could not roll back the Auth profile:", rollbackError);
      }
      throw error;
    }
    return Response.json({ ok: true, displayName, phoneNumber, photoURL });
  } catch (error) {
    console.error("[account/settings] Could not update account profile:", error);
    return apiError("We could not save your profile right now. Please try again.", 500);
  }
}
