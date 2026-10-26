import type { NextConfig } from "next";

/**
 * This app is full of REALTIME content — business listings, quotes, jobs, events,
 * deals, reviews and saves all arrive over Firestore listeners. Prerendered HTML
 * must therefore never be cached hard at a CDN or in the browser, or a rebuilt
 * page keeps serving the previous deploy.
 *
 * Next's default for a prerendered page is `s-maxage=31536000` (one year), which
 * is right for a content site that redeploys rarely but wrong here: during
 * development it means a rebuilt page is invisible until the browser cache
 * expires, which reads as "my changes did nothing".
 *
 * `_next/static/*` is still immutable and long-lived — those filenames are
 * content-hashed, so a changed asset always gets a new URL.
 */
const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Every page that is NOT an immutable hashed asset.
        //
        // `_next/static` is deliberately excluded: those filenames embed a
        // content hash, so a changed file always gets a brand-new URL and can be
        // cached forever without ever serving stale CSS or JS. Excluding them
        // here keeps `/:path*` from forcing a no-store re-download of every
        // stylesheet and bundle on each page view.
        source: "/((?!_next/static|_next/image).*)",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
