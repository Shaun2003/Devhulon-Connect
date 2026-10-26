"use client";
import { KIcon, type IconKey } from "@/lib/icons";
import { useState, type ReactNode, type FormEvent, type CSSProperties } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { useRealtime, subscribeJobs, subscribeEvents, subscribeDeals, subscribeArticles, subscribePlaces, subscribeMySubscription, listenerHint, type RealtimeError } from "@/lib/realtime";
import { submitJob, submitEvent, submitDeal, submitPlace, submitGuide } from "@/lib/repo";
import { CtaBand } from "@/components/hippo";
import { PageHero } from "@/components/ui";
import SaveButton from "@/components/SaveButton";
import { SITE_SHORT } from "@/lib/site";
import PostPreviewModal from "@/components/PostPreviewModal";

type Row = Record<string, string>;

export function Empty({ what }: { what: string }) {
  return <p className="text-sm text-[#1d3a5f]/60">No {what} yet — new items appear here live the moment they&apos;re added.</p>;
}

export function LiveBadge({ live }: { live: boolean }) {
  return live ? <span className="chip-live">Live</span> : <span className="text-xs font-bold text-white/60">Connecting…</span>;
}

export function ErrorBanner({ error }: { error: RealtimeError | null }) {
  if (!error) return null;
  return <p className="text-xs font-bold text-[#a36508] bg-[#fff4d6] rounded-2xl px-4 py-3">{listenerHint(error)}</p>;
}

/**
 * Public shell — browsing never requires an account.
 *
 * Uses the shared PageHero so these pages have exactly the same top-of-page
 * design as the service pages, rather than their own centre-aligned banner.
 */
function Shell({
  kicker,
  title,
  sub,
  icon = "layers",
  crumbs,
  children,
  badge,
}: {
  kicker: string;
  title: string;
  sub: string;
  icon?: IconKey;
  crumbs: { label: string; href?: string }[];
  children: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <PageHero kicker={kicker} title={title} sub={sub} icon={icon} crumbs={crumbs}>
        {badge ? <div className="mt-3 flex flex-wrap items-center gap-2">{badge}</div> : null}
      </PageHero>
      <main className="max-w-6xl mx-auto px-4 py-10 space-y-8">
        {children}
        <CtaBand />
      </main>
    </div>
  );
}

const inputCls = "rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-3 py-2.5 text-sm outline-none w-full";

/** The five seller-publishable post types. Mirrors `PostCollection` in repo.ts. */
type PostKind = "job" | "event" | "deal" | "place" | "guide";

const HEADING: Record<PostKind, string> = {
  job: "Post a job",
  event: "Submit an event",
  deal: "Submit a deal",
  place: "Add a place",
  guide: "Write a guide",
};

const LABEL: Record<PostKind, string> = {
  job: "Job",
  event: "Event",
  deal: "Deal",
  place: "Place",
  guide: "Guide",
};

/**
 * Seller-only submit panel.
 *
 * Posting is NOT a buyer feature, so the whole card is withheld from anyone who
 * is not a seller — previously the heading and the "+ Post" button rendered for
 * every visitor, including signed-out ones, and only the form behind the button
 * was gated. Buyers saw an upload affordance they could never use.
 *
 * The plan check below mirrors the `firestore.rules` tier requirement so a
 * seller without the right plan gets an explanation instead of a permission
 * error. The server remains the authority.
 */
