// Static audit: enumerate real routes from src/app, then verify every internal
// link/redirect target used anywhere in src actually resolves to a route.
import fs from "node:fs";
import path from "node:path";

const APP = "src/app";
const SRC = "src";

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// ---- 1. routes -------------------------------------------------------------
const pages = [];
const apis = [];
for (const f of walk(APP)) {
  const rel = path.relative(APP, f).replace(/\\/g, "/");
  const dir = path.dirname(rel);
  const base = path.basename(rel);
  if (base === "page.tsx" || base === "page.ts") {
    pages.push("/" + (dir === "." ? "" : dir.split("/").filter((d) => d !== "(auth)").join("/")).replace(/\/$/, ""));
  } else if (base === "route.ts") {
    apis.push("/" + dir);
  }
}
const staticAssets = ["/sitemap.xml", "/robots.txt", "/manifest.webmanifest", "/ads.txt", "/favicon.ico"];

const routePat = (r) => new RegExp("^" + r.replace(/\[+([^\]]+)\]+/g, "([^/]+)").replace(/^\$/, "") + "$");
const routeMatchers = [...new Set([...pages, ...staticAssets])].map((r) => ({ route: r, re: routePat(r || "/") }));

// ---- 2. collect every internal target used in code ------------------------
const files = walk(SRC).filter((f) => /\.(tsx|ts)$/.test(f) && !f.startsWith(APP + "/api"));
const found = [];
const push = (target, file, line) => { if (target.startsWith("/")) found.push({ target, file, line }); };

for (const f of files) {
  const text = fs.readFileSync(f, "utf8");
  const lines = text.split(/\r?\n/);
  lines.forEach((ln, i) => {
    // href="..."  href='...'  href={"..."}  href={...}
    for (const m of ln.matchAll(/href\s*=\s*\{?\s*["'`]([^"'`$]*)["'`]/g)) push(m[1], f, i + 1);
    // template literal hrefs: href={`/a/${x}/b`}
    for (const m of ln.matchAll(/href\s*=\s*\{?\s*`([^`$]*(?:\$\{[^}]*\}[^`$]*)*)`/g)) push(m[1].replace(/\$\{[^}]*\}/g, "\u0001"), f, i + 1);
    // programmatic navigation
    for (const m of ln.matchAll(/(?:router\.)?(?:push|replace|prefetch)\s*\(\s*["'`]([^"'`$]*)["'`]/g)) push(m[1], f, i + 1);
    for (const m of ln.matchAll(/(?:router\.)?(?:push|replace|prefetch)\s*\(\s*`([^`$]*(?:\$\{[^}]*\}[^`$]*)*)`/g)) push(m[1].replace(/\$\{[^}]*\}/g, "\u0001"), f, i + 1);
    for (const m of ln.matchAll(/redirect\s*\(\s*["'`]([^"'`$]*)["'`]/g)) push(m[1], f, i + 1);
    for (const m of ln.matchAll(/location(?:\.href)?\s*=\s*["'`]\/([^"'`]*)["'`]/g)) push("/" + m[1], f, i + 1);
    // nav-config object literals: { href: "/jobs", label: "Jobs" }
    for (const m of ln.matchAll(/\bhref\s*:\s*["'`]([^"'`$]*)["'`]/g)) push(m[1], f, i + 1);
    for (const m of ln.matchAll(/\bhref\s*:\s*`([^`$]*(?:\$\{[^}]*\}[^`$]*)*)`/g)) push(m[1].replace(/\$\{[^}]*\}/g, "\u0001"), f, i + 1);
  });
}

// ---- 3. resolve -----------------------------------------------------------
const bad = [];
const ok = new Set();
for (const { target, file, line } of found) {
  if (target === "#" || target === "" || target.startsWith("//")) { bad.push({ target, file, line, why: "empty/placeholder href" }); continue; }
  if (/^https?:/.test(target)) continue;
  const clean = target.split("?")[0].split("#")[0].replace(/\/$/, "") || "/";
  const hit = routeMatchers.find((r) => {
    // dynamic code target vs dynamic route: compare segment-wise
    const a = clean.split("/").filter(Boolean);
    const b = r.route.split("/").filter(Boolean);
    if (a.length !== b.length) return false;
    return a.every((seg, i) => b[i].startsWith("[") || seg === b[i] || seg === "\u0001" || (b[i].startsWith("[") && seg !== ""));
  });
  if (!hit) bad.push({ target, file, line, why: "no matching route" });
  else ok.add(`${clean} -> ${hit.route}`);
}

console.log(`pages(${pages.length}) apis(${apis.length}) targets_scanned(${found.length}) distinct_ok(${ok.size})`);
console.log("\n== BROKEN / SUSPECT TARGETS ==");
const seen = new Set();
for (const b of bad) {
  const k = `${b.target}|${b.why}`;
  if (seen.has(k)) continue;
  seen.add(k);
  console.log(`  ${b.target}  [${b.why}]  ${b.file}:${b.line}`);
}
console.log("\n== API routes ==");
for (const a of apis) console.log("  " + a);
console.log("\n== pages not linked from anywhere ==");
const linkedTargets = new Set(found.map((f) => f.target.split("?")[0].split("#")[0].replace(/\/$/, "") || "/"));
for (const r of pages) {
  if (r.includes("[")) continue;
  if (!linkedTargets.has(r) && !linkedTargets.has(r + "/")) console.log("  " + (r || "/"));
}
