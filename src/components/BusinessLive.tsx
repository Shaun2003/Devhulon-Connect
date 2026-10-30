"use client";
/* eslint-disable @next/next/no-img-element -- seller photo URLs are arbitrary
   user-supplied remote links (Firebase Storage + pasted https URLs); next/image
   would need a remotePatterns whitelist for every possible host and provides no
   onError→IMG_FALLBACK fallback, which these previews rely on. */
import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { useRealtime, subscribeBusinessById, subscribeFavoriteDoc, listenerHint } from "@/lib/realtime";
import { addBusinessPhotoLink, toggleFavorite, trackBusinessEvent, submitClaim, submitReport } from "@/lib/repo";
import { uploadBusinessPhoto } from "@/lib/storage";
import { IMG_FALLBACK } from "@/lib/utils";
import { SignInInline } from "@/components/dash/parts";
import VerificationBadge from "@/components/VerificationBadge";
import type { VerificationRecord } from "@/lib/verification";
import { useAuth } from "@/components/AuthProvider";
import { hasCap, type Plan } from "@/lib/monetize";
import { normalizePlanId } from "@/lib/plans";
import { getCategory } from "@/data/categories";
import { getSuburb } from "@/data/locations";
import { RatingSummary, AdSlot } from "@/components/ui";
import { KIcon, iconForCategory } from "@/lib/icons";
import { SITE_SHORT } from "@/lib/site";
import { Faq, CtaBand } from "@/components/hippo";
import ReviewsLive from "@/components/ReviewsLive";
import ReviewForm from "@/components/ReviewForm";
import PortfolioLive from "@/components/PortfolioLive";
import BookingRequestForm from "@/components/BookingRequestForm";

/** Owner-claim card for unclaimed/seeded listings (Tier 1). */
function ClaimCard({ businessId, businessName }: { businessId: string; businessName: string }) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await submitClaim(businessId, businessName, name, phone);
      setMsg("Claim submitted ✓ Our team will verify you by phone and link the listing to your account.");
      setOpen(false);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not submit claim.");
    } finally { setBusy(false); }
  }

  return (
    <div className="hippo-card p-5">
      <h2 className="font-black text-[#10243e]">Own {businessName}?</h2>
      <p className="text-sm text-[#1d3a5f]/70 mt-1">Claim this listing to edit your info, add photos and get leads. We verify ownership by phone.</p>
      {!open && !msg && (
        <button onClick={() => setOpen(true)} className="btn-navy text-sm mt-3"><KIcon name="building" size={14} className="inline shrink-0" /> Claim this business </button>
      )}
      {open && !user && (
        <div className="mt-3 rounded-2xl bg-[#f2f6fa] p-4 text-sm">
          <p className="font-bold text-[#10243e]">Sign in first — your claim links to your account.</p>
          <div className="mt-3"><SignInInline /></div>
        </div>
      )}
      {open && user && !msg && (
        <form onSubmit={onSubmit} className="mt-3 grid sm:grid-cols-2 gap-2">
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-3 py-2.5 text-sm outline-none" />
          <input required value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="Phone for verification" className="rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-3 py-2.5 text-sm outline-none" />
          <button disabled={busy} className="btn-hippo text-sm sm:col-span-2 disabled:opacity-60">{busy ? "Submitting…" : "Submit claim "}</button>
          <p className="text-[11px] text-[#1d3a5f]/50 sm:col-span-2">{user ? "Signed in — your claim links to your account." : "You'll be asked to sign in after submitting if you aren't yet."}</p>
        </form>
      )}
      {msg && <p className="text-sm font-bold text-[#3c6b1d] bg-[#e8f6d8] rounded-xl px-3 py-2 mt-3">{msg}</p>}
      {err && <p className="text-sm font-bold text-red-700 bg-red-50 rounded-xl px-3 py-2 mt-3">{err}</p>}
    </div>
  );
}

