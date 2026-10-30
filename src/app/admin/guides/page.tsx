"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { useRealtime, subscribeAdminDoc } from "@/lib/realtime";
import { saveGuideArticle } from "@/lib/repo";
import { SignInInline } from "@/components/dash/parts";

const inputCls = "w-full rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-3 py-2.5 text-sm outline-none";

/**
 * Guide editor (Tier 4) — admin writes original local guides straight to
 * Firestore `articles`. Body format: "## Heading", "- bullet", blank line = new paragraph.
 */
export default function GuideEditorPage() {
  const { user } = useAuth();
  const uid = user?.uid ?? "";
  const admin = useRealtime<Record<string, unknown>>((cb, onErr) => (uid ? subscribeAdminDoc(uid, (r) => cb(r ? [r] : []), onErr) : () => {}), [], [uid]);
  const isAdmin = admin.rows.length > 0;

  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [suburb, setSuburb] = useState("Gauteng");
  const [readTime, setReadTime] = useState("6 min");
  const [body, setBody] = useState("## Intro\n\nWrite the guide here.\n\n## Quick comparison\n\n- Pick one\n- Pick two");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (!user || !uid) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="text-3xl font-black text-[#10243e]">Guide editor</h1>
        <p className="text-sm text-[#1d3a5f]/70">Sign in to continue.</p>
        <SignInInline />
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-3">
        <h1 className="text-3xl font-black text-[#10243e]">Admins only</h1>
        <p className="text-sm text-[#1d3a5f]/70">Register as admin via <Link href="/admin/seed" className="font-bold text-[#558c2b] hover:underline">/admin/seed</Link>.</p>
      </div>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null); setErr(null);
    try {
      const saved = await saveGuideArticle({ slug, title, excerpt, suburb, readTime, body });
      setMsg(`Saved <KIcon name="check" size={14} className="inline shrink-0" /> Live at /guides/${saved}`);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not save.");
    } finally { setBusy(false); }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-5">
      <header>
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#558c2b]">Guide editor</p>
        <h1 className="text-2xl sm:text-3xl font-black text-[#10243e]">Write an original local guide</h1>
        <p className="text-xs text-[#1d3a5f]/60 mt-1">
          Body format: <code>## Heading</code> for sections, <code>- item</code> for bullets, blank lines for paragraphs. Phone real businesses — original content only.
        </p>
      </header>

      <form onSubmit={onSubmit} className="hippo-card p-5 space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block text-sm font-bold text-[#10243e]">URL slug
            <input required value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="best-plumbers-gauteng" className={`mt-1 ${inputCls}`} />
          </label>
          <label className="block text-sm font-bold text-[#10243e]">Area label
            <input value={suburb} onChange={(e) => setSuburb(e.target.value)} placeholder="Gauteng" className={`mt-1 ${inputCls}`} />
          </label>
        </div>
        <label className="block text-sm font-bold text-[#10243e]">Title
          <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Best Plumbers in Gauteng (2026)" className={`mt-1 ${inputCls}`} />
        </label>
        <label className="block text-sm font-bold text-[#10243e]">Excerpt (search snippet)
          <input value={excerpt} onChange={(e) => setExcerpt(e.target.value)} placeholder="A practical guide to comparing local service providers…" className={`mt-1 ${inputCls}`} />
        </label>
        <label className="block text-sm font-bold text-[#10243e]">Read time
          <input value={readTime} onChange={(e) => setReadTime(e.target.value)} placeholder="6 min" className={`mt-1 ${inputCls}`} />
        </label>
        <label className="block text-sm font-bold text-[#10243e]">Body
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={14} className={`mt-1 ${inputCls} font-mono text-xs`} />
        </label>
        <button disabled={busy} className="btn-hippo text-sm disabled:opacity-60">{busy ? "Saving…" : "Publish guide "}</button>
        {msg && <p className="text-sm font-bold text-[#3c6b1d] bg-[#e8f6d8] rounded-xl px-3 py-2">{msg}</p>}
        {err && <p className="text-sm font-bold text-red-700 bg-red-50 rounded-xl px-3 py-2">{err}</p>}
      </form>
    </div>
  );
}