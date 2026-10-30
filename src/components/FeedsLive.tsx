"use client";
import { KIcon, type IconKey } from "@/lib/icons";
import { useState, type ReactNode, type FormEvent, type CSSProperties } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/components/AuthProvider";
import { useRealtime, subscribeJobs, subscribeEvents, subscribeDeals, subscribeArticles, subscribePlaces, listenerHint, type RealtimeError } from "@/lib/realtime";
import { submitJob, submitEvent, submitDeal, submitPlace, submitGuide } from "@/lib/repo";
import { CtaBand } from "@/components/hippo";
import { PageHero } from "@/components/ui";
import SaveButton from "@/components/SaveButton";
import { SITE_SHORT } from "@/lib/site";
import PostPreviewModal from "@/components/PostPreviewModal";
import PostSearch, { matchesPostSearch } from "@/components/PostSearch";

type Row = Record<string, string>;
type FeedPostKind = "job" | "event" | "deal" | "guide" | "place";

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

function FeedPostCard({
  post,
  kind,
  title,
  summary,
  metadata,
  onPreview,
}: {
  post: Row;
  kind: FeedPostKind;
  title: string;
  summary?: string;
  metadata: string[];
  onPreview: () => void;
}) {
  const icon: IconKey = kind === "job" ? "briefcase" : kind === "event" ? "ticket" : kind === "deal" ? "tag" : kind === "guide" ? "file" : "mapPin";
  const label = kind[0].toUpperCase() + kind.slice(1);
  const id = String(post.id ?? post.slug ?? "");
  const suburb = String(post.suburb ?? "");
  const rawImageUrl = kind === "place" ? String(post.imageUrl ?? "").trim() : "";
  let imageUrl = "";
  if (rawImageUrl) {
    try {
      const parsed = new URL(rawImageUrl);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") imageUrl = parsed.href;
    } catch {
      imageUrl = "";
    }
  }

  return (
    <article className={`hippo-card flex h-full min-h-[250px] min-w-0 flex-col overflow-hidden !rounded-2xl ${imageUrl ? "p-0" : "p-4"}`}>
      {imageUrl && (
        <Image
          src={imageUrl}
          alt={`${title} photo`}
          width={800}
          height={240}
          unoptimized
          className="h-24 w-full shrink-0 object-cover"
        />
      )}
      <div className={`flex min-w-0 flex-1 flex-col gap-3 ${imageUrl ? "p-4" : ""}`}>
      <div className="flex min-w-0 items-start gap-3">
        <span className="icon-3d icon-3d-md shrink-0" aria-hidden="true">
          <KIcon name={icon} size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-h-6 flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-[#f2f6fa] px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-[#1d3a5f]/75">{label}</span>
            {Boolean(post.featured) && <span className="rounded-full bg-[#10243e] px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-[#ffc72c]">Featured</span>}
            {String(post.status ?? "live") === "pending" && <span className="rounded-full bg-[#fff4d6] px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-[#a36508]">Pending review</span>}
          </div>
          <button
            type="button"
            onClick={onPreview}
            className="mt-2 block w-full min-h-[3.5rem] line-clamp-2 break-words text-left text-base font-extrabold leading-snug text-[#10243e] hover:text-[#558c2b] focus-visible:underline"
          >
            {title}
          </button>
        </div>
      </div>
      <div className="min-h-10 space-y-1">
        {metadata.slice(0, 2).map((value, index) => (
          <p key={`${index}-${value}`} className="truncate text-xs text-[#1d3a5f]/65">{value}</p>
        ))}
      </div>
      <p className="min-h-10 line-clamp-2 break-words text-sm leading-5 text-[#1d3a5f]/75">
        {summary || "Open the preview to see more information."}
      </p>
      <div className="mt-auto flex min-w-0 items-center justify-between gap-2 border-t border-[#e7eef5] pt-3">
        <button type="button" onClick={onPreview} className="min-w-0 truncate text-left text-xs font-extrabold text-[#558c2b] hover:underline">
          Preview {kind}
        </button>
        <SaveButton type={kind} id={id} title={title} suburb={suburb} slug={kind === "guide" || kind === "place" ? String(post.slug ?? "") : undefined} />
      </div>
      </div>
    </article>
  );
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
        {badge ? <div className="mt-3 flex min-w-0 items-center justify-between gap-3">{badge}</div> : null}
      </PageHero>
      <main className="max-w-6xl mx-auto px-4 py-10 space-y-8">
        {children}
        <CtaBand />
      </main>
    </div>
  );
}

