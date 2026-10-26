/**
 * ESM resolver hook: map the project's `@/*` TypeScript path alias onto `src/*`.
 *
 * Exists purely so `scripts/verify-retention.ts` can import the REAL modules with
 * bare Node (`node --experimental-strip-types`) instead of duplicating their logic
 * or adding a test-runner dependency the project deliberately does not have.
 *
 * Also appends `.ts` to extensionless relative specifiers, which Node's type
 * stripping requires.
 */

import { pathToFileURL } from "node:url";
import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve(import.meta.dirname, "..", "src");

export async function resolve(specifier, context, nextResolve) {
  // `@/lib/plans` → `<repo>/src/lib/plans.ts`
  if (specifier.startsWith("@/")) {
    const target = path.join(SRC, specifier.slice(2));
    const file = fs.existsSync(target) ? target : `${target}.ts`;
    return { url: pathToFileURL(file).href, shortCircuit: true };
  }

  // A relative specifier with no extension → try `.ts`.
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    try {
      return await nextResolve(specifier, context);
    } catch (err) {
      if (specifier.endsWith(".ts") || specifier.endsWith(".js")) throw err;
      const base = context.parentURL ? path.dirname(new URL(context.parentURL).pathname.replace(/^\//, "")) : SRC;
      const candidate = path.resolve(base, `${specifier}.ts`);
      if (fs.existsSync(candidate)) {
        return { url: pathToFileURL(candidate).href, shortCircuit: true };
      }
      throw err;
    }
  }

  return nextResolve(specifier, context);
}