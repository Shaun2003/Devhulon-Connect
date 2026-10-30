"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useAuth } from "@/components/AuthProvider";
import { setLeadStatus, type LeadStatus } from "@/lib/repo";
import { isFirebaseConfigured } from "@/lib/firebase";
import { greetingFor } from "@/lib/utils";
import {
  subscribeMyBusinesses, subscribeLeadsInbox,
  subscribeMyClaims, subscribeMySubscription, useRealtime,
} from "@/lib/realtime";
import { DashboardSkeleton } from "@/components/dash/parts";

function Section({ title, children, live }: { title: string; children: ReactNode; live: boolean }) {
  return (
    <section className="rounded-2xl border bg-white p-5">
      <h2 className="font-bold">{title} {live && <span className="ml-2 text-[11px] font-bold text-green-700 bg-green-100 rounded-full px-2 py-0.5">Live</span>}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default function DashboardClient() {
  const { user, loading, signInGoogle, unconfigured } = useAuth();
  const uid = user?.uid ?? "";
  const [acting, setActing] = useState<string | null>(null);

  const biz = useRealtime<Record<string, unknown>>((cb) => (uid ? subscribeMyBusinesses(uid, cb) : () => {}), [], [uid]);
  const leads = useRealtime<Record<string, unknown>>((cb) => (uid ? subscribeLeadsInbox(uid, cb) : () => {}), [], [uid]);
  const claims = useRealtime<Record<string, unknown>>((cb) => (uid ? subscribeMyClaims(uid, cb) : () => {}), [], [uid]);
  const subs = useRealtime<Record<string, unknown>>((cb) => (uid ? subscribeMySubscription(uid, cb) : () => {}), [], [uid]);

  async function act(leadId: string, status: LeadStatus) {
    setActing(leadId + status);
    try {
      await setLeadStatus(leadId, status);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not update lead.");
    } finally {
      setActing(null);
    }
  }

  if (unconfigured || !isFirebaseConfigured)
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-3xl font-black">Owner dashboard</h1>
        <p className="text-sm text-zinc-600 mt-2">Add your NEXT_PUBLIC_FIREBASE_* vars to .env.local and restart npm run dev.</p>
        <Link href="/pricing" className="inline-block mt-4 rounded-xl bg-green-800 text-white text-sm font-bold px-4 py-2.5">See Starter and Premium plans</Link>
      </div>
    );
  if (loading) return <DashboardSkeleton title="Loading your owner dashboard" />;
  if (!user)
    return (
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-3">
        <h1 className="text-3xl font-black">Owner dashboard</h1>
        <p className="text-sm text-zinc-600">Sign in with Google to see your listings, leads inbox, claims and subscription.</p>
        <button onClick={signInGoogle} className="rounded-xl bg-zinc-900 text-white text-sm font-bold px-4 py-2.5">Sign in with Google</button>
      </div>
    );

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-4">
      <header>
        <p className="text-xs font-bold uppercase tracking-widest text-green-700">Owner dashboard</p>
        <h1 className="text-3xl font-black">{greetingFor()}, {user.displayName ?? user.email}</h1>
        <p className="text-xs text-zinc-500 mt-1">UID <code>{user.uid}</code> - live via Firestore onSnapshot.</p>
      </header>
      <div className="grid md:grid-cols-2 gap-4">
        <Section title={`My listings (${biz.rows.length})`} live={biz.live}>
          {biz.rows.length === 0 ? <p className="text-sm text-zinc-500">No listings yet. <Link className="underline" href="/list-business">List your business</Link>.</p> :
            <ul className="text-sm space-y-2">{biz.rows.map((b, i) => <li key={i} className="rounded-xl border p-3"><b>{String((b as { name: string }).name ?? "Listing")}</b></li>)}</ul>}
        </Section>
        <Section title={`Leads inbox (${leads.rows.length})`} live={leads.live}>
          {leads.rows.length === 0 ? <p className="text-sm text-zinc-500">No leads yet.</p> :
            <ul className="text-sm space-y-2">{leads.rows.map((l, i) => {
              const lid = String((l as { id: string }).id ?? "");
              const st = String((l as { status: string }).status ?? "new");
              const busy = acting === lid + "accepted" || acting === lid + "declined";
              return (
                <li key={i} className="rounded-xl border p-3">
                  <p><b>{String((l as { need: string }).need ?? "Quote request")}</b></p>
                  <p className="text-xs text-zinc-500 mt-0.5">{String((l as { phone: string }).phone ?? "")} - {st}</p>
                  <div className="flex gap-2 mt-2">
                    <button disabled={busy || !lid} onClick={() => act(lid, "accepted")} className="rounded-lg bg-green-800 text-white text-xs font-bold px-3 py-1.5 disabled:opacity-50">Accept</button>
                    <button disabled={busy || !lid} onClick={() => act(lid, "declined")} className="rounded-lg border text-xs font-bold px-3 py-1.5 disabled:opacity-50">Decline</button>
                  </div>
                </li>
              );
            })}</ul>}
        </Section>
        <Section title={`My claims (${claims.rows.length})`} live={claims.live}>
          {claims.rows.length === 0 ? <p className="text-sm text-zinc-500">No listing claims yet.</p> :
            <ul className="text-sm space-y-2">{claims.rows.map((c, i) => <li key={i} className="rounded-xl border p-3">{String((c as { name: string }).name ?? "Claim")}</li>)}</ul>}
        </Section>
        <Section title="Subscription" live={subs.live}>
          {subs.rows.length === 0 ? (
            <p className="text-sm text-zinc-500">You are on Starter. <Link className="underline font-bold" href="/pricing">Compare Starter and Premium plans</Link>.</p>
          ) : (
            <ul className="text-sm space-y-2">{subs.rows.map((s, i) => <li key={i} className="rounded-xl border p-3">Plan <b>{String((s as { plan: string }).plan ?? "")}</b></li>)}</ul>
          )}
        </Section>
      </div>
    </div>
  );
}