const inputCls = "rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-3 py-2.5 text-sm outline-none w-full";

function todayInSouthAfrica(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** The five seller-publishable post types. Mirrors `PostCollection` in repo.ts. */
type PostKind = "job" | "event" | "deal" | "place" | "guide";
type PostField = {
  name: string;
  label: string;
  placeholder?: string;
  type?: "text" | "date" | "url";
  required?: boolean;
  minLength?: number;
  options?: string[];
  rows?: number;
};

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

const POST_FIELDS: Record<PostKind, PostField[]> = {
  job: [
    { name: "title", label: "Job title", placeholder: "e.g. Delivery Driver", required: true, minLength: 3 },
    { name: "company", label: "Employer / business", placeholder: "Company or trader name", required: true, minLength: 2 },
    { name: "suburb", label: "Location", placeholder: "Suburb or town", required: true, minLength: 2 },
    { name: "type", label: "Employment type", required: true, options: ["Full-time", "Part-time", "Contract", "Apprenticeship", "Piece job"] },
    { name: "pay", label: "Pay", placeholder: "e.g. R45 per order, salary range, or negotiable", required: true, minLength: 2 },
    { name: "detail", label: "Responsibilities and how to apply", placeholder: "Describe the work, requirements, and application instructions.", required: true, minLength: 30, rows: 5 },
  ],
  event: [
    { name: "title", label: "Event name", placeholder: "Name your event", required: true, minLength: 3 },
    { name: "venue", label: "Venue", placeholder: "Venue name or address", required: true, minLength: 2 },
    { name: "suburb", label: "Location", placeholder: "Suburb or town", required: true, minLength: 2 },
    { name: "date", label: "Event date", type: "date", required: true },
    { name: "fee", label: "Entry fee", placeholder: "Free or ticket price", required: true, minLength: 1 },
    { name: "detail", label: "Event details", placeholder: "What can visitors expect? Include booking or entry instructions.", required: true, minLength: 20, rows: 5 },
  ],
  deal: [
    { name: "title", label: "Deal title", placeholder: "e.g. 20% off a full car service", required: true, minLength: 3 },
    { name: "business", label: "Business name", placeholder: "Name shown on your business profile", required: true, minLength: 2 },
    { name: "suburb", label: "Location", placeholder: "Suburb or town", required: true, minLength: 2 },
    { name: "validUntil", label: "Offer valid until", type: "date", required: true },
    { name: "detail", label: "Offer terms", placeholder: "State the price, discount, eligibility, exclusions, and how to redeem.", required: true, minLength: 20, rows: 5 },
  ],
  place: [
    { name: "title", label: "Place name", placeholder: "e.g. Union Buildings", required: true, minLength: 2 },
    { name: "imageUrl", label: "Picture link (optional)", placeholder: "https://example.com/place-photo.jpg", type: "url" },
    { name: "kind", label: "Place category", required: true, options: ["Attraction", "Restaurant", "Nature", "Mall", "Nightlife", "Sport", "Family"] },
    { name: "suburb", label: "Location", placeholder: "Suburb or town", required: true, minLength: 2 },
    { name: "hours", label: "Opening hours", placeholder: "Days and opening hours", required: true, minLength: 2 },
    { name: "detail", label: "Visitor information", placeholder: "Describe what visitors can do, access details, and any important notices.", required: true, minLength: 20, rows: 5 },
  ],
  guide: [
    { name: "title", label: "Guide title", placeholder: "A clear, useful title", required: true, minLength: 5 },
    { name: "suburb", label: "Area covered", placeholder: "Suburb, town, or South Africa", required: true, minLength: 2 },
    { name: "excerpt", label: "Summary", placeholder: "A short summary shown on the guide card", required: true, minLength: 30 },
    { name: "body", label: "Guide article", placeholder: "Write original, helpful information. Include practical details and sources where relevant.", required: true, minLength: 80, rows: 10 },
  ],
};

/**
 * Seller-only submit panel.
 *
 * Posting is NOT a buyer feature, so the whole card is withheld from anyone who
 * is not a seller — previously the heading and the "+ Post" button rendered for
 * every visitor, including signed-out ones, and only the form behind the button
 * was gated. Buyers saw an upload affordance they could never use.
 *
 * The server-owned subscription and Firestore rules remain the authority for
 * publishing entitlements.
 */
export function PostPanel({ kind }: { kind: PostKind }) {
  const { role, loading: authLoading, user } = useAuth();
  const canPost = role === "seller";
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
      if (kind === "job") await submitJob({ title: v("title"), company: v("company"), suburb: v("suburb"), type: v("type"), pay: v("pay"), detail: v("detail") });
      else if (kind === "event") await submitEvent({ title: v("title"), venue: v("venue"), suburb: v("suburb"), date: v("date"), fee: v("fee"), detail: v("detail") });
      else if (kind === "deal") await submitDeal({ title: v("title"), business: v("business"), suburb: v("suburb"), detail: v("detail"), validUntil: v("validUntil") });
      else if (kind === "place") await submitPlace({ title: v("title"), imageUrl: v("imageUrl"), suburb: v("suburb"), kind: v("kind"), detail: v("detail"), hours: v("hours") });
      else await submitGuide({ title: v("title"), suburb: v("suburb"), excerpt: v("excerpt"), body: v("body") });
      setMsg(`${LABEL[kind]} saved — find it in your dashboard ✓`);
      formEl.reset();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not submit.");
    } finally { setBusy(false); }
  }

  const heading = HEADING[kind];
  const fields = POST_FIELDS[kind];
  const titleField = fields.find((field) => field.name === "title");
  const contentField = fields.find((field) => field.rows);
  const detailFields = fields.filter((field) => field !== titleField && field !== contentField);
  const posterName = user?.displayName?.trim() || "Your business";
  const posterInitial = posterName.charAt(0).toUpperCase();
  // Buyers (and signed-out visitors) never see the posting card at all. While the
  // auth listener is still resolving, render nothing rather than flashing the
  // form at somebody who turns out to be a buyer.
  if (authLoading || role !== "seller") return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-[#d6e1ec] bg-white shadow-sm">
      <div className="flex items-center gap-3 p-4 sm:p-5">
        <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#10243e] text-base font-black text-white">
          {posterInitial}
        </span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="min-h-11 flex-1 rounded-full border border-[#d6e1ec] bg-[#f7f9fb] px-5 text-left text-sm font-semibold text-[#1d3a5f]/65 transition hover:bg-[#eef3f8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#558c2b]"
        >
          {open ? `Creating ${LABEL[kind].toLowerCase()} post` : "Start a post"}
        </button>
        <div className="hidden text-right sm:block">
          <p className="max-w-40 truncate text-sm font-bold text-[#10243e]">{posterName}</p>
          <p className="text-xs text-[#1d3a5f]/55">Posting as a seller</p>
        </div>
      </div>
      {open && !canPost && (
        <div className="mt-4 rounded-2xl bg-[#f2f6fa] p-4 text-sm">
          <p className="font-bold text-[#10243e]">Your plan doesn&apos;t include posting yet.</p>
          <p className="text-[#1d3a5f]/75 mt-1">
            Publishing is included with Starter and Premium. Premium adds more advanced seller tools.
            Browsing, saving businesses and requesting quotes stay free.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/pricing" className="btn-hippo text-sm">See plans </Link>
          </div>
        </div>
      )}
      {open && canPost && (
        <form onSubmit={onSubmit} className="border-t border-[#e7eef5]">
          <div className="space-y-4 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-[#10243e]">{heading}</h3>
                <p className="mt-0.5 text-xs text-[#1d3a5f]/60">Share a clear, useful update with the DevhulonConnect community.</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="hidden rounded-full bg-[#f2f6fa] px-3 py-1 text-xs font-bold text-[#1d3a5f]/70 sm:inline-flex">Public post</span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-full border border-[#d6e1ec] px-3 py-1.5 text-xs font-bold text-[#1d3a5f] transition hover:bg-[#f2f6fa] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#558c2b]"
                  aria-label={`Minimize ${LABEL[kind].toLowerCase()} form`}
                >
                  Minimize
                </button>
              </div>
            </div>

            {titleField && <PostFieldControl field={titleField} variant="title" />}
            {contentField && <PostFieldControl field={contentField} variant="content" />}

            {detailFields.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {detailFields.map((field) => <PostFieldControl key={field.name} field={field} />)}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 border-t border-[#e7eef5] bg-[#f9fbfc] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-xs text-[#1d3a5f]/60">Required fields are marked with an asterisk.</p>
            <button disabled={busy} className="btn-hippo min-w-36 text-sm disabled:opacity-60">{busy ? "Submitting…" : `Publish ${LABEL[kind].toLowerCase()}`}</button>
          </div>
          {(msg || err) && (
            <div className="space-y-2 px-4 pb-4 sm:px-5">
              {msg && <p role="status" className="text-sm font-bold text-[#3c6b1d]">{msg}</p>}
              {err && <p role="alert" className="text-sm font-bold text-red-700">{err}</p>}
            </div>
          )}
        </form>
      )}
    </section>
  );
}

function PostFieldControl({
  field,
  variant = "default",
}: {
  field: PostField;
  variant?: "default" | "title" | "content";
}) {
  const controlClass = variant === "title"
    ? "w-full border-0 border-b-2 border-[#e7eef5] bg-transparent px-1 py-3 text-xl font-bold text-[#10243e] outline-none placeholder:font-normal placeholder:text-[#1d3a5f]/40 focus:border-[#7ac142]"
    : variant === "content"
      ? "w-full resize-y rounded-xl border border-[#e7eef5] bg-white px-3 py-3 text-sm leading-6 text-[#10243e] outline-none placeholder:text-[#1d3a5f]/45 focus:border-[#7ac142]"
      : inputCls;

  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-xs font-extrabold text-[#10243e]">
        {field.label}{field.required && <span aria-hidden="true"> *</span>}
      </span>
      {field.options ? (
        <select name={field.name} required={field.required} defaultValue="" className={controlClass}>
          <option value="" disabled>Choose {field.label.toLowerCase()}</option>
          {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      ) : field.rows ? (
        <textarea
          name={field.name}
          rows={field.rows}
          required={field.required}
          minLength={field.minLength}
          placeholder={field.placeholder}
          className={controlClass}
        />
      ) : (
        <input
          name={field.name}
          type={field.type ?? "text"}
          required={field.required}
          minLength={field.minLength}
          placeholder={field.placeholder}
          min={field.type === "date" ? todayInSouthAfrica() : undefined}
          className={controlClass}
        />
      )}
    </label>
  );
}

export function JobsLive() {
  const { rows, live, error } = useRealtime<Row>((cb, onErr) => subscribeJobs(cb as never, onErr), [], []);
  const { user, role } = useAuth();
  const [preview, setPreview] = useState<Row | null>(null);
  const [search, setSearch] = useState("");
  const uid = user?.uid ?? "";
  // Moderation: show live posts + your own pending posts (with a badge).
  const visible = rows
    .filter((j) => { const st = String(j.status ?? "live"); return st === "live" || (uid && String(j.createdBy ?? "") === uid); })
    .filter((j) => matchesPostSearch(j, search))
    .sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)));
  return (
    <Shell kicker="Hustle board" title="Jobs in South Africa" sub="Piece jobs, full-time and apprenticeships — posted live by local employers." icon="briefcase" crumbs={[{ label: "Home", href: "/" }, { label: "Jobs" }]} badge={<><LiveBadge live={live} /><PostSearch role={role} value={search} onChange={setSearch} label="jobs" /></>}>
      <PostPanel kind="job" />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((j, i) => (
          <li key={(j.id as string) ?? i} className="min-w-0" style={{ "--d": `${Math.min(i, 8) * 45}ms` } as CSSProperties}>
            <FeedPostCard
              post={j}
              kind="job"
              title={String(j.title ?? "")}
              summary={String(j.detail ?? "")}
              metadata={[String(j.company ?? ""), [j.suburb, j.type, j.pay].filter(Boolean).join(" · ")]}
              onPreview={() => setPreview(j)}
            />
          </li>
        ))}
      </ul>
      <ErrorBanner error={error} />
      {live && visible.length === 0 && (search ? <p className="text-sm text-[#1d3a5f]/60">No jobs match your search.</p> : <Empty what="jobs" />)}
      <PostPreviewModal post={preview} kind="job" onClose={() => setPreview(null)} />
    </Shell>
  );
}

