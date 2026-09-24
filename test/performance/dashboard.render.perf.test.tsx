import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/react";
import React from "react";
import { makeCalls, makeDashboardProp, makeMetricsPayload, makeOrg } from "../fixtures/generators";
import { record, summarize } from "./metrics";

/*
 * Render performance of the Dashboard against a mocked backend.
 *
 * Measured in jsdom, so absolute numbers are not browser numbers — jsdom does no
 * layout or paint. What it does measure honestly is React's own work (render,
 * reconcile, commit), and that is what regresses when someone adds an
 * O(n²) memo or an unkeyed list. Budgets are set with headroom for slow CI.
 */

const getCalls = vi.fn();
vi.mock("../../services/voiceCallsApi", () => ({
  voiceCallsApi: {
    calls: { getCalls: (...a: unknown[]) => getCalls(...a) },
    outreach: { getOutreachSchedules: async () => ({ schedules: [] }) },
    notifications: { getUnreadNotificationCount: async () => ({ count: 0 }) },
    dashboard: { getMetrics: async () => makeMetricsPayload() },
  },
}));

import Dashboard from "../../pages/Dashboard";

const kpi = () =>
  [...document.querySelectorAll(".ag-dashboard-stat")]
    .find((el) => el.querySelector("p")?.textContent === "Total calls")
    ?.querySelectorAll("p")[1]?.textContent;

const measure = async (calls: number, agents: number) => {
  const payload = { calls: makeCalls(calls, Array.from({ length: agents }, (_, i) => `agent-${i + 1}`)) };
  getCalls.mockResolvedValue(payload);
  const t0 = performance.now();
  render(<Dashboard org={makeOrg(agents)} dashboard={makeDashboardProp()} />);
  const mountMs = performance.now() - t0;
  await waitFor(() => expect(kpi()).toBe(String(calls)), { timeout: 5_000, interval: 5 });
  const readyMs = performance.now() - t0;
  cleanup();
  return { mountMs, readyMs };
};

beforeEach(() => getCalls.mockReset());

describe("Performance — Dashboard render (mocked backend, jsdom)", () => {
  it("first mount and time-to-data stay within budget at the real page size", async () => {
    await measure(200, 3); // warm-up: module init, first JIT
    const runs = [];
    for (let i = 0; i < 8; i += 1) runs.push(await measure(200, 3));
    const mount = summarize(runs.map((r) => r.mountMs));
    const ready = summarize(runs.map((r) => r.readyMs));
    record("dashboardRender200", { mount, ready, budgetMountP95Ms: 250, budgetReadyP95Ms: 1_000 });
    expect(mount.p95).toBeLessThan(250);
    expect(ready.p95).toBeLessThan(1_000);
  });

  it("time-to-data grows gently with call volume and agent count", async () => {
    const grid: { calls: number; agents: number; readyMs: number }[] = [];
    for (const [calls, agents] of [[50, 1], [200, 3], [200, 10], [1_000, 10]] as const) {
      const r = [await measure(calls, agents), await measure(calls, agents), await measure(calls, agents)];
      grid.push({ calls, agents, readyMs: summarize(r.map((x) => x.readyMs)).p50 });
    }
    record("dashboardRenderScaling", grid);
    // 20× the calls and 10× the agents must not cost more than 2 s in jsdom.
    expect(grid[grid.length - 1].readyMs).toBeLessThan(2_000);
  });
});
