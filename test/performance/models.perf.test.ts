import { describe, it, expect } from "vitest";
import { searchIndustries } from "../../lib/industries";
import { normalizeCallsResponse, normalizeDashboardMetrics } from "../../pages/Dashboard";
import { marginMultiplier } from "../../lib/pricingMath";
import { INDUSTRY_BENCHMARK } from "../model-validation/fixtures/industryBenchmark";
import { makeCalls, makeMetricsPayload } from "../fixtures/generators";
import { record, sample, summarize } from "./metrics";

/*
 * Performance of the computations that sit on a user's critical path.
 *
 * Budgets are frame-based: 16.7 ms is one frame at 60 Hz, which is the point
 * where typing in the industry picker, or the dashboard settling after a
 * refresh, starts to feel laggy. They are asserted at p95, not the mean,
 * because one slow keystroke in twenty is what people notice.
 */

const FRAME_MS = 16.7;

describe("Performance — industry picker (per keystroke)", () => {
  it(`p95 keystroke latency stays under one frame (${FRAME_MS} ms)`, () => {
    // Replay every benchmark query as it is typed, one character at a time.
    const keystrokes = INDUSTRY_BENCHMARK.flatMap((c) => Array.from({ length: c.query.length }, (_, i) => c.query.slice(0, i + 1)));
    const samples: number[] = [];
    for (const k of keystrokes) samples.push(...sample(() => searchIndustries(k), 1, 0));
    const s = summarize(samples);
    record("industryKeystroke", { ...s, keystrokes: keystrokes.length, budgetP95Ms: FRAME_MS });
    expect(s.p95).toBeLessThan(FRAME_MS);
  });
});

describe("Performance — dashboard data pipeline", () => {
  const PAGE = 200; // the page size Dashboard actually requests

  it(`normalises one real page (${PAGE} calls) in under one frame at p95`, () => {
    const payload = { calls: makeCalls(PAGE), metrics: {} };
    const s = summarize(sample(() => normalizeCallsResponse(payload), 200));
    record("callsNormalize200", { ...s, budgetP95Ms: FRAME_MS });
    expect(s.p95).toBeLessThan(FRAME_MS);
  });

  it("scales linearly with call volume (no quadratic path)", () => {
    const sizes = [250, 1_000, 4_000, 16_000];
    const perRow = sizes.map((n) => {
      const payload = { calls: makeCalls(n) };
      const { p50 } = summarize(sample(() => normalizeCallsResponse(payload), 15, 3));
      return { n, p50Ms: p50, usPerRow: (p50 * 1000) / n };
    });
    record("callsScaling", perRow);
    // 64× more rows may cost at most ~4× more per row; a quadratic path would be ~64×.
    expect(perRow[perRow.length - 1].usPerRow).toBeLessThan(perRow[0].usPerRow * 4 + 1);
  });

  it("derives usage metrics in well under a millisecond", () => {
    const payload = makeMetricsPayload();
    const s = summarize(sample(() => normalizeDashboardMetrics(payload, 500), 2_000, 50));
    record("usageMetrics", { ...s, budgetP95Ms: 1 });
    expect(s.p95).toBeLessThan(1);
  });

  it("prices a margin in well under a microsecond on average", () => {
    const n = 200_000;
    const t = performance.now();
    let acc = 0;
    for (let i = 0; i < n; i += 1) acc += marginMultiplier(i % 96);
    const usPerCall = ((performance.now() - t) * 1000) / n;
    record("marginMultiplier", { calls: n, usPerCall, checksum: Math.round(acc) });
    expect(usPerCall).toBeLessThan(1);
  });
});