export function EventsLive() {
  const { rows, live, error } = useRealtime<Row>((cb, onErr) => subscribeEvents(cb as never, onErr), [], []);
  const { user, role } = useAuth();
  const [preview, setPreview] = useState<Row | null>(null);
  const [search, setSearch] = useState("");
  const uid = user?.uid ?? "";
  const visible = rows
    .filter((e) => { const st = String(e.status ?? "live"); return st === "live" || (uid && String(e.createdBy ?? "") === uid); })
    .filter((e) => matchesPostSearch(e, search))
    .sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)));
  return (
    <Shell kicker="This weekend & beyond" title="Events in South Africa" sub="Markets, groove, church, sport & community. Free to submit, free to browse." icon="calendar" crumbs={[{ label: "Home", href: "/" }, { label: "Events" }]} badge={<><LiveBadge live={live} /><PostSearch role={role} value={search} onChange={setSearch} label="events" /></>}>
      <PostPanel kind="event" />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((e, i) => (
          <li key={(e.id as string) ?? i} className="min-w-0" style={{ "--d": `${Math.min(i, 8) * 45}ms` } as CSSProperties}>
            <FeedPostCard
              post={e}
              kind="event"
              title={String(e.title ?? "")}
              summary={String(e.detail ?? "")}
              metadata={[String(e.venue ?? ""), [e.suburb, e.date, e.fee].filter(Boolean).join(" · ")]}
              onPreview={() => setPreview(e)}
            />
          </li>
        ))}
      </ul>
      <ErrorBanner error={error} />
      {live && visible.length === 0 && (search ? <p className="text-sm text-[#1d3a5f]/60">No events match your search.</p> : <Empty what="events" />)}
      <PostPreviewModal post={preview} kind="event" onClose={() => setPreview(null)} />
    </Shell>
  );
}

