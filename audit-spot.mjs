// Focused status + head-tag spot checks against the running server (:3000).
const BASE = process.env.AUDIT_BASE ?? "http://localhost:3000";
const urls = [
  "/south-africa/all/plumbers",
  "/pretoria/pretoria-north",
  "/pretoria/pretoria-north/plumbers",
  "/pretoria/waterkloof",
  "/johannesburg",
  "/johannesburg/sandton/plumbers",
  "/services/plumbers",
  "/guides",
  "/places",
  "/tools",
  "/business/ptn-plumb-01",
  "/jobs",
  "/events",
  "/deals",
  "/emergency",
  "/locations",
  "/blog",
  "/sitemap.xml",
];

for (const u of urls) {
  try {
    const r = await fetch(BASE + u, { redirect: "manual" });
    const loc = r.headers.get("location");
    console.log(`${String(r.status).padEnd(4)} ${u}${loc ? " -> " + loc : ""}`);
  } catch (e) {
    console.log(`ERR  ${u} ${e.message}`);
  }
}

// head-tag audit for a few key pages
for (const u of ["/", "/pretoria", "/pretoria/pretoria-north/plumbers", "/services/plumbers", "/business/ptn-plumb-01", "/jobs"]) {
  const r = await fetch(BASE + u);
  const html = await r.text();
  const pick = (re) => (html.match(re) || [, ""])[1];
  console.log(`\n### ${u}`);
  console.log("  title      :", pick(/<title[^>]*>([^<]*)<\/title>/i));
  console.log("  desc       :", pick(/<meta name="description" content="([^"]*)"/i).slice(0, 90));
  console.log("  canonical  :", pick(/<link rel="canonical" href="([^"]*)"/i) || "(none)");
  console.log("  robots     :", pick(/<meta name="robots" content="([^"]*)"/i) || "(none)");
  console.log("  og:title   :", pick(/property="og:title" content="([^"]*)"/i) || "(none)");
  console.log("  og:image   :", pick(/property="og:image" content="([^"]*)"/i) || "(none)");
  console.log("  twitter:cd :", pick(/name="twitter:card" content="([^"]*)"/i) || "(none)");
  console.log("  jsonld     :", (html.match(/application\/ld\+json/gi) || []).length);
  console.log("  h1         :", (html.match(/<h1[\s>]/gi) || []).length, "| h2:", (html.match(/<h2[\s>]/gi) || []).length);
}

const sm = await (await fetch(BASE + "/sitemap.xml")).text();
console.log("\n== sitemap head ==");
console.log(sm.slice(0, 320));
console.log("sitemap url count:", (sm.match(/<url>/g) || []).length);
const rb = await (await fetch(BASE + "/robots.txt")).text();
console.log("\n== robots.txt ==\n" + rb);
const ads = await (await fetch(BASE + "/ads.txt")).text();
console.log("== ads.txt ==\n" + ads.slice(0, 200));
