"use client";
import { KIcon } from "@/lib/icons";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { auth } from "@/lib/firebase";
import {
  useRealtime,
  subscribeAdminDoc,
  subscribeReports,
  subscribeAllClaims,
  subscribeTopBusinesses,
  subscribeJobs,
  subscribeEvents,
  subscribeDeals,
  subscribeAllUsers,
  subscribeAllSubscriptions,
  subscribeAllPayments,
  subscribeAllLeads,
  tsMilli,
  ADMIN_FEED_LIMIT,
  ADMIN_QUEUE_LIMIT,
  BUSINESS_FEED_LIMIT,
  MODERATION_FEED_LIMIT,
} from "@/lib/realtime";
import { setBusinessVerified, setBusinessStatus, setFeedItemStatus, approveClaim, rejectClaim, resolveReport } from "@/lib/repo";
import type { VerificationMethod } from "@/lib/verification";
import { SignInInline } from "@/components/dash/parts";

type Row = Record<string, unknown>;

// ── Display helpers ────────────────────────────────────────────────────────────

const fmtZAR = (n: unknown): string => {
  const v = typeof n === "number" ? n : parseFloat(String(n));
  if (!isFinite(v)) return "—";
  return `R${Math.round(v).toLocaleString("en-ZA")}`;
};

const planLabel = (plan: unknown): string => {
  if (!plan) return "None (free)";
  const p = String(plan);
  return p === "starter" ? "Starter" : p === "professional" ? "Professional" : p === "business" ? "Business" : p;
};

const subStatusLabel = (status: unknown, plan: unknown): string => {
  const s = String(status ?? "");
  if (s === "trialing") return "Trial";
  if (s === "active") return planLabel(plan) + " (active)";
  if (s === "past_due") return "Past due";
  if (s === "canceled" || s === "cancelled") return "Cancelled";
  if (!s) return "Unsubscribed";
  return s;
};

const roleLabel = (role: unknown): string => {
  if (!role) return "Buyer";
  const r = String(role);
  if (r === "seller") return "Seller";
  if (r === "buyer") return "Buyer";
  return r;
};

const isoDate = (v: unknown): string => {
  const t = tsMilli(v);
  if (!t) return "—";
  return new Date(t).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
};

const truncateMiddle = (s: string, keep = 8): string => {
  if (s.length <= keep * 2 + 3) return s;
  return s.slice(0, keep) + "…" + s.slice(-keep);
};

function sortSubs(rows: Row[]): Row[] {
  return [...rows].sort((a, b) => {
    const sa = String(a.subscription_status ?? a.status ?? "");
    const sb = String(b.subscription_status ?? b.status ?? "");
    const order = (s: string) => (s === "active" || s === "trialing" ? 0 : s === "past_due" ? 1 : 2);
    if (order(sa) !== order(sb)) return order(sa) - order(sb);
    return tsMilli(b.current_period_end) - tsMilli(a.current_period_end);
  });
}

/** Users newest-joined first. The join field is inconsistent across doc
 *  generations, so read both names (`tsMilli` handles Timestamp objects). */
function sortUsers(rows: Row[]): Row[] {
  return [...rows].sort((a, b) => tsMilli(b.created_at ?? b.createdAt) - tsMilli(a.created_at ?? a.createdAt));
}

function sortPayments(rows: Row[]): Row[] {
  return [...rows].sort((a, b) => tsMilli(b.createdAt) - tsMilli(a.createdAt));
}

function sortLeads(rows: Row[]): Row[] {
  return [...rows].sort((a, b) => {
    const aOpen = !a.ownerUid && String(a.status ?? "") === "new";
    const bOpen = !b.ownerUid && String(b.status ?? "") === "new";
    if (aOpen !== bOpen) return aOpen ? -1 : 1;
    return tsMilli(b.createdAt) - tsMilli(a.createdAt);
  });
}

/**
 * Shown when a feed returns exactly the cap. The slice is NOT "the newest N" —
 * a `limit()` without `orderBy` returns documents in document-ID order, and the
 * creation field differs between old (`created_at`) and new (`createdAt`) docs,
 * so an ordered query would silently drop the old ones. Say "capped" honestly.
 */
function Capped({ count, limit = ADMIN_FEED_LIMIT, note }: { count: number; limit?: number; note?: string }) {
  if (count < limit) return null;
  return (
    <p className="mt-2 rounded-lg border border-[#f0d79a] bg-[#fff4d6] px-3 py-2 text-xs font-bold text-[#a36508]">
      {note ?? (
        <>
          Showing the first {limit} documents (cap reached) — totals below are for this slice only. Older
          records stay in Firestore; raise ADMIN_FEED_LIMIT in src/lib/realtime.ts to widen it.
        </>
      )}
    </p>
  );
}

/** Applies to every figure derived from the admin feeds, which are capped. */
const SLICE_HINT = `Counted over at most ${ADMIN_FEED_LIMIT} documents per admin feed (the cap), not the whole collection.`;

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const { user } = useAuth();
  const uid = user?.uid ?? "";
  const [tab, setTab] = useState<
    | "users" | "subscriptions" | "leads" | "moderation" | "verify" | "claims" | "reports"
  >("users");

  const admin = useRealtime<Row>(
    (cb, onErr) => (uid ? subscribeAdminDoc(uid, (r) => cb(r ? [r] : []), onErr) : () => {}),
    [],
    [uid]
  );
  const isAdmin = admin.rows.length > 0;

  // Every feed below is gated on `isAdmin`, not merely on being signed in — the
  // factories used to run unconditionally and only the render was guarded. For a
  // signed-out or non-admin visitor that meant six subscriptions the rules reject
  // outright (users, subscriptions, payments, leads, reports, business_claims →
  // six console warnings), plus four that succeed because businesses/jobs/events/
  // deals are `allow read: if true`, which quietly pulled ~500 documents down to
  // render the "Sign in to continue" screen. Gating removes both.
  const isAdminDeps = [isAdmin];
  const gate = <T,>(subscribe: (cb: (rows: T[]) => void, onErr?: (e: { message: string }) => void) => () => void) =>
    (cb: (rows: T[]) => void, onErr?: (e: { message: string }) => void) => (isAdmin ? subscribe(cb, onErr) : () => {});

  const biz = useRealtime<Row>(gate<Row>((cb, onErr) => subscribeTopBusinesses(cb as never, onErr, "live")), [], isAdminDeps);
  const claims = useRealtime<Row>(gate<Row>((cb, onErr) => subscribeAllClaims(cb as never, onErr)), [], isAdminDeps);
  const reports = useRealtime<Row>(gate<Row>((cb, onErr) => subscribeReports(cb as never, onErr)), [], isAdminDeps);
  const jobs = useRealtime<Row>(gate<Row>((cb, onErr) => subscribeJobs(cb as never, onErr, "pending")), [], isAdminDeps);
  const events = useRealtime<Row>(gate<Row>((cb, onErr) => subscribeEvents(cb as never, onErr, "pending")), [], isAdminDeps);
  const deals = useRealtime<Row>(gate<Row>((cb, onErr) => subscribeDeals(cb as never, onErr, "pending")), [], isAdminDeps);

  const users = useRealtime<Row>(gate<Row>((cb, onErr) => subscribeAllUsers(cb as never, onErr)), [], isAdminDeps);
  const subs = useRealtime<Row>(gate<Row>((cb, onErr) => subscribeAllSubscriptions(cb as never, onErr)), [], isAdminDeps);
  const payments = useRealtime<Row>(gate<Row>((cb, onErr) => subscribeAllPayments(cb as never, onErr)), [], isAdminDeps);
  const leads = useRealtime<Row>(gate<Row>((cb, onErr) => subscribeAllLeads(cb as never, onErr)), [], isAdminDeps);

  // Seller-submitted verification requests (documents) — fetched from the
  // admin API rather than a Firestore subscription: only admins may read the
  // queue, it is small by nature, and the review actions are server-routed.
  const [vQueue, setVQueue] = useState<Row[]>([]);
  const [vBusy, setVBusy] = useState<string | null>(null);
  const [vNote, setVNote] = useState<string | null>(null);
  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    (async () => {
      try {
        const token = await auth?.currentUser?.getIdToken();
        if (!token) throw new Error("Sign in as an admin first.");
        const res = await fetch("/api/admin/verification-queue", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; requests?: Row[]; error?: string };
        if (!alive) return;
        if (!res.ok || !json.ok) throw new Error(json.error || "Could not load the queue.");
        setVQueue(Array.isArray(json.requests) ? json.requests : []);
        setVNote(null);
      } catch (e) {
        if (alive) setVNote(e instanceof Error ? e.message : "Could not load the queue.");
      }
    })();
    return () => { alive = false; };
  }, [isAdmin]);

  /** Approve or reject a seller-submitted verification request (documents). */
  async function actVRequest(row: Row, action: "approve" | "reject") {
    const sellerUid = String(row.uid ?? row.id ?? "");
    const businessId = String(row.businessId ?? "");
    if (!sellerUid || !businessId) return alert("This request is missing the seller or listing id.");
    let notes: string | undefined;
    if (action === "approve") {
      if (!confirm(`Approve ${String(row.businessName ?? "this listing")}? It gets the Verified badge.`)) return;
    } else {
      const input = prompt("Rejection note (required — the seller sees it):");
      if (input === null) return;
      notes = input.trim();
      if (!notes) return alert("A rejection note is required.");
    }
    setVBusy(sellerUid);
    try {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) throw new Error("Sign in as an admin first.");
      const res = await fetch("/api/admin/verify-action", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ uid: sellerUid, businessId, action, method: String(row.method ?? "documents"), notes }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || "Action failed.");
      setVQueue((q) => q.filter((r) => String(r.uid ?? r.id ?? "") !== sellerUid));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setVBusy(null);
    }
  }

  if (!user || !uid) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="text-3xl font-black text-[#10243e]">Admin console</h1>
        <p className="text-sm text-[#1d3a5f]/70">Sign in to continue.</p>
        <SignInInline />
      </div>
    );
  }

  if (!isAdmin) {
    // The admin doc streams in asynchronously, so a real admin would otherwise
    // see "Not an admin yet" (and the seeder instructions) on every page load.
    // Only hold the screen while the lookup is genuinely still outstanding — a
    // failure falls through to the instructions, which are the bootstrap path.
    const checking = !!uid && !admin.live && !admin.error;
    if (checking) {
      return (
        <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-2">
          <h1 className="text-3xl font-black text-[#10243e]">Admin console</h1>
          <p className="text-sm text-[#1d3a5f]/70">Checking admin access…</p>
        </div>
      );
    }
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="text-3xl font-black text-[#10243e]">Not an admin yet</h1>
        <p className="text-sm text-[#1d3a5f]/70">
          The first admin is registered from <Link href="/admin/seed" className="font-bold text-[#558c2b] hover:underline">/admin/seed</Link> — sign in there and run the seeder once; it writes <code>admins/{"{your uid}"}</code>.
        </p>
        <p className="text-xs text-[#1d3a5f]/50">UID: <code>{uid}</code></p>
      </div>
    );
  }

  // The jobs/events/deals feeds are pinned to `status == 'pending'`, so the rows
  // ARE the queue — no client-side filter that could hide a record outside the
  // slice. `verified` cannot be used as a query filter: the field is often absent
  // rather than false (seed/hand-written docs omit it, and equality never matches
  // a missing field), so the verification queue filters client-side over the
  // capped businesses feed and reports its cap.
  const pendingJobs = jobs.rows;
  const pendingEvents = events.rows;
  const pendingDeals = deals.rows;
  const unverified = biz.rows.filter((b) => !b.verified);
  const verificationCapped = biz.rows.length >= BUSINESS_FEED_LIMIT;

  const allUsersCount = users.rows.length;

  // Indexed once per render instead of scanning the business/subscription feeds
  // inside the row loop (that made the users tab O(users × businesses)).
  const bizByUid = new Map<string, Row[]>();
  for (const b of biz.rows) {
    const key = String(b.ownerUid ?? "");
    if (!key) continue;
    const list = bizByUid.get(key);
    if (list) list.push(b); else bizByUid.set(key, [b]);
  }
  const subsByUid = new Map(subs.rows.map((s) => [String(s.id ?? ""), s]));

  const usersSorted = sortUsers(users.rows);
  const subsSorted = sortSubs(subs.rows);
  const leadsSorted = sortLeads(leads.rows);
  const subsActive = subsSorted.filter((s) =>
    ["active", "trialing", "past_due"].includes(String(s.subscription_status ?? s.status ?? ""))
  ).length;
  const paymentsTotal = sortPayments(payments.rows)
    .filter((p) => String(p.status ?? "") === "paid")
    .reduce((sum, p) => sum + (typeof p.amount === "number" ? p.amount : 0), 0);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-5">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#558c2b]">Admin console</p>
          <h1 className="text-2xl sm:text-3xl font-black text-[#10243e]">Moderate &amp; manage</h1>
        </div>
        <div className="ml-auto flex flex-wrap gap-2 text-xs font-bold text-[#1d3a5f]/60">
          <span title={SLICE_HINT}>{allUsersCount} users</span>
          <span title={SLICE_HINT}>· {subsActive} active subs</span>
          <span title={SLICE_HINT}>· {fmtZAR(paymentsTotal)} paid</span>
        </div>
        <Link href="/admin/guides" className="btn-sun text-sm"><KIcon name="penTool" size={14} className="inline shrink-0" /> Guide editor →</Link>
        <Link href="/admin/analytics" className="btn-sun text-sm">Analytics →</Link>
        <Link href="/admin/support" className="btn-sun text-sm">Support queue →</Link>
      </header>

      <nav className="flex gap-2 overflow-x-auto">
        {([
          ["users", `Users & sellers (${allUsersCount})`],
          ["subscriptions", `Subs & payments (${subsActive})`],
          ["leads", `Leads & quotes (${leads.rows.length})`],
          ["moderation", `Moderation (${pendingJobs.length + pendingEvents.length + pendingDeals.length})`],
          ["verify", `Verify (${unverified.length + vQueue.length})`],
          ["claims", `Claims (${claims.rows.length})`],
          ["reports", `Reports (${reports.rows.length})`],
        ] as const).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            title={SLICE_HINT}
            className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-bold transition ${
              tab === t ? "hippo-tab-active" : "bg-white border border-[#d6e1ec] text-[#1d3a5f] hover:border-[#7ac142]"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* ── Users & sellers ──────────────────────────────────────────────────── */}
      {tab === "users" && (
        <section className="hippo-card p-5 overflow-x-auto">
          <h2 className="font-black text-[#10243e]">Users &amp; sellers ({allUsersCount})</h2>
          <p className="text-xs text-[#1d3a5f]/60 mt-1">
            Role, businesses and subscription status. Email is in Firebase Auth — use the UID in Firebase Console.
          </p>
          <div className="mt-4 min-w-[620px]">
            <Capped count={users.rows.length} />
            {users.rows.length === 0 ? (
              <p className="text-sm text-[#1d3a5f]/60 py-6 text-center">No user docs yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#e2e8f0]">
                    <th className="text-left py-2 text-[#1d3a5f]/60 font-bold uppercase text-xs">UID</th>
                    <th className="text-left py-2 text-[#1d3a5f]/60 font-bold uppercase text-xs">Role</th>
                    <th className="text-left py-2 text-[#1d3a5f]/60 font-bold uppercase text-xs">Joined</th>
                    <th className="text-left py-2 text-[#1d3a5f]/60 font-bold uppercase text-xs">Biz</th>
                    <th className="text-left py-2 text-[#1d3a5f]/60 font-bold uppercase text-xs">Sub</th>
                  </tr>
                </thead>
                <tbody>
                  {usersSorted.map((u) => {
                    const uidStr = String(u.id ?? "");
                    const businesses = bizByUid.get(uidStr) ?? [];
                    const sub = subsByUid.get(uidStr);
                    const isSeller = String(u.role ?? "") === "seller" || businesses.length > 0;
                    return (
                      <tr key={uidStr} className="border-b border-[#f1f5f9] hover:bg-[#f8fafc]">
                        <td className="py-2 font-mono text-[#1d3a5f]/50">{truncateMiddle(uidStr)}</td>
                        <td className="py-2">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${isSeller ? "bg-[#e8f6d8] text-[#3c6b1d]" : "bg-[#eef2ff] text-[#3b4f8a]"}`}>
                            {roleLabel(u.role)}
                          </span>
                          {isSeller && businesses.length > 0 && <span className="text-[#64748b] text-xs ml-1">({businesses.length})</span>}
                        </td>
                        <td className="py-2 text-[#64748b]">{isoDate(u.created_at ?? u.createdAt)}</td>
                        <td className="py-2 text-[#10243e] font-semibold">{businesses.length}</td>
                        <td className="py-2 text-[#1d3a5f]/70 text-xs">{sub ? subStatusLabel(sub.subscription_status ?? sub.status, sub.plan) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}

      {/* ── Subscriptions & payments ─────────────────────────────────────────── */}
      {tab === "subscriptions" && (
        <div className="space-y-5">
          <section className="hippo-card p-5">
            <h2 className="font-black text-[#10243e]">Subscriptions ({subs.rows.length})</h2>
            <p className="text-xs text-[#1d3a5f]/60 mt-1">
              Plan, status, trial, renewal and lead allowance. Changes go through server route handlers.
            </p>
            <Capped count={subs.rows.length} />
            <div className="mt-4 space-y-2">
              {subsSorted.length === 0 && <p className="text-sm text-[#1d3a5f]/60">No subscriptions yet.</p>}
              {subsSorted.map((s) => {
                const sid = String(s.id ?? "");
                const status = String(s.subscription_status ?? s.status ?? "");
                const isActive = ["active", "trialing", "past_due"].includes(status);
                return (
                  <div key={sid} className="rounded-xl border border-[#e7eef5] p-3 flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <b className="text-sm text-[#10243e]">{planLabel(s.plan)}</b>
                      <span className="text-xs text-[#64748b] ml-2">UID: {truncateMiddle(sid)}</span>
                      <p className="text-xs text-[#1d3a5f]/60 mt-0.5">
                        {isActive ? (
                          <>
                            Renews {isoDate(s.current_period_end)}{" "}
                            {s.cancel_at_period_end === true ? "(auto-renewal off)" : ""}
                            {status === "trialing" && (
                              <span className="text-[#a36508]"> · Trial ends {isoDate(s.trial_ends_at)}</span>
                            )}
                          </>
                        ) : (
                          <span className="text-[#a3341f]">{subStatusLabel(status, s.plan)}</span>
                        )}
                      </p>
                      {typeof s.lead_limit === "number" && (
                        <p className="text-xs text-[#1d3a5f]/60 mt-0.5">
                          Leads: {typeof s.leads_used === "number" ? s.leads_used : 0} / {s.lead_limit}{" "}
                          {typeof s.leads_used === "number" && typeof s.lead_limit === "number" && s.lead_limit > 0 && (
                            <span className="text-[#3c6b1d]">· {Math.max(0, s.lead_limit - s.leads_used)} remaining</span>
                          )}
                        </p>
                      )}
                    </div>
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold shrink-0 ${
                      status === "active" ? "bg-[#e8f6d8] text-[#3c6b1d]" :
                      status === "trialing" ? "bg-[#fff4d6] text-[#a36508]" :
                      status === "past_due" ? "bg-[#fde8e8] text-[#a3341f]" :
                      "bg-[#eef2f6] text-[#64748b]"
                    }`}>
                      {status === "trialing" ? "Trial" : status === "past_due" ? "Past due" : status === "canceled" || status === "cancelled" ? "Cancelled" : isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {/* ── Leads & quotes ───────────────────────────────────────────────────── */}
      {tab === "leads" && (
        <div className="space-y-5">
          <section className="hippo-card p-5">
            <h2 className="font-black text-[#10243e]">All leads ({leads.rows.length})</h2>
            <p className="text-xs text-[#1d3a5f]/60 mt-1">
              Open (unclaimed) leads first. Admin sees every lead — participants only see their own.
            </p>
            <div className="mt-4 space-y-2">
              <Capped count={leads.rows.length} />
              {leadsSorted.length === 0 && <p className="text-sm text-[#1d3a5f]/60">No leads yet.</p>}
              {leadsSorted.map((l) => {
                const lid = String(l.id ?? "");
                const status = String(l.status ?? "new");
                const isOpen = status === "new" && !l.ownerUid;
                return (
                  <div key={lid} className={`rounded-xl border p-3 flex flex-wrap items-start gap-2 ${
                    isOpen ? "border-[#7ac142] bg-[#f0f7ee]" : "border-[#e7eef5] bg-white"
                  }`}>
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold shrink-0 ${
                      status === "new" ? "bg-[#fff4d6] text-[#a36508]" :
                      status === "viewed" ? "bg-[#eef2ff] text-[#3b4f8a]" :
                      status === "accepted" || status === "quoted" ? "bg-[#e8f6d8] text-[#3c6b1d]" :
                      status === "negotiating" ? "bg-[#fff4d6] text-[#a36508]" :
                      status === "won" ? "bg-[#d4edda] text-[#155724]" :
                      status === "lost" ? "bg-[#fde8e8] text-[#a3341f]" :
                      "bg-[#eef2f6] text-[#64748b]"
                    }`}>
                      {status}
                    </span>
                    <div className="min-w-0 flex-1">
                      <b className="text-sm text-[#10243e]">{String(l.need ?? l.category ?? "Service request")}</b>
                      <p className="text-xs text-[#64748b] mt-0.5">
                        {String(l.suburb ?? "") ? `Suburb: ${l.suburb} · ` : ""}
                        {String(l.phone ?? "")} · {isoDate(l.createdAt)}
                        {String(l.businessId ?? "") ? ` · Listing: ${l.businessId}` : ""}
                      </p>
                    </div>
                    <span className="text-xs font-mono text-[#1d3a5f]/40 shrink-0">{truncateMiddle(lid)}</span>
                    {typeof l.ownerUid === "string" && l.ownerUid !== "" && (
                      <span className="text-xs text-[#3c6b1d] font-bold shrink-0">Matched</span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {/* ── Verification ─────────────────────────────────────────────────────── */}
      {tab === "verify" && (
        <div className="space-y-4">
          {/* Seller-submitted document requests — the §8 Phase 1 queue. */}
          <section className="hippo-card p-5">
            <h2 className="font-black text-[#10243e]">Seller verification requests ({vQueue.length})</h2>
            <p className="text-xs text-[#1d3a5f]/60 mt-1">
              Documents submitted through the seller dashboard. Approve only what you have actually checked —
              the badge records who approved it, when, and by what method.
            </p>
            {vNote && <p className="mt-2 text-xs font-bold text-[#a36508] bg-[#fff4d6] rounded-2xl px-3 py-2">{vNote}</p>}
            <div className="mt-3 space-y-2">
              {vQueue.length === 0 && !vNote && <p className="text-sm text-[#1d3a5f]/60">No pending requests.</p>}
              {vQueue.map((r) => {
                const docs = (r.documents ?? {}) as { idFront?: string; idBack?: string; proofAddress?: string };
                const sellerUid = String(r.uid ?? r.id ?? "");
                return (
                  <div key={sellerUid || String(r.id)} className="rounded-xl border border-[#e7eef5] p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="min-w-0">
                        <b className="text-sm text-[#10243e]">{String(r.businessName ?? "Listing")}</b>
                        <p className="text-xs text-[#1d3a5f]/60">
                          {String(r.method ?? "documents")} · requested {isoDate(r.createdAt)} · seller {truncateMiddle(sellerUid, 6)}
                        </p>
                      </div>
                      <span className="ml-auto flex gap-2">
                        <button
                          disabled={vBusy === sellerUid}
                          onClick={() => actVRequest(r, "approve")}
                          className="rounded-lg bg-[#558c2b] text-white text-xs font-bold px-3 py-1.5 disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          disabled={vBusy === sellerUid}
                          onClick={() => actVRequest(r, "reject")}
                          className="rounded-lg border text-xs font-bold px-3 py-1.5 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </span>
                    </div>
                    {(docs.idFront || docs.idBack || docs.proofAddress) && (
                      <div className="mt-2 flex flex-wrap gap-3 text-xs font-bold">
                        {docs.idFront && <a href={docs.idFront} target="_blank" rel="noreferrer" className="text-[#558c2b] hover:underline">ID (front) →</a>}
                        {docs.idBack && <a href={docs.idBack} target="_blank" rel="noreferrer" className="text-[#558c2b] hover:underline">ID (back) →</a>}
                        {docs.proofAddress && <a href={docs.proofAddress} target="_blank" rel="noreferrer" className="text-[#558c2b] hover:underline">Proof of address →</a>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="hippo-card p-5">
            <h2 className="font-black text-[#10243e]">Verify a listing yourself ({unverified.length})</h2>
          <p className="text-xs text-[#1d3a5f]/60 mt-1">
            Verify ONLY listings you have phoned/WhatsApp-checked (see /about — never fake the badge).
          </p>
          <Capped
            count={biz.rows.length}
            limit={BUSINESS_FEED_LIMIT}
            note={`Only the first ${BUSINESS_FEED_LIMIT} live listings are loaded and unverified ones are filtered out of that slice in the browser — the field cannot be filtered in the query because it is often absent rather than false. There may be unverified listings beyond the slice; check Firebase Console before treating this queue as complete.`}
          />
          <div className="mt-3 space-y-2">
            {unverified.length === 0 && (
              <p className="text-sm text-[#1d3a5f]/60">
                {verificationCapped
                  ? "Nothing to verify in the loaded slice — but the slice is capped, so this does NOT prove every listing is verified. Check Firebase Console before assuming the queue is clear."
                  : "Everything is verified."}
              </p>
            )}
            {unverified.map((b) => (
              <div key={String(b.id)} className="rounded-xl border border-[#e7eef5] p-3 flex flex-wrap items-center gap-2">
                <div className="min-w-0">
                  <b className="text-sm text-[#10243e]">{String(b.businessName ?? b.name ?? "")}</b>
                  <p className="text-xs text-[#1d3a5f]/60">
                    {String(b.suburb ?? "")} · {String(b.phone ?? "")} · {String(b.ownerUid ?? "")}
                  </p>
                </div>
                <span className="ml-auto flex gap-2">
                  <Link href={`/business/${String(b.id)}`} className="text-xs font-bold text-[#558c2b] hover:underline">
                    Open
                  </Link>
                  <button
                    onClick={() => {
                      // Verification now records provenance, so the admin has to
                      // say WHAT they actually did. This is deliberate friction: the
                      // old one-click button produced a "Verified" badge with no
                      // evidence behind it, which is exactly the kind of claim we
                      // could not defend.
                      const method = prompt(
                        "How did you verify this business?\n\n1 = Called the listed number\n2 = Confirmed on WhatsApp\n3 = Confirmed by email\n4 = Visited in person\n5 = Checked business documents\n\nEnter 1-5:",
                        "1",
                      );
                      if (!method) return;
                      const byMethod: Record<string, VerificationMethod> = {
                        "1": "phone", "2": "whatsapp", "3": "email", "4": "in_person", "5": "documents",
                      };
                      const chosen = byMethod[method.trim()];
                      if (!chosen) return alert("Pick a number from 1 to 5.");
                      const notes = prompt("What did you check? (optional)") ?? undefined;
                      setBusinessVerified(String(b.id), true, { method: chosen, notes })
                        .catch((e) => alert(e instanceof Error ? e.message : "Failed"));
                    }}
                    className="rounded-lg bg-[#558c2b] text-white text-xs font-bold px-3 py-1.5"
                  >
                    <KIcon name="check" size={14} className="inline shrink-0" /> Verify
                  </button>
                  <button
                    onClick={() => {
                      if (confirm("Suspend this listing (hidden from feeds)?"))
                        setBusinessStatus(String(b.id), "rejected").catch((e) => alert(e instanceof Error ? e.message : "Failed"));
                    }}
                    className="rounded-lg border text-xs font-bold px-3 py-1.5"
                  >
                    Suspend
                  </button>
                </span>
              </div>
            ))}
          </div>
          </section>
        </div>
      )}

      {tab === "claims" && (
        <section className="hippo-card p-5">
          <h2 className="font-black text-[#10243e]">Business claims ({claims.rows.length})</h2>
          <p className="text-xs text-[#1d3a5f]/60 mt-1">Phone the claimant, confirm ownership, then approve — ownership transfers and the listing is verified.</p>
          <Capped count={claims.rows.length} limit={ADMIN_QUEUE_LIMIT} />
          <div className="mt-3 space-y-2">
            {claims.rows.length === 0 && <p className="text-sm text-[#1d3a5f]/60">No pending claims.</p>}
            {claims.rows.map((c) => (
              <div key={String(c.id)} className="rounded-xl border border-[#e7eef5] p-3 flex flex-wrap items-center gap-2">
                <div className="min-w-0">
                  <b className="text-sm text-[#10243e]">{String(c.businessName ?? "")}</b>
                  <p className="text-xs text-[#1d3a5f]/60">{String(c.claimantName ?? "")} · {String(c.phone ?? "")}</p>
                </div>
                <span className="ml-auto flex gap-2">
                  <button onClick={() => { if (confirm("Approve and transfer ownership?")) approveClaim(String(c.id), { businessId: String(c.businessId ?? ""), claimantUid: String(c.claimantUid ?? "") }).catch((e) => alert(e instanceof Error ? e.message : "Failed")); }} className="rounded-lg bg-[#558c2b] text-white text-xs font-bold px-3 py-1.5">Approve</button>
                  <button onClick={() => { if (confirm("Reject this claim?")) rejectClaim(String(c.id)).catch((e) => alert(e instanceof Error ? e.message : "Failed")); }} className="rounded-lg border text-xs font-bold px-3 py-1.5">Reject</button>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === "moderation" && (
        <div className="space-y-4">
          {([["jobs", pendingJobs], ["events", pendingEvents], ["deals", pendingDeals]] as const).map(([col, items]) => (
            <section key={col} className="hippo-card p-5">
              <h2 className="font-black text-[#10243e]">Pending {col} ({items.length})</h2>
              <Capped count={items.length} limit={MODERATION_FEED_LIMIT} />
              <div className="mt-3 space-y-2">
                {items.length === 0 && <p className="text-sm text-[#1d3a5f]/60">Nothing waiting.</p>}
                {items.map((p) => (
                  <div key={String(p.id)} className="rounded-xl border border-[#e7eef5] p-3 flex flex-wrap items-center gap-2">
                    <b className="text-sm text-[#10243e]">{String(p.title ?? "")}</b>
                    <span className="text-xs text-[#1d3a5f]/60">{String(p.suburb ?? "")} · {String(p.company ?? p.venue ?? p.business ?? "")}</span>
                    <span className="ml-auto flex gap-2">
                      <button onClick={() => setFeedItemStatus(col, String(p.id), "live").catch((e) => alert(e instanceof Error ? e.message : "Failed"))} className="rounded-lg bg-[#558c2b] text-white text-xs font-bold px-3 py-1.5">Approve</button>
                      <button onClick={() => { if (confirm("Reject this post?")) setFeedItemStatus(col, String(p.id), "rejected").catch((e) => alert(e instanceof Error ? e.message : "Failed")); }} className="rounded-lg border text-xs font-bold px-3 py-1.5">Reject</button>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {tab === "reports" && (
        <section className="hippo-card p-5">
          <h2 className="font-black text-[#10243e]">Open reports ({reports.rows.length})</h2>
          <Capped count={reports.rows.length} limit={ADMIN_QUEUE_LIMIT} />
          <div className="mt-3 space-y-2">
            {reports.rows.length === 0 && <p className="text-sm text-[#1d3a5f]/60">No open reports.</p>}
            {reports.rows.map((r) => (
              <div key={String(r.id)} className="rounded-xl border border-[#e7eef5] p-3">
                <p className="text-sm font-bold text-[#10243e]">{String(r.type ?? "")}: {String(r.label ?? r.targetId ?? "")}</p>
                <p className="text-xs text-[#1d3a5f]/70 mt-0.5">{String(r.reason ?? "")}</p>
                <div className="flex gap-2 mt-2">
                  {r.type === "business" && <Link href={`/business/${String(r.targetId)}`} className="text-xs font-bold text-[#558c2b] hover:underline">Open listing →</Link>}
                  <button onClick={() => resolveReport(String(r.id)).catch((e) => alert(e instanceof Error ? e.message : "Failed"))} className="ml-auto rounded-lg bg-[#10243e] text-white text-xs font-bold px-3 py-1.5">Resolve</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}