/**
 * Cookie / advertising consent — POPIA (South Africa) + Google AdSense.
 * Stored in localStorage only (no cookie set until the visitor decides).
 *
 *   "all"        → analytics + personalised ads allowed
 *   "essential"  → site works, no ad scripts loaded
 *
 * Advertising consent is stored separately from essential platform operation.
 */
export const CONSENT_KEY = "kasi-consent-v1";
export type Consent = "all" | "essential";

export function readConsent(): Consent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CONSENT_KEY);
    return raw === "all" || raw === "essential" ? raw : null;
  } catch {
    return null;
  }
}

export function writeConsent(value: Consent): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CONSENT_KEY, value);
  } catch {
    /* private mode — consent simply isn't remembered */
  }
  window.dispatchEvent(new Event(CONSENT_EVENT));
}

/** Fired whenever the visitor changes their choice (same tab). */
export const CONSENT_EVENT = "kasi-consent";

export const hasAdConsent = () => readConsent() === "all";