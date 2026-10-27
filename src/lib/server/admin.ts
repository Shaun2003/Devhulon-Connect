/**
 * Firebase Admin SDK — TRUSTED SERVER ONLY.
 *
 * Why this exists: Firestore security rules can express "you may read your own
 * data", but they cannot express "you may upgrade yourself to the Business plan
 * after paying". Anything money- or allowance-related must be decided by a
 * trusted process that holds credentials the browser never sees.
 *
 * Chosen architecture (per project decision): Next.js route handlers running on
 * Vercel (Node runtime) + the Admin SDK, so we do NOT need Firebase Cloud
 * Functions or the Blaze billing plan.
 *
 * Required environment variables (server-side only — never NEXT_PUBLIC_*):
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_CLIENT_EMAIL
 *   FIREBASE_PRIVATE_KEY     (PEM; literal "\n" escapes are accepted)
 *
 * Console path: Project settings → Service accounts → Generate new private key.
 */

import { initializeApp, getApps, getApp, cert, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAuth, type Auth } from "firebase-admin/auth";

/** Hard stop if this module is ever pulled into a browser bundle. */
function assertServer(where: string) {
  if (typeof window !== "undefined") {
    throw new Error(
      `[KASI] ${where} can only run on the server. Do not import @/lib/server/* from a client component.`
    );
  }
}

/** PEM keys are usually stored with escaped newlines; normalise both forms. */
function normalizePrivateKey(raw: string): string {
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

const projectId = process.env.FIREBASE_PROJECT_ID ?? "";
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL ?? "";
const privateKey = process.env.FIREBASE_PRIVATE_KEY ?? "";

/** True only when all three service-account values are present. */
export const isAdminConfigured = Boolean(projectId && clientEmail && privateKey);

/**
 * Names of the Admin SDK vars that are missing, for a diagnostic message.
 * Empty array when configured.
 */
export function missingAdminEnvVars(): string[] {
  const missing: string[] = [];
  if (!projectId) missing.push("FIREBASE_PROJECT_ID");
  if (!clientEmail) missing.push("FIREBASE_CLIENT_EMAIL");
  if (!privateKey) missing.push("FIREBASE_PRIVATE_KEY");
  return missing;
}

/**
 * Log ONCE when the Admin SDK is missing.
 *
 * WHY THIS EXISTS: without the service account, ten-plus route handlers return
 * `{ ok: false, error: "Server storage is not configured." }` with a 503 — while
 * every page still renders perfectly. That is the worst possible failure mode for
 * a deployment: it looks healthy, every form silently fails, and nothing in the
 * build output says why. One loud line at first use turns a 3am mystery into a
 * two-second fix.
 *
 * Once-only so a per-request 503 does not flood the logs.
 */
let warnedMissingAdmin = false;
export function warnIfAdminUnconfigured(): void {
  if (isAdminConfigured || warnedMissingAdmin) return;
  warnedMissingAdmin = true;
  console.error(
    `[KASI] FIREBASE ADMIN SDK NOT CONFIGURED — missing: ${missingAdminEnvVars().join(", ")}.\n` +
      `[KASI] Leads, quotes, subscriptions, verification, erasure and the retention cron will ALL return 503.\n` +
      `[KASI] Add the three FIREBASE_* vars to .env.local (server) or your host's environment (never NEXT_PUBLIC_).`
  );
}

let app: App | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;
let adminInitializationFailed = false;

function logAdminInitializationFailure(service: string, error: unknown): void {
  adminInitializationFailed = true;
  console.error(
    `[KASI] Firebase Admin ${service} initialization failed. Check FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in the production environment.`,
    error
  );
}

/** Lazily initialise so a missing env var degrades gracefully instead of crashing the build. */
function adminApp(): App | null {
  assertServer("firebase-admin");
  if (!isAdminConfigured || adminInitializationFailed) return null;
  if (!app) {
    try {
      app = getApps().length ? getApp() : initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey: normalizePrivateKey(privateKey),
        }),
        projectId,
      });
    } catch (error) {
      logAdminInitializationFailure("SDK", error);
      return null;
    }
  }
  return app;
}

/** Admin Firestore handle, or null when the service account is not configured. */
export function adminDb(): Firestore | null {
  if (!isAdminConfigured) {
    // Fires the one-time loud warning. Without it, a deployment missing the
    // service account renders every page perfectly while every form 503s.
    warnIfAdminUnconfigured();
    return null;
  }
  if (!db) {
    const a = adminApp();
    if (!a) return null;
    try {
      db = getFirestore(a);
    } catch (error) {
      logAdminInitializationFailure("Firestore", error);
      return null;
    }
  }
  return db;
}

/** Admin Auth handle (used to verify ID tokens), or null when unconfigured. */
export function adminAuth(): Auth | null {
  if (!isAdminConfigured) return null;
  if (!auth) {
    const a = adminApp();
    if (!a) return null;
    try {
      auth = getAuth(a);
    } catch (error) {
      logAdminInitializationFailure("Auth", error);
      return null;
    }
  }
  return auth;
}

/** Standard JSON error body for /api routes. */
export function apiError(message: string, status = 400) {
  return Response.json({ ok: false, error: message }, { status });
}

/**
 * Verify the caller AND confirm they are an admin (`admins/{uid}` exists).
 *
 * Same registry the client rules use for `isAdmin()`, so the console and the API
 * can never disagree about who is an admin. Returns null when unauthenticated,
 * unconfigured, or simply not an admin — callers should respond 403, never leak
 * which of the two it was.
 */
export async function adminFromRequest(req: Request): Promise<RequestSession | null> {
  const session = await sessionFromRequest(req);
  if (!session) return null;
  const db = adminDb();
  if (!db) return null;
  try {
    const snap = await db.collection("admins").doc(session.uid).get();
    return snap.exists ? session : null;
  } catch {
    return null;
  }
}

/**
 * Resolve the caller's uid from a Firebase ID token.
 *
 * The browser sends `Authorization: Bearer <idToken>` obtained via
 * `user.getIdToken()`. We verify it here so a route handler knows *who* is
 * calling without trusting any request body field.
 *
 * Returns null when unauthenticated (caller should respond 401).
 */
export async function uidFromRequest(req: Request): Promise<string | null> {
  const a = adminAuth();
  if (!a) return null;
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  try {
    const decoded = await a.verifyIdToken(token);
    return decoded.uid ?? null;
  } catch {
    return null;
  }
}

/** Verified caller identity, including the email a payment provider needs. */
export type RequestSession = { uid: string; email: string | null; emailVerified: boolean };

/**
 * Verify the caller and return identity. Prefer this over reading a uid from the
 * body — a body-supplied uid would let anyone act as another seller.
 */
export async function sessionFromRequest(req: Request): Promise<RequestSession | null> {
  const a = adminAuth();
  if (!a) return null;
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  try {
    const d = await a.verifyIdToken(token);
    return {
      uid: d.uid,
      email: typeof d.email === "string" ? d.email : null,
      emailVerified: Boolean(d.email_verified),
    };
  } catch {
    return null;
  }
}