export function PostPanel({ kind }: { kind: PostKind }) {
  const { user, role, loading: authLoading } = useAuth();
  // Client-side gate mirrors the `firestore.rules` check so sellers on the wrong
  // tier get told why instead of hitting a permission error. The server remains
  // the authority — this only avoids a dead end.
  const subs = useRealtime<{ plan?: string }>(
    (cb, onErr) => (user ? subscribeMySubscription(user.uid, cb as never, onErr) : () => {}),
    [],
    [user?.uid],
  );
  const plan = String(subs.rows[0]?.plan ?? "free").toLowerCase();
  const tier = plan === "business" || plan === "premium" ? 2 : plan === "professional" || plan === "pro" ? 1 : 0;
  // Jobs/events/deals unlock at Professional (tier 1); places/guides at Business (tier 2).
  const needTier = kind === "place" || kind === "guide" ? 2 : 1;
  const canPost = role === "seller" && tier >= needTier;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const fd = new FormData(formEl);
    setBusy(true); setMsg(null); setErr(null);
    const v = (k: string) => String(fd.get(k) ?? "");
    try {
      if (kind === "job") await submitJob({ title: v("title"), company: v("company"), suburb: v("suburb"), type: v("type"), pay: v("pay") });
      else if (kind === "event") await submitEvent({ title: v("title"), venue: v("venue"), suburb: v("suburb"), date: v("date"), fee: v("fee") });
      else if (kind === "deal") await submitDeal({ title: v("title"), business: v("business"), suburb: v("suburb"), detail: v("detail") });
      else if (kind === "place") await submitPlace({ title: v("title"), suburb: v("suburb"), kind: v("kind"), detail: v("detail"), hours: v("hours") });
      else await submitGuide({ title: v("title"), suburb: v("suburb"), excerpt: v("excerpt"), body: v("body") });
      setMsg(`${LABEL[kind]} saved — find it in your dashboard ✓`);
      formEl.reset();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not submit.");
    } finally { setBusy(false); }
  }

  const heading = HEADING[kind];
  const fields: Record<PostKind, string[]> = {
    job: ["title*|Job title — e.g. Delivery Driver", "company*|Company / trader name", "suburb|Suburb — e.g. Mamelodi", "type|Full-time,Part-time,Contract,Apprenticeship,Piece job", "pay|Pay — e.g. R45/order + tips"],
    event: ["title*|Event name", "venue|Venue", "suburb|Suburb", "date|When — e.g. Sat 14:00–22:00", "fee|Entry — e.g. Free / R150"],
    deal: ["title*|Deal title — e.g. 50% off car wash", "business*|Business name", "suburb|Suburb", "detail|The details — prices, validity, how to redeem"],
    place: ["title*|Place name — e.g. Union Buildings", "kind|attraction,restaurant,nature,mall,nightlife,sport,family", "suburb|Suburb", "hours|Opening hours", "detail|What a visitor should know"],
    guide: ["title*|Guide title", "suburb|Suburb", "excerpt|Short summary (shown on the guide card)", "body|Your article"],
  };

  // Buyers (and signed-out visitors) never see the posting card at all. While the
  // auth listener is still resolving, render nothing rather than flashing the
  // form at somebody who turns out to be a buyer.
  if (authLoading || role !== "seller") return null;

  return (
    <section className="hippo-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-black text-[#10243e]">{heading}</h2>
        <button onClick={() => setOpen((o) => !o)} className="text-sm font-extrabold text-[#10243e] border-2 border-[#10243e] rounded-full px-4 py-2 hover:bg-[#10243e] hover:text-white transition">
          {open ? "Close" : "+ Post"}
        </button>
      </div>
      {open && !canPost && (
        <div className="mt-4 rounded-2xl bg-[#f2f6fa] p-4 text-sm">
          <p className="font-bold text-[#10243e]">Your plan doesn&apos;t include posting yet.</p>
          <p className="text-[#1d3a5f]/75 mt-1">
            Jobs, events and deals unlock on <b>PRO (R199/mo)</b>; places and guides need <b>PREMIUM (R499/mo)</b>.
            Browsing, saving businesses and requesting quotes stay free.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/pricing" className="btn-hippo text-sm">See plans →</Link>
          </div>
        </div>
      )}
      {open && canPost && (
        <form onSubmit={onSubmit} className="mt-4 grid sm:grid-cols-2 gap-3">
          {fields[kind].map((f) => {
            const [spec, ...rest] = f.split("|");
            const ph = rest.join("|");
            const required = spec.endsWith("*");
            const name = spec.replace("*", "");
            if (name === "type") {
              return (
                <select key={name} name={name} required defaultValue={ph.split(",")[0]} className={inputCls}>
                  {ph.split(",").map((t) => <option key={t}>{t}</option>)}
                </select>
              );
            }
            if (name === "detail" || name === "body") {
              // `body` is a full article, so give it real room; `detail` stays short.
              return (
                <textarea
                  key={name}
                  name={name}
                  rows={name === "body" ? 8 : 2}
                  required={required}
                  placeholder={ph}
                  className={inputCls + " sm:col-span-2"}
                />
              );
            }
            return <input key={name} name={name} required={required} placeholder={ph} className={inputCls} />;
          })}
          <button disabled={busy} className="btn-hippo text-sm disabled:opacity-60 sm:col-span-2">{busy ? "Submitting…" : "Publish — goes live instantly →"}</button>
          {msg && <p className="text-sm font-bold text-[#3c6b1d] sm:col-span-2">{msg}</p>}
          {err && <p className="text-sm font-bold text-red-700 sm:col-span-2">{err}</p>}
        </form>
      )}
    </section>
  );
}

