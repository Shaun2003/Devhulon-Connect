"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { useRealtime, subscribeMyConversations, subscribeConversation, subscribeMessages } from "@/lib/realtime";
import { ensureConversation, sendMessage, markConversationRead, setConversationStatus, reportConversation } from "@/lib/repo";
import { cleanBody, MESSAGE_MAX, previewText, validateMessage, whenLabel, toMillis } from "@/lib/messages";
import { SignInInline, ErrorNote } from "@/components/dash/parts";
import { KIcon } from "@/lib/icons";
import { SITE_SHORT } from "@/lib/site";

type Row = Record<string, unknown>;

function convLabel(c: Row, uid: string): string {
  const names = (c.names ?? {}) as Record<string, string>;
  const other = ((c.participants ?? []) as string[]).find((p) => p !== uid) ?? "";
  return String(c.businessName ?? names[other] ?? `${SITE_SHORT} conversation`);
}

/**
 * /messages — realtime buyer ↔ seller messaging (§18).
 *
 * Reached from a listing, a quote, or a notification deep link. Threads are
 * participant-only (enforced in firestore.rules), with block + report built in
 * for safety (§38).
 */
export default function MessagesClient({
  initialCid,
  toUid,
  businessId,
  businessName,
}: {
  initialCid?: string;
  toUid?: string;
  businessId?: string;
  businessName?: string;
}) {
  const { user, loading } = useAuth();
  const uid = user?.uid ?? "";
  const [cid, setCid] = useState(initialCid ?? "");
  const [mobileThread, setMobileThread] = useState(Boolean(initialCid));
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const threads = useRealtime<Row>((cb, onErr) => (uid ? subscribeMyConversations(uid, cb as never, onErr) : () => {}), [], [uid]);
  // conv is a SINGLE-DOC listener (emits `null` or one object), so adapt to
  // useRealtime's row-array contract — the raw callback would set `rows` to null
  // and crash `conv.rows[0]` below when the thread doc doesn't exist yet.
  const conv = useRealtime<Row>((cb, onErr) => (cid ? subscribeConversation(cid, (r) => cb(r ? [r] : []), onErr) : () => {}), [], [cid]);
  const msgs = useRealtime<Row>((cb, onErr) => (cid ? subscribeMessages(cid, cb as never, onErr) : () => {}), [], [cid]);

  // Deep entry — /messages?to=<uid>&business=<id> opens or creates that thread.
  useEffect(() => {
    if (!uid || !toUid || cid) return;
    let alive = true;
    ensureConversation({ otherUid: toUid, businessId: businessId ?? null, businessName: businessName ?? null })
      .then((id) => { if (alive) { setCid(id); setMobileThread(true); } })
      .catch((e) => { if (alive) setErr(e instanceof Error ? e.message : "Could not open that conversation."); });
    return () => { alive = false; };
  }, [uid, toUid, cid, businessId, businessName]);

  // Opening/reading a thread marks it read for the caller.
  useEffect(() => {
    if (cid && msgs.rows.length > 0) void markConversationRead(cid);
  }, [cid, msgs.rows.length]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [msgs.rows.length, cid]);

  const active = conv.rows[0] as Row | undefined;
  const blocked = String(active?.status ?? "open") === "blocked";
  const canUnblock = !active?.blockedBy || String(active.blockedBy) === uid;

  async function send() {
    const problem = validateMessage(draft);
    if (problem) { setErr(problem); return; }
    if (!cid) return;
    setBusy(true);
    setErr(null);
    try {
      const result = await sendMessage(cid, cleanBody(draft));
      setDraft("");
      setNote(result.messagesRemaining !== null && result.messagesRemaining <= 5
        ? `${result.messagesRemaining} Starter seller messages left this month.`
        : null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Message didn't send — check your connection.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleBlock() {
    if (!cid) return;
    const next = blocked ? "open" : "blocked";
    if (next === "blocked" && !confirm("Block this conversation? Neither side can send messages until you unblock it.")) return;
    try {
      await setConversationStatus(cid, next);
      setNote(next === "blocked" ? "Conversation blocked." : "Conversation unblocked.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not update the conversation.");
    }
  }

  async function report() {
    if (!cid) return;
    const reason = prompt("What's wrong with this conversation? (sent to our moderators)");
    if (!reason) return;
    try {
      await reportConversation(cid, reason);
      setNote("Thanks — our moderators will review this conversation.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not send the report.");
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <div className="inline-block w-8 h-8 border-4 border-[#7ac142] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-[#1d3a5f]/60 mt-3">Loading your messages…</p>
      </div>
    );
  }

  if (!user || !uid) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
        <span className="icon-3d icon-3d-sm mx-auto" aria-hidden="true"><KIcon name="message" size={26} /></span>
        <h1 className="text-3xl font-black text-[#10243e]">Messages</h1>
        <p className="text-sm text-[#1d3a5f]/70 max-w-lg mx-auto">
          Chat to a business about a quote, a date or a detail. Sign in to see your conversations —
          browsing {SITE_SHORT} stays free without an account.
        </p>
        <SignInInline />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <header className="mb-4">
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#558c2b]">Messages</p>
        <h1 className="text-2xl sm:text-3xl font-black text-[#10243e]">Your conversations</h1>
        <p className="text-sm text-[#1d3a5f]/70 mt-1 max-w-2xl">
          One thread per business, so nothing gets lost. Messages are private to you and the business you
          are talking to.
        </p>
      </header>

      {err && <p className="mb-3 text-sm font-bold text-red-700 bg-red-50 rounded-2xl px-4 py-3">{err}</p>}
      {note && <p className="mb-3 text-sm font-bold text-[#3c6b1d] bg-[#e8f6d8] rounded-2xl px-4 py-3">{note}</p>}
      {/* Only render the wrapper when there is actually an error — an empty
          `mb-3` div otherwise leaves a phantom gap above the inbox. */}
      {(threads.error ?? conv.error ?? msgs.error) && (
        <div className="mb-3"><ErrorNote error={threads.error ?? conv.error ?? msgs.error} /></div>
      )}

      <div className="grid md:grid-cols-[20rem_1fr] gap-4 items-start">
        <aside className={`hippo-card p-2 ${mobileThread ? "hidden md:block" : ""}`}>
          {threads.rows.length === 0 ? (
            <div className="p-4 text-center">
              <span className="icon-3d icon-3d-sm mx-auto" aria-hidden="true"><KIcon name="message" size={20} /></span>
              <p className="text-sm font-bold text-[#10243e] mt-2">No conversations yet</p>
              <p className="text-xs text-[#1d3a5f]/60 mt-1">
                Open a business profile or a quote and tap Message — the thread lands here.
              </p>
              <Link href="/services" className="btn-hippo text-xs mt-3">Find a pro →</Link>
            </div>
          ) : (
            <ul className="space-y-1">
              {threads.rows.map((t) => {
                const id = String(t.id ?? "");
                const readAt = (t.readAt ?? {}) as Record<string, unknown>;
                const unread =
                  String(t.lastSenderUid ?? "") !== uid &&
                  Boolean(t.lastAt) &&
                  toMillis(readAt[uid]) < toMillis(t.lastAt);
                return (
                  <li key={id}>
                    <button
                      onClick={() => { setCid(id); setMobileThread(true); setNote(null); }}
                      className={`w-full text-left rounded-xl p-3 transition border ${
                        id === cid ? "border-[#7ac142] bg-[#f3f9ec]" : "border-transparent hover:bg-[#f2f6fa]"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        {/* min-w-0 is REQUIRED: `truncate` on a flex child only
                            works once the child is allowed to shrink. Without it a
                            long business name forces the row wider than the phone
                            viewport and the unread dot is pushed off-screen. */}
                        <b className="text-sm text-[#10243e] truncate min-w-0">{convLabel(t, uid)}</b>
                        {unread && <span className="ml-auto w-2 h-2 rounded-full bg-[#e5484d] shrink-0" aria-label="Unread" />}
                      </span>
                      <span className="block text-xs text-[#1d3a5f]/60 truncate mt-0.5">
                        {t.lastMessage ? previewText(t.lastMessage, 46) : "No messages yet"}
                      </span>
                      <span className="block text-[10px] text-[#1d3a5f]/45 mt-0.5">{whenLabel(t.lastAt)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <section className={`hippo-card overflow-hidden ${mobileThread ? "" : "hidden md:block"}`}>
          {!cid ? (
            <div className="p-8 text-center">
              <span className="icon-3d icon-3d-sm mx-auto" aria-hidden="true"><KIcon name="message" size={24} /></span>
              <h2 className="text-lg font-black text-[#10243e] mt-3">Pick a conversation</h2>
              <p className="text-sm text-[#1d3a5f]/70 mt-1">
                Or open a business profile and tap Message to start a new thread about a job.
              </p>
            </div>
          ) : (
            <>
              <header className="flex flex-wrap items-center gap-x-3 gap-y-2 p-4 border-b border-[#e7eef5]">
                <button onClick={() => setMobileThread(false)} className="md:hidden text-xs font-bold text-[#558c2b]">← Inbox</button>
                <div className="min-w-0">
                  <b className="block text-sm text-[#10243e] truncate">{active ? convLabel(active, uid) : "Conversation"}</b>
                  <span className="text-[11px] text-[#1d3a5f]/60">
                    {blocked ? "Blocked" : "Private between you and this business"}
                  </span>
                </div>
                {active?.businessId ? (
                  <Link href={`/business/${String(active.businessId)}`} className="ml-auto text-xs font-bold text-[#558c2b] hover:underline">
                    View profile
                  </Link>
                ) : null}
                <button onClick={toggleBlock} className="text-xs font-bold text-[#10243e] hover:underline">
                  {blocked ? (canUnblock ? "Unblock" : "Blocked") : "Block"}
                </button>
                <button onClick={report} className="text-xs font-bold text-red-700 hover:underline inline-flex items-center gap-1">
                  <KIcon name="flag" size={12} className="inline shrink-0" /> Report
                </button>
              </header>

              <div className="p-4 space-y-3 max-h-[26rem] overflow-y-auto bg-[#f8fafc]">
                {msgs.rows.length === 0 ? (
                  <p className="text-sm text-[#1d3a5f]/60 text-center py-8">
                    No messages yet — say hello and ask what you need to know about the job.
                  </p>
                ) : (
                  msgs.rows.map((m) => {
                    const mine = String(m.senderUid ?? "") === uid;
                    const files = Array.isArray(m.attachments) ? (m.attachments as unknown[]).map(String) : [];
                    const kind = String(m.kind ?? "text");
                    return (
                      <div key={String(m.id)} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${mine ? "bg-[#10243e] text-white" : "bg-white border border-[#e7eef5] text-[#10243e]"}`}>
                          {kind !== "text" && (
                            <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase rounded-full px-2 py-0.5 mb-1 ${mine ? "bg-white/15 text-[#ffc72c]" : "bg-[#e8f6d8] text-[#3c6b1d]"}`}>
                              <KIcon name={kind === "quote" ? "file" : "briefcase"} size={10} /> {kind}
                            </span>
                          )}
                          <p className="text-sm whitespace-pre-wrap break-words">{String(m.body ?? "")}</p>
                          {files.length > 0 && (
                            <div className="mt-1.5 space-y-0.5">
                              {files.map((f) => (
                                <a key={f} href={f} target="_blank" rel="noopener noreferrer" className={`block text-xs font-bold truncate ${mine ? "text-[#ffc72c]" : "text-[#558c2b]"} hover:underline`}>
                                  {f}
                                </a>
                              ))}
                            </div>
                          )}
                          <span className={`block text-[10px] mt-1 ${mine ? "text-white/55" : "text-[#1d3a5f]/45"}`}>
                            {whenLabel(m.createdAt)}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={endRef} />
              </div>

              {blocked ? (
                <p className="p-4 text-sm font-bold text-[#a36508] bg-[#fff4d6]">
                  This conversation is blocked.{" "}
                  {canUnblock ? "Unblock it above to keep chatting." : "The other person has to unblock it."}
                </p>
              ) : (
                <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="p-3 border-t border-[#e7eef5]">
                  <label className="sr-only" htmlFor="msg-draft">Your message</label>
                  <textarea
                    id="msg-draft"
                    rows={2}
                    value={draft}
                    maxLength={MESSAGE_MAX}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
                    }}
                    placeholder="Write a message… (Enter sends, Shift+Enter adds a line)"
                    className="w-full rounded-2xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-4 py-3 text-sm bg-[#f2f6fa]/40 outline-none"
                  />
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[11px] text-[#1d3a5f]/50">{draft.length}/{MESSAGE_MAX}</span>
                    <button disabled={busy} className="btn-hippo text-sm ml-auto !py-2.5 disabled:opacity-60 inline-flex items-center gap-1.5">
                      <KIcon name="send" size={14} className="inline shrink-0" /> {busy ? "Sending…" : "Send"}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </section>
      </div>

    </div>
  );
}
