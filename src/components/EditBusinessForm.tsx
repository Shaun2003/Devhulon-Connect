"use client";
/* eslint-disable @next/next/no-img-element -- gallery photos are arbitrary
   user-supplied remote URLs; next/image needs a remotePatterns whitelist per
   host and cannot fall back to IMG_FALLBACK on error like this does. */
import { KIcon } from "@/lib/icons";
import { useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { useRealtime, subscribeBusinessById, subscribeMyPlan, subscribeMyTeamMemberships, listenerHint } from "@/lib/realtime";
import {
  updateBusiness, addBusinessPhotoLink, removeBusinessPhotoLink,
  setBusinessLiveStatus, deleteBusiness,
} from "@/lib/repo";
import { uploadBusinessPhoto } from "@/lib/storage";
import { hasCap, CAP_LABEL, CAP_MIN_PLAN, type Plan, type Capability } from "@/lib/monetize";
import { cities, suburbsForCity } from "@/data/locations";
import { categories } from "@/data/categories";
import { SignInInline } from "@/components/dash/parts";
import { IMG_FALLBACK } from "@/lib/utils";

type Biz = {
  id: string; name?: string; categorySlug?: string; suburbSlug?: string; citySlug?: string;
  phone?: string; whatsapp?: string; website?: string; facebook?: string; instagram?: string;
  address?: string; hours?: string; services?: string[]; description?: string; priceNote?: string;
  coverImageUrl?: string; photos?: string[]; ownerUid?: string; plan?: string; status?: string;
};

const CAPS: Capability[] = ["photos", "whatsapp", "website", "priority", "socials", "analytics", "promoArticle", "multiListing"];
const inputCls = "mt-1 w-full rounded-2xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-4 py-3 text-sm font-normal bg-[#f2f6fa]/40 outline-none";
const lockedCls = "mt-1 w-full rounded-2xl border-2 border-dashed border-[#d6e1ec] px-4 py-3 text-sm font-normal bg-[#f2f6fa] text-[#1d3a5f]/45 cursor-not-allowed";

/**
 * Owner edit page (Tier 1): /business/[id]/edit
 * Every write goes through repo.updateBusiness(), which re-applies the plan gate
 * server-side — a FREE seller can't smuggle a WhatsApp button past the form.
 */
export default function EditBusinessForm({ id }: { id: string }) {
  const { user, loading } = useAuth();
  const uid = user?.uid ?? null;
  const router = useRouter();

  const { rows, live, error } = useRealtime<Biz>(
    (cb, onErr) => subscribeBusinessById(id, (r) => cb(r ? ([{ id, ...r }] as Biz[]) : []), onErr),
    [],
    [id]
  );
  const b = rows[0];

  const sub = useRealtime<Record<string, unknown>>(
    (cb, onErr) => (uid ? subscribeMyPlan(uid, (r) => cb(r ? [r] : []), onErr) : () => {}),
    [],
    [uid]
  );
  const teamMemberships = useRealtime<Record<string, unknown>>(
    (cb, onErr) => (uid ? subscribeMyTeamMemberships(uid, (items) => cb(items as Record<string, unknown>[]), onErr) : () => {}),
    [],
    [uid],
  );
  const isOwner = Boolean(uid && b?.ownerUid && b.ownerUid === uid);
  const isTeamMember = Boolean(uid && b?.ownerUid && teamMemberships.rows.some((member) =>
    String(member.ownerUid ?? "") === b.ownerUid && String(member.status ?? "") === "active"
  ));
  const teamRole = String(teamMemberships.rows.find((member) =>
    String(member.ownerUid ?? "") === b?.ownerUid && String(member.status ?? "") === "active"
  )?.role ?? "");
  const canEdit = isOwner || isTeamMember;
  const plan = ((isTeamMember ? b?.plan : sub.rows[0]?.plan) as Plan) ?? (b?.plan as Plan) ?? "free";

  const [form, setForm] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [link, setLink] = useState("");

  // Seed the form once per listing. This runs during render (React's documented
  // "adjust state when a prop changes" pattern) instead of in an effect, which
  // avoids a cascading render and the stale-form flash on first paint.
  if (b && loaded !== b.id) {
    setForm({
      name: b.name ?? "",
      categorySlug: b.categorySlug ?? categories[0].slug,
      citySlug: b.citySlug ?? "pretoria",
      suburbSlug: b.suburbSlug ?? "",
      phone: b.phone ?? "",
      address: b.address ?? "",
      hours: b.hours ?? "",
      priceNote: b.priceNote ?? "",
      description: b.description ?? "",
      services: (b.services ?? []).join(", "),
      coverImageUrl: b.coverImageUrl ?? "",
      whatsapp: b.whatsapp ?? "",
      website: b.website ?? "",
      facebook: b.facebook ?? "",
      instagram: b.instagram ?? "",
    });
    setLoaded(b.id);
  }

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const can = (c: Capability) => hasCap(plan, c) && (!isTeamMember || teamRole === "manager");
  const paused = String(b?.status ?? "live") === "paused";
async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null); setMsg(null);
    try {
      await updateBusiness(id, form, plan);
      setMsg("Saved ✓ Buyers see your changes instantly.");
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not save.");
    } finally { setBusy(false); }
  }

  async function addPhoto(e: FormEvent) {
    e.preventDefault();
    const url = link.trim();
    if (!/^https?:\/\/.+/i.test(url)) { setErr("Paste a photo link starting with https://"); return; }
    setBusy(true); setErr(null); setMsg(null);
    try { await addBusinessPhotoLink(id, url); setLink(""); setMsg("Photo added ✓"); }
    catch (e2) { setErr(e2 instanceof Error ? e2.message : "Could not add photo."); }
    finally { setBusy(false); }
  }

  async function dropPhoto(url: string) {
    setBusy(true); setErr(null); setMsg(null);
    try { await removeBusinessPhotoLink(id, url); setMsg("Photo removed."); }
    catch (e2) { setErr(e2 instanceof Error ? e2.message : "Could not remove photo."); }
    finally { setBusy(false); }
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setErr("Max 5MB per photo."); return; }
    setBusy(true); setErr(null); setMsg(null);
    try {
      const url = await uploadBusinessPhoto(id, uid ?? "", file);
      await addBusinessPhotoLink(id, url);
      setMsg("Photo uploaded ✓");
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Upload failed — use a photo link instead (free, no Storage needed).");
    } finally { setBusy(false); }
  }

  async function toggleStatus() {
    setBusy(true); setErr(null); setMsg(null);
    try {
      await setBusinessLiveStatus(id, paused ? "live" : "paused");
      setMsg(paused ? "Listing is live again ✓" : "Listing paused — hidden from buyers.");
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : "Could not update status."); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!confirm("Delete this listing permanently? This cannot be undone.")) return;
    setBusy(true); setErr(null); setMsg(null);
    try { await deleteBusiness(id); router.push("/dashboard"); }
    catch (e2) { setErr(e2 instanceof Error ? e2.message : "Could not delete."); setBusy(false); }
  }