export function JobsLive() {
  const { rows, live, error } = useRealtime<Row>((cb, onErr) => subscribeJobs(cb as never, onErr), [], []);
  const { user } = useAuth();
  const [preview, setPreview] = useState<Row | null>(null);
  const uid = user?.uid ?? "";
  // Moderation: show live posts + your own pending posts (with a badge).
  const visible = rows
    .filter((j) => { const st = String(j.status ?? "live"); return st === "live" || (uid && String(j.createdBy ?? "") === uid); })
    .sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)));
  return (
    <Shell kicker="Hustle board" title="Jobs in South Africa" sub="Piece jobs, full-time and apprenticeships — posted live by local employers." icon="briefcase" crumbs={[{ label: "Home", href: "/" }, { label: "Jobs" }]} badge={<LiveBadge live={live} />}>
      <PostPanel kind="job" />
      <ul className="space-y-3">
        {visible.map((j, i) => (
          <li key={(j.id as string) ?? i} className="hippo-card p-4 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 compare-row anim-rise" style={{ "--d": `${Math.min(i, 8) * 45}ms` } as CSSProperties}>
            <div className="flex items-start gap-3 min-w-0">
              <span className="icon-3d icon-3d-sm shrink-0" aria-hidden="true"><KIcon name="briefcase" size={20} /></span>
              <div className="min-w-0">
                <button type="button" onClick={() => setPreview(j)} className="text-left font-bold text-[#10243e] text-lg leading-tight hover:text-[#558c2b] focus-visible:underline">
                  {j.title} {Boolean(j.featured) && <span className="text-[10px] font-black uppercase tracking-widest bg-[#10243e] text-[#ffc72c] rounded-full px-2 py-0.5 align-middle"><KIcon name="star" size={14} className="inline shrink-0" /> Featured</span>} {String(j.status ?? "live") === "pending" && <span className="text-[10px] font-black uppercase tracking-widest bg-[#fff4d6] text-[#a36508] rounded-full px-2 py-0.5 align-middle">Pending review</span>}
                </button>
                <p className="text-xs text-[#1d3a5f]/60 mt-0.5">{j.company} · {j.suburb} · {j.type} · {j.posted}</p>
                <button type="button" onClick={() => setPreview(j)} className="mt-2 text-xs font-bold text-[#558c2b] hover:underline">Full job preview →</button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <span className="text-sm font-black text-[#558c2b] whitespace-nowrap bg-[#e8f6d8] rounded-full px-3 py-1.5 w-fit">{j.pay}</span>
              <SaveButton type="job" id={String(j.id ?? "")} title={String(j.title ?? "")} suburb={String(j.suburb ?? "")} />
            </div>
          </li>
        ))}
      </ul>
      <ErrorBanner error={error} />
      {live && visible.length === 0 && <Empty what="jobs" />}
      <PostPreviewModal post={preview} kind="job" onClose={() => setPreview(null)} />
    </Shell>
  );
}

