"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { useRealtime, subscribeNotifications } from "@/lib/realtime";
import { markNotificationRead, deleteNotification } from "@/lib/repo";
import { timeAgo } from "@/lib/utils";
import { KIcon } from "@/lib/icons";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";

type Row = Record<string, unknown>;

/**
 * Realtime notification bell - leads, quotes, messages, reviews, subscriptions.
 * A notification with an `href` deep-links straight to the screen that needs
 * action (compare-quotes, /messages), instead of dumping everyone on /dashboard.
 */
export default function NotificationsBell() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  useBodyScrollLock(open);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  const uid = user?.uid ?? null;
  const nots = useRealtime<Row>((cb, onErr) => (uid ? subscribeNotifications(uid, cb as never, onErr) : () => {}), [], [uid]);
  if (!uid) return null;
  const unread = nots.rows.filter((n) => !n.read).length;

  return (
    <span className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        className="relative w-9 h-9 grid place-items-center rounded-xl bg-[#f2f6fa] hover:bg-[#e7eef5] text-[#10243e] transition"
      >
        <KIcon name="bell" size={17} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 grid place-items-center min-w-[18px] h-[18px] rounded-full bg-[#e5484d] text-white text-[10px] font-black px-1">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default bg-[#0b1e33]/45 backdrop-blur-[2px] sm:hidden"
            onClick={() => setOpen(false)}
            aria-label="Close notifications"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="notification-panel-title"
            className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+6rem)] z-50 max-h-[calc(100dvh-env(safe-area-inset-top)-7rem)] overflow-y-auto rounded-2xl hippo-card p-3 sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2 sm:max-h-96 sm:w-80"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <p id="notification-panel-title" className="text-sm font-black text-[#10243e]">Notifications {nots.live && <span className="chip-live ml-1">Live</span>}</p>
              <Link href="/notifications" onClick={() => setOpen(false)} className="shrink-0 text-[11px] font-bold text-[#558c2b] hover:underline">
                See all →
              </Link>
            </div>
            {nots.rows.length === 0 && (
              <p className="text-xs text-[#1d3a5f]/60">Nothing yet - lead replies, quotes, messages, reviews and verification updates land here.</p>
            )}
            <ul className="space-y-1.5">
              {nots.rows.map((n, i) => (
                <li key={String(n.id ?? i)} className={`rounded-xl border p-2.5 text-xs ${n.read ? "border-[#e7eef5] text-[#1d3a5f]/70" : "border-[#7ac142] bg-[#f3f9ec] text-[#10243e] font-semibold"}`}>
                  <div className="flex items-start gap-2">
                    <span className="min-w-0 flex-1 break-words">{String(n.message ?? "")}</span>
                    <button
                      onClick={() => deleteNotification(String(n.id)).catch(() => {})}
                      className="shrink-0 text-[10px] font-bold text-red-700/70 hover:text-red-700"
                      aria-label="Delete this notification"
                    >
                      ✕
                    </button>
                  </div>
                  <span className="mt-1 flex flex-wrap items-center gap-2">
                    {timeAgo(n.createdAt) && <span className="text-[10px] text-[#1d3a5f]/45">{timeAgo(n.createdAt)}</span>}
                    {!n.read && (
                      <button onClick={() => markNotificationRead(String(n.id))} className="text-[10px] font-bold text-[#558c2b] hover:underline">
                        Mark read
                      </button>
                    )}
                    {n.href ? (
                      <Link href={String(n.href)} onClick={() => markNotificationRead(String(n.id))} className="text-[10px] font-bold text-[#558c2b] hover:underline">
                        Open
                      </Link>
                    ) : null}
                    {!!n.businessId && (
                      <Link href={`/business/${String(n.businessId)}`} className="text-[10px] font-bold text-[#558c2b] hover:underline">
                        View listing
                      </Link>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </span>
  );
}