if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-3">
        <h1 className="text-2xl font-black text-[#10243e]">Could not open this listing</h1>
        <p className="text-sm text-[#a36508] bg-[#fff4d6] rounded-2xl px-4 py-3">{listenerHint(error)}</p>
        <Link href="/dashboard" className="btn-navy text-sm inline-flex">Back to dashboard</Link>
      </div>
    );
  }
  if (!b && live) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-3">
        <h1 className="text-2xl font-black text-[#10243e]">Listing not found</h1>
        <Link href="/dashboard" className="btn-navy text-sm inline-flex">Back to dashboard</Link>
      </div>
    );
  }
  if (!b || loading) return <p className="max-w-2xl mx-auto px-4 py-16 text-sm text-[#1d3a5f]/60">Loading listing…</p>;

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
        <span className="text-4xl"><KIcon name="keyRound" size={14} className="inline shrink-0" /></span>
        <h1 className="text-2xl font-black text-[#10243e]">Sign in to edit {b.name}</h1>
        <p className="text-sm text-[#1d3a5f]/70">Only the listing owner or an invited team member can change these details.</p>
        <SignInInline />
      </div>
    );
  }

  if (!isOwner && !teamMemberships.live && !teamMemberships.error) {
    return <p className="max-w-2xl mx-auto px-4 py-16 text-sm text-[#1d3a5f]/60">Checking team access…</p>;
  }

  if (!canEdit) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
        <span className="text-4xl"><KIcon name="building" size={14} className="inline shrink-0" /></span>
        <h1 className="text-2xl font-black text-[#10243e]">This listing isn&apos;t yours yet</h1>
        <p className="text-sm text-[#1d3a5f]/70">
          {b.name} is managed by another account. Own this business? Claim it from the public profile — we verify ownership by phone.
        </p>
        <div className="flex flex-wrap gap-2 justify-center">
          <Link href={`/business/${id}`} className="btn-navy text-sm">View listing &amp; claim →</Link>
          <Link href="/dashboard" className="btn-hippo text-sm">My dashboard</Link>
        </div>
      </div>
    );
  }

  const photos = b.photos ?? [];
  const citySuburbs = suburbsForCity(form.citySlug || "pretoria");
  const capLock = (c: Capability) => (can(c) ? null : (
    <span className="ml-2 text-[11px] font-bold text-[#a36508] bg-[#fff4d6] rounded-full px-2 py-0.5">
      <KIcon name="keyRound" size={14} className="inline shrink-0" /> {isTeamMember && teamRole !== "manager" ? "MANAGER ROLE" : CAP_MIN_PLAN[c].toUpperCase()}
    </span>
  ));

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-5">
      <nav className="text-xs text-[#1d3a5f]/60 flex flex-wrap gap-1">
        <Link href="/dashboard" className="hover:underline">Dashboard</Link> <span>/</span>
        <Link href={`/business/${id}`} className="hover:underline">{b.name}</Link> <span>/</span>
        <span className="font-bold text-[#10243e]">Edit</span>
      </nav>

      <header className="hippo-card p-5 flex flex-wrap items-center gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#558c2b]">Owner tools</p>
          <h1 className="text-2xl font-black text-[#10243e]">Edit {b.name}</h1>
          <p className="text-xs text-[#1d3a5f]/60 mt-1">
              Plan: <b className="uppercase">{plan}</b> · Status: <b>{paused ? "Paused (hidden from buyers)" : "Live"}</b>{isTeamMember && <span> · Team role: {teamRole}</span>}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Link href={`/business/${id}`} className="btn-navy text-sm">View public page →</Link>
          {isOwner && (
            <button type="button" onClick={toggleStatus} disabled={busy} className="btn-hippo text-sm disabled:opacity-50">
              {paused ? "Put back online" : "Pause listing"}
            </button>
          )}
        </div>
      </header>

      {msg && <p className="text-sm font-bold text-[#3c6b1d] bg-[#e8f6d8] rounded-2xl px-4 py-3">{msg}</p>}
      {err && <p className="text-sm font-bold text-red-700 bg-red-50 rounded-2xl px-4 py-3">{err}</p>}

      <section className="hippo-card p-5">
        <h2 className="font-black text-[#10243e]">What your plan unlocks</h2>
        <p className="text-xs text-[#1d3a5f]/60 mt-1">Locked fields are stripped before saving — upgrading is what unlocks them for buyers.</p>
        <ul className="mt-2 grid sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
          {CAPS.map((c) => (
            <li key={c} className={can(c) ? "text-[#3c6b1d]" : "text-[#1d3a5f]/45"}>
              {can(c) ? <KIcon name="check" size={13} /> : <KIcon name="lock" size={13} />} {CAP_LABEL[c]}
              {!can(c) && <span className="text-[11px] font-bold"> — needs {isTeamMember && teamRole !== "manager" ? "manager role" : CAP_MIN_PLAN[c].toUpperCase()}</span>}
            </li>
          ))}
        </ul>
        <Link href="/list-business" className="btn-sun text-sm mt-3 inline-flex">Change plan →</Link>
      </section>
      <form onSubmit={save} className="space-y-5">
        <section className="hippo-card p-5 space-y-4">
          <h2 className="font-black text-[#10243e]">Basics — always editable</h2>

          <label className="block text-sm font-black text-[#10243e]">
            Business name
            <input required value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} className={inputCls} />
          </label>

          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block text-sm font-black text-[#10243e]">
              Category
              <select value={form.categorySlug ?? ""} onChange={(e) => set("categorySlug", e.target.value)} className={inputCls}>
                {categories.map((c) => <option key={c.slug} value={c.slug}>{c.icon} {c.name}</option>)}
              </select>
            </label>
            <label className="block text-sm font-black text-[#10243e]">
              City
              <select
                value={form.citySlug ?? "pretoria"}
                onChange={(e) => {
                  const citySlug = e.target.value;
                  const first = suburbsForCity(citySlug)[0]?.slug ?? "";
                  setForm((f) => ({ ...f, citySlug, suburbSlug: first }));
                }}
                className={inputCls}
              >
                {cities.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </select>
            </label>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block text-sm font-black text-[#10243e]">
              Suburb
              <select value={form.suburbSlug ?? ""} onChange={(e) => set("suburbSlug", e.target.value)} className={inputCls}>
                {citySuburbs.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
              </select>
            </label>
            <label className="block text-sm font-black text-[#10243e]">
              Phone (shown to everyone)
              <input required value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} inputMode="tel" className={inputCls} />
            </label>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block text-sm font-black text-[#10243e]">
              Address
              <input value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} className={inputCls} />
            </label>
            <label className="block text-sm font-black text-[#10243e]">
              Opening hours
              <input value={form.hours ?? ""} onChange={(e) => set("hours", e.target.value)} placeholder="Mon–Fri 08:00–17:00" className={inputCls} />
            </label>
          </div>

          <label className="block text-sm font-black text-[#10243e]">
            Price note
            <input value={form.priceNote ?? ""} onChange={(e) => set("priceNote", e.target.value)} placeholder="Callout R450 · Hourly R550" className={inputCls} />
          </label>

          <label className="block text-sm font-black text-[#10243e]">
            Description
            <textarea rows={5} value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} className={inputCls} />
          </label>

          <label className="block text-sm font-black text-[#10243e]">
            Services <span className="font-normal text-[#1d3a5f]/50">(comma separated)</span>
            <input value={form.services ?? ""} onChange={(e) => set("services", e.target.value)} placeholder="Emergency plumbing, Leak repairs, Drain cleaning" className={inputCls} />
          </label>
        </section>

        <section className="hippo-card p-5 space-y-4">
          <div>
            <h2 className="font-black text-[#10243e]">Plan-gated fields</h2>
            <p className="text-xs text-[#1d3a5f]/60 mt-1">
              Locked fields are greyed out and stripped server-side on save — nothing you type here can leak through on a FREE plan.
            </p>
          </div>

          <label className="block text-sm font-black text-[#10243e]">
            WhatsApp number {capLock("whatsapp")}
            <input
              disabled={!can("whatsapp")}
              value={form.whatsapp ?? ""}
              onChange={(e) => set("whatsapp", e.target.value)}
              inputMode="tel"
              placeholder="27821234567"
              className={can("whatsapp") ? inputCls : lockedCls}
            />
          </label>

          <label className="block text-sm font-black text-[#10243e]">
            Website {capLock("website")}
            <input
              disabled={!can("website")}
              value={form.website ?? ""}
              onChange={(e) => set("website", e.target.value)}
              placeholder="https://"
              className={can("website") ? inputCls : lockedCls}
            />
          </label>

          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block text-sm font-black text-[#10243e]">
              Facebook page {capLock("socials")}
              <input
                disabled={!can("socials")}
                value={form.facebook ?? ""}
                onChange={(e) => set("facebook", e.target.value)}
                placeholder="https://facebook.com/…"
                className={can("socials") ? inputCls : lockedCls}
              />
            </label>
            <label className="block text-sm font-black text-[#10243e]">
              Instagram {capLock("socials")}
              <input
                disabled={!can("socials")}
                value={form.instagram ?? ""}
                onChange={(e) => set("instagram", e.target.value)}
                placeholder="https://instagram.com/…"
                className={can("socials") ? inputCls : lockedCls}
              />
            </label>
          </div>

          <label className="block text-sm font-black text-[#10243e]">
            Cover photo link {capLock("photos")}
            <input
              disabled={!can("photos")}
              value={form.coverImageUrl ?? ""}
              onChange={(e) => set("coverImageUrl", e.target.value)}
              placeholder="https://…/shopfront.jpg"
              className={can("photos") ? inputCls : lockedCls}
            />
          </label>
          </section>

        <section className="hippo-card p-5 space-y-3">
          <h2 className="font-black text-[#10243e]">Photo gallery ({photos.length})</h2>
          {photos.length === 0 && <p className="text-sm text-[#1d3a5f]/60">No gallery photos yet.</p>}
          {photos.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {photos.map((p) => (
                <div key={p} className="relative">
                  <img src={p} alt="" loading="lazy" onError={(ev) => { ev.currentTarget.src = IMG_FALLBACK; }} className="h-24 w-full rounded-xl object-cover" />
                  <button
                    type="button"
                    onClick={() => dropPhoto(p)}
                    disabled={busy}
                    className="absolute top-1 right-1 rounded-full bg-white/95 text-red-700 text-[11px] font-black px-2 py-0.5 shadow disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          {can("photos") ? (
            <>
              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…/photo.jpg" className={`${inputCls} flex-1`} />
                <button type="button" onClick={addPhoto} disabled={busy || !link.trim()} className="btn-hippo text-sm disabled:opacity-50">Add photo link</button>
              </div>
              {isOwner && (
                <details className="text-xs text-[#1d3a5f]/60">
                  <summary className="cursor-pointer font-bold">Direct file upload (requires Blaze billing on your Firebase project)</summary>
                  <label className="mt-2 inline-block cursor-pointer rounded-full bg-[#10243e] text-white text-xs font-bold px-4 py-2">
                    {busy ? "Uploading…" : <><KIcon name="camera" size={14} className="inline shrink-0" /> Choose file</>}
                    <input type="file" accept="image/*" className="hidden" onChange={onFile} disabled={busy} />
                  </label>
                </details>
              )}
            </>
          ) : (
            <p className="text-sm text-[#a36508] bg-[#fff4d6] rounded-2xl px-4 py-3">
              <KIcon name="keyRound" size={14} className="inline shrink-0" /> A photo gallery is a <b>PRO</b> feature. <Link href="/list-business" className="font-bold underline">Upgrade for R199/mo</Link> to add photos buyers actually click on.
            </p>
          )}
        </section>

        <div className="flex flex-wrap items-center gap-2">
          <button disabled={busy} className="btn-hippo text-sm disabled:opacity-60">{busy ? "Saving…" : "Save changes ✓"}</button>
          <Link href={`/business/${id}`} className="btn-navy text-sm">View public page →</Link>
          {isOwner && (
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="ml-auto text-sm font-bold text-red-700 border-2 border-red-200 rounded-full px-4 py-2.5 hover:bg-red-50 disabled:opacity-50"
            >
              Delete listing
            </button>
          )}
        </div>
      </form>

      <section className="hippo-card p-5 text-xs text-[#1d3a5f]/60">
        <p>
          <b>Tip:</b> keep hours, price note and services current — listings with complete info get far more calls. Pausing a listing hides
          it from the public directory and category pages instantly, but never deletes your reviews.
        </p>
      </section>
    </div>
  );
}
