"use client";
import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { useRealtime, subscribeNotifications, listenerHint, type RealtimeError } from "@/lib/realtime";
import {
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  clearNotifications,
} from "@/lib/repo";
import { timeAgo } from "@/lib/utils";
import { KIcon, type IconKey } from "@/lib/icons";
import { SignInInline } from "@/components/dash/parts";
import { SITE_SHORT } from "@/lib/site";
import { triggerNotificationEmailAsync } from "@/components/notification-email";

type Row = Record<string, unknown>;

/**
 * Per-type icon so a quote notification never looks like a booking one at a
 * glance. Falls back to the bell for types written by server paths that don't
 * appear here (lead-lost, verification, …).
 */
const TYPE_ICON: Record<string, IconKey> = {
  quote: "file",
  "quote-declined": "file",
  "quote-accepted": "file",
  review: "star",
  message: "message",
  booking: "calendar",
  claim: "badgeCheck",
  lead: "megaphone",
  "lead-lost": "megaphone",
  "lead-unlocked": "megaphone",
};

const TYPE_LABEL: Record<string, string> = {
  quote: "Quote",
  "quote-declined": "Quote",
  "quote-accepted": "Quote won",
  review: "Review",
  message: "Message",
  booking: "Booking",
  claim: "Claim",
  lead: "Request",
  "lead-lost": "Request",
  "lead-unlocked": "Request",
};

/**
 * /notifications — the full-screen notification centre.
 *
 * The bell dropdown only ever shows the newest handful; this page is where the
 * list can be READ comfortably, marked read in bulk, deep-link-jumped, and
 * DELETED (single or all at once — firestore.rules only lets the recipient
 * delete their own rows, so "clear" cannot touch anyone else's).
 */
