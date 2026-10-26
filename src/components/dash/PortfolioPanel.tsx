"use client";
import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  addPortfolioItem,
  deletePortfolioItem,
  updatePortfolioItem,
} from "@/lib/repo";
import {
  PORTFOLIO_LIMITS,
  cleanPortfolioDraft,
  portfolioCapacity,
  validatePortfolioDraft,
  type PortfolioDraft,
  type PortfolioItem,
} from "@/lib/portfolio";
import { limitsFor } from "@/lib/plans";
import { KIcon } from "@/lib/icons";

type Row = Record<string, unknown>;

const inputCls =
  "mt-1 w-full rounded-2xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-4 py-2.5 text-sm font-normal bg-[#f2f6fa]/40 outline-none";

function rowToItem(row: Row): PortfolioItem {
  const list = (v: unknown) => (Array.isArray(v) ? (v as unknown[]).map(String) : []);
  return {
    id: String(row.id ?? ""),
    ownerUid: String(row.ownerUid ?? ""),
    businessId: String(row.businessId ?? ""),
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    completedAt: String(row.completedAt ?? ""),
    beforeUrl: String(row.beforeUrl ?? ""),
    afterUrl: String(row.afterUrl ?? ""),
    imageUrl: String(row.imageUrl ?? ""),
    tags: list(row.tags),
  };
}

const EMPTY: PortfolioDraft = {
  title: "",
  description: "",
  completedAt: "",
  beforeUrl: "",
  afterUrl: "",
  imageUrl: "",
  tags: [],
};

/**
 * Seller portfolio manager (§9 / §10). Create + edit + delete, with a live
 * quota bar ("7 of 10 used") resolved from the seller's PLAN — not from trust.
 * The server route re-checks that quota with the Admin SDK before it writes.
 */
