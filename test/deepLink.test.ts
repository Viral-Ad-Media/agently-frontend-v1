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

describe("index.html deep-link normalization (shipped code)", () => {
  it("folds plain marketing paths into the hash", () => {
    expect(runScript("/pricing", "", "")).toEqual([[null, "", "/#/pricing"]]);
    expect(runScript("/terms", "", "")).toEqual([[null, "", "/#/terms"]]);
    expect(runScript("/features", "", "")).toEqual([[null, "", "/#/features"]]);
  });

  it("handles nested app routes and preserves the query string", () => {
    expect(runScript("/blog/some-article", "", "")).toEqual([
      [null, "", "/#/blog/some-article"],
    ]);
    expect(runScript("/pricing", "?plan=pro", "")).toEqual([
      [null, "", "/#/pricing?plan=pro"],
    ]);
  });

  it("leaves the homepage, index.html and existing hash routes alone", () => {
    expect(runScript("/", "", "")).toEqual([]);
    expect(runScript("/index.html", "", "")).toEqual([]);
    expect(runScript("/pricing", "", "#/pricing")).toEqual([]);
    expect(runScript("/", "", "#/dashboard")).toEqual([]);
  });

  it("never throws when history.replaceState is hostile", () => {
    const fakeWindow = {
      location: { pathname: "/pricing", search: "", hash: "" },
      history: {
        replaceState: () => {
          throw new Error("denied");
        },
      },
    };
    expect(() => new Function("window", shippedScript())(fakeWindow)).not.toThrow();
  });
});
