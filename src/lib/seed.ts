import { collection, doc, setDoc } from "firebase/firestore";
import { db, auth } from "./firebase";
import { provinces, cities, suburbs } from "@/data/locations";
import { categories } from "@/data/categories";
import { jobs, events, deals, articles } from "@/data/content";

/** One-click seeder for /admin/seed. Idempotent (setDoc with fixed IDs). */
export async function seedFirestore(onProgress?: (msg: string) => void) {
  if (!db) throw new Error("Firebase not configured — add NEXT_PUBLIC_FIREBASE_* to .env.local first.");
  const log = (m: string) => onProgress?.(m);
  let n = 0;
  const put = async (col: string, id: string, data: unknown) => {
    await setDoc(doc(collection(db!, col), id), { ...(data as object), updatedAt: new Date().toISOString() }, { merge: true });
    n++;
  };

  log("Seeding provinces/cities/suburbs…");
  for (const p of provinces) await put("provinces", p.slug, p);
  for (const c of cities) await put("cities", c.slug, c);
  for (const s of suburbs) await put("suburbs", s.slug, s);

  log("Seeding categories…");
  for (const c of categories) await put("categories", c.slug, c);

  // Businesses are NOT seeded. Sellers create their own listings through
  // /list-business — seeding placeholders put fake businesses into Firestore
  // where a real buyer could find and call them.

  log("Seeding jobs/events/deals/articles…");
  const uid = auth?.currentUser?.uid ?? "seed-admin";
  for (const j of jobs) await put("jobs", j.id, { ...j, createdBy: uid, status: "live" });
  for (const e of events) await put("events", e.id, { ...e, createdBy: uid, status: "live" });
  for (const d of deals) await put("deals", d.id, { ...d, createdBy: uid, status: "live" });
  for (const a of articles) await put("articles", a.slug, a);

  // ️ Admin bootstrap is deliberately NOT done from the browser any more.
  // This block used to register whoever ran the seeder as an admin, which meant
  // any signed-in user could make themselves admin with one request. Create the
  // first admin by hand instead:
  //   Firebase Console → Firestore → admins → Add document
  //     Document ID: <your Firebase uid>
  //     Field:       admin = true
  // (or via the Admin SDK). After that, admins grant other admins.
  log("Admin bootstrap is manual — see the note at the top of this page.");

  log(`Done — ${n} docs written.`);
  return n;
}

