import type { MetadataRoute } from "next";
import { SITE_NAME, SITE_URL } from "@/lib/site";

/**
 * PWA manifest — Devhulon Connect is mobile-first (most buyers are on phones with
 * unreliable data), so it must be installable and open without browser chrome.
 * Icons use the supplied Devhulon Connect mark.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — Connecting buyers with services and service providers`,
    short_name: SITE_NAME,
    description:
      "Discover services offered by participating service providers and connect with them through the platform.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f2f6fa",
    theme_color: "#10243e",
    lang: "en-ZA",
    dir: "ltr",
    categories: ["business", "lifestyle", "shopping"],
    icons: [
      { src: "/devhulon-connect-icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/devhulon-connect-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    ],
    shortcuts: [
      { name: "Compare quotes", url: "/request-quote" },
      { name: "Jobs", url: "/jobs" },
      { name: "Any area", url: "/locations" },
    ],
    id: SITE_URL,
  };
}