/** Abuse report form (Tier 5) — writes to reports/{id}, admin console resolves. */
function ReportForm({ targetId, label }: { targetId: string; label: string }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await submitReport({ type: "business", targetId, label, reason });
      setMsg("Report sent — thank you. Our moderators review within 48h.");
      setReason("");
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not send report.");
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 space-y-2">
      <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} required minLength={5} placeholder="What's wrong with this listing?" className="w-full rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-3 py-2 text-sm outline-none" />
      <button disabled={busy} className="btn-navy text-xs !py-2 !px-4 disabled:opacity-50">{busy ? "Sending…" : "Send report"}</button>
      {msg && <p className="text-xs font-bold text-[#3c6b1d]">{msg}</p>}
      {err && <p className="text-xs font-bold text-red-700">{err}</p>}
    </form>
  );
}

export type Biz = {
  id: string; name?: string; categorySlug?: string; suburbSlug?: string; citySlug?: string;
  hours?: string; rating?: number;
  reviewCount?: number; services?: string[]; description?: string; priceNote?: string;
  verified?: boolean; plan?: string; photos?: string[]; coverImageUrl?: string;
  /** Provenance behind the badge; absent on listings verified before records existed. */
  verification?: VerificationRecord | null;
  ownerUid?: string; serviceAreas?: string[]; featured?: boolean;
};

/** Public business profile — realtime, no sign-in needed to browse. */
export default function BusinessLive({
  id,
  initial,
  initialReviews,
}: {
  id: string;
  initial?: Biz;
  /** Reviews already read on the server, so the list is in the first paint. */
  initialReviews?: Array<{
    id: string; author: string; rating: number; body: string; createdAt?: unknown;
  }>;
}) {
  return (
    <>
      <BusinessBody id={id} initial={initial} initialReviews={initialReviews} />
      <div className="mx-auto w-full max-w-6xl px-4 pb-10 sm:px-6 lg:px-8">
        <CtaBand />
      </div>
    </>
  );
}

