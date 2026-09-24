import { defineConfig } from "vitest/config";

/*
 * The frontend had no tests at all, and that had a cost: a null dereference in
 * a modal body shipped to production and took the Phone Numbers screen down for
 * everyone. `tsc --noEmit` passed, `vite build` passed, and neither of them
 * renders a component — so neither could have known.
 *
 * Environment is jsdom because the bug class these tests exist to catch only
 * appears when React actually renders. A type check cannot see it, and a build
 * cannot either.
 */
export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.{ts,tsx}"],
    // Rendering a page pulls in charts and lazy routes; the default 5s is
    // tight on a cold run and a flaky timeout teaches people to ignore CI.
    testTimeout: 20000,
  },
});
