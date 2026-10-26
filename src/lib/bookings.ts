/**
 * Bookings & scheduling — pure rules for the appointment flow (master spec §39).
 *
 * No Firebase imports: the same validation and status machine run in the UI and
 * are re-applied by firestore.rules on the server. Statuses are the spec's six:
 * Requested → Confirmed → Completed, with Cancelled / No-show / Rescheduled
 * branching off — and a review is expected once a booking completes.
 */

export type BookingStatus =
  | "requested"
  | "confirmed"
  | "rescheduled"
  | "cancelled"
  | "completed"
  | "no-show";

/** A `bookings/{id}` document, as both the UI and the rules see it. */
export type Booking = {
  id: string;
  buyerUid: string;
  sellerUid: string;
  businessId: string;
  businessName?: string | null;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM (24h, SAST)
  durationHours: number;
  note: string; // buyer's brief
  status: BookingStatus;
  buyerNote?: string | null;
  sellerNote?: string | null;
  createdAt?: unknown;
  updatedAt?: unknown;
  decidedAt?: unknown;
};

export const BOOKING_LIMITS = {
  minHours: 0.5,
  maxHours: 12,
  note: 500,
  buyerNote: 200,
  sellerNote: 200,
} as const;

export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  requested: "Awaiting confirmation",
  confirmed: "Confirmed",
  rescheduled: "Rescheduled",
  cancelled: "Cancelled",
  completed: "Completed",
  "no-show": "No-show",
};

export const BOOKING_STATUS_TONE: Record<BookingStatus, string> = {
  requested: "bg-[#fff4d6] text-[#a36508]",
  confirmed: "bg-[#e8f6d8] text-[#3c6b1d]",
  rescheduled: "bg-[#fff4d6] text-[#a36508]",
  cancelled: "bg-[#f2f6fa] text-[#1d3a5f]/70",
  completed: "bg-[#10243e] text-[#ffc72c]",
  "no-show": "bg-[#f2f6fa] text-[#1d3a5f]/70",
};

export function normalizeBookingStatus(v: unknown): BookingStatus {
  const s = String(v ?? "requested");
  return s === "confirmed" || s === "rescheduled" || s === "cancelled" || s === "completed" || s === "no-show"
    ? s
    : "requested";
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** YYYY-MM-DD today in SAST — the marketplace's operating clock. */
export function bookingToday(): string {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Africa/Johannesburg" }));
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${mm}-${dd}`;
}

/** Human problems for a booking request (empty array = valid). */
export function validateBooking(d: { date?: unknown; time?: unknown; durationHours?: unknown; note?: unknown }): string[] {
  const issues: string[] = [];
  const date = String(d.date ?? "").trim();
  const time = String(d.time ?? "").trim();
  const hours = Number(d.durationHours);
  if (!DATE_RE.test(date)) issues.push("Pick a date for the booking.");
  else if (date < bookingToday()) issues.push("That date is in the past — pick today or later.");
  if (!TIME_RE.test(time)) issues.push("Pick a start time (24-hour, e.g. 14:30).");
  if (!Number.isFinite(hours) || hours < BOOKING_LIMITS.minHours) {
    issues.push("Choose how long you need (at least 30 minutes).");
  } else if (hours > BOOKING_LIMITS.maxHours) {
    issues.push(`Bookings are capped at ${BOOKING_LIMITS.maxHours} hours — split bigger jobs into visits.`);
  }
  if (String(d.note ?? "").trim().length > BOOKING_LIMITS.note) {
    issues.push(`Keep the note under ${BOOKING_LIMITS.note} characters.`);
  }
  return issues;
}

/** Trim + clamp a request into the stored shape. */
export function cleanBookingDraft(d: { date?: unknown; time?: unknown; durationHours?: unknown; note?: unknown }): {
  date: string;
  time: string;
  durationHours: number;
  note: string;
} {
  return {
    date: String(d.date ?? "").trim().slice(0, 10),
    time: String(d.time ?? "").trim().slice(0, 5),
    durationHours: Math.min(Math.max(Math.round(Number(d.durationHours) * 2) / 2, BOOKING_LIMITS.minHours), BOOKING_LIMITS.maxHours),
    note: String(d.note ?? "").trim().slice(0, BOOKING_LIMITS.note),
  };
}

/** "Tue 23 Sep · 14:30 (2h)" for list rows and headers. */
export function bookingWhen(b: { date?: unknown; time?: unknown; durationHours?: unknown }): string {
  const date = String(b.date ?? "");
  const time = String(b.time ?? "");
  const hours = Number(b.durationHours ?? 0);
  let day = date;
  if (DATE_RE.test(date)) {
    const d = new Date(`${date}T00:00:00`);
    day = Number.isFinite(d.getTime())
      ? d.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" })
      : date;
  }
  const dur = hours > 0 ? ` (${hours % 1 === 0 ? hours : hours.toFixed(1)}h)` : "";
  return `${day}${time ? ` · ${time}` : ""}${dur}`;
}

/** Which transitions are legal from a status (spec §39 flow, both roles). */
export function canTransition(from: BookingStatus, to: BookingStatus, role: "buyer" | "seller"): boolean {
  if (from === "cancelled" || from === "completed" || from === "no-show") return false;
  if (role === "buyer") return to === "cancelled" && (from === "requested" || from === "confirmed");
  // seller
  if (from === "requested") return to === "confirmed" || to === "rescheduled" || to === "cancelled";
  if (from === "confirmed") return to === "completed" || to === "no-show" || to === "cancelled" || to === "rescheduled";
  return to === "rescheduled"; // rescheduled stays in play for the seller
}
