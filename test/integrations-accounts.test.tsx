import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import React from "react";

/*
 * The Integrations page used to render exactly two cards — one Google, one
 * Calendly — and the tenant running several businesses from one Agently login
 * reported that they could see no way to add a second Google account. They
 * were right: there wasn't one.
 *
 * So these tests pin the two things that failure was made of:
 *   1. the page renders a LIST of accounts, so three connections show as
 *      three rows rather than collapsing into one card per provider; and
 *   2. an add button is present even when that provider already has an
 *      account — the absence of exactly that button is what the user hit.
 *
 * Row actions are checked against the CONNECTION ID they are called with,
 * because keying per-row state by provider instead of by id is the specific
 * way this page breaks once a provider has more than one account.
 */

const getIntegrationsStatus = vi.fn();
const getBusinessGroups = vi.fn();
const renameCalendarConnection = vi.fn();
const disconnectCalendarConnection = vi.fn();

vi.mock("../services/api", () => ({
  apiBaseUrl: "https://api.example.test",
  api: {
    getIntegrationsStatus: (...a: unknown[]) => getIntegrationsStatus(...a),
    getBusinessGroups: (...a: unknown[]) => getBusinessGroups(...a),
    renameCalendarConnection: (...a: unknown[]) => renameCalendarConnection(...a),
    disconnectCalendarConnection: (...a: unknown[]) => disconnectCalendarConnection(...a),
    createIntegrationStartToken: vi.fn(async () => ({ url: "/api/integrations/google/start" })),
    getIntegrationOptions: vi.fn(async () => ({ options: [], selected: null })),
    saveIntegrationSelection: vi.fn(async () => ({ connection: {} })),
    saveBookingSettings: vi.fn(async () => ({ connection: { booking_settings: null } })),
    createBusinessGroup: vi.fn(),
    joinBusinessGroup: vi.fn(),
    updateBusinessGroup: vi.fn(),
    leaveBusinessGroup: vi.fn(),
  },
}));

import Integrations from "../pages/Integrations";

type Row = Record<string, unknown>;

/*
 * provider_user_id differs per row on purpose. Uniqueness is now
 * (organization_id, provider, provider_user_id), so two google rows sharing an
 * account id is a state the database refuses — a fixture that did it would be
 * testing something that cannot happen.
 */
const connection = (over: Row = {}): Row => ({
  id: "conn-google-viral",
  provider: "google",
  status: "connected",
  label: "Viral Ad Media",
  is_booking_default: true,
  provider_user_id: "google-uid-1",
  provider_user_email: "viraladmediacontent@gmail.com",
  provider_user_name: "Viral Ad Media",
  calendar_id: "primary",
  event_type_uri: null,
  event_type_name: null,
  scopes: null,
  timezone: "America/New_York",
  last_error: null,
  connected_at: "2026-10-01T10:00:00.000Z",
  updated_at: "2026-10-01T10:00:00.000Z",
  booking_settings: null,
  ...over,
});

const THREE_ACCOUNTS: Row[] = [
  connection(),
  connection({
    id: "conn-google-nutra",
    label: "Nutra Wellness",
    is_booking_default: false,
    provider_user_id: "google-uid-2",
    provider_user_email: "nutra@example.test",
    provider_user_name: "Nutra Wellness",
  }),
  connection({
    id: "conn-calendly-clinic",
    provider: "calendly",
    label: "Clinic Consults",
    is_booking_default: false,
    provider_user_id: "calendly-uid-1",
    provider_user_email: "clinic@example.test",
    provider_user_name: "Clinic Consults",
    calendar_id: null,
    event_type_name: "30 minute consult",
  }),
];

const statusPayload = (connections: Row[]) => ({
  encryptionConfigured: true,
  encryptionHelp: null,
  googleConfigured: true,
  calendlyConfigured: true,
  connections,
});

const owner = { id: "user-1", role: "Owner" } as never;

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/integrations"]}>
      <Integrations user={owner} />
    </MemoryRouter>,
  );
}

const accountList = () => screen.getByRole("list", { name: /connected calendar accounts/i });

beforeEach(() => {
  getBusinessGroups.mockResolvedValue({ groups: [] });
  getIntegrationsStatus.mockResolvedValue(statusPayload(THREE_ACCOUNTS));
  /*
   * These responses describe ONE connection, not the list: the server's
   * booking-default write clears whichever row used to hold the flag and
   * reports only the winner, and its disconnect reports which row it promoted.
   * The page therefore has to re-read /status after each — which is what the
   * repeat call to getIntegrationsStatus proves below.
   */
  renameCalendarConnection.mockResolvedValue({
    connection: {
      id: "conn-google-nutra",
      provider: "google",
      label: "Nutra Wellness HQ",
      email: "nutra@example.test",
      status: "connected",
      isBookingDefault: false,
    },
  });
  disconnectCalendarConnection.mockResolvedValue({
    disconnected: true,
    provider: "calendly",
    connectionId: "conn-calendly-clinic",
    promotedConnectionId: null,
  });
});

