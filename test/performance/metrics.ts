import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * Timing helpers for the performance suite.
 *
 * Budgets are asserted on every CI run. Raw numbers are written to
 * reports/metrics/metrics.json only when PERF_REPORT=1, so a normal `npm test`
 * leaves the working tree clean.
 */

export const percentile = (samples: number[], p: number) => {
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
};

export type Summary = { n: number; mean: number; p50: number; p95: number; p99: number; max: number };

export const summarize = (samples: number[]): Summary => ({
  n: samples.length,
  mean: samples.reduce((a, b) => a + b, 0) / samples.length,
  p50: percentile(samples, 50),
  p95: percentile(samples, 95),
  p99: percentile(samples, 99),
  max: Math.max(...samples),
});

/** Time `fn` `n` times after `warmup` untimed runs; returns per-run milliseconds. */
export const sample = (fn: () => void, n: number, warmup = 5) => {
  for (let i = 0; i < warmup; i += 1) fn();
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const t = performance.now();
    fn();
    out.push(performance.now() - t);
  }
  return out;
};

const recorded: Record<string, unknown> = {};
const FILE = resolve(__dirname, "../../reports/metrics/metrics.json");

/** Record a metric for the report. Merges into the file so separate test files can each contribute. */
export const record = (key: string, value: unknown) => {
  recorded[key] = value;
  if (!process.env.PERF_REPORT) return;
  mkdirSync(dirname(FILE), { recursive: true });
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(readFileSync(FILE, "utf8"));
  } catch {
    existing = {};
  }
  writeFileSync(FILE, JSON.stringify({ ...existing, [key]: value }, null, 2));
};
