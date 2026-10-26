/**
 * Client error reporting — no vendor dependency, no SDK, no new package.
 *
 * WHY HAND-ROLLED: a hosted error service (Sentry et al.) means a third-party
 * script, a dependency, and a paid plan before you know whether you need it. This
 * reports to OUR OWN endpoint, so the errors land in infrastructure the project
 * already owns (Firestore + the admin console) with nothing extra to run.
 *
 * What it deliberately does NOT do:
 *   • No PII. A phone number or access token inside a stack trace is a POPIA
 *     incident, so messages are scrubbed for long digit runs and bearer tokens,
 *     and capped in length. Errors are useless if redacted into meaninglessness,
 *     which is why the patterns target credential/long-number SHAPES specifically.
 *   • No sampling games. `sessionThrottle` stops one error loop from writing
 *     thousands of rows, which is both a cost and a way to bury every other error.
 *   • No retry. `keepalive` with a single attempt; a failing reporter must never
 *     become the thing that breaks the page.
 *
 * `NEXT_PUBLIC_ERROR_REPORTING` turns it off entirely (set to "off") without a
 * code change, so it can be disabled in production without a redeploy.
 */

const ENDPOINT = "/api/errors";
const KEY = "kasi-error-reporting";

/** Read once; "off" disables entirely. Unset means enabled. */
function enabled(): boolean {
  try {
    if (typeof window === "undefined") return false;
    if (window.localStorage.getItem(KEY) === "off") return false;
  } catch {
    /* private mode — default to enabled */
  }
  return process.env.NEXT_PUBLIC_ERROR_REPORTING !== "off";
}

/** Strip the shapes most likely to carry credentials or personal data. */
export function scrub(message: string): string {
  return String(message ?? "")
    .slice(0, 500)
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [redacted]")
    .replace(/\b[0-9]{9,}\b/g, "[redacted-number]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[redacted-email]");
}

/** At most this many distinct errors per session, so a loop cannot flood storage. */
const SESSION_CAP = 25;
let sentThisSession = 0;

export function reportError(err: unknown, context?: string): void {
  if (!enabled() || sentThisSession >= SESSION_CAP) return;

  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : "Non-error thrown";
  const stack = err instanceof Error ? err.stack : undefined;

  sentThisSession++;
  try {
    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: scrub(message),
        stack: stack ? scrub(stack).slice(0, 2000) : null,
        context: context ? scrub(context).slice(0, 200) : null,
        at: new Date().toISOString(),
        url: typeof window !== "undefined" ? window.location.pathname : null,
        // Browser + version only. No fingerprinting of the person, and nothing
        // that could identify a user without their account.
        ua: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : null,
      }),
      keepalive: true,
    }).catch(() => {
      /* the reporter failing is never the user's problem */
    });
  } catch {
    /* never let reporting throw into a render path */
  }
}

/**
 * Install the global handlers. Called once from the root layout's client effect.
 *
 * `unhandledrejection` is included because most real-world JS failures arrive as a
 * rejected promise and are otherwise invisible until a user reports them.
 */
export function installErrorReporting(): void {
  if (typeof window === "undefined") return;

  window.addEventListener("error", (e) => {
    reportError(e.error ?? e.message, "window.onerror");
  });
  window.addEventListener("unhandledrejection", (e) => {
    reportError(e.reason, "unhandledrejection");
  });
}