export function DealsLive() {
  const { rows, live, error } = useRealtime<Row>((cb, onErr) => subscribeDeals(cb as never, onErr), [], []);
  const { user, role } = useAuth();
  const [preview, setPreview] = useState<Row | null>(null);
  const [search, setSearch] = useState("");
  const uid = user?.uid ?? "";
  const today = todayInSouthAfrica();
  const visible = rows
    .filter((d) => { const st = String(d.status ?? "live"); return st === "live" || (uid && String(d.createdBy ?? "") === uid); })
    .filter((d) => String(d.createdBy ?? "") === uid || !d.validUntil || String(d.validUntil) >= today)
    .filter((d) => matchesPostSearch(d, search))
    .sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)));
  return (
    <Shell kicker="Hot specials" title="Deals in South Africa" sub={`Local specials from verified businesses — mention ${SITE_SHORT} to redeem.`} icon="tag" crumbs={[{ label: "Home", href: "/" }, { label: "Deals" }]} badge={<><LiveBadge live={live} /><PostSearch role={role} value={search} onChange={setSearch} label="deals" /></>}>
      <PostPanel kind="deal" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((d, i) => (
          <div key={(d.id as string) ?? i} className="min-w-0" style={{ "--d": `${Math.min(i, 8) * 45}ms` } as CSSProperties}>
            <FeedPostCard
              post={d}
              kind="deal"
              title={String(d.title ?? "")}
              summary={String(d.detail ?? "")}
              metadata={[String(d.business ?? ""), [d.suburb, d.validUntil ? `Valid until ${d.validUntil}` : ""].filter(Boolean).join(" · ")]}
              onPreview={() => setPreview(d)}
            />
          </div>
        ))}
      </div>
      <ErrorBanner error={error} />
      {live && visible.length === 0 && (search ? <p className="text-sm text-[#1d3a5f]/60">No deals match your search.</p> : <Empty what="deals" />)}
      <PostPreviewModal post={preview} kind="deal" onClose={() => setPreview(null)} />
    </Shell>
  );
}

