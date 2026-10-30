"use client";
import { useState } from "react";
import { seedFirestore } from "@/lib/seed";
import { isFirebaseConfigured } from "@/lib/firebase";
import { SignInInline } from "@/components/dash/parts";
import { useAuth } from "@/components/AuthProvider";

export default function SeedPage() {
  const { user } = useAuth();
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    setLog([]);
    try {
      const n = await seedFirestore((m) => setLog((l) => [...l, m]));
      setLog((l) => [...l, `Done — ${n} docs written.`]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLog((l) => [...l, `FAILED: ${msg}`]);
      if (/permission|PERMISSION/i.test(msg)) {
        setLog((l) => [...l, "Fix: reference data can only be written by an admin. Create the admins/<your-uid> document in the Firebase Console, then publish the latest firestore.rules (repo root)."]);
      }
    }
    setBusy(false);
  }
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-black">Admin — seed Firestore</h1>
      {!isFirebaseConfigured ? (
        <p className="mt-2 text-sm text-red-700 font-semibold">Firebase not configured. Add NEXT_PUBLIC_FIREBASE_* to .env.local and restart dev server.</p>
      ) : !user ? (
        <div className="mt-4 rounded-2xl bg-[#f2f6fa] p-4 text-sm">
          <p className="font-bold text-[#10243e]">Sign in first — firestore.rules restricts reference data to admins, and /admins cannot be written by a client (by design).</p>
          <p className="mt-2 text-zinc-600">To create the first admin, run this once locally with your service account in <code className="text-xs">.env.local</code>:</p>
          <pre className="mt-2 rounded-xl bg-zinc-950 text-green-200 text-xs p-3 overflow-x-auto">node scripts/bootstrap-admin.mjs {`{your.email}`}</pre>
          <p className="mt-2 text-xs text-zinc-600">It resolves your email to a Firebase uid and writes <code>admins/&lt;uid&gt;</code> through the Admin SDK, which bypasses the rules. Revoke with the same command plus <code>--remove</code>.</p>
          <div className="mt-3"><SignInInline /></div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-zinc-600">Signed in as {user.email} — writes reference data, businesses, jobs, events, deals &amp; articles. Safe to re-run (merge). Requires an active admin entry (admins/&lt;your-uid&gt;).</p>
      )}
      <button onClick={run} disabled={busy || !isFirebaseConfigured || !user} className="mt-4 rounded-xl bg-green-800 text-white font-bold px-5 py-3 disabled:opacity-50">
        {busy ? "Seeding…" : "Seed Firestore "}
      </button>
      <pre className="mt-4 rounded-xl bg-zinc-950 text-green-200 text-xs p-4 min-h-24 whitespace-pre-wrap">{log.join("\n") || "…"}</pre>
    </div>
  );
}
