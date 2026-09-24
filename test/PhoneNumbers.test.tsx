import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import React from "react";

/*
 * p4: the frontend's first test, and it exists because of a specific
 * production outage.
 *
 * On 24 Sep the release modal's body called getPhoneNumber(releaseTarget)
 * while releaseTarget was still null. AppModal renders its children even when
 * `open` is false, so that ran on EVERY render of the page, threw, and took
 * the whole Phone Numbers screen down for every user who opened it.
 *
 * `tsc --noEmit` passed. `vite build` passed. Neither renders a component, so
 * neither could have known — and the call site carried
 * `as TwilioNumberRecord`, a cast that told the type checker to stop checking
 * the one thing that mattered.
 *
 * So the assertion that matters here is simply: THE PAGE RENDERS. Everything
 * else is secondary.
 */

const getTwilioNumbers = vi.fn();
const getNumberCountries = vi.fn();
const releaseTwilioNumber = vi.fn();
const searchAvailableTwilioNumbers = vi.fn();

vi.mock("../services/voiceCallsApi", () => ({
  voiceCallsApi: {
    phoneNumbers: {
      getTwilioNumbers: (...a: unknown[]) => getTwilioNumbers(...a),
      getNumberCountries: (...a: unknown[]) => getNumberCountries(...a),
      releaseTwilioNumber: (...a: unknown[]) => releaseTwilioNumber(...a),
      searchAvailableTwilioNumbers: (...a: unknown[]) => searchAvailableTwilioNumbers(...a),
      purchaseTwilioNumber: vi.fn(),
      assignTwilioNumberToAgent: vi.fn(),
    },
  },
}));

import PhoneNumbers from "../pages/PhoneNumbers";

const org = { id: "org-1", name: "Acme" } as never;

/*
 * organization_id has to match the org prop: loadNumbers filters the response
 * down to rows belonging to this organization, so a row without it is dropped
 * and no card renders. Worth stating because the first version of this test
 * omitted it and the failure looked like a rendering bug rather than a fixture
 * one.
 */
const numberRow = {
  id: "num-1",
  organization_id: "org-1",
  organizationId: "org-1",
  phone_number: "+15551234567",
  iso_country: "US",
  capabilities: { voice: true, sms: true },
  lifecycle_status: "active",
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/phone-numbers"]}>
      <PhoneNumbers org={org} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  getTwilioNumbers.mockResolvedValue({ numbers: [numberRow] });
  getNumberCountries.mockResolvedValue({
    sellableCountries: ["US", "CA", "GB", "AU", "IE", "NZ"],
    lowRiskVoiceCountries: ["US", "CA"],
    defaultCountry: "US",
    noBundleRequired: ["US", "CA"],
  });
  searchAvailableTwilioNumbers.mockResolvedValue({ numbers: [] });
  releaseTwilioNumber.mockResolvedValue({ released: true });
});

describe("Phone Numbers screen", () => {
  it("renders without throwing when no release is in progress", async () => {
    // The exact regression: releaseTarget is null on first paint, and the
    // modal body is evaluated anyway.
    expect(() => renderPage()).not.toThrow();
    await waitFor(() => expect(getTwilioNumbers).toHaveBeenCalled());
  });

  it("shows the release control on an owned number", async () => {
    renderPage();
    expect(await screen.findByRole("button", { name: /^release$/i })).toBeInTheDocument();
  });

  it("offers Canada before any search has run", async () => {
    // The country list used to arrive only inside a search RESPONSE, so CA was
    // unreachable: you had to search as US to learn Canada existed. The picker
    // lives on the "search" tab, so start there — the point of the test is
    // that the options are populated WITHOUT a search, not which tab it is on.
    render(
      <MemoryRouter initialEntries={["/phone-numbers?tab=search"]}>
        <PhoneNumbers org={org} initialTab="search" />
      </MemoryRouter>,
    );
    await waitFor(() => expect(getNumberCountries).toHaveBeenCalled());
    await waitFor(() => {
      expect(screen.getByRole("option", { name: /canada/i })).toBeInTheDocument();
    });
    expect(searchAvailableTwilioNumbers).not.toHaveBeenCalled();
  });

  it("still renders when the country lookup fails", async () => {
    // A degraded dropdown is acceptable; a blank screen is not.
    getNumberCountries.mockRejectedValue(new Error("network"));
    expect(() => renderPage()).not.toThrow();
    await waitFor(() => expect(getTwilioNumbers).toHaveBeenCalled());
    expect(await screen.findByRole("button", { name: /^release$/i })).toBeInTheDocument();
  });

  it("still renders when the numbers list fails to load", async () => {
    getTwilioNumbers.mockRejectedValue(new Error("boom"));
    expect(() => renderPage()).not.toThrow();
    await waitFor(() => expect(getTwilioNumbers).toHaveBeenCalled());
  });

  it("does not release anything just by rendering", async () => {
    renderPage();
    await waitFor(() => expect(getTwilioNumbers).toHaveBeenCalled());
    expect(releaseTwilioNumber).not.toHaveBeenCalled();
  });
});
