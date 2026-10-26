/**
 * Messaging — pure helpers for buyer ↔ seller conversations (§18).
 *
 * No Firebase imports, so the id scheme, validation and formatting are shared by
 * the thread UI, the repo layer and (via the same field names) firestore.rules.
 *
 * A conversation id is DETERMINISTIC: the two uids sorted, scoped to a business
 * when the chat started from a listing. That guarantees one thread per pair per
 * business instead of duplicates appearing as the UI navigates around.
 */

export type MessageKind = "text" | "quote" | "job";
export type ConversationStatus = "open" | "blocked";

export type Conversation = {
  id: string;
  participants: string[];
  names?: Record<string, string>;
  businessId?: string | null;
  businessName?: string | null;
  leadId?: string | null;
  lastMessage?: string | null;
  lastSenderUid?: string | null;
  lastAt?: unknown;
  status: ConversationStatus;
  createdBy: string;
  createdAt?: unknown;
};

export type ChatMessage = {
  id: string;
  senderUid: string;
  body: string;
  kind: MessageKind;
  attachments: string[];
  createdAt?: unknown;
};

export const MESSAGE_MAX = 2000;

/** Deterministic thread id — same pair + same business always resolves to one doc. */
export function conversationId(a: string, b: string, scoped?: string | null): string {
  const pair = [a, b].sort();
  const tail = scoped ? scoped.replace(/[^\w-]/g, "").slice(0, 60) : "direct";
  return `${pair[0]}__${pair[1]}__${tail}`;
}

/** The person on the other side of this thread (never the caller). */
export function otherParticipant(c: Conversation, uid: string): string {
  return c.participants.find((p) => p !== uid) ?? "";
}

/** Human validation — returns null when the message is fine. */
export function validateMessage(body: unknown): string | null {
  const text = String(body ?? "").trim();
  if (text.length === 0) return "Type a message first.";
  if (text.length > MESSAGE_MAX) return `Messages are limited to ${MESSAGE_MAX} characters.`;
  return null;
}

/** Trim + clamp a body to exactly what gets stored. */
export function cleanBody(v: unknown): string {
  return String(v ?? "").trim().slice(0, MESSAGE_MAX);
}

/** One-line preview for the conversation list. */
export function previewText(v: unknown, max = 70): string {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

/** Relative "when" for message bubbles and the thread list. */
export function whenLabel(value: unknown, now: Date = new Date()): string {
  const ms = toMillis(value);
  if (!ms) return "";
  const diff = now.getTime() - ms;
  if (diff < 60_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(ms).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
}

/** Firestore Timestamp | Date | ISO string | epoch → epoch millis (0 when unknown). */
export function toMillis(value: unknown): number {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const t = new Date(value).getTime();
    return Number.isFinite(t) ? t : 0;
  }
  const maybe = value as { toMillis?: () => number; seconds?: number };
  if (typeof maybe.toMillis === "function") {
    try { return maybe.toMillis(); } catch { return 0; }
  }
  if (typeof maybe.seconds === "number") return maybe.seconds * 1000;
  return 0;
}

/** Newest-first ordering for threads / oldest-first for messages. */
export function byNewest(a: { lastAt?: unknown }, b: { lastAt?: unknown }): number {
  return toMillis(b.lastAt) - toMillis(a.lastAt);
}

export function byOldest(a: { createdAt?: unknown }, b: { createdAt?: unknown }): number {
  return toMillis(a.createdAt) - toMillis(b.createdAt);
}
