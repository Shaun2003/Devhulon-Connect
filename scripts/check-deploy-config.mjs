/**
 * Validate deployment config before you deploy.
 *
 * Run: node scripts/check-deploy-config.mjs
 *
 * WHY: `firebase.json` did not exist until recently, so the rules and the 13
 * indexes could not be deployed by CLI at all — they had to be pasted into the
 * Console by hand, which is exactly how config drifts out of sync with the repo.
 * This catches the failure modes that silently break a deploy:
 *
 *   - malformed JSON in firebase.json / .firebaserc / firestore.indexes.json
 *   - an unbalanced or unterminated rules file (a half-pasted rule is rejected
 *     by the CLI, but only AFTER you have already pointed it at production)
 *   - a `.firebaserc` still holding the placeholder project id, which would
 *     deploy to the wrong project
 *   - index definitions that are duplicated, which Firebase rejects
 *   - seller identity no longer being pinned against buyer-role downgrade
 *
 * NOTE: this is a STATIC check. It cannot prove the rules are semantically
 * correct — balanced braces are necessary, not sufficient. That needs the
 * Firestore rules unit tests (`npm run emulators`) against real requests.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Counts `{`/`}`, `(`/`)`, `[`/`]` while ignoring comments and string literals. */
function balance(text) {
  const counts = { "{": 0, "(": 0, "[": 0 };
  const pairs = { "}": "{", ")": "(", "]": "[" };
  let i = 0;
  let inLine = false, inBlock = false, inStr = null;
  while (i < text.length) {
    const c = text[i], n = text[i + 1];
    if (inLine) { if (c === "\n") inLine = false; i++; continue; }
    if (inBlock) { if (c === "*" && n === "/") { inBlock = false; i += 2; } else i++; continue; }
    if (inStr) { if (c === "\\") { i += 2; continue; } if (c === inStr) inStr = null; i++; continue; }
    if (c === "/" && n === "/") { inLine = true; i += 2; continue; }
    if (c === "/" && n === "*") { inBlock = true; i += 2; continue; }
    if (c === '"' || c === "'") { inStr = c; i++; continue; }
    if (c in counts) counts[c]++;
    else if (c in pairs) counts[pairs[c]]--;
    i++;
  }
  return counts;
}

function checkJson(file, validate) {
  const path = join(ROOT, file);
  if (!existsSync(path)) {
    bad(`${file} exists`, "file not found");
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    bad(`${file} is valid JSON`, e.message);
    return null;
  }
  if (validate) {
    const problem = validate(parsed);
    if (problem) {
      bad(`${file} contents`, problem);
      return null;
    }
  }
  ok(`${file} is valid JSON`);
  return parsed;
}


let failures = 0;
const ok = (name, detail = "") => console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
const bad = (name, detail) => {
  failures++;
  console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
};

// ── firebase.json ─────────────────────────────────────────────────────────────
const fb = checkJson("firebase.json", (j) => {
  if (!j.firestore?.rules) return "missing firestore.rules path";
  if (!j.firestore?.indexes) return "missing firestore.indexes path";
  if (!j.storage?.rules) return "missing storage.rules path";
  // A `hosting` block would let `firebase deploy --only hosting` publish a second,
  // stale copy of the site next to the real Vercel deployment.
  if (j.hosting) return "has a `hosting` block — the site is deployed to Vercel, not Firebase Hosting";
  return null;
});

// ── .firebaserc ───────────────────────────────────────────────────────────────
// The project id is a SETUP task, not a property of the code, so it must not gate
// CI: it is a placeholder until someone runs `firebase use --add` once, and until
// then it would fail every unrelated pull request forever.
//
// It IS a hard gate immediately before a deploy (`--require-project-id`, wired to
// `predeploy:firebase`), because at that moment deploying to the wrong project is
// genuinely unrecoverable.
const strictProjectId = process.argv.includes("--require-project-id");
checkJson(".firebaserc", (j) => {
  const p = j.projects?.default;
  if (!p) return "no projects.default set";
  if (/REPLACE|example|your-project|CHANGEME/i.test(p)) {
    return strictProjectId
      ? `projects.default is still a placeholder ("${p}") — run \`firebase use --add\` before deploying`
      : null;
  }
  return null;
});
if (!strictProjectId) {
  const p = (() => {
    try { return JSON.parse(readFileSync(join(ROOT, ".firebaserc"), "utf8")).projects?.default; }
    catch { return null; }
  })();
  if (p && /REPLACE|example|your-project|CHANGEME/i.test(p)) {
    console.log(`WARN  .firebaserc still holds a placeholder project id — fine for CI, but \`npm run deploy:firebase\` will refuse to run.`);
  }
}

// ── indexes ───────────────────────────────────────────────────────────────────
const idx = checkJson("firestore.indexes.json");
if (idx) {
  const indexes = idx.indexes ?? [];
  if (!Array.isArray(indexes)) bad("indexes is an array", "expected an array");
  else {
    const seen = new Set();
    let dupes = 0, emptyFields = 0;
    for (const [i, ix] of indexes.entries()) {
      // Uniqueness must key on the COLLECTION as well as the fields. Two indexes
      // on different collections can share an identical field list — leads/requestId
      // and quotes/requestId do — and those are two distinct, necessary indexes.
      // Keying on fields alone reports them as duplicates and would have someone
      // delete an index the app genuinely needs.
      const sig = JSON.stringify([ix.collectionGroup, ix.queryScope, ix.fields]);
      if (seen.has(sig)) {
        dupes++;
        console.log(`      duplicate index at position ${i}: ${ix.collectionGroup} ${sig.slice(0, 80)}`);
      }
      seen.add(sig);
      const flds = ix.fields ?? [];
      if (!Array.isArray(flds) || flds.length === 0) emptyFields++;
      else if (!ix.collectionGroup) emptyFields++;
    }
    if (dupes) bad("no duplicate indexes", `${dupes} duplicate(s) — Firebase rejects these`);
    else ok("no duplicate indexes", `${indexes.length} defined`);
    if (emptyFields) bad("every index has a collection and fields", `${emptyFields} index(es) are incomplete`);
  }
}

// ── rules files ───────────────────────────────────────────────────────────────
for (const file of ["firestore.rules", "storage.rules"]) {
  const path = join(ROOT, file);
  if (!existsSync(path)) {
    bad(`${file} exists`, "file not found");
    continue;
  }
  const text = readFileSync(path, "utf8");
  if (!text.trim()) {
    bad(`${file} is non-empty`, "file is empty — deploying would erase all rules");
    continue;
  }
  const counts = balance(text);
  const unbalanced = Object.entries(counts).filter(([, v]) => v !== 0);
  if (unbalanced.length) {
    bad(`${file} brackets balance`, unbalanced.map(([k, v]) => `${k}${v > 0 ? "+" : ""}${v}`).join(", "));
  } else {
    ok(`${file} brackets balance`, `${text.split("\n").length} lines`);
  }
  if (fb && file === "firestore.rules" && fb.firestore.rules !== file) {
    bad("firebase.json points at the real firestore.rules", fb.firestore.rules);
  }
  if (file === "firestore.rules") {
    const normalized = text.replace(/\s+/g, " ");
    const sellerRoleGuard =
      "resource.data.get('role', null) != 'seller' || request.resource.data.get('role', null) == 'seller'";
    if (normalized.includes(sellerRoleGuard)) {
      ok("seller accounts cannot downgrade their role to buyer");
    } else {
      bad("seller accounts cannot downgrade their role to buyer", "missing seller role pin in /users/{uid} update rule");
    }
  }
}

console.log(failures === 0 ? "\nAll deploy-config checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);