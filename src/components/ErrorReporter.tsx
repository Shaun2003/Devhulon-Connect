"use client";

import { useEffect } from "react";
import { installErrorReporting } from "@/lib/error-reporting";

/**
 * Installs the global error handlers once at the root layout.
 *
 * A tiny client component rather than a side effect in `layout.tsx` because that
 * file is a Server Component — importing the reporter (which touches `window`)
 * into it would pull browser-only code onto the server, and would fail the build.
 *
 * It returns `null` and exists purely for its effect. A React error BOUNDARY
 * (catching render errors) is deliberately not added here: it would swallow the
 * rendered error UI that users need, and the global handlers already capture what
 * a boundary would.
 */
export default function ErrorReporter() {
  useEffect(() => {
    installErrorReporting();
  }, []);
  return null;
}