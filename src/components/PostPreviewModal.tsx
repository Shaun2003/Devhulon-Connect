"use client";
/* eslint-disable @next/next/no-img-element -- post images use seller-supplied public URLs. */
import { useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { KIcon, type IconKey } from "@/lib/icons";
import SaveButton, { type SaveType } from "@/components/SaveButton";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";

type Row = Record<string, unknown>;

export type PreviewKind = "job" | "event" | "deal" | "place" | "guide";

const META: Record<PreviewKind, { icon: IconKey; label: string; save: SaveType }> = {
  job: { icon: "briefcase", label: "Job", save: "job" },
  event: { icon: "calendar", label: "Event", save: "event" },
  deal: { icon: "tag", label: "Deal", save: "deal" },
  place: { icon: "mapPin", label: "Place", save: "place" },
  guide: { icon: "file", label: "Guide", save: "guide" },
};

/**
 * Buyer-side preview modal for a seller's post.
 *
 * Feed cards are dense one-liners; this opens the full story in place — hero
 * image, badges, every field the post carries, save control and the relevant
 * CTA — without a page load, so a buyer can skim five posts without leaving the
 * feed. Closes on backdrop click, ✕, and Escape (scroll-locked while open so
 * the feed behind doesn't move, especially on iOS).
 */
export default function PostPreviewModal({
  post,
  kind,
  onClose,
}: {
  post: Row | null;
  kind: PreviewKind;
  onClose: () => void;
}) {
  useBodyScrollLock(Boolean(post));

  useEffect(() => {
    if (!post) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [post, onClose]);

  if (!post || typeof document === "undefined") return null;

  const meta = META[kind];
  const title = String(post.title ?? "");
  const id = String(post.id ?? "");
  const bodyText = String(kind === "guide" ? post.body ?? "" : post.detail ?? "");
  const imageUrl = kind === "place" ? String(post.imageUrl ?? "") : "";
  const pending = String(post.status ?? "live") === "pending";
  const featured = Boolean(post.featured);

  const rows: { icon: IconKey; text: string }[] =
    kind === "job"
      ? [
          ...(post.company ? [{ icon: "building" as IconKey, text: String(post.company) }] : []),
          ...(post.suburb ? [{ icon: "mapPin" as IconKey, text: String(post.suburb) }] : []),
          ...(post.type ? [{ icon: "briefcase" as IconKey, text: String(post.type) }] : []),
          ...(post.pay ? [{ icon: "tag" as IconKey, text: String(post.pay) }] : []),
        ]
      : kind === "event"
        ? [
            ...(post.venue ? [{ icon: "mapPin" as IconKey, text: String(post.venue) }] : []),
            ...(post.suburb ? [{ icon: "mapPin" as IconKey, text: String(post.suburb) }] : []),
            ...(post.date ? [{ icon: "clock" as IconKey, text: String(post.date) }] : []),
            ...(post.fee ? [{ icon: "ticket" as IconKey, text: String(post.fee) }] : []),
          ]
        : kind === "deal"
            ? [
            ...(post.business ? [{ icon: "building" as IconKey, text: String(post.business) }] : []),
            ...(post.suburb ? [{ icon: "mapPin" as IconKey, text: String(post.suburb) }] : []),
            ...(post.validUntil ? [{ icon: "clock" as IconKey, text: `Valid until ${String(post.validUntil)}` }] : []),
              ]
            : kind === "place"
              ? [
                  ...(post.kind ? [{ icon: "mapPin" as IconKey, text: String(post.kind) }] : []),
                  ...(post.suburb ? [{ icon: "mapPin" as IconKey, text: String(post.suburb) }] : []),
                  ...(post.hours ? [{ icon: "clock" as IconKey, text: String(post.hours) }] : []),
                ]
              : [
                  ...(post.suburb ? [{ icon: "mapPin" as IconKey, text: String(post.suburb) }] : []),
                  ...(post.readTime ? [{ icon: "clock" as IconKey, text: String(post.readTime) }] : []),
                ];

  return createPortal(
    <div
      className="fixed inset-0 z-[60] isolate flex items-end justify-center p-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`${meta.label} preview: ${title}`}
    >
      <button
        className="fixed inset-0 z-0 cursor-default bg-[#0b1e33]/60 backdrop-blur-md"
        onClick={onClose}
        aria-label="Close preview"
        tabIndex={-1}
      />
      <div className="relative z-10 max-h-[90dvh] w-full overflow-y-auto rounded-3xl bg-white shadow-2xl sm:max-w-lg anim-rise">
        <div className="relative h-40 sm:h-48 overflow-hidden bg-gradient-to-br from-[#10243e] via-[#1d3a5f] to-[#558c2b]">
          {imageUrl && <img src={imageUrl} alt={`${title} photo`} className="absolute inset-0 h-full w-full object-cover" />}
          {!imageUrl && (
            <div aria-hidden="true" className="absolute inset-0 grid place-items-center text-white/15">
              <KIcon name={meta.icon} size={112} strokeWidth={1.1} />
            </div>
          )}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-9 h-9 grid place-items-center rounded-full bg-white/90 text-[#10243e] hover:bg-white transition font-black"
            aria-label="Close preview"
          >
            ✕
          </button>
          <div className="absolute bottom-3 left-4 right-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest bg-white/95 text-[#10243e] rounded-full px-2.5 py-1">
              <KIcon name={meta.icon} size={12} className="inline shrink-0" /> {meta.label}
            </span>
            {featured && (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest bg-[#10243e] text-[#ffc72c] rounded-full px-2.5 py-1">
                <KIcon name="star" size={12} className="inline shrink-0" /> Featured
              </span>
            )}
            {pending && (
              <span className="text-[10px] font-black uppercase tracking-widest bg-[#fff4d6] text-[#a36508] rounded-full px-2.5 py-1">
                Pending review
              </span>
            )}
          </div>
        </div>

        <div className="p-5 sm:p-6 space-y-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-[#10243e] leading-tight break-words">{title}</h2>
            {kind === "guide" && typeof post.excerpt === "string" && post.excerpt && (
              <p className="text-sm font-semibold text-[#1d3a5f]/80 mt-2 break-words">{post.excerpt}</p>
            )}
            {bodyText && (
              <p className="text-sm text-[#1d3a5f]/75 mt-3 whitespace-pre-wrap break-words">
                {bodyText}
              </p>
            )}
          </div>

          {rows.length > 0 && (
            <ul className="space-y-2">
              {rows.map((r, i) => (
                <li key={i} className="flex items-center gap-2.5 text-sm text-[#10243e] bg-[#f2f6fa] rounded-xl px-3.5 py-2.5">
                  <KIcon name={r.icon} size={15} className="inline shrink-0 text-[#558c2b]" />
                  <span className="min-w-0 break-words">{r.text}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-[#e7eef5]">
            <SaveButton type={meta.save} id={id} title={title} suburb={String(post.suburb ?? "")} />
            <Link
              href={kind === "job" ? "/jobs" : kind === "event" ? "/events" : kind === "deal" ? "/deals" : kind === "place" ? "/places" : "/guides"}
              onClick={onClose}
              className="ml-auto btn-hippo text-xs"
            >
              More {meta.label.toLowerCase()}s 
            </Link>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
