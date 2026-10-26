import { NextResponse } from "next/server";
import { SITE_NAME } from "@/lib/site";

export const dynamic = "force-static";

/**
 * /ads.txt — authoritative list of who may sell our ad inventory.
 * Google AdSense requires this file once ads are live: without it, demand
 * drops and unauthorised resellers can't be blocked.
 * The publisher ID is derived from NEXT_PUBLIC_ADSENSE_CLIENT (ca-pub-…).
 */
export function GET() {
  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? "";
  const pub = client.replace(/^ca-/, ""); // "ca-pub-123" → "pub-123"
  const body = /^pub-\d+$/.test(pub)
    ? `# ${SITE_NAME} — AdSense publisher authorisation\ngoogle.com, ${pub}, DIRECT, f08c47fec0942fa0\n`
    : `# ${SITE_NAME}: AdSense is not switched on yet.\n# Set NEXT_PUBLIC_ADSENSE_CLIENT=ca-pub-xxxxxxxxxxxxxxxx in .env.local,\n# then redeploy — this file will list your publisher ID.\n`;
  return new NextResponse(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}