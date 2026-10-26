"use client";
import { KIcon } from "@/lib/icons";
import { useState } from "react";
import { subscribeReviews, useRealtime } from "@/lib/realtime";
import { isFirebaseConfigured } from "@/lib/firebase";
import { markReviewHelpful, replyToReview } from "@/lib/repo";
import { useAuth } from "./AuthProvider";
import { Stars } from "./ui";
import { timeAgo } from "@/lib/utils";

type Review = {
  id: string; author: string; rating: number; body: string;
  reply?: string; reviewerUid?: string; helpfulCount?: number; helpfulVoters?: string[];
  /** Firestore Timestamp from the realtime snapshot — drives the "3 days ago" line. */
  createdAt?: unknown;
};

/** Realtime reviews with helpful votes, verified-reviewer badges and owner replies. */
export default function ReviewsLive({
  businessId,
  ownerUid,
  initial,
}: {
  businessId: string;
  ownerUid?: string | null;
  /**
   * Reviews already read on the server. Seeds the first render so the list is in
   * the SSR HTML — without it the delivered HTML said "No reviews yet" for a
   * business that had reviews, until the listener connected after hydration.
   * Realtime still takes over the moment it delivers.
   */
  initial?: Review[];
}) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { rows, live, error } = useRealtime<Review>(
    (cb, onErr) => subscribeReviews(businessId, cb, onErr),
    initial ?? [],
    [businessId],
  );
  if (!isFirebaseConfigured) return null;
  return (
    <div className="hippo-card p-5">
      <h2 className="font-black text-[#10243e]">
        Reviews {live && <span className="chip-live ml-1">Live</span>}
        {error && <span className="ml-2 text-xs font-bold text-[#a36508]">{error.message}</span>}
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-[#1d3a5f]/60 mt-2">No reviews yet — be the first below.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {rows.map((r) => {
            const verified = Boolean(r.reviewerUid);
            const helpful = Number(r.helpfulCount ?? 0);
            const voted = Boolean(uid && (r.helpfulVoters as string[] | undefined)?.includes(uid));
            const isReviewersOwn = Boolean(uid && r.reviewerUid === uid);
            const isListingOwner = Boolean(uid && ownerUid && ownerUid === uid);
            // Realtime: re-evaluated on every snapshot, so the age updates as the
            // page stays open. Null when the row carries no usable timestamp.
            const when = timeAgo(r.createdAt);
            return (
              <li key={r.id} className="rounded-xl bg-[#f8fafc] border p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Stars value={r.rating} />
                  <span className="text-xs font-bold text-[#10243e]">{r.author || "Anonymous"}</span>
                  {verified && <span className="text-[10px] font-black bg-[#e8f6d8] text-[#3c6b1d] rounded-full px-2 py-0.5"><KIcon name="check" size={14} className="inline shrink-0" /> Verified reviewer</span>}
                  {when && (
                    <span className="ml-auto flex items-center gap-1 text-[11px] font-semibold text-[#1d3a5f]/55">
                      <KIcon name="clock" size={12} className="inline shrink-0" /> {when}
                    </span>
                  )}
                </div>
                <p className="text-sm mt-1 text-[#1d3a5f]/85">{r.body}</p>
                {r.reply && (
                  <div className="mt-2 rounded-xl bg-white p-3 border-l-4 border-[#7ac142]">
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#558c2b]">Reply from the business</p>
                    <p className="text-sm mt-1 text-[#10243e]">{r.reply}</p>
                  </div>
                )}
                <div className="flex items-center gap-3 mt-2">
                  {!isReviewersOwn && (
                    <button
                      onClick={async () => { try { await markReviewHelpful(r.id); } catch { /* sign in to vote */ } }}
                      disabled={!uid || voted}
                      className={`text-xs font-bold rounded-full px-3 py-1 transition border ${voted ? "bg-[#e8f6d8] text-[#3c6b1d] border-[#7ac142]" : "border-[#d6e1ec] text-[#1d3a5f] hover:border-[#7ac142]"} disabled:opacity-60`}
                      title={uid ? "Helpful?" : "Sign in to vote"}
                    >
                      <KIcon name="check" size={14} className="inline shrink-0" /> Helpful ({helpful}){voted ? " ✓" : ""}
                    </button>
                  )}
                  {!r.reply && isListingOwner && <ReplyBox reviewId={r.id} />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {!user && <p className="text-xs text-[#1d3a5f]/50 mt-3">Sign in to vote helpful reviews and get notified of replies.</p>}
    </div>
  );
}

function ReplyBox({ reviewId }: { reviewId: string }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-col sm:flex-row gap-2 flex-1">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Reply as the business owner…"
        className="flex-1 rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-3 py-1.5 text-xs outline-none"
      />
      <button
        disabled={busy || text.trim().length < 2}
        onClick={async () => {
          setBusy(true);
          try { await replyToReview(reviewId, text); setMsg("Posted ✓"); setText(""); }
          catch (e) { setMsg(e instanceof Error ? e.message : "Failed"); }
          finally { setBusy(false); }
        }}
        className="btn-navy !py-1.5 !px-4 text-xs disabled:opacity-50"
      >
        Reply
      </button>
      {msg && <span className="text-xs font-bold text-[#3c6b1d] self-center">{msg}</span>}
    </div>
  );
}
