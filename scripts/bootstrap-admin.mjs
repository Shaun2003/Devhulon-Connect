/**
 * Create the FIRST admin — solves the bootstrap deadlock.
 *
 * THE PROBLEM: `firestore.rules` has `allow write: if false` on /admins (correctly —
 * otherwise any signed-in user could promote themselves by writing one document).
 * But that means the very first admin cannot be created through the app either, and
 * /admin/seed refuses to run without one. The documented workaround was "open the
 * Firebase Console by hand and paste a document id", which fails often because the
 * Console does not show you your Firebase Auth uid anywhere obvious — it shows the
 * email.
 *
 * THIS SCRIPT: resolves an EMAIL to a uid via the Admin SDK, then writes
 * `admins/{uid}`. The Admin SDK bypasses security rules by design, which is exactly
 * why it is trusted here and client writes are not.
 *
 * Usage:
 *   node scripts/bootstrap-admin.mjs you@example.com
 *   node scripts/bootstrap-admin.mjs you@example.com --remove     # revoke
 *
 * Requires FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY in
 * .env.local (loaded automatically) — i.e. the same service account the app needs.
 *
 * SAFETY: creating an admin is idempotent and NEVER overwrites an existing entry
 * unless --force is passed. Revoking requires --remove. The script never prints
 * the private key.
 */
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Minimal .env.local loader — avoids a dotenv dependency for one file.
 * Supports quoted values and escaped newlines inside double quotes, which matters
 * because a service-account private key is routinely stored as one long quoted
 * line containing literal \n sequences.
 */
function loadEnvLocal() {
  const file = join(ROOT, ".env.local");
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue; // real env wins over the file
    let val = line.slice(eq + 1).trim();
    const quoted = (val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"));
    if (quoted) {
      val = val.slice(1, -1);
      // Only double quotes carry escape sequences; single quotes stay literal.
      if (raw.includes('"')) val = val.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\"/g, '"');
    }
    process.env[key] = val;
  }
}
loadEnvLocal();

const args = process.argv.slice(2);
const email = (args.find((a) => !a.startsWith("--")) ?? "").trim().toLowerCase();
const remove = args.includes("--remove");
const force = args.includes("--force");

function fail(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

if (!email) {
  fail(`Usage: node scripts/bootstrap-admin.mjs <email> [--remove] [--force]

Examples:
  node scripts/bootstrap-admin.mjs you@example.com
  node scripts/bootstrap-admin.mjs you@example.com --remove`);
}

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

const missing = [];
if (!projectId) missing.push("FIREBASE_PROJECT_ID");
if (!clientEmail) missing.push("FIREBASE_CLIENT_EMAIL");
if (!privateKey) missing.push("FIREBASE_PRIVATE_KEY");
if (missing.length) {
  fail(`Missing ${missing.join(", ")} in .env.local or the environment.
The Admin SDK is what bypasses the rules, so this script cannot run without it.
If every admin route is already returning 503, this is the same root cause.`);
}

const app = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const db = getFirestore(app);

async function resolveUid(address) {
  try {
    return (await getAuth(app).getUserByEmail(address)).uid;
  } catch (e) {
    const code = e?.code ?? "";
    if (code === "auth/user-not-found") {
      fail(`No Firebase Auth user with email "${address}".
Create it first: sign up once through the site's sign-in modal (or Firebase Console → Authentication → Users → Add user).
Then re-run this script.`);
    }
    fail(`Could not look up "${address}": ${e?.message ?? e}`);
  }
}

const uid = await resolveUid(email);
const ref = db.collection("admins").doc(uid);

if (remove) {
  const snap = await ref.get();
  if (!snap.exists) {
    console.log(`\nNothing to do — ${email} (uid ${uid}) is not an admin.\n`);
    process.exit(0);
  }
  await ref.delete();
  console.log(`\n✓ Revoked admin from ${email} (uid ${uid}).`);
  console.log(`  They lose console access on their next request.\n`);
  process.exit(0);
}

const existing = await ref.get();
if (existing.exists && !force) {
  console.log(`\n✓ ${email} is already an admin (uid ${uid}) — nothing changed.`);
  console.log(`  Use --force to update, or --remove to revoke.\n`);
  process.exit(0);
}

await ref.set(
  {
    email,
    createdAt: existing.exists ? existing.get("createdAt") ?? FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    ...(force ? { note: "Updated via bootstrap-admin --force" } : { via: "scripts/bootstrap-admin.mjs" }),
  },
  { merge: true }
);

console.log(`\n✓ ${remove ? "Revoked" : "Granted"} admin access to ${email}`);
console.log(`  uid: ${uid}`);
if (!existing.exists) {
  console.log(`\nNext: sign in at /admin/seed as ${email} to seed reference data.`);
}
console.log(`  Then publish rules + indexes:  npm run deploy:firebase\n`);