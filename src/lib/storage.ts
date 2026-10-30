import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage, isFirebaseConfigured } from "./firebase";

export function storageBillingMessage(err: unknown): string | null {
  const m = err instanceof Error ? err.message : String(err);
  if (/billing|blaze|upgrade|unauthorized|permission-denied|retry-limit|unknown/i.test(m)) {
    return "Firebase Storage needs a Blaze billing account on new projects. Skip it — use the free photo-link option in the uploader instead (no billing needed).";
  }
  return null;
}

/**
 * Upload a business photo.
 *
 * SECURITY: `uid` is REQUIRED and is embedded in the object path
 * (`businesses/{bizId}/{uid}/{file}`). Storage rules cannot read Firestore, so a
 * path carrying only a business id is impossible to authorise — any signed-in user
 * who guessed an id could overwrite that business's photos. Putting the uploader's
 * uid in the path lets the rule assert `request.auth.uid == uid`. Do not remove it.
 *
 * `businessId` is sanitised because it is caller-supplied and interpolated into a
 * storage path; Firestore doc ids cannot contain `/`, so a nested id is rejected
 * outright rather than silently creating an object the rules do not match.
 */
/** Upload a seller verification document (ID / proof of address) during registration. */
export async function uploadSellerDocument(
  uid: string,
  docType: "id-front" | "id-back" | "proof-address",
  file: File
): Promise<string> {
  if (!storage || !isFirebaseConfigured) throw new Error("Firebase Storage not configured. Add NEXT_PUBLIC_FIREBASE_* env vars.");
  if (!uid) throw new Error("Sign in before uploading a document.");
  const name = (file.name || "document").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60);
  const path = `seller-verification/${uid}/${docType}/${Date.now()}-${name}`;
  try {
    const snap = await uploadBytes(ref(storage, path), file);
    return getDownloadURL(snap.ref);
  } catch (err) {
    throw new Error(storageBillingMessage(err) ?? (err instanceof Error ? err.message : "Upload failed."));
  }
}

export async function uploadBusinessPhoto(businessId: string, uid: string, file: File): Promise<string> {
  if (!storage || !isFirebaseConfigured) throw new Error("Firebase Storage not configured. Add NEXT_PUBLIC_FIREBASE_* env vars.");
  if (!uid) throw new Error("Sign in before uploading a photo.");
  // Firestore ids exclude "/" — reject it so the path shape the rules rely on holds.
  const biz = businessId.split("/").join("_");
  const name = (file.name || "photo").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60);
  const path = `businesses/${biz}/${uid}/${Date.now()}-${name}`;
  try {
    const snap = await uploadBytes(ref(storage, path), file);
    return getDownloadURL(snap.ref);
  } catch (err) {
    throw new Error(storageBillingMessage(err) ?? (err instanceof Error ? err.message : "Upload failed."));
  }
}

export async function uploadProfilePhoto(uid: string, file: File): Promise<string> {
  if (!storage || !isFirebaseConfigured) throw new Error("Firebase Storage not configured. Add NEXT_PUBLIC_FIREBASE_* env vars.");
  if (!uid) throw new Error("Sign in before uploading a profile photo.");
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file for your profile photo.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Profile photos must be smaller than 5MB.");
  const name = (file.name || "profile-photo").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60);
  const path = `users/${uid}/profile/${Date.now()}-${name}`;
  try {
    const snap = await uploadBytes(ref(storage, path), file);
    return getDownloadURL(snap.ref);
  } catch (error) {
    throw new Error(storageBillingMessage(error) ?? (error instanceof Error ? error.message : "Profile photo upload failed."));
  }
}