describe("Integrations — connected accounts list", () => {
  it("renders one row per connected account, not one card per provider", async () => {
    renderPage();

    const list = await waitFor(() => accountList());
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);

    // Each row carries the tenant's own name for the business...
    expect(within(list).getByText("Viral Ad Media")).toBeInTheDocument();
    expect(within(list).getByText("Nutra Wellness")).toBeInTheDocument();
    expect(within(list).getByText("Clinic Consults")).toBeInTheDocument();

    // ...the account email, which is how two Google rows are told apart...
    expect(within(list).getByText("viraladmediacontent@gmail.com")).toBeInTheDocument();
    expect(within(list).getByText("nutra@example.test")).toBeInTheDocument();
    expect(within(list).getByText("clinic@example.test")).toBeInTheDocument();

    // ...and the provider's own mark.
    const logos = within(list).getAllByRole("img");
    const sources = logos.map((img) => img.getAttribute("src"));
    expect(sources.filter((s) => s === "/integrations/google-calendar.svg")).toHaveLength(2);
    expect(sources).toContain("/integrations/calendly.svg");
  });

  it("marks exactly one row as the booking target", async () => {
    renderPage();

    const list = await waitFor(() => accountList());
    const badges = within(list).getAllByText("Booking target");
    expect(badges).toHaveLength(1);

    // ...and it is the row whose is_booking_default is true.
    const targetRow = screen.getByTestId("calendar-connection-conn-google-viral");
    expect(within(targetRow).getByText("Booking target")).toBeInTheDocument();
  });

  it("offers an add button for a provider that already has an account", async () => {
    renderPage();

    // This is the assertion the user's complaint reduces to.
    expect(
      await screen.findByRole("button", { name: /add another google account/i }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: /add another calendly account/i }),
    ).toBeEnabled();
  });

  it("lets a row be renamed, and sends that row's own id", async () => {
    renderPage();

    const row = await waitFor(() =>
      screen.getByTestId("calendar-connection-conn-google-nutra"),
    );
    fireEvent.click(within(row).getByRole("button", { name: /^rename$/i }));

    const input = within(row).getByLabelText(/name for this account/i);
    fireEvent.change(input, { target: { value: "Nutra Wellness HQ" } });
    fireEvent.click(within(row).getByRole("button", { name: /save name/i }));

    await waitFor(() =>
      expect(renameCalendarConnection).toHaveBeenCalledWith(
        "conn-google-nutra",
        "Nutra Wellness HQ",
      ),
    );
    expect(await screen.findByText("Nutra Wellness HQ")).toBeInTheDocument();
  });

  it("keeps booking setup on the Bookings page", async () => {
    renderPage();

    const row = await waitFor(() => screen.getByTestId("calendar-connection-conn-google-nutra"));
    expect(within(row).queryByRole("button", { name: /make booking target/i })).toBeNull();
    expect(screen.getByRole("link", { name: /manage booking setup/i })).toHaveAttribute("href", "/bookings");
  });

  it("confirms before removing a row, then removes that row", async () => {
    renderPage();

    const row = await waitFor(() =>
      screen.getByTestId("calendar-connection-conn-calendly-clinic"),
    );
    fireEvent.click(within(row).getByRole("button", { name: /^remove$/i }));

    // A confirmation step, not an immediate revoke: removing a connection
    // revokes at the provider and deletes the tokens, which cannot be undone.
    const confirm = within(row).getByRole("alertdialog");
    expect(confirm).toHaveTextContent(/revokes its access at Calendly/i);
    expect(disconnectCalendarConnection).not.toHaveBeenCalled();

    fireEvent.click(within(confirm).getByRole("button", { name: /yes, remove it/i }));
    await waitFor(() =>
      expect(disconnectCalendarConnection).toHaveBeenCalledWith("conn-calendly-clinic"),
    );
  });
});

describe("Integrations — single account", () => {
  const single = [connection({ is_booking_default: false })];

  beforeEach(() => {
    getIntegrationsStatus.mockResolvedValue(statusPayload(single));
  });

  it("treats the only connection as the booking target and offers no way to change that", async () => {
    renderPage();

    const list = await waitFor(() => accountList());
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);

    /*
     * is_booking_default is false in this fixture on purpose: a one-connection
     * org has nowhere else for a booking to go, so the UI must not show it as
     * unconfigured while the migration's backfill is still catching up.
     */
    expect(within(list).getByText("Booking target")).toBeInTheDocument();
    expect(
      within(list).queryByRole("button", { name: /make booking target/i }),
    ).not.toBeInTheDocument();
  });

  it("still invites a second account for the same provider", async () => {
    renderPage();
    expect(
      await screen.findByRole("button", { name: /add another google account/i }),
    ).toBeInTheDocument();
    // Calendly has none yet, so its button reads as a first connection.
    expect(
      screen.getByRole("button", { name: /^connect calendly$/i }),
    ).toBeInTheDocument();
  });
});

describe("Integrations — nothing connected", () => {
  beforeEach(() => {
    getIntegrationsStatus.mockResolvedValue(statusPayload([]));
  });

  it("shows an empty state and a first-connection button for each provider", async () => {
    renderPage();

    expect(await screen.findByTestId("connections-empty")).toHaveTextContent(
      /no calendars connected yet/i,
    );
    expect(screen.queryByRole("list", { name: /connected calendar accounts/i })).toBeNull();

    expect(screen.getByRole("button", { name: /connect google calendar/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^connect calendly$/i })).toBeInTheDocument();
  });
});
