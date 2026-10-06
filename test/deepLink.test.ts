/*
 * Deep-link normalization regression test (Batch B, v1.1).
 *
 * Rather than testing a copy of the logic, this executes the exact inline
 * script shipped in index.html (extracted via its marker comments) against a
 * fake window. If the shipped script drifts, this test fails.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function shippedScript(): string {
  const html = readFileSync("index.html", "utf8");
  const match = html.match(
    /\/\* deep-link-normalize:start \*\/([\s\S]*?)\/\* deep-link-normalize:end \*\//,
  );
  if (!match) throw new Error("deep-link script markers missing from index.html");
  return match[1];
}

function runScript(pathname: string, search: string, hash: string) {
  const calls: unknown[][] = [];
  const fakeWindow = {
    location: { pathname, search, hash },
    history: {
      replaceState: (...args: unknown[]) => {
        calls.push(args);
      },
    },
  };
  // The script is an IIFE referencing only `window`.
  new Function("window", shippedScript())(fakeWindow);
  return calls;
}

describe("index.html legacy-hash normalization (shipped code)", () => {
  it("rewrites a legacy fragment route to the real path", () => {
    expect(runScript("/", "", "#/pricing")).toEqual([[null, "", "/pricing"]]);
    expect(runScript("/", "", "#/terms")).toEqual([[null, "", "/terms"]]);
    expect(runScript("/", "", "#/billing")).toEqual([[null, "", "/billing"]]);
  });

  it("handles nested routes and preserves the query string", () => {
    expect(runScript("/", "", "#/blog/some-article")).toEqual([
      [null, "", "/blog/some-article"],
    ]);
    // The query rides inside the fragment on a legacy URL, so it survives the
    // slice without any extra handling — this is the case that breaks a
    // password-reset or top-up link if the rewrite is done naively.
    expect(runScript("/", "", "#/billing?tab=usage")).toEqual([
      [null, "", "/billing?tab=usage"],
    ]);
  });

  it("leaves real paths and non-route fragments alone", () => {
    expect(runScript("/", "", "")).toEqual([]);
    expect(runScript("/pricing", "", "")).toEqual([]);
    expect(runScript("/blog/some-article", "?plan=pro", "")).toEqual([]);
    // An in-page anchor is not a route. The landing page uses these for its
    // scroll links, so rewriting one would navigate away mid-scroll.
    expect(runScript("/", "", "#features")).toEqual([]);
  });

  it("never throws when history.replaceState is hostile", () => {
    const fakeWindow = {
      // Must carry a legacy fragment, or replaceState is never reached and
      // this asserts nothing.
      location: { pathname: "/", search: "", hash: "#/pricing" },
      history: {
        replaceState: () => {
          throw new Error("denied");
        },
      },
    };
    expect(() => new Function("window", shippedScript())(fakeWindow)).not.toThrow();
  });
});
