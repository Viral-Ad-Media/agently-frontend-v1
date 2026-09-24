import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { makeCalls, makeDashboardProp, makeMetricsPayload, makeOrg } from "../fixtures/generators";

/*
 * Mock tests for the Dashboard — the first screen every tenant sees.
 *
 * The four backend calls it makes (calls, outreach schedules, unread count,
 * metrics) are replaced with doubles so each can succeed, fail or return junk
 * independently. The page loads them with Promise.allSettled, so the promise
 * under test is: any subset can fail and the page still renders with correct
 * numbers from the parts that worked.
 */

const getCalls = vi.fn();
const getOutreachSchedules = vi.fn();
const getUnreadNotificationCount = vi.fn();
const getMetrics = vi.fn();

vi.mock("../../services/voiceCallsApi", () => ({
  voiceCallsApi: {
    calls: { getCalls: (...a: unknown[]) => getCalls(...a) },
    outreach: { getOutreachSchedules: (...a: unknown[]) => getOutreachSchedules(...a) },
    notifications: { getUnreadNotificationCount: (...a: unknown[]) => getUnreadNotificationCount(...a) },
    dashboard: { getMetrics: (...a: unknown[]) => getMetrics(...a) },
  },
}));

import Dashboard from "../../pages/Dashboard";

const renderDashboard = () => render(<Dashboard org={makeOrg()} dashboard={makeDashboardProp()} />);

/** The value and sub-line printed on a KPI tile, found by its label. */
const tile = (label: string) => {
  const card = [...document.querySelectorAll(".ag-dashboard-stat")].find(
    (el) => el.querySelector("p")?.textContent === label,
  );
  if (!card) throw new Error(`no KPI tile "${label}"`);
  const [, value, sub] = [...card.querySelectorAll("p")].map((p) => p.textContent);
  return { value, sub };
};

const calls = makeCalls(12);
const completed = calls.filter((c) => c.status === "completed").length;

beforeEach(() => {
  getCalls.mockResolvedValue({ calls, metrics: { totalCalls: calls.length } });
  getOutreachSchedules.mockResolvedValue({ schedules: [{ id: "s1", status: "active" }] });
  getUnreadNotificationCount.mockResolvedValue({ count: 3 });
  getMetrics.mockResolvedValue(makeMetricsPayload());
});

describe("Dashboard with a mocked backend", () => {
  it("requests the first page of calls and renders every KPI from the mocked payloads", async () => {
    renderDashboard();
    await waitFor(() => expect(getCalls).toHaveBeenCalledWith({ page: 1, limit: 200 }));
    await waitFor(() => expect(tile("Total calls").value).toBe(String(calls.length)));
    expect(tile("Completed").value).toBe(String(completed));
    expect(tile("Chatbot answers").value).toBe("88");
  });

  it("lists the five most recent callers", async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText(String(calls[0].caller_name))).toBeInTheDocument());
    for (const c of calls.slice(0, 5)) expect(screen.getAllByText(String(c.caller_name)).length).toBeGreaterThan(0);
  });

  it("still renders the calls when the metrics endpoint fails", async () => {
    getMetrics.mockRejectedValue(new Error("503"));
    renderDashboard();
    await waitFor(() => expect(tile("Total calls").value).toBe(String(calls.length)));
    expect(tile("Call usage").sub).toBe("of 500m limit");
  });

  it("still renders when every endpoint fails", async () => {
    for (const m of [getCalls, getOutreachSchedules, getUnreadNotificationCount, getMetrics]) m.mockRejectedValue(new Error("down"));
    expect(() => renderDashboard()).not.toThrow();
    await waitFor(() => expect(getMetrics).toHaveBeenCalled());
    expect(tile("Total calls").value).toBe("0");
  });

  it("survives malformed payloads (nulls, strings, wrong shapes)", async () => {
    getCalls.mockResolvedValue({ calls: [null, 42, "x", { no_id: true }, { id: "ok-1", status: "completed", duration: "90" }] });
    getOutreachSchedules.mockResolvedValue({ schedules: [null, 7] });
    getUnreadNotificationCount.mockResolvedValue(null);
    getMetrics.mockResolvedValue({ metrics: { usage: "broken", leads: [] } });
    expect(() => renderDashboard()).not.toThrow();
    await waitFor(() => expect(tile("Total calls").value).toBe("1"));
  });

  it("stays usable while the backend is slow (renders before data arrives)", async () => {
    let release!: (v: unknown) => void;
    getCalls.mockReturnValue(new Promise((r) => (release = r)));
    renderDashboard();
    expect(screen.getByText("Total calls")).toBeInTheDocument();
    release({ calls, metrics: {} });
    await waitFor(() => expect(tile("Total calls").value).toBe(String(calls.length)));
  });

  it.fails("F-09 (High): a list response with no array in it wipes the whole dashboard", async () => {
    // getArrayPayload recurses into record[key] even when it is undefined, and
    // getObject(undefined) is {} again — so it never bottoms out. An outreach
    // response of {}, {ok:true} or null throws "Maximum call stack size
    // exceeded" inside loadDashboard, which aborts the whole load: every KPI
    // reads 0 and the error text is shown to the tenant.
    getOutreachSchedules.mockResolvedValue({});
    renderDashboard();
    await waitFor(() => expect(getOutreachSchedules).toHaveBeenCalled());
    await waitFor(() => expect(tile("Total calls").value).toBe(String(calls.length)), { timeout: 1500 });
    expect(screen.queryByText(/call stack/i)).toBeNull();
  });
});

