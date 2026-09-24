import { bench, describe } from "vitest";
import { INDUSTRIES, searchIndustries } from "../lib/industries";
import { marginMultiplier, tenantMarginMultiple } from "../lib/pricingMath";
import { normalizeCallsResponse, normalizeDashboardMetrics } from "../pages/Dashboard";
import { makeCalls, makeMetricsPayload } from "../test/fixtures/generators";

/*
 * Throughput benchmarks (ops/sec) for the frontend's quantitative paths.
 * Run with `npm run bench`. These report, they do not gate CI; the gating
 * budgets live in test/performance.
 */

const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const challenger = (query: string) => {
  const q = norm(query);
  return INDUSTRIES.filter((i) => [i.label, ...i.aliases].some((t) => norm(t).includes(q)));
};

describe("industry matcher — champion vs challenger", () => {
  bench("champion: exact alias ('plumber')", () => void searchIndustries("plumber"));
  bench("champion: typo → fuzzy fallback ('resturant')", () => void searchIndustries("resturant"));
  bench("champion: sentence ('we are a plumbing company')", () => void searchIndustries("we are a plumbing company"));
  bench("challenger: naive substring ('plumber')", () => void challenger("plumber"));
});

describe("dashboard pipeline", () => {
  const page = { calls: makeCalls(200) };
  const big = { calls: makeCalls(5_000) };
  const metrics = makeMetricsPayload();
  bench("normalizeCallsResponse — 200 calls (one page)", () => void normalizeCallsResponse(page));
  bench("normalizeCallsResponse — 5,000 calls", () => void normalizeCallsResponse(big));
  bench("normalizeDashboardMetrics", () => void normalizeDashboardMetrics(metrics, 500));
});

describe("pricing", () => {
  bench("marginMultiplier (Billing Pricing)", () => void marginMultiplier(70));
  bench("tenantMarginMultiple (Tenant Economics)", () => void tenantMarginMultiple("70"));
});
