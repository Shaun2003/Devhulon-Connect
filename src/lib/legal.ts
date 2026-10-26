import { SITE_SHORT } from "@/lib/site";

/**
 * Legal versions & consent copy — SINGLE SOURCE OF TRUTH.
 *
 * Why this module exists: the privacy policy promises that quote requests are
 * shared with businesses and that personal information is removed or anonymised
 * on request. Neither promise was MECHANICAL — nothing recorded what a buyer
 * agreed to when their phone number was handed to several sellers, and the rules
 * made deletion impossible. This module gives both a concrete, versioned shape so
 * the written policy and the running system cannot drift apart.
 *
 * Deliberately pure (no Firebase imports) so the same constants drive the client
 * checkbox, the server route that validates it, and the documents stamped onto
 * stored records. Bump a version whenever the wording changes materially: the old
 * value stays on historical records so an old consent is never silently re-read
 * as consent to new terms.
 */

/** Bump when the Terms of Use / Buyer Terms change materially. */
export const TERMS_VERSION = "2026-09-15";

/** Bump when the consent wording below changes. */
export const CONSENT_VERSION = "2026-10-23";

/**
 * What the buyer is explicitly agreeing to at the point their number is shared.
 *
 * Kept short, plain and specific on purpose: POPIA requires CONSENT to be a
 * specific, informed and unambiguous act, so the wording must name WHO receives
 * the data and WHY — "I consent to my details being shared" does not.
 */
export const LEAD_CONSENT_LABEL =
  "Yes, share my number and details with the businesses matched to this request so they can quote me.";

/** Short privacy summary shown under the checkbox. */
export const LEAD_CONSENT_DETAIL =
  "Up to 5 matched businesses are alerted. They can access your name and number only if they unlock your contact through Devhulon Connect, and may use it only to quote this job. You can withdraw consent at any time and request deletion.";

/** Seller-side equivalent, for creating a listing (contact details are published). */
export const LISTING_CONSENT_LABEL =
  `Yes, publish my business contact details on my public ${SITE_SHORT} listing.`;

export const LISTING_CONSENT_DETAIL =
  `Your business name, category, service area and contact details are visible to anyone searching ${SITE_SHORT}. Verified businesses carry a badge; unverified listings say so.`;

/**
 * How long we keep a quote request before anonymising it.
 *
 * POPIA s14 requires a retention limit — "we keep it as long as needed" is not a
 * policy, it is an excuse. A quote request is only useful while pros may still
 * reply and while the buyer may still compare, so 180 days is generous; after
 * that the personal fields are stripped and only the anonymous outcome is kept
 * for aggregate analytics.
 */
export const LEAD_RETENTION_DAYS = 180;

/**
 * How many businesses ONE buyer request may reach.
 *
 * Lives here (not in lib/server/lead-allocation) so the BROWSER can quote the
 * real ceiling in its consent copy. The server clamps to exactly this range in
 * `clampFanout`; keeping one constant is what stops the promise in the checkbox
 * from quietly disagreeing with the number of strangers who actually receive the
 * number.
 */
export const MAX_ALERTED_PROS = 5;
export const DEFAULT_ALERTED_PROS = 3;

/** Past this age an open (never-answered) request is closed and stood down. */
export const LEAD_OPEN_EXPIRY_DAYS = 30;

/**
 * Terms acceptance, recorded on the ACCOUNT at signup.
 *
 * WHY A VERSION ON THE ACCOUNT AND NOT ONLY ON LEADS: stamping `termsVersion` on
 * each lead proves consent to quote, but it does not answer the question a
 * dispute actually turns on — "did this person agree to these terms, and which
 * version?" That has to be answerable about the ACCOUNT, at a point in time.
 * Records here are immutable evidence; bumping this constant later does not
 * rewrite what someone agreed to.
 *
 * The tick is enforced in `SignInModal` on the SIGNUP path only. Requiring it on
 * every sign-in would train people to click it without reading, which destroys
 * the evidentiary value entirely — the opposite of the point.
 */
export const SIGNUP_TERMS_LABEL =
  "I accept the Terms of Use and Privacy Policy, and agree to the Acceptable Use Policy.";

export const SIGNUP_TERMS_DETAIL =
  "Buyers and sellers also have their own terms. You can browse without an account — nothing is collected until you sign up.";

/** The terms that apply by role, for the signup copy. */
export const ROLE_TERMS_PATH = {
  buyer: "/buyer-terms",
  seller: "/seller-terms",
} as const;

/**
 * Record written to `users/{uid}` on acceptance.
 *
 * `ip` and `userAgent` are deliberately NOT stored. An IP address is personal
 * information under POPIA with its own retention obligations, and the date +
 * terms version is what actually evidences acceptance. Collecting more would
 * create a liability without adding evidentiary value.
 */
export type TermsAcceptance = {
  acceptedAt: string;
  termsVersion: string;
  consentVersion: string;
  /** Which role(s) the person accepted as. A seller is also bound by seller terms. */
  role: "buyer" | "seller";
};

/**
 * Strip the personal fields from a lead/quote record while keeping the commercial
 * outcome. Used by both the erasure route and the retention sweep.
 *
 * WHY ANONYMISE RATHER THAN DELETE THE DOCUMENT: the seller's record of what they
 * quoted, and the aggregate win-rate statistics, are not the data subject's
 * personal information once the identifiers are gone. Keeping the shape while
 * destroying the identity is what lets the privacy policy say "anonymised"
 * truthfully, and it preserves an audit trail for disputes.
 */
export const REDACTED = "[redacted]";

export function redactLead<T extends Record<string, unknown>>(lead: T): T {
  return {
    ...lead,
    name: REDACTED,
    email: null,
    // The number is normalised to empty rather than null so existing callers that
    // build a tel: link from it cannot resurrect a "null" string.
    phone: "",
    requesterUid: null,
    requesterRedacted: true,
  };
}
