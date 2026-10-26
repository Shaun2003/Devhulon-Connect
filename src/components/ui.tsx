import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import AdSenseAd from "@/components/AdSenseAd";
import { KIcon, type IconKey } from "@/lib/icons";

/**
 * Star rating. Uses the shared `star` icon rather than the <KIcon name="star" size={14} className="inline shrink-0" />/<KIcon name="star" size={14} className="inline shrink-0" /> glyphs so the
 * whole site shares one icon system (and one optical weight) — the glyphs
 * rendered in a different font from everything else next to them.
 */
export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  const rounded = Math.round(value);
  return (
    <span
      className="inline-flex items-center gap-0.5 text-amber-500"
      role="img"
      aria-label={`${value.toFixed(1)} out of 5 stars`}
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <KIcon key={i} name="star" size={size} fill={i < rounded ? "currentColor" : "none"} />
      ))}
    </span>
  );
}

/**
 * Rating + review count, with an honest empty state.
 *
 * A listing with no reviews used to render five empty stars next to a literal
 * "0.0" and "(0 reviews)" — which reads as a business rated badly at zero
 * rather than one nobody has reviewed yet. Both values are also optional in
 * Firestore, so an absent `rating` printed "NaN" in some places.
 *
 * `reviewCount <= 0` (or a missing rating) now shows the `empty` label instead.
 * `countOnly` matches the tighter card slots that only had room for "(3)".
 */
export function RatingSummary({
  rating,
  reviews,
  empty = "New listing · no reviews yet",
  className = "",
  countOnly = false,
}: {
  rating?: number | null;
  reviews?: number | null;
  /** Text shown when there is no rating to display. */
  empty?: string;
  className?: string;
  /** Render just "(3)" instead of "3 reviews" — for compact card slots. */
  countOnly?: boolean;
}) {
  const r = Number(rating ?? 0);
  const n = Number(reviews ?? 0);
  if (!Number.isFinite(r) || !Number.isFinite(n) || n <= 0 || r <= 0) {
    return (
      <span className={`text-[#1d3a5f]/55 font-semibold ${className}`}>{empty}</span>
    );
  }
  return (
    <span className={`flex items-center gap-1.5 ${className}`}>
      <Stars value={r} />
      <span className="font-extrabold text-[#10243e]">{r.toFixed(1)}</span>
      <span className="text-[#1d3a5f]/50 text-xs">{countOnly ? `(${n})` : `(${n} review${n === 1 ? "" : "s"})`}</span>
    </span>
  );
}

/**
 * THE page header — one component, every page.
 *
 * This exists because headers had drifted into four different designs: the
 * /services hero (navy gradient + navy icon plate + gold kicker), a
 * centre-aligned Unsplash banner, a plain white section, and several bespoke
 * variants. /services/[slug] is the reference design, so this reproduces it
 * exactly: same `hippo-hero` surface, same breadcrumb, same navy icon plate,
 * same gold kicker / white H1 / 75%-white lede stack, same container and
 * spacing. Passing `crumbs` adds the breadcrumb trail where a page has one.
 */
export function PageHero({
  kicker,
  title,
  sub,
  crumbs,
  children,
}: {
  /** Small gold uppercase line above the title (e.g. "Home Services · 12 pros"). */
  kicker?: string;
  title: string;
  /** Muted white lede under the title. */
  sub?: string;
  /** Retained for existing callers; page titles no longer show decorative icons. */
  icon?: IconKey;
  /** Breadcrumb trail; last item is the current page. */
  crumbs?: { label: string; href?: string }[];
  /** Optional extra content under the lede (filters, chips, CTAs). */
  children?: ReactNode;
}) {
  return (
    <div className="hippo-hero text-white">
      <div className="mx-auto w-full max-w-6xl min-w-0 px-4 pt-6 pb-8 sm:px-6 sm:pt-8 sm:pb-10">
        {crumbs && crumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="min-w-0 text-xs font-bold text-white/60">
            <ol className="flex items-center gap-1.5 flex-wrap">
              {crumbs.map((c, i) => (
                <li key={c.label + i} className="flex items-center gap-1.5">
                  {c.href ? (
                    <Link href={c.href} className="hover:text-white transition-colors">
                      {c.label}
                    </Link>
                  ) : (
                    <span aria-current="page" className="text-white">
                      {c.label}
                    </span>
                  )}
                  {i < crumbs.length - 1 && (
                    <span aria-hidden="true" className="text-white/40">
                      /
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}

        {kicker && (
          <p className="mt-4 text-xs font-extrabold uppercase tracking-[0.18em] text-[#ffc72c] sm:mt-5">
            {kicker}
          </p>
        )}
        <h1 className="mt-2 break-words text-3xl font-black tracking-tight sm:text-4xl">{title}</h1>
        {sub && <p className="mt-2 max-w-2xl break-words text-sm text-white/75 sm:text-base">{sub}</p>}

        {children && <div className="mt-4 min-w-0">{children}</div>}
      </div>
    </div>
  );
}

/** Standard page body container — same width/padding as the hero above it. */
export function PageBody({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <main className={`max-w-6xl mx-auto px-4 py-10 space-y-10 ${className}`}>{children}</main>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#e8f6d8] text-[#3c6b1d]">{children}</span>;
}

/**
 * THE icon plate — one component, used on every page.
 *
 * Before this existed, icons were placed by hand and three different treatments
 * ended up in the codebase: a near-black navy plate, a flat light plate with a
 * dark green glyph, and a bare inline glyph. The navy plate is gone — its dark
 * gradient and drop shadow read as a smudge behind the glyph. What is left is
 * the one treatment that matched the service pages: the light `.icon-3d` plate
 * with a green glyph, which also lifts on hover. `variant` only controls size.
 */
export function IconPlate({
  icon,
  size = 20,
  variant = "sm",
  className = "",
}: {
  icon: IconKey;
  size?: number;
  /** `sm` is the card-sized plate; `lg` is the page-hero plate. */
  variant?: "sm" | "lg";
  className?: string;
}) {
  return (
    <span
      className={`icon-3d ${variant === "lg" ? "icon-3d-lg" : "icon-3d-sm"} ${className}`}
      aria-hidden="true"
    >
      <KIcon name={icon} size={size} />
    </span>
  );
}

export function SectionTitle({ kicker, title, sub, link, linkLabel }: { kicker?: string; title: string; sub?: string; link?: string; linkLabel?: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 sm:gap-4 mb-5">
      <div className="min-w-0">
        {kicker && <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#558c2b]">{kicker}</p>}
        <h2 className="text-xl sm:text-2xl font-black text-[#10243e] tracking-tight">{title}</h2>
        {sub && <p className="text-sm text-[#1d3a5f]/70 mt-1 max-w-2xl">{sub}</p>}
      </div>
      {link && <Link href={link} className="text-sm font-bold text-[#10243e] link-underline hover:text-[#558c2b] shrink-0 pb-0.5 self-start sm:self-auto">{linkLabel ?? "View all →"}</Link>}
    </div>
  );
}

/**
 * Ad slot — renders a real Google AdSense unit once NEXT_PUBLIC_ADSENSE_CLIENT
 * is set (and the ad slot ID, per ad unit). Until then shows a labelled,
 * content-safe placeholder. Never add more than 1–2 of these per page: Google
 * explicitly warns against ads outweighing content or accidental clicks.
 */
export function AdSlot({ label = "Advertisement", slot }: { label?: string; slot?: string }) {
  return <AdSenseAd label={label} slot={slot} />;
}

export function TrustBar({ items }: { items?: { icon: IconKey; title: string; sub: string }[] }) {
  // Every claim here must be one we can actually stand behind. The previous
  // "Real reviews — From neighbours, not bots" was not: reviews do not REQUIRE a
  // booking (we record booking provenance but do not gate on it), so we cannot
  // promise a review came from a real customer, let alone that it isn't bot
  // generated. Under the CPA an unsubstantiated trust claim is an offence, and an
  // overclaim here undercuts the Verified badge's credibility next to it.
  const defaults: { icon: IconKey; title: string; sub: string }[] = [
    { icon: "badgeCheck", title: "Verified locals", sub: "Checked by phone & WhatsApp" },
    { icon: "message", title: "Up to 3 quotes", sub: "One request, multiple replies" },
    { icon: "tag", title: "Free for you", sub: "No fees, no spam, no card" },
    { icon: "star", title: "Reviews you can check", sub: "We remove fakes when reported" },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-start">
      {(items ?? defaults).map((t, i) => (
        <div key={t.title} className="hippo-card p-4 flex items-start gap-3 hover-lift anim-rise" style={{ "--d": `${i * 60}ms` } as CSSProperties}>
          <span
            className="icon-3d icon-3d-xs shrink-0"
            aria-hidden
          >
            <KIcon name={t.icon} size={18} />
          </span>
          <span className="min-w-0">
            <span className="block font-extrabold text-[#10243e] text-sm">{t.title}</span>
            <span className="block text-xs text-[#1d3a5f]/70 mt-0.5">{t.sub}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

export function HowItWorks() {
  const steps: { icon: IconKey; title: string; text: string }[] = [
    { icon: "search", title: "Tell us what you need", text: "Pick a service + your area. Takes 30 seconds." },
    { icon: "sliders", title: "We match you to pros", text: "Only relevant, local, rated businesses." },
    { icon: "phone", title: "Call or WhatsApp", text: "Numbers are live. No middleman, no waiting." },
  ];
  return (
    <div className="grid sm:grid-cols-3 gap-3 items-start">
      {steps.map((s, i) => (
        <div
          key={s.title}
          className="hippo-card p-5 relative overflow-hidden hover-lift anim-rise"
          style={{ "--d": `${i * 80}ms` } as CSSProperties}
        >
          <span
            className="absolute -top-2 right-2 text-[64px] font-black text-[#f2f6fa] select-none"
            aria-hidden
          >
            {i + 1}
          </span>
          <span
            className="icon-3d icon-3d-md relative"
            aria-hidden
          >
            <KIcon name={s.icon} size={20} />
          </span>
          <p className="font-extrabold text-[#10243e] mt-3">
            Step {i + 1}: {s.title}
          </p>
          <p className="text-sm text-[#1d3a5f]/70 mt-1">{s.text}</p>
        </div>
      ))}
    </div>
  );
}