export default function PortfolioPanel({
  items,
  listings,
  plan,
  onChanged,
}: {
  items: Row[];
  listings: Row[];
  plan: string;
  onChanged?: () => void;
}) {
  const parsed = useMemo(() => items.map(rowToItem), [items]);
  const cap = portfolioCapacity(limitsFor(plan).portfolio, parsed.length);

  const [listingId, setListingId] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<PortfolioDraft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  function startAdd() {
    setError(null);
    setNote(null);
    setEditing(null);
    setForm(EMPTY);
    setFormOpen(true);
    setListingId(listings.length === 1 ? String(listings[0]?.id ?? "") : "");
  }

  function startEdit(item: PortfolioItem) {
    setError(null);
    setNote(null);
    setEditing(item.id);
    setFormOpen(true);
    setForm({
      title: item.title,
      description: item.description,
      completedAt: item.completedAt,
      beforeUrl: item.beforeUrl,
      afterUrl: item.afterUrl,
      imageUrl: item.imageUrl,
      tags: item.tags,
    });
  }

  const set = (key: keyof PortfolioDraft, value: string) =>
    setForm((f) => {
      if (key === "tags") return { ...f, tags: value.split(/[\n,;]+/) };
      return { ...f, [key]: value };
    });

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const targetListing = editing
      ? parsed.find((p) => p.id === editing)?.businessId ?? ""
      : listingId;
    if (!targetListing) {
      setError("Choose the listing this work belongs to first.");
      return;
    }
    const issues = validatePortfolioDraft(form);
    if (issues.length > 0) { setError(issues[0]); return; }
    setBusy(true);
    setError(null);
    try {
      const clean = cleanPortfolioDraft(form) as PortfolioDraft;
      if (editing) {
        await updatePortfolioItem(editing, clean);
        setNote("Portfolio item updated.");
      } else {
        await addPortfolioItem({ businessId: targetListing, ...clean });
        setNote("Work sample added — it now shows on your public profile.");
      }
      setEditing(null);
      setForm(EMPTY);
      setFormOpen(false);
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that item.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string, title: string) {
    if (!confirm(`Delete “${title}” from your portfolio? This also removes it from your public profile.`)) return;
    setError(null);
    try {
      await deletePortfolioItem(id);
      if (editing === id) { setEditing(null); setForm(EMPTY); }
      setNote("Portfolio item deleted.");
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete that item.");
    }
  }

  return (
    <div className="space-y-4">
      {/* Quota bar — mirrors the server's check so the UI never over-promises. */}
      <div className="rounded-xl bg-[#f2f6fa] p-3">
        <div className="flex items-center gap-2 text-xs font-extrabold text-[#10243e]">
          <KIcon name="camera" size={14} />
          {cap.limit === null ? (
            <span>Unlimited portfolio on the Business plan ({cap.used} used)</span>
          ) : (
            <span>
              {cap.used} of {cap.limit} portfolio items used
              {cap.full ? " — upgrade for more space" : ` · ${cap.remaining} left`}
            </span>
          )}
        </div>
        {cap.limit !== null && (
          <div className="mt-2 h-2 rounded-full bg-white overflow-hidden" role="progressbar" aria-valuenow={cap.used} aria-valuemin={0} aria-valuemax={cap.limit}>
            <div className={`h-full rounded-full transition-all ${cap.full ? "bg-[#e5484d]" : "bg-[#7ac142]"}`} style={{ width: `${Math.min(100, (cap.used / Math.max(1, cap.limit)) * 100)}%` }} />
          </div>
        )}
      </div>

      {error && <p className="text-sm font-bold text-red-700 bg-red-50 rounded-2xl px-4 py-3">{error}</p>}
      {note && <p className="text-sm font-bold text-[#3c6b1d] bg-[#e8f6d8] rounded-2xl px-4 py-3">{note}</p>}

      {cap.full && editing === null ? (
        <div className="rounded-xl border-2 border-[#e7eef5] p-4 text-sm">
          <p className="font-bold text-[#10243e]">You&apos;ve used every portfolio slot on this plan.</p>
          <p className="text-xs text-[#1d3a5f]/70 mt-1">
            Edit or delete an item below, or upgrade: Professional holds 50 items, Business is unlimited.
          </p>
          <Link href="/advertise" className="btn-sun text-sm mt-3 inline-flex">See plans →</Link>
        </div>
      ) : (
        <button
          type="button"
          onClick={startAdd}
          className="w-full rounded-2xl border-2 border-dashed border-[#d6e1ec] hover:border-[#7ac142] px-4 py-3 text-sm font-extrabold text-[#558c2b] transition"
        >
          + Add a work sample
        </button>
      )}

      {formOpen ? (
        <form onSubmit={save} className="rounded-xl border border-[#e7eef5] p-3 space-y-3">
          <h3 className="text-sm font-black text-[#10243e]">{editing ? "Edit work sample" : "New work sample"}</h3>

          {listings.length > 1 && editing === null && (
            <label className="block text-sm font-bold text-[#10243e]">
              Listing this work belongs to *
              <select value={listingId} onChange={(e) => setListingId(e.target.value)} required className={inputCls}>
                <option value="">Choose a listing…</option>
                {listings.map((l) => (
                  <option key={String(l.id ?? "")} value={String(l.id ?? "")}>{String(l.name ?? "Listing")}</option>
                ))}
              </select>
            </label>
          )}

          <label className="block text-sm font-bold text-[#10243e]">
            Project title *
            <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Geyser swap — Annlin" maxLength={PORTFOLIO_LIMITS.title} className={inputCls} />
          </label>

          <label className="block text-sm font-bold text-[#10243e]">
            What did you do? *
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => set("description", e.target.value.slice(0, PORTFOLIO_LIMITS.description))}
              placeholder="The brief, what you did, and how it turned out."
              className={inputCls}
            />
            <span className="block text-[11px] font-normal text-[#1d3a5f]/60 mt-1">{form.description.length}/{PORTFOLIO_LIMITS.description}</span>
          </label>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block text-sm font-bold text-[#10243e]">
              Completed
              <input
                value={form.completedAt}
                onChange={(e) => set("completedAt", e.target.value)}
                placeholder="e.g. 2026-03"
                maxLength={PORTFOLIO_LIMITS.completedAt}
                className={inputCls}
              />
            </label>
            <label className="block text-sm font-bold text-[#10243e]">
              Tags (comma separated)
              <input
                value={form.tags.join(", ")}
                onChange={(e) => set("tags", e.target.value)}
                placeholder="geyser, copper, annlin"
                className={inputCls}
              />
            </label>
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <label className="block text-sm font-bold text-[#10243e]">
              Main photo link *
              <input
                value={form.imageUrl}
                onChange={(e) => set("imageUrl", e.target.value)}
                placeholder="https://…/finished.jpg"
                inputMode="url"
                className={inputCls}
              />
            </label>
            <label className="block text-sm font-bold text-[#10243e]">
              “Before” photo link
              <input
                value={form.beforeUrl}
                onChange={(e) => set("beforeUrl", e.target.value)}
                placeholder="https://…/before.jpg"
                inputMode="url"
                className={inputCls}
              />
            </label>
            <label className="block text-sm font-bold text-[#10243e]">
              “After” photo link
              <input
                value={form.afterUrl}
                onChange={(e) => set("afterUrl", e.target.value)}
                placeholder="https://…/after.jpg"
                inputMode="url"
                className={inputCls}
              />
            </label>
          </div>
          <p className="text-[11px] text-[#1d3a5f]/60">
            Paste public https:// image links (your Facebook page photo or a free host). An after-shot
            sells better than words — add a before/after pair for transformations.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <button disabled={busy} className="btn-hippo text-sm disabled:opacity-60">
              {busy ? "Saving…" : editing ? "Save changes" : "Add work sample →"}
            </button>
            <button
              type="button"
              onClick={() => { setFormOpen(false); setEditing(null); setForm(EMPTY); setError(null); }}
              className="text-sm font-bold text-[#1d3a5f]/70 hover:underline"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
      {parsed.length === 0 ? (
        <p className="text-sm text-[#1d3a5f]/60">
          Nothing here yet. Add finished jobs with photos — buyers compare your real work here
          before they compare your price anywhere else.
        </p>
      ) : (
        <ul className="space-y-2">
          {parsed.map((item) => (
            <li key={item.id} className="rounded-xl border border-[#e7eef5] p-3 flex flex-wrap items-center gap-2">
              <div className="min-w-0">
                <b className="block text-sm text-[#10243e] truncate">{item.title}</b>
                <span className="text-xs text-[#1d3a5f]/60">{item.completedAt || "Date not set"}</span>
              </div>
              <span className="ml-auto flex gap-2">
                <button type="button" onClick={() => startEdit(item)} className="text-xs font-bold text-[#558c2b] hover:underline">
                  Edit
                </button>
                <button type="button" onClick={() => remove(item.id, item.title)} className="text-xs font-bold text-red-700 hover:underline">
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

    </div>
  );
}