export function EventsLive() {
  const { rows, live, error } = useRealtime<Row>((cb, onErr) => subscribeEvents(cb as never, onErr), [], []);
  const { user } = useAuth();
  const [preview, setPreview] = useState<Row | null>(null);
  const uid = user?.uid ?? "";
  const visible = rows
    .filter((e) => { const st = String(e.status ?? "live"); return st === "live" || (uid && String(e.createdBy ?? "") === uid); })
    .sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)));
  return (
    <Shell kicker="This weekend & beyond" title="Events in South Africa" sub="Markets, groove, church, sport & community. Free to submit, free to browse." icon="calendar" crumbs={[{ label: "Home", href: "/" }, { label: "Events" }]} badge={<LiveBadge live={live} />}>
      <PostPanel kind="event" />
      <ul className="grid sm:grid-cols-2 gap-3 items-start">
        {visible.map((e, i) => (
          <li key={(e.id as string) ?? i} className="hippo-card p-5 compare-row anim-rise !rounded-2xl" style={{ "--d": `${Math.min(i, 8) * 45}ms` } as CSSProperties}>
            <div className="flex items-start gap-3">
              <span className="icon-3d shrink-0" aria-hidden><KIcon name="ticket" size={14} className="inline shrink-0" /></span>
              <div className="min-w-0 flex-1">
                <span className="inline-block text-[10px] font-black uppercase tracking-widest bg-[#fff4d6] text-[#a36508] rounded-full px-2 py-0.5">Event</span>
                {Boolean(e.featured) && <span className="ml-1 text-[10px] font-black uppercase tracking-widest bg-[#10243e] text-[#ffc72c] rounded-full px-2 py-0.5"><KIcon name="star" size={14} className="inline shrink-0" /> Featured</span>}
                {String(e.status ?? "live") === "pending" && <span className="ml-1 text-[10px] font-black uppercase tracking-widest bg-[#fff4d6] text-[#a36508] rounded-full px-2 py-0.5">Pending review</span>}
                <button type="button" onClick={() => setPreview(e)} className="mt-2 text-left font-bold text-[#10243e] text-lg leading-tight hover:text-[#558c2b] focus-visible:underline">{e.title}</button>
                <p className="text-xs text-[#1d3a5f]/60 mt-1">{e.venue} · {e.suburb}</p>
                <button type="button" onClick={() => setPreview(e)} className="mt-2 text-xs font-bold text-[#558c2b] hover:underline">Full event preview →</button>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs font-bold text-[#1d3a5f]/70"><KIcon name="calendar" size={14} className="inline shrink-0" /> {e.date}</span>
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-black text-[#558c2b] bg-[#e8f6d8] rounded-full px-3 py-1">{e.fee}</span>
                    <SaveButton type="event" id={String(e.id ?? "")} title={String(e.title ?? "")} suburb={String(e.suburb ?? "")} />
                  </span>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <ErrorBanner error={error} />
      {live && visible.length === 0 && <Empty what="events" />}
      <PostPreviewModal post={preview} kind="event" onClose={() => setPreview(null)} />
    </Shell>
  );
}

export function DealsLive() {
  const { rows, live, error } = useRealtime<Row>((cb, onErr) => subscribeDeals(cb as never, onErr), [], []);
  const { user } = useAuth();
  const [preview, setPreview] = useState<Row | null>(null);
  const uid = user?.uid ?? "";
  const visible = rows
    .filter((d) => { const st = String(d.status ?? "live"); return st === "live" || (uid && String(d.createdBy ?? "") === uid); })
    .sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)));
  return (
    <Shell kicker="Hot specials" title="Deals in South Africa" sub={`Local specials from verified businesses — mention ${SITE_SHORT} to redeem.`} icon="tag" crumbs={[{ label: "Home", href: "/" }, { label: "Deals" }]} badge={<LiveBadge live={live} />}>
      <PostPanel kind="deal" />
      <div className="grid sm:grid-cols-2 gap-3 items-start">
        {visible.map((d, i) => (
          <div key={(d.id as string) ?? i} className="hippo-card p-5 compare-row anim-rise !rounded-2xl" style={{ "--d": `${Math.min(i, 8) * 45}ms` } as CSSProperties}>
            <div className="flex items-start gap-3">
              <span className="icon-3d shrink-0" aria-hidden><KIcon name="tag" size={14} className="inline shrink-0" /></span>
              <div className="min-w-0 flex-1">
                <span className="inline-block text-[10px] font-black uppercase tracking-widest bg-[#fff4d6] text-[#a36508] rounded-full px-2 py-0.5">Deal</span>
                {Boolean(d.featured) && <span className="ml-1 text-[10px] font-black uppercase tracking-widest bg-[#10243e] text-[#ffc72c] rounded-full px-2 py-0.5"><KIcon name="star" size={14} className="inline shrink-0" /> Featured</span>}
                {String(d.status ?? "live") === "pending" && <span className="ml-1 text-[10px] font-black uppercase tracking-widest bg-[#fff4d6] text-[#a36508] rounded-full px-2 py-0.5">Pending review</span>}
                <button type="button" onClick={() => setPreview(d)} className="mt-2 text-left font-bold text-[#10243e] text-lg leading-tight hover:text-[#558c2b] focus-visible:underline">{d.title}</button>
                <p className="text-xs text-[#1d3a5f]/60 mt-1">{d.business} · {d.suburb}</p>
                <p className="text-sm text-[#1d3a5f]/75 mt-2">{d.detail}</p>
                <button type="button" onClick={() => setPreview(d)} className="mt-2 text-xs font-bold text-[#558c2b] hover:underline">Full deal preview →</button>
                <SaveButton
                  className="mt-3"
                  type="deal"
                  id={String(d.id ?? "")}
                  title={String(d.title ?? "")}
                  suburb={String(d.suburb ?? "")}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
      <ErrorBanner error={error} />
      {live && visible.length === 0 && <Empty what="deals" />}
      <PostPreviewModal post={preview} kind="deal" onClose={() => setPreview(null)} />
    </Shell>
  );
}

export function GuidesLive() {
  const { rows, live, error } = useRealtime<Row>((cb, onErr) => subscribeArticles(cb as never, onErr), [], []);
  const { user } = useAuth();
  const [preview, setPreview] = useState<Row | null>(null);
  const visible = rows.filter((article) =>
    String(article.status ?? "live") === "live" ||
    Boolean(user?.uid && String(article.createdBy ?? "") === user.uid),
  );
  return (
    <Shell kicker="Original local content" title="South Africa guides & news" sub="Real prices and numbers, phoned in fresh — no scraped content." icon="file" crumbs={[{ label: "Home", href: "/" }, { label: "Guides" }]} badge={<LiveBadge live={live} />}>
      <PostPanel kind="guide" />
      {visible.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 items-start">
          {visible.map((a, i) => (
            <div key={(a.slug as string) ?? i} className="hippo-card p-5 hover-lift anim-rise flex flex-col" style={{ "--d": `${Math.min(i, 8) * 45}ms` } as CSSProperties}>
              <button type="button" onClick={() => setPreview(a)} className="group flex flex-1 flex-col text-left">
                <p className="text-[10px] font-black uppercase tracking-widest text-[#558c2b]">{a.suburb} · {a.readTime} read</p>
                <p className="font-extrabold text-[#10243e] text-lg leading-snug mt-1 group-hover:text-[#558c2b]">{a.title}</p>
                <p className="text-sm text-[#1d3a5f]/70 mt-1 flex-1 line-clamp-3 leading-relaxed">{a.excerpt}</p>
                <span className="text-xs font-bold text-[#558c2b] mt-3 group-hover:underline">Read the full guide →</span>
              </button>
              <SaveButton
                className="mt-3"
                type="guide"
                id={String(a.id ?? a.slug ?? "")}
                title={String(a.title ?? "")}
                suburb={String(a.suburb ?? "")}
                slug={String(a.slug ?? "")}
              />
            </div>
          ))}
        </div>
      )}
      <ErrorBanner error={error} />
      {live && visible.length === 0 && <Empty what="guides" />}
      <PostPreviewModal post={preview} kind="guide" onClose={() => setPreview(null)} />
    </Shell>
  );
}

/** Realtime seller-posted places shown alongside the curated place catalogue. */
export function CommunityPlacesLive() {
  const { rows, live, error } = useRealtime<Row>((cb, onErr) => subscribePlaces(cb as never, onErr), [], []);
  const { user } = useAuth();
  const [preview, setPreview] = useState<Row | null>(null);
  const visible = rows.filter((place) =>
    String(place.status ?? "live") === "live" ||
    Boolean(user?.uid && String(place.createdBy ?? "") === user.uid),
  );

  if (visible.length === 0 && live && !error) return null;
  return (
    <section className="space-y-3">
      <div>
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#558c2b]">Shared by local businesses</p>
        <h2 className="text-xl font-black text-[#10243e]">Community places {live && <span className="chip-live ml-1">Live</span>}</h2>
      </div>
      <ErrorBanner error={error} />
      {!live && !error ? (
        <div className="grid gap-3 sm:grid-cols-2" role="status" aria-label="Loading community places">
          {[0, 1].map((item) => <div key={item} className="hippo-card h-28 animate-pulse" />)}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {visible.map((place, i) => (
            <article key={String(place.id ?? i)} className="hippo-card min-w-0 p-4">
              <p className="text-xs font-black uppercase tracking-widest text-[#558c2b]">{String(place.kind ?? "Place")}{String(place.status ?? "") === "pending" ? " · Pending review" : ""}</p>
              <button type="button" onClick={() => setPreview(place)} className="mt-1 text-left text-lg font-extrabold text-[#10243e] hover:text-[#558c2b] focus-visible:underline">{String(place.title ?? place.name ?? "Place")}</button>
              <p className="mt-1 text-xs text-[#1d3a5f]/65">{String(place.suburb ?? "South Africa")} · {String(place.hours ?? "Hours on request")}</p>
              {typeof place.detail === "string" && <p className="mt-2 line-clamp-2 text-sm text-[#1d3a5f]/75">{place.detail}</p>}
              <button type="button" onClick={() => setPreview(place)} className="mt-3 text-xs font-bold text-[#558c2b] hover:underline">Full place preview →</button>
            </article>
          ))}
        </div>
      )}
      <PostPreviewModal post={preview} kind="place" onClose={() => setPreview(null)} />
    </section>
  );
}