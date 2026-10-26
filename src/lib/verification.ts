/**
 * Seller verification records — the provenance behind a "Verified" badge.
 *
 * WHY THIS EXISTS: `verified` used to be a bare boolean that an admin flipped with
 * a one-click button. Three real problems followed from that:
 *
 *   1. NO PROVENANCE. Nothing recorded who verified, when, or how. A badge that
 *      says "we checked" with no record of the check is not defensible — and under
 *      the CPA, displaying "Verified" is a factual representation about a
 *      business. If it is ever challenged, "an admin clicked a button at some
 *      point" is not an answer.
 *   2. NO RE-VERIFICATION. A number verified in 2024 may now belong to someone
 *      else. A boolean never goes stale, so the badge quietly becomes a lie.
 *   3. AUTO-VERIFICATION ON CLAIM (the worst of the three). `approveClaim` set
 *      `verified: true` automatically when a user claimed a listing. Proving you
 *      own a listing is NOT the same as proving the business exists and is
 *      contactable — which is exactly what `/about` says the badge means. That
 *      claim path is now closed: a claim transfers ownership only, and the badge
 *      still has to be earned.
 *
 * Verification therefore becomes a RECORD, written only by a trusted admin
 * endpoint, and it expires.
 */

export const VERIFICATION_METHODS = ["phone", "whatsapp", "email", "in_person", "documents"] as const;
export type VerificationMethod = (typeof VERIFICATION_METHODS)[number];

export const VERIFICATION_METHOD_LABEL: Record<VerificationMethod, string> = {
  phone: "Called the listed number",
  whatsapp: "Confirmed on WhatsApp",
  email: "Confirmed by email",
  in_person: "Visited in person",
  documents: "Checked business documents",
};

/**
 * How long a verification stays valid before it must be redone.
 *
 * Twelve months is deliberate: a phone number that answered a year ago is decent
 * evidence, not current evidence. Businesses that close, change owners or change
 * numbers are the main source of "verified" profiles that turn out to be dead, and
 * a forced re-check is the cheapest defence.
 */
export const VERIFICATION_VALID_DAYS = 365;

/** A verification record, stored on the business document under `verification`. */
export type VerificationRecord = {
  verifiedAt: string;
  /** Admin uid who performed the check — the audit anchor. */
  verifiedBy: string;
  method: VerificationMethod;
  /** Optional note about what was actually checked. Must not store personal data. */
  notes?: string;
  /** ISO date after which the badge needs re-checking. */
  expiresAt: string;
};

export const nowIso = () => new Date().toISOString();

/** Build a record with a computed expiry. */
export function buildVerificationRecord(input: {
  verifiedBy: string;
  method: VerificationMethod;
  notes?: string;
  now?: Date;
}): VerificationRecord {
  const now = input.now ?? new Date();
  return {
    verifiedAt: now.toISOString(),
    verifiedBy: input.verifiedBy,
    method: input.method,
    // Trimmed and length-capped: a note is operational ("called, answered by
    // reception"), not a place to paste in someone's ID number.
    notes: input.notes ? String(input.notes).trim().slice(0, 300) : undefined,
    expiresAt: new Date(now.getTime() + VERIFICATION_VALID_DAYS * 86_400_000).toISOString(),
  };
}

/** Read a stored record, or null when absent/malformed. */
export function readVerification(raw: unknown): VerificationRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  if (typeof v.verifiedAt !== "string" || typeof v.verifiedBy !== "string") return null;
  const method = VERIFICATION_METHODS.includes(v.method as VerificationMethod)
    ? (v.method as VerificationMethod)
    : "phone";
  return {
    verifiedAt: v.verifiedAt,
    verifiedBy: v.verifiedBy,
    method,
    notes: typeof v.notes === "string" ? v.notes : undefined,
    // Older records predate the expiry field; treat them as stale rather than
    // inventing a date, so they get re-checked.
    expiresAt: typeof v.expiresAt === "string" ? v.expiresAt : "",
  };
}

/** False once the expiry date has passed (or was never recorded). */
export function isVerificationCurrent(record: VerificationRecord | null, now: Date = new Date()): boolean {
  if (!record) return false;
  const expiry = Date.parse(record.expiresAt);
  if (!Number.isFinite(expiry)) return false;
  return expiry > now.getTime();
}

/** Whole days until re-verification is due; 0 once overdue. */
export function daysUntilReverify(record: VerificationRecord | null, now: Date = new Date()): number {
  if (!record) return 0;
  const expiry = Date.parse(record.expiresAt);
  if (!Number.isFinite(expiry)) return 0;
  return Math.max(0, Math.ceil((expiry - now.getTime()) / 86_400_000));
}

/**
 * The public-facing sentence under a badge.
 *
 * Says WHAT was checked and WHEN, never "we guarantee quality" — `/about`
 * already states that verification means "the listing is real and contactable",
 * and the UI must not quietly overclaim beyond that.
 */
export function verificationSentence(record: VerificationRecord | null): string {
  if (!record) return "";
  const method = VERIFICATION_METHOD_LABEL[record.method] ?? "Checked by our team";
  const date = new Date(record.verifiedAt);
  const when = Number.isFinite(date.getTime())
    ? date.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
    : "";
  return when ? `${method} on ${when}` : method;
}