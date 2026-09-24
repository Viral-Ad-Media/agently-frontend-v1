import { describe, it, expect } from "vitest";
import { normalizeDashboardMetrics } from "../../pages/Dashboard";

/*
 * MRM-003 — Dashboard usage & conversion metrics (normalizeDashboardMetrics in
 * pages/Dashboard.tsx).
 *
 * Customers read "minutes remaining", "% of plan used" and "conversion rate"
 * off these numbers and make top-up decisions from them, so the derivations
 * are held to the same standard as any other quantitative output.
 */

const PLAN_DEFAULT = 500;
const run = (payload: unknown) => normalizeDashboardMetrics(payload, PLAN_DEFAULT);

describe("MRM-003 usage metrics — conceptual soundness", () => {
  it("derives minutes from seconds when minutes are absent", () => {
    const m = run({ usage: { totalCallSeconds: 90, minuteLimit: 100 } });
    expect(m.totalCallMinutes).toBe(1.5);
    expect(m.remainingMinutes).toBe(98.5);
    expect(m.usagePercent).toBe(1.5);
  });

  it("treats camelCase, snake_case and nested/flat payloads identically", () => {
    const a = run({ usage: { totalCallMinutes: 42, minuteLimit: 300 }, leads: { total: 10, converted: 3 } });
    const b = run({ metrics: { usage: { total_call_minutes: 42, minute_limit: 300 }, leads: { total_leads: 10, converted_leads: 3 } } });
    expect(b).toEqual(a);
    expect(a.conversionRate).toBe(30);
  });

  it("accepts numeric strings and falls back cleanly on junk", () => {
    expect(run({ usage: { totalCallMinutes: "12.5", minuteLimit: "100" } }).usagePercent).toBe(12.5);
    const junk = run({ usage: { totalCallMinutes: "abc", minuteLimit: {} } });
    expect(junk.totalCallMinutes).toBe(0);
    expect(junk.minuteLimit).toBe(PLAN_DEFAULT);
    for (const payload of [null, undefined, 42, "x", []]) {
      const m = run(payload);
      expect(m.minuteLimit).toBe(PLAN_DEFAULT);
      expect(m.usagePercent).toBe(0);
    }
  });

  it("caps usage at 100% and floors remaining minutes at 0 on overage", () => {
    const m = run({ usage: { totalCallMinutes: 750, minuteLimit: 500 } });
    expect(m.usagePercent).toBe(100);
    expect(m.remainingMinutes).toBe(0);
  });

  it("rounds conversion rate to one decimal place", () => {
    expect(run({ leads: { total: 3, converted: 1 } }).conversionRate).toBe(33.3);
    expect(run({ leads: { total: 0, converted: 0 } }).conversionRate).toBe(0);
  });

  it("holds its invariants across a sweep of well-formed inputs", () => {
    for (const limit of [1, 60, 500, 10_000]) {
      for (const used of [0, 0.5, 1, 59, 60, 499, 500, 501, 20_000]) {
        const m = run({ usage: { totalCallMinutes: used, minuteLimit: limit } });
        expect(m.usagePercent).toBeGreaterThanOrEqual(0);
        expect(m.usagePercent).toBeLessThanOrEqual(100);
        expect(m.remainingMinutes).toBeGreaterThanOrEqual(0);
        expect(m.remainingMinutes).toBeLessThanOrEqual(limit);
        expect(m.remainingMinutes + Math.min(used, limit)).toBeCloseTo(limit, 9);
      }
    }
  });
});

describe("MRM-003 usage metrics — known limitations (open findings)", () => {
  it.fails("F-06: an explicit 0-minute limit is replaced by the plan default", () => {
    // `usage.minuteLimit || …` treats 0 as missing, so a plan with no included
    // minutes shows 490 of 500 remaining.
    const m = run({ usage: { totalCallMinutes: 10, minuteLimit: 0 } });
    expect(m.minuteLimit).toBe(0);
    expect(m.remainingMinutes).toBe(0);
  });

  it.fails("F-07: conversion rate is not bounded to [0, 100]", () => {
    expect(run({ leads: { total: 4, converted: 6 } }).conversionRate).toBeLessThanOrEqual(100);
  });

  it.fails("F-08: negative usage from the API yields negative % used and more minutes than the plan", () => {
    const m = run({ usage: { totalCallMinutes: -20, minuteLimit: 100 } });
    expect(m.usagePercent).toBeGreaterThanOrEqual(0);
    expect(m.remainingMinutes).toBeLessThanOrEqual(100);
  });
});
