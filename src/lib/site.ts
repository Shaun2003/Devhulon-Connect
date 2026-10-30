/**
 * Single source of truth for site-wide constants (SEO + legal pages).
 *
 * EVERY value here is env-overridable. That was not originally true: `SITE_URL`
 * and `CONTACT_EMAIL` were overridable while the entity name, short name and phone
 * were hardcoded. These values can now be set per environment.
 *
 * Defaults reflect the current deployment but must be checked before launch.
 * `assertSiteConfig()` warns about obvious example.com placeholders.
 *
 * Env keys are NEXT_PUBLIC_ because these values are read in Server AND Client
 * Components — the footer and legal pages render on both.
 */

/** Trim, and fall back when a var is unset OR blank (CI often injects ""). */
function env(key: string, fallback: string): string {
  const v = process.env[key];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : fallback;
}

export const SITE_URL = env("NEXT_PUBLIC_SITE_URL", "https://devhulonconnect.co.za").replace(/\/$/, "");
export const SITE_NAME = env("NEXT_PUBLIC_SITE_NAME", "DevhulonConnect");
/** Short form for tight UI slots (nav, chips, meta titles). */
export const SITE_SHORT = env("NEXT_PUBLIC_SITE_SHORT", "DevhulonConnect");
/** Registered legal entity, used on invoices and the terms footer. */
export const SITE_LEGAL = env("NEXT_PUBLIC_SITE_LEGAL", "Devhulon Business and People Solutions (Pty) Ltd");
export const CONTACT_EMAIL = env("NEXT_PUBLIC_CONTACT_EMAIL", "Info@devhulonconnect.co.za");
export const CONTACT_PHONE_DISPLAY = env("NEXT_PUBLIC_CONTACT_PHONE", "");
/** Tel-href form: digits and a leading +, spaces stripped. */
export const CONTACT_PHONE_TEL = env("NEXT_PUBLIC_CONTACT_PHONE_TEL", CONTACT_PHONE_DISPLAY.replace(/[^\d+]/g, ""));
export const CONTACT_HOURS = env("NEXT_PUBLIC_CONTACT_HOURS", "08h30–16h30");

/**
 * True when any identity/contact value is still the placeholder.
 *
 * Deliberately conservative: `SITE_URL` is checked because a canonical pointing
 * at `example.com` breaks SEO outright, and the contact values because the
 * complaints page presents them as the formal address.
 */
export function siteConfigIsPlaceholder(): boolean {
  return (
    SITE_URL.includes("example.com") ||
    CONTACT_EMAIL.includes("example.com") ||
    SITE_NAME.includes("example.com")
  );
}

/**
 * Names the specific placeholder values still in place, for a boot-time warning.
 * Returns an empty array when the config is real.
 */
export function siteConfigPlaceholders(): string[] {
  const out: string[] = [];
  if (SITE_URL.includes("example.com")) out.push("NEXT_PUBLIC_SITE_URL");
  if (CONTACT_EMAIL.includes("example.com")) out.push("NEXT_PUBLIC_CONTACT_EMAIL");
  if (SITE_NAME.includes("example.com")) out.push("NEXT_PUBLIC_SITE_NAME");
  return out;
}