export function GuidesLive() {
  const { rows, live, error } = useRealtime<Row>((cb, onErr) => subscribeArticles(cb as never, onErr), [], []);
  const { user, role } = useAuth();
  const [preview, setPreview] = useState<Row | null>(null);
  const [search, setSearch] = useState("");
  const visible = rows.filter((article) =>
    String(article.status ?? "live") === "live" ||
    Boolean(user?.uid && String(article.createdBy ?? "") === user.uid),
  ).filter((article) => matchesPostSearch(article, search));
  return (
    <Shell kicker="Original local content" title="South Africa guides & news" sub="Real prices and numbers, phoned in fresh — no scraped content." icon="file" crumbs={[{ label: "Home", href: "/" }, { label: "Guides" }]} badge={<><LiveBadge live={live} /><PostSearch role={role} value={search} onChange={setSearch} label="guides" /></>}>
      <PostPanel kind="guide" />
      {visible.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((a, i) => (
            <div key={(a.slug as string) ?? i} className="min-w-0" style={{ "--d": `${Math.min(i, 8) * 45}ms` } as CSSProperties}>
              <FeedPostCard
                post={a}
                kind="guide"
                title={String(a.title ?? "")}
                summary={String(a.excerpt ?? "")}
                metadata={[String(a.suburb ?? ""), String(a.readTime ? `${a.readTime} read` : "")]}
                onPreview={() => setPreview(a)}
              />
            </div>
          ))}
        </div>
      )}
      <ErrorBanner error={error} />
      {live && visible.length === 0 && (search ? <p className="text-sm text-[#1d3a5f]/60">No guides match your search.</p> : <Empty what="guides" />)}
      <PostPreviewModal post={preview} kind="guide" onClose={() => setPreview(null)} />
    </Shell>
  );
}

