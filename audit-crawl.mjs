// Runtime crawl against `next start` on :3000 — verifies real HTTP status of
// every reachable internal page + reports missing SEO essentials.
const BASE = process.env.AUDIT_BASE ?? "http://localhost:3000";

const seeds = [
  "/", "/services", "/locations", "/guides", "/jobs", "/events", "/deals", "/places",
  "/tools", "/emergency", "/pricing", "/advertise", "/list-business", "/request-quote",
  "/compare-quotes", "/search", "/about", "/contact", "/dashboard", "/admin", "/messages",
  "/privacy-policy", "/terms", "/cookie-policy", "/seller-terms", "/buyer-terms",
  "/refund-policy", "/community-guidelines", "/acceptable-use", "/subscription-terms",
  "/sitemap.xml", "/robots.txt", "/ads.txt", "/manifest.webmanifest",
];

const seen = new Map(); // path -> { status, title, desc, canonical, h1, ogTitle, href }
const SKIP = /^($|\/(api|_next|favicon|assets|_vercel))/;

function internalLinks(html) {
  const out = new Set();
  for (const m of html.matchAll(/href="([^"#]+)(?:#[^"]*)?"/g)) {
    let h = m[1];
    if (!h || h.startsWith("mailto:") || h.startsWith("tel:") || h.startsWith("data:") || h.startsWith("blob:")) continue;
    if (h.startsWith("//")) continue;
    if (/^https?:/i.test(h)) {
      try {
        const u = new URL(h);
        if (u.host !== "localhost") continue; // external
        h = u.pathname;
      } catch { continue; }
    }
    if (!h.startsWith("/")) continue;
    if (SKIP.test(h)) continue;
    out.add(h.split("?")[0].replace(/\/$/, "") || "/");
  }
  return [...out];
}

async function grab(p) {
  if (seen.has(p)) return seen.get(p);
  const rec = { path: p, status: 0, links: [], title: "", desc: "", canonical: "", h1: 0, og: 0, jsonld: 0, err: "" };
  seen.set(p, rec);
  try {
    const r = await fetch(BASE + p, { redirect: "manual" });
    rec.status = r.status;
    const loc = r.headers.get("location");
    const ct = r.headers.get("content-type") || "";
    if (r.status >= 300 && r.status < 400 && loc) rec.redirectTo = loc;
    if (ct.includes("html")) {
      const html = await r.text();
      rec.title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [, ""])[1].trim();
      rec.desc = (html.match(/<meta name="description" content="([^"]*)"/i) || [, ""])[1].trim();
      rec.canonical = (html.match(/<link rel="canonical" href="([^"]*)"/i) || [, ""])[1].trim();
      rec.h1 = (html.match(/<h1[\s>]/gi) || []).length;
      rec.og = (html.match(/property="og:(title|description|url)"/gi) || []).length;
      rec.jsonld = (html.match(/application\/ld\+json/gi) || []).length;
      rec.size = html.length;
      rec.links = internalLinks(html);
    }
  } catch (e) { rec.err = String(e.message || e); }
  return rec;
}

// BFS depth 2 (home + index pages reveal most templates)
const queue = seeds.map((s) => s.replace(/\/$/, "") || "/");
const depth = new Map(queue.map((p) => [p, 0]));
const all = [];
while (queue.length) {
  const batch = queue.splice(0, 12);
  const res = await Promise.all(batch.map(async (p) => ({ p, rec: await grab(p) })));
  for (const { p, rec } of res) {
    all.push(rec);
    const d = depth.get(p) ?? 0;
    if (d >= 2) continue;
    for (const l of rec.links) {
      if (seen.has(l) || depth.has(l)) continue;
      depth.set(l, d + 1);
      queue.push(l);
    }
  }
}

const bad = all.filter((r) => r.status >= 400 || r.status === 0);
const redirect = all.filter((r) => r.status >= 300 && r.status < 400);
const noTitle = all.filter((r) => (r.status === 200) && !r.title);
const noDesc = all.filter((r) => (r.status === 200) && !r.desc && (r.path.match(/\.html$|^\/$/) || r.path.length > 1));
const multiH1 = all.filter((r) => r.status === 200 && r.h1 !== 1);
const noCanon = all.filter((r) => r.status === 200 && !r.canonical && !r.path.match(/\.(xml|txt|webmanifest|ico|json)$/));

console.log(`pages_crawled=${all.length}`);
console.log(`\n== NON-2xx (${bad.length}) ==`);
for (const r of bad) console.log(`  ${r.status || "ERR"} ${r.path} ${r.err}${r.redirectTo ? " ->" + r.redirectTo : ""}`);
console.log(`\n== REDIRECTS (${redirect.length}) ==`);
for (const r of redirect) console.log(`  ${r.status} ${r.path} -> ${r.redirectTo || "?"}`);
console.log(`\n== MISSING <title> (${noTitle.length}) ==`);
for (const r of noTitle) console.log(`  ${r.path}`);
console.log(`\n== MISSING meta description (${noDesc.length}) ==`);
for (const r of noDesc.slice(0, 40)) console.log(`  ${r.path}`);
console.log(`\n== h1 != 1 (${multiH1.length}) ==`);
for (const r of multiH1.slice(0, 40)) console.log(`  h1=${r.h1} ${r.path}`);
console.log(`\n== NO canonical (${noCanon.length}) ==`);
for (const r of noCanon.slice(0, 40)) console.log(`  ${r.path}`);
console.log(`\n== sample titles ==`);
for (const r of all.slice(0, 14)) console.log(`  [${r.status}] ${r.path} :: ${r.title.slice(0, 80)}`);
