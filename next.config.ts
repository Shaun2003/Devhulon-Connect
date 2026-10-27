import type { NextConfig } from "next";

// Let Next.js set caching according to how each route renders:
// prerendered public pages can be served from Vercel's edge cache, while
// dynamic pages and authenticated endpoints retain their framework defaults.
const nextConfig: NextConfig = {};

export default nextConfig;
