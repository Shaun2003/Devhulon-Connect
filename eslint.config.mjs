import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // `@typescript-eslint/no-require-imports` exists to stop CommonJS `require()`
    // leaking into TypeScript/ESM application source, where it defeats bundler
    // static analysis. It has no business firing on a `.cjs` file: those are
    // CommonJS BY DEFINITION, so `require()` is the only correct call form there.
    //
    // This was the sole cause of `npm run lint` exiting non-zero (2 errors in
    // scripts/backfill-ratings.cjs), which meant the lint gate could never be
    // made blocking in CI without blocking every unrelated pull request.
    files: ["**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
]);

export default eslintConfig;