export default function NotificationsClient() {
  const { user, loading } = useAuth();
  const uid = user?.uid ?? "";
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Opt-in gate for the courtesy email: the row's Email button does nothing
  // until the reader says they want mail. Kept for this visit only.
  const [emailForMe, setEmailForMe] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const nots = useRealtime<Row>(
    (cb, onErr) => (uid ? subscribeNotifications(uid, cb as never, onErr) : () => {}),
    [],
    [uid],
  );

  const all = nots.rows;
  const unread = all.filter((n) => !n.read);
  const visible = filter === "unread" ? unread : all;
  const ids = all.map((n) => String(n.id ?? ""));

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That didn't work — try again.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <div className="inline-block w-8 h-8 border-4 border-[#7ac142] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-[#1d3a5f]/60 mt-3">Loading your notifications…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
        <span className="icon-3d icon-3d-sm mx-auto" aria-hidden="true">
          <KIcon name="bell" size={26} />
        </span>
        <h1 className="text-3xl font-black text-[#10243e]">Notifications</h1>
        <p className="text-sm text-[#1d3a5f]/70 max-w-lg mx-auto">
          New leads, quotes, replies, bookings and messages land here the moment they happen. Sign in to see
          yours — browsing {SITE_SHORT} stays free without an account.
        </p>
        <SignInInline />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div className="min-w-0">
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#558c2b]">
            Notification centre {nots.live && <span className="chip-live ml-1">Live</span>}
          </p>
          <h1 className="text-2xl sm:text-3xl font-black text-[#10243e]">Your notifications</h1>
          <p className="text-sm text-[#1d3a5f]/70 mt-1">
            New leads and updates across your requests, quotes, reviews, bookings and messages.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setFilter((f) => (f === "all" ? "unread" : "all"))}
            className="text-xs font-bold rounded-full border-2 border-[#10243e] text-[#10243e] px-3.5 py-1.5 hover:bg-[#10243e] hover:text-white transition"
            aria-pressed={filter === "unread"}
          >
            {filter === "all" ? `Unread only (${unread.length})` : "Show all"}
          </button>
          <button
            disabled={busy || unread.length === 0}
            onClick={() => run(() => markAllNotificationsRead(unread.map((n) => String(n.id ?? ""))))}
            className="text-xs font-bold rounded-full border-2 border-[#e7eef5] text-[#10243e] px-3.5 py-1.5 hover:bg-[#f2f6fa] transition disabled:opacity-50"
          >
            Mark all read
          </button>
          <button
            disabled={busy || all.length === 0}
            onClick={() => {
              if (confirm(`Delete all ${all.length} notification${all.length === 1 ? "" : "s"}? This can't be undone.`)) {
                run(() => clearNotifications(ids));
              }
            }}
            className="text-xs font-bold rounded-full border-2 border-red-200 text-red-700 px-3.5 py-1.5 hover:bg-red-50 transition disabled:opacity-50"
          >
            Clear all
          </button>
          <label className="flex items-center gap-2 text-xs font-bold text-[#1d3a5f]/70 cursor-pointer">
            <input
              type="checkbox"
              checked={emailForMe}
              onChange={(e) => setEmailForMe(e.target.checked)}
              aria-label="Email me about notifications"
              className="rounded border-[#1d3a5f] text-[#10243e] focus:ring-[#7ac142]"
            />
            Email me
          </label>
        </div>
      </header>

      {err && (
        <p className="mb-3 text-sm font-bold text-red-700 bg-red-50 rounded-2xl px-4 py-3">{err}</p>
      )}
      {!err && nots.error && (
        <p className="mb-3 text-sm font-bold text-[#a36508] bg-[#fff4d6] rounded-2xl px-4 py-3">
          {listenerHint(nots.error as RealtimeError)}
        </p>
      )}

      {visible.length === 0 ? (
        <div className="hippo-card p-10 text-center">
          <span className="icon-3d icon-3d-sm mx-auto" aria-hidden="true">
            <KIcon name="bell" size={24} />
          </span>
          <h2 className="text-lg font-black text-[#10243e] mt-3">
            {filter === "unread" ? "You're all caught up" : "Nothing yet"}
          </h2>
          <p className="text-sm text-[#1d3a5f]/70 mt-1 max-w-md mx-auto">
            {filter === "unread"
              ? "Every notification has been read. Switch back to “Show all” to browse the history."
              : "New matched leads, quote replies, review responses, booking updates and messages will land here the moment they happen."}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map((n, i) => {
            const id = String(n.id ?? i);
            const type = String(n.type ?? "");
            const isRead = Boolean(n.read);
            const href = n.href ? String(n.href) : null;
            const bizId = n.businessId ? String(n.businessId) : null;
            const when = timeAgo(n.createdAt);
            return (
              <li
                key={id}
                className={`hippo-card p-4 anim-rise ${isRead ? "" : "border-2 border-[#7ac142]"}`}
                style={{ "--d": `${Math.min(i, 8) * 45}ms` } as React.CSSProperties}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`shrink-0 w-9 h-9 grid place-items-center rounded-xl ${
                      isRead ? "bg-[#f2f6fa] text-[#1d3a5f]/60" : "bg-[#e8f6d8] text-[#3c6b1d]"
                    }`}
                    aria-hidden="true"
                  >
                    <KIcon name={TYPE_ICON[type] ?? "bell"} size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {TYPE_LABEL[type] && (
                        <span className="text-[10px] font-black uppercase tracking-widest text-[#558c2b] bg-[#e8f6d8] rounded-full px-2 py-0.5">
                          {TYPE_LABEL[type]}
                        </span>
                      )}
                      {!isRead && (
                        <span className="text-[10px] font-black uppercase tracking-widest text-[#a36508] bg-[#fff4d6] rounded-full px-2 py-0.5">
                          New
                        </span>
                      )}
                      {when && <span className="text-[11px] text-[#1d3a5f]/45">{when}</span>}
                    </div>
                    <p className={`text-sm mt-1.5 break-words ${isRead ? "text-[#1d3a5f]/75" : "text-[#10243e] font-semibold"}`}>
                      {String(n.message ?? "")}
                    </p>
                    {(type === "message" || type === "lead" || type === "quote" || type === "quote-declined" || type === "quote-accepted" || type === "lead-lost" || type === "review" || type === "booking" || type === "claim") && (
                      <button
                        type="button"
                        disabled={!emailForMe || isRead || sendingId !== null}
                        title={
                          emailForMe
                            ? "Send the recipient a copy by email"
                            : "Turn on “Email me” above to send a copy"
                        }
                        onClick={() => {
                          // Best-effort: a mail outage must never surface as a UI error.
                          // The route resolves the recipient, whitelists the type and
                          // guards emailedAt, so a retry can't double-send.
                          void (async () => {
                            setSendingId(id);
                            try {
                              const ok = await triggerNotificationEmailAsync(id);
                              if (ok && !isRead) await markNotificationRead(id).catch(() => {});
                            } catch {
                              /* transport failure — the in-app row stays the source of truth */
                            } finally {
                              setSendingId(null);
                            }
                          })();
                        }}
                        className="text-[10px] font-black uppercase tracking-widest text-white bg-[#10243e] hover:bg-[#3c6b1d] rounded px-2 py-0.5 transition disabled:opacity-50"
                        aria-label="Email the recipient a copy of this notification"
                      >
                        {sendingId === id ? "Sending…" : "Email"}
                      </button>
                    )}
                    <div className="flex flex-wrap items-center gap-3 mt-2">
                      {href && (
                        <Link
                          href={href}
                          onClick={() => !isRead && markNotificationRead(id).catch(() => {})}
                          className="text-xs font-bold text-[#558c2b] hover:underline"
                        >
                          Open →
                        </Link>
                      )}
                      {bizId && (
                        <Link href={`/business/${bizId}`} className="text-xs font-bold text-[#558c2b] hover:underline">
                          View listing
                        </Link>
                      )}
                      {!isRead && (
                        <button
                          onClick={() => markNotificationRead(id).catch(() => {})}
                          className="text-xs font-bold text-[#1d3a5f]/70 hover:underline"
                        >
                          Mark read
                        </button>
                      )}
                      <button
                        disabled={busy}
                        onClick={() => run(() => deleteNotification(id))}
                        className="ml-auto text-xs font-bold text-red-700 hover:underline inline-flex items-center gap-1 disabled:opacity-50"
                        aria-label="Delete this notification"
                      >
                        <KIcon name="close" size={12} className="inline shrink-0" /> Delete
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

