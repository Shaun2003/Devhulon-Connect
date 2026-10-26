import { SITE_SHORT } from "@/lib/site";
export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

/**
 * Firestore Timestamp | number | ISO string | null → "just now" / "5 min ago" /
 * "3 days ago" / an absolute date once it is older than ~30 days.
 *
 * Accepts every shape a timestamp arrives in: a Firestore `Timestamp`
 * (has `toDate()`), a JS `Date`, epoch millis, or an ISO string. Returns null
 * when there is nothing usable, so callers can omit the element rather than
 * print "Invalid Date".
 */
export function timeAgo(value: unknown): string | null {
  if (value == null) return null;
  let ms: number;
  if (typeof value === "number") ms = value;
  else if (value instanceof Date) ms = value.getTime();
  else if (typeof value === "string") ms = Date.parse(value);
  else if (typeof value === "object" && typeof (value as { toDate?: unknown }).toDate === "function") {
    try {
      ms = (value as { toDate: () => Date }).toDate().getTime();
    } catch {
      return null;
    }
  } else return null;
  if (!Number.isFinite(ms) || ms <= 0) return null;

  const mins = Math.floor((Date.now() - ms) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(ms).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

export const waLink = (number: string | undefined, text: string) =>
  number ? `https://wa.me/${number}?text=${encodeURIComponent(text)}` : "#";

/**
 * Time-of-day greeting for dashboard headers.
 *
 * Splits the day at 12:00 (afternoon starts at lunch) and 18:00 (evening),
 * evaluated in the viewer's local time — a dashboard greeting is for the person
 * reading it, not the server's clock. Replaces the fixed isiZulu "Sawubona"
 * with English that matches the rest of the UI copy.
 */
export function greetingFor(now: Date = new Date()): "Good morning" | "Good afternoon" | "Good evening" {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/**
 * Best-effort "open now" from hours strings like
 * "Mon–Sat 07:00–18:00 · 24/7 emergencies". Returns null when unparseable.
 */
export function isOpenNow(hours: string | undefined): boolean | null {
  if (!hours) return null;
  const h = hours.toLowerCase();
  if (h.includes("24/7")) return true;
  const m = h.match(/(\d{1,2})[:.](\d{2})?\s*(am|pm)?\s*(?:-|–|—|to)\s*(\d{1,2})[:.](\d{2})?\s*(am|pm)?/);
  if (!m) return null;
  const to24 = (v: number, ap?: string) => {
    if (ap === "pm" && v < 12) return v + 12;
    if (ap === "am" && v === 12) return 0;
    return v;
  };
  const start = to24(parseInt(m[1], 10), m[3]);
  let end = to24(parseInt(m[4], 10), m[6]);
  if (!m[3] && !m[6] && end <= start) end += 12; // "07:00–18:00" style
  try {
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Africa/Johannesburg" }));
    const cur = now.getHours() + now.getMinutes() / 60;
    return cur >= start && cur <= end;
  } catch {
    return null;
  }
}

/** Broken-image fallback placeholder (tiny inline SVG, KASI colours). */
export const IMG_FALLBACK =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="100%" height="100%" fill="#e7eef5"/><text x="50%" y="50%" font-family="Arial" font-size="14" font-weight="bold" fill="#1d3a5f" text-anchor="middle">${SITE_SHORT} · photo coming soon</text></svg>`
  );

const PICS = [
  "https://images.unsplash.com/photo-1581578731548-c64695cc6952",
  "https://images.unsplash.com/photo-1498050108023-c5249f4df085",
  "https://images.unsplash.com/photo-1503676260728-1c00da094a0b",
  "https://images.unsplash.com/photo-1544161515-4ab6ce6db874",
  "https://images.unsplash.com/photo-1619642751034-765dfdf7c58e",
  "https://images.unsplash.com/photo-1507679799987-c73779587ccf",
  "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b",
  "https://images.unsplash.com/photo-1522202176988-66273c2fd55f",
  "https://images.unsplash.com/photo-1600880292203-757bb62b4baf",
  "https://images.unsplash.com/photo-1551288049-bebda4e38f71",
  "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4",
  "https://images.unsplash.com/photo-1556761175-4b46a572b786",
  "https://images.unsplash.com/photo-1581291518857-4e27b48ff24e",
  "https://images.unsplash.com/photo-1521791136064-7986c2920216",
  "https://images.unsplash.com/photo-1664575602276-acd073f104c1",
  "https://images.unsplash.com/photo-1573164713988-8665fc963095",
  "https://images.unsplash.com/photo-1600880292089-90a7e086ee0c",
  "https://images.unsplash.com/photo-1542744173-8e7e53415bb0",
  "https://images.unsplash.com/photo-1519389950473-47ba0277781c",
  "https://images.unsplash.com/photo-1552664730-d307ca884978",
  "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158",
  "https://images.unsplash.com/photo-1540553016722-983e48a2cd10",
  "https://images.unsplash.com/photo-1588702546671-cf28420e6f77",
  "https://images.unsplash.com/photo-1504384308090-c894fdcc538d",
  "https://images.unsplash.com/photo-1531973576160-7125cd663d86"
];

export function getBgUrl(slug: string) {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) hash = slug.charCodeAt(i) + ((hash << 5) - hash);
  return `${PICS[Math.abs(hash) % PICS.length]}?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80`;
}
