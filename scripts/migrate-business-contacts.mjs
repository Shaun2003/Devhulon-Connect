/**
 * Move existing business contact fields out of public business documents.
 *
 * Usage: node scripts/migrate-business-contacts.mjs [--apply --project-id=<id> --confirm-project=<id>]
 * Requires FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY
 * in .env.local or the environment. No contact values are printed.
 */
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldPath, FieldValue } from "firebase-admin/firestore";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = join(root, ".env.local");
if (existsSync(envFile)) {
  for (const raw of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim();
    if (process.env[key] !== undefined) continue;
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      const quoted = value[0] === '"';
      value = value.slice(1, -1);
      if (quoted) value = value.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\"/g, '"');
    }
    process.env[key] = value;
  }
}

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
const args = new Set(process.argv.slice(2));
const projectArg = process.argv.find((arg) => arg.startsWith("--project-id="))?.slice("--project-id=".length);
const confirmationArg = process.argv.find((arg) => arg.startsWith("--confirm-project="))?.slice("--confirm-project=".length);
const apply = args.has("--apply");
if (apply && (!projectArg || projectArg !== projectId || confirmationArg !== projectId)) {
  console.error("Refusing to apply migration: pass matching --project-id and --confirm-project values for FIREBASE_PROJECT_ID.");
  process.exit(1);
}
if (!projectId || !clientEmail || !privateKey) {
  console.error("Missing Firebase Admin credentials. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY.");
  process.exit(1);
}

const app = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const db = getFirestore(app);
const contactFields = ["phone", "email", "whatsapp", "website", "facebook", "instagram", "address"];
const pageSize = 250;
let last = null;
let migrated = 0;
console.log(`Business contact migration target: ${projectId}`);
console.log(apply ? "Apply mode enabled." : "Dry run only. No documents will be changed.");

while (true) {
  let query = db.collection("businesses").orderBy(FieldPath.documentId()).limit(pageSize);
  if (last) query = query.startAfter(last);
  const page = await query.get();
  if (page.empty) break;

  for (let offset = 0; offset < page.docs.length; offset += 200) {
    const docs = page.docs.slice(offset, offset + 200);
    const privateSnaps = await Promise.all(
      docs.map((business) => db.collection("business_contacts").doc(business.id).get())
    );
    const batch = db.batch();
    let writes = 0;
    for (let index = 0; index < docs.length; index += 1) {
      const business = docs[index];
      const source = business.data();
      const existing = privateSnaps[index].data() ?? {};
      const legacy = Object.fromEntries(
        contactFields
          .filter((field) => typeof source[field] === "string" && source[field].trim())
          .map((field) => [field, source[field]])
      );
      const hasLegacyFields = contactFields.some((field) => field in source);
      if (!hasLegacyFields) continue;

      const contacts = {
        ownerUid: existing.ownerUid ?? source.ownerUid ?? "",
        createdAt: existing.createdAt ?? FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      for (const field of contactFields) {
        const existingValue = existing[field];
        contacts[field] = typeof existingValue === "string" && existingValue
          ? existingValue
          : typeof legacy[field] === "string" ? legacy[field] : "";
      }

      if (apply) {
        batch.set(db.collection("business_contacts").doc(business.id), contacts, { merge: true });
        const removals = Object.fromEntries(contactFields.map((field) => [field, FieldValue.delete()]));
        batch.update(business.ref, removals);
      }
      writes += 2;
      migrated += 1;
    }
    if (apply && writes > 0) await batch.commit();
  }

  last = page.docs[page.docs.length - 1];
}

let cachedCount = 0;
if (apply) {
  while (true) {
    const cached = await db.collection("seller_pool").limit(450).get();
    if (cached.empty) break;
    const batch = db.batch();
    for (const doc of cached.docs) batch.delete(doc.ref);
    await batch.commit();
    cachedCount += cached.size;
  }
} else {
  const cached = await db.collection("seller_pool").count().get();
  cachedCount = cached.data().count;
}
console.log(`${apply ? "Migrated" : "Would migrate"} ${migrated} business records. Private contact values were not logged.`);
console.log(`${apply ? "Deleted" : "Would delete"} ${cachedCount} cached seller-pool records so they rebuild without contact fields.`);