/** Realtime seller-posted places, displayed with the shared compact post card. */
export function CommunityPlacesLive() {
  const { rows, live, error } = useRealtime<Row>((cb, onErr) => subscribePlaces(cb as never, onErr), [], []);
  const { user, role } = useAuth();
  const [preview, setPreview] = useState<Row | null>(null);
  const [search, setSearch] = useState("");
  const visible = rows.filter((place) =>
    String(place.status ?? "live") === "live" ||
    Boolean(user?.uid && String(place.createdBy ?? "") === user.uid),
  ).filter((place) => matchesPostSearch(place, search));

  return (
    <>
    <PageHero
      kicker="What can I do near me?"
      title="Places to go in South Africa"
      sub="Discover places shared by local businesses and the community. Browse useful details, locations and opening hours from real posts."
      icon="mapPin"
      crumbs={[{ label: "Home", href: "/" }, { label: "Places" }]}
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <LiveBadge live={live} />
        <PostSearch role={role} value={search} onChange={setSearch} label="places" />
      </div>
    </PageHero>
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-10">
    <PostPanel kind="place" />
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
      ) : visible.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((place, i) => (
            <div key={String(place.id ?? i)} className="min-w-0">
              <FeedPostCard
                post={place}
                kind="place"
                title={String(place.title ?? place.name ?? "Place")}
                summary={String(place.detail ?? "")}
                metadata={[String(place.kind ?? "Place"), [place.suburb, place.hours].filter(Boolean).join(" · ")]}
                onPreview={() => setPreview(place)}
              />
            </div>
          ))}
        </div>
      ) : live && !error ? (
        search ? <p className="text-sm text-[#1d3a5f]/60">No places match your search.</p> : <Empty what="community places" />
      ) : null}
      {error && visible.length === 0 && (
        <p className="text-sm text-[#1d3a5f]/60">Community place posts are unavailable right now.</p>
      )}
      <PostPreviewModal post={preview} kind="place" onClose={() => setPreview(null)} />
    </section>
    </main>
    </>
  );
}