function BusinessBody({
  id,
  initial,
  initialReviews,
}: {
  id: string;
  initial?: Biz;
  initialReviews?: Array<{
    id: string; author: string; rating: number; body: string; createdAt?: unknown;
  }>;
}) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  // `initial` is the listing already fetched on the server by the page, so the
  // first render (and the SSR HTML crawlers see) has the real name/rating
  // instead of a "Loading listing…" placeholder. Realtime overwrites it.
  const { rows, live, error } = useRealtime<Biz>(
    (cb, onErr) => subscribeBusinessById(id, (r) => cb(r ? ([{ id, ...r }] as Biz[]) : []), onErr),
    initial ? [initial] : [],
    [id],
  );
  const raw = rows[0];
  // `businesses.rating` is a denormalised cache that a client holding the
  // matching Firestore write rule maintains. It has drifted to 0 while real
  // reviews exist, so whenever the server sent a derived rating that is higher
  // than the cached one, prefer the derived value. Anything the seller edits
  // live (name, hours, photos) still comes straight through from realtime.
  const b: Biz | undefined = raw && initial
    ? {
        ...raw,
        rating: Math.max(Number(raw.rating ?? 0), Number(initial.rating ?? 0)) || Number(raw.rating ?? 0),
        reviewCount: Math.max(Number(raw.reviewCount ?? 0), Number(initial.reviewCount ?? 0)),
      }
    : raw;
  const [msg, setMsg] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);

  // Realtime favourite state for the signed-in buyer
  const fav = useRealtime<{ id: string }>((cb, onErr) => (uid && b ? subscribeFavoriteDoc(uid, b.id, (r) => cb(r ? [{ id: r.id }] : []), onErr) : () => {}), [], [uid, b?.id ?? ""]);
  const isFav = fav.rows.length > 0;

  // Profile views — anonymous-safe counter (rules allow ONLY counter keys)
  const bizId = b?.id ?? null;
  useEffect(() => {
    if (bizId) trackBusinessEvent(bizId, "profileViews");
  }, [bizId]);

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-3">
        <h1 className="text-2xl font-black text-[#10243e]">Could not load this listing</h1>
        <p className="text-sm text-[#a36508] bg-[#fff4d6] rounded-2xl px-4 py-3">{listenerHint(error)}</p>
        <Link href="/" className="btn-navy text-sm inline-flex">Back home</Link>
      </div>
    );
  }
  if (!b && live) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-black text-[#10243e]">Listing not found</h1>
        <p className="text-sm text-[#1d3a5f]/60 mt-2">This business may have been removed.</p>
        <Link href="/" className="btn-navy mt-4 text-sm inline-flex">Back home</Link>
      </div>
    );
  }
  if (!b) return <p className="max-w-3xl mx-auto px-4 py-16 text-sm text-[#1d3a5f]/60">Loading listing…</p>;

  const cat = getCategory(b.categorySlug ?? "");
  const plan = (b.plan as Plan) ?? "free";
  const canPhotos = hasCap(plan, "photos");
  const cover = b.coverImageUrl ?? b.photos?.[0];
  const photos = b.photos ?? [];
  const isOwner = Boolean(uid && b.ownerUid === uid);
  // NOTE: LocalBusiness + BreadcrumbList structured data is rendered on the
  // SERVER in app/business/[id]/page.tsx (crawlable without JS). Don't
  // duplicate it here — duplicated JSON-LD confuses rich-result validation.

  async function addLink(e: FormEvent) {
    e.preventDefault();
    const url = link.trim();
    if (!/^https?:\/\/.+/i.test(url)) { setMsg("Paste a photo link starting with https://"); return; }
    setBusy(true);
    try {
      await addBusinessPhotoLink(id, url);
      setMsg("Photo link saved ✓");
      setLink("");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Could not save link.");
    } finally { setBusy(false); }
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setMsg("Max 5MB per photo."); return; }
    setBusy(true);
    try {
      const url = await uploadBusinessPhoto(id, uid ?? "", file);
      await addBusinessPhotoLink(id, url);
      setMsg("Photo uploaded ✓");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Upload failed — use the free photo-link instead.");
    } finally { setBusy(false); }
  }

  async function onFav() {
    if (!b) return;
    try {
      const r = await toggleFavorite({ id: b.id, name: b.name, categorySlug: b.categorySlug, suburbSlug: b.suburbSlug, citySlug: b.citySlug });
      setMsg(r === "added" ? "Saved — see it in your dashboard ✓" : "Removed from your saved businesses.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not save — sign in first.");
    }
  }

  const citySlug = b.citySlug ?? "pretoria";
  const suburbSlug = b.suburbSlug ?? "pretoria-north";
  const suburbName = getSuburb(citySlug, suburbSlug)?.name
    ?? suburbSlug.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  const categoryLabel = `${cat?.plural ?? "Category"} in ${suburbName}`;

  return (
    <>
      <div className="mx-auto w-full max-w-6xl px-4 pt-6 sm:px-6 lg:px-8">
        <nav aria-label="Breadcrumb" className="text-xs font-bold text-[#1d3a5f]/60">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li className="flex items-center gap-1.5">
              <Link href="/" className="hover:text-[#10243e]">Home</Link>
              <span aria-hidden="true">/</span>
            </li>
            <li className="flex items-center gap-1.5">
              <Link href={`/${citySlug}/${suburbSlug}/${b.categorySlug ?? ""}`} className="hover:text-[#10243e]">{categoryLabel}</Link>
              <span aria-hidden="true">/</span>
            </li>
            <li aria-current="page" className="break-words font-bold text-[#10243e]">{b.name}</li>
          </ol>
        </nav>
      </div>
      <main className="mx-auto w-full max-w-6xl px-4 py-8 space-y-6 sm:px-6 lg:px-8">
      <header className="hippo-card overflow-hidden !rounded-3xl anim-rise">
        {cover && <img src={cover} alt={`${b.name} cover`} className="h-56 w-full object-cover" />}
        <div className="p-6">
          <span className="icon-3d icon-3d-sm shrink-0" aria-hidden>
            <KIcon name={iconForCategory(b.categorySlug ?? "")} size={20} />
          </span>
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#558c2b]">{cat?.name} · {(b.suburbSlug ?? "").replace(/-/g, " ")}</p>
            {/* Shows HOW it was verified and WHEN, not just a bare chip. See
                VerificationBadge for why the provenance is public. */}
            <VerificationBadge verified={b.verified === true} verification={b.verification} />
            {normalizePlanId(b.plan) === "premium" && <span className="text-[10px] font-black uppercase tracking-widest bg-[#e8f6d8] text-[#3c6b1d] rounded-full px-2 py-0.5">Premium</span>}
            {b.featured === true && <span className="text-[10px] font-black uppercase tracking-widest bg-[#e8f6d8] text-[#3c6b1d] rounded-full px-2 py-0.5">Featured</span>}
            {live && <span className="chip-live">Live</span>}
          </div>
          <h1 className="text-3xl font-black text-[#10243e] tracking-tight mt-1">{b.name}</h1>
          <RatingSummary rating={b.rating} reviews={b.reviewCount} className="mt-2" />
          <p className="text-sm text-[#1d3a5f]/75 mt-3 leading-6">{b.description}</p>
          <div className="flex flex-wrap gap-2 mt-5">
            {b.ownerUid && !isOwner && (
              <Link
                href={`/messages?to=${b.ownerUid}&business=${id}&name=${encodeURIComponent(b.name ?? "")}`}
                className="text-sm font-extrabold rounded-full px-5 py-3 border-2 border-[#558c2b] text-[#558c2b] hover:bg-[#558c2b] hover:text-white transition inline-flex items-center gap-1.5"
              >
                <KIcon name="message" size={15} /> Message
              </Link>
            )}
            <Link href={`/request-quote?business=${id}`} className="btn-sun text-sm">Request quote </Link>
            <button
              onClick={onFav}
              className={`text-sm font-extrabold rounded-full px-5 py-3 transition border-2 ${isFav ? "bg-[#ffc72c] border-[#ffc72c] text-[#10243e]" : "border-[#10243e] text-[#10243e] hover:bg-[#10243e] hover:text-white"}`}
              title={uid ? "Save this business" : "Sign in to save"}
            >
              {isFav ? <><KIcon name="check" size={13} className="inline shrink-0" /> Saved</> : <><KIcon name="heart" size={13} className="inline shrink-0" /> Save</>}
            </button>
          </div>
          {!uid && <p className="text-xs text-[#1d3a5f]/50 mt-2">Tip: <Link href="/dashboard" className="font-bold text-[#558c2b] hover:underline">sign in</Link> to save businesses and track your quote requests.</p>}
        </div>
      </header>

      {/* Request-a-booking (spec §39) — only when the listing has an owner. */}
      <BookingRequestForm
        businessId={id}
        businessName={b.name ?? "this business"}
        sellerUid={b.ownerUid}
        hours={b.hours}
      />

      <div className="grid sm:grid-cols-2 gap-4 items-start">
            <div className="hippo-card p-5">
            <h2 className="font-black text-[#10243e]">Services</h2>
            <ul className="text-sm mt-2 space-y-1.5 text-[#1d3a5f]/75">
            {(b.services ?? []).map((s) => <li key={s} className="flex gap-2"><span className="text-[#7ac142] font-black"><KIcon name="check" size={14} className="inline shrink-0" /></span>{s}</li>)}
          </ul>
          {Array.isArray(b.serviceAreas) && b.serviceAreas.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-extrabold uppercase tracking-wide text-[#1d3a5f]/60">Areas served</p>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {(b.serviceAreas as unknown[]).map(String).map((a) => (
                  <span key={a} className="text-[11px] font-bold bg-[#f2f6fa] text-[#10243e] rounded-full px-2.5 py-1">
                    {a.replace(/-/g, " ")}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="hippo-card p-5 text-sm space-y-1.5 text-[#1d3a5f]/75">
          <h2 className="font-black text-[#10243e]">Business details & hours</h2>
          <p><KIcon name="mapPin" size={14} className="inline shrink-0" /> {(b.suburbSlug ?? "").replace(/-/g, " ")}, {(b.citySlug ?? "").replace(/-/g, " ")}</p>
          <p><KIcon name="clock" size={14} className="inline shrink-0" /> {b.hours}</p>
          <div className="rounded-xl bg-[#fff4d6] text-[#a36508] px-3 py-2 mt-2 font-semibold"><KIcon name="tag" size={14} className="inline shrink-0" /> {b.priceNote}</div>
          <p className="text-xs pt-2">Use Request a quote or Message to contact this business through {SITE_SHORT}; private contact details are not shown on public profiles.</p>
        </div>
      </div>

      <AdSlot />

      {photos.length > 0 && (
        <div className="hippo-card p-5">
          <h2 className="font-black text-[#10243e]">Photos ({photos.length})</h2>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2 items-start">
            {photos.map((p) => <img key={p} src={p} alt={b.name ?? ""} loading="lazy" onError={(ev) => { ev.currentTarget.src = IMG_FALLBACK; }} className="h-32 w-full rounded-xl object-cover" />)}
          </div>
        </div>
      )}

      {/* Recent work from the seller's portfolio (hides itself when empty). */}
      <PortfolioLive businessId={id} />

      {isOwner && canPhotos && (
        <div className="hippo-card p-5">
          <h2 className="font-black text-[#10243e]">Add photos (owner)</h2>
          <p className="text-xs text-[#1d3a5f]/60 mt-1">
            <b>Recommended — free:</b> paste a public image link below (your Facebook page photo, Unsplash, imgbb…). Starter has a fair-use profile photo limit.
          </p>
          <p className="text-xs text-[#1d3a5f]/60 mt-2">
            For finished jobs with before/after shots, use the <b>Portfolio</b> tab in your seller hub instead — that&apos;s what buyers compare.
          </p>
          <form onSubmit={addLink} className="mt-3 flex flex-col sm:flex-row gap-2">
            <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…/shopfront.jpg" className="flex-1 rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-3 py-2.5 text-sm outline-none" />
            <button disabled={busy || !link.trim()} className="btn-hippo text-sm disabled:opacity-50">Add photo link</button>
          </form>
          <details className="mt-3 text-xs text-[#1d3a5f]/60">
            <summary className="cursor-pointer font-bold">Direct file upload (requires Blaze billing on your Firebase project)</summary>
            <label className="mt-2 inline-block cursor-pointer rounded-full bg-[#10243e] text-white text-xs font-bold px-4 py-2">
              {busy ? "Uploading…" : <><KIcon name="camera" size={15} className="inline shrink-0" /> Choose file</>}
              <input type="file" accept="image/*" className="hidden" onChange={onFile} disabled={busy} />
            </label>
          </details>
          {msg && <p className="text-sm font-bold text-[#3c6b1d] mt-2">{msg}</p>}
        </div>
      )}

      <ReviewsLive
        businessId={id}
        ownerUid={b.ownerUid ?? null}
        initial={initialReviews as never}
      />
      <ReviewForm businessId={id} />

      {/* Claim this listing (unclaimed / seeded listings) */}
      {!isOwner && !b.ownerUid && (
        <ClaimCard businessId={id} businessName={b.name ?? "this business"} />
      )}

      {/* Report this listing (Tier 5) */}
      <details className="hippo-card p-4">
        <summary className="text-xs font-bold text-[#1d3a5f]/60 cursor-pointer"><KIcon name="flag" size={14} className="inline shrink-0" /> Report this listing (wrong info, closed, spam…)</summary>
        <ReportForm targetId={id} label={b.name ?? ""} />
      </details>

      {cat?.faqs && cat.faqs.length > 0 && (
        <section>
          <h2 className="font-black text-[#10243e] mb-3">{b.name} — commonly asked</h2>
          <Faq items={cat.faqs} />
        </section>
      )}
      </main>
    </>
  );
}
