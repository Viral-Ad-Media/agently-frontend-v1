import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import React from "react";

/*
 * The merged bookings view exists because the tenant asked to see "all of the
 * appointments in a single page view — at a glance instead of switching
 * between accounts".
 *
 * Two properties make it that, and both are tested here:
 *   1. bookings group by DAY, so a Monday with two appointments renders as one
 *      Monday with two lines rather than two separate entries; and
 *   2. every line names the account it belongs to, because a page that merges
 *      three businesses and does not say which is which is worse than three
 *      separate pages.
 *
 * The day keys are asserted against each booking's OWN timezone, not the
 * runner's. Grouping by the viewer's local date pushes early-morning and
 * late-evening bookings onto the wrong day, and a test that ran in UTC would
 * never have noticed.
 */

const getMergedBookings = vi.fn();
const cancelBooking = vi.fn();
const getIntegrationsStatus = vi.fn();
const getIntegrationOptions = vi.fn();
const setCalendarBookingDefault = vi.fn();
const saveIntegrationSelection = vi.fn();
const saveBookingSettings = vi.fn();

vi.mock("../services/api", () => ({
  apiBaseUrl: "https://api.example.test",
  api: {
    getMergedBookings: (...a: unknown[]) => getMergedBookings(...a),
    cancelBooking: (...a: unknown[]) => cancelBooking(...a),
    getIntegrationsStatus: (...a: unknown[]) => getIntegrationsStatus(...a),
    getIntegrationOptions: (...a: unknown[]) => getIntegrationOptions(...a),
    setCalendarBookingDefault: (...a: unknown[]) => setCalendarBookingDefault(...a),
    saveIntegrationSelection: (...a: unknown[]) => saveIntegrationSelection(...a),
    saveBookingSettings: (...a: unknown[]) => saveBookingSettings(...a),
  },
}));

import Bookings, { groupByDay } from "../pages/Bookings";

type Row = Record<string, unknown>;

/*
 * Shaped exactly as GET /api/integrations/bookings returns it: the appointment
 * row in snake_case, plus the connection fields the server joins on in
 * camelCase. The mixed casing is the real contract, and a fixture that tidied
 * it up would pass while the page read undefined.
 */
const booking = (over: Row): Row => ({
  id: "appt-1",
  integration_id: "conn-viral",
  provider: "google",
  title: null,
  attendee_name: "Jane Doe",
  attendee_email: "jane@example.test",
  attendee_phone: null,
  // 13:00Z is 09:00 in New York on this date (EDT, UTC-4).
  starts_at: "2026-10-12T13:00:00.000Z",
  ends_at: "2026-10-12T13:30:00.000Z",
  timezone: "America/New_York",
  status: "booked",
  cancel_url: null,
  reschedule_url: null,
  created_at: "2026-10-01T09:00:00.000Z",
  connectionId: "conn-viral",
  connectionLabel: "Viral Ad Media",
  connectionEmail: "viraladmediacontent@gmail.com",
  isBookingDefault: true,
  ...over,
});

const ACCOUNTS = [
  {
    id: "conn-viral",
    provider: "google",
    label: "Viral Ad Media",
    email: "viraladmediacontent@gmail.com",
    status: "connected",
    isBookingDefault: true,
  },
  {
    id: "conn-nutra",
    provider: "google",
    label: "Nutra Wellness",
    email: "nutra@example.test",
    status: "connected",
    isBookingDefault: false,
  },
];

/*
 * Two businesses, two days. The Monday deliberately holds one booking from
 * EACH account: that is the case the old per-account screens could not show
 * at all.
 */
const BOOKINGS = [
  // Out of order on purpose — the page sorts, the fixture does not.
  booking({
    id: "appt-nutra-mon",
    integration_id: "conn-nutra",
    connectionId: "conn-nutra",
    connectionLabel: "Nutra Wellness",
    connectionEmail: "nutra@example.test",
    isBookingDefault: false,
    attendee_name: "Mark Obi",
    starts_at: "2026-10-12T15:30:00.000Z", // 11:30 New York
    ends_at: "2026-10-12T16:00:00.000Z",
  }),
  booking({
    id: "appt-viral-tue",
    attendee_name: "Ada Ibe",
    starts_at: "2026-10-13T13:00:00.000Z", // 09:00 New York, next day
    ends_at: "2026-10-13T13:30:00.000Z",
  }),
  booking({ id: "appt-viral-mon" }), // 09:00 New York
];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/bookings"]}>
      <Bookings />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  getMergedBookings.mockResolvedValue({
    bookings: BOOKINGS,
    connections: ACCOUNTS,
    total: BOOKINGS.length,
  });
  getIntegrationsStatus.mockResolvedValue({
    connections: [{
      id: "conn-viral", provider: "google", status: "connected", label: "Viral Ad Media",
      is_booking_default: true, provider_user_id: null, provider_user_email: "viral@example.test",
      provider_user_name: null, calendar_id: "primary", event_type_uri: null, event_type_name: null,
      scopes: null, timezone: "America/New_York", last_error: null,
      connected_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z",
      booking_settings: null,
    }],
  });
  getIntegrationOptions.mockResolvedValue({ options: [{ id: "primary", name: "Primary calendar", primary: true }], selected: "primary" });
  setCalendarBookingDefault.mockResolvedValue({});
  saveIntegrationSelection.mockResolvedValue({});
  saveBookingSettings.mockResolvedValue({});
});

describe("Bookings — merged view", () => {
  it("keeps booking setup compact and exposes its controls on demand", async () => {
    render(<MemoryRouter><Bookings user={{ role: "Owner" } as any} /></MemoryRouter>);
    const setup = screen.getByTestId("booking-setup-panel");
    expect(setup).toHaveTextContent("Booking setup");
    expect(setup).not.toHaveAttribute("open");
    fireEvent.click(within(setup).getByText("Booking setup"));
    expect(await screen.findByLabelText("Appointment length")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load destinations" })).toBeInTheDocument();
  });

  it("requires confirmation to cancel and shows provider failures", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    cancelBooking.mockResolvedValue({ success: false, message: "Calendar is unavailable" });
    render(<MemoryRouter><Bookings user={{ role: "Owner" } as any} /></MemoryRouter>);
    const button = await screen.findByRole("button", { name: "Cancel appointment for Jane Doe" });
    fireEvent.click(button);
    expect(cancelBooking).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(button);
    await waitFor(() => expect(cancelBooking).toHaveBeenCalledWith("appt-viral-mon"));
    expect(await screen.findByText("Calendar is unavailable")).toBeInTheDocument();
    expect(screen.getByTestId("booking-appt-viral-mon")).toBeInTheDocument();
    confirm.mockRestore();
  });
  it("groups appointments by day and labels each with its account", async () => {
    renderPage();

    const monday = await waitFor(() => screen.getByTestId("booking-day-2026-10-12"));
    const tuesday = screen.getByTestId("booking-day-2026-10-13");

    // The day heading leads with the weekday, as the user described it.
    expect(within(monday).getByRole("heading", { level: 2 })).toHaveTextContent("Monday");
    // en-US long form: "October 12, 2026". Asserted because two Mondays in a
    // list are indistinguishable without the date.
    expect(monday).toHaveTextContent("October 12, 2026");
    expect(within(tuesday).getByRole("heading", { level: 2 })).toHaveTextContent("Tuesday");

    // Monday holds BOTH businesses' appointments — the whole point of merging.
    const mondayLines = within(monday).getAllByRole("listitem");
    expect(mondayLines).toHaveLength(2);
    expect(within(tuesday).getAllByRole("listitem")).toHaveLength(1);

    // Soonest first within the day, regardless of fixture order.
    expect(mondayLines[0]).toHaveAttribute("data-testid", "booking-appt-viral-mon");
    expect(mondayLines[1]).toHaveAttribute("data-testid", "booking-appt-nutra-mon");

    // Each line: the time in its own zone, the account, the attendee.
    expect(mondayLines[0]).toHaveTextContent("09:00");
    expect(mondayLines[0]).toHaveTextContent("Viral Ad Media");
    expect(mondayLines[0]).toHaveTextContent("Jane Doe");

    expect(mondayLines[1]).toHaveTextContent("11:30");
    expect(mondayLines[1]).toHaveTextContent("Nutra Wellness");
    expect(mondayLines[1]).toHaveTextContent("Mark Obi");

    expect(within(tuesday).getByTestId("booking-appt-viral-tue")).toHaveTextContent(
      "Viral Ad Media",
    );
  });

  it("offers a per-account filter once there is more than one account", async () => {
    renderPage();

    const filters = await waitFor(() =>
      screen.getByRole("group", { name: /filter by account/i }),
    );
    expect(within(filters).getByRole("button", { name: /all businesses/i })).toBeInTheDocument();
    expect(within(filters).getByRole("button", { name: /viral ad media/i })).toBeInTheDocument();
    expect(within(filters).getByRole("button", { name: /nutra wellness/i })).toBeInTheDocument();
  });

  /*
   * groupByDay in isolation. The DOM tests above prove the page renders the
   * groups; this proves the rule that produces them, including the case the
   * rendered page cannot easily show — that the zone, not the runner's clock,
   * decides the day.
   */
  it("assigns a booking to its own timezone's day, not the runner's", () => {
    const groups = groupByDay([
      // 02:00Z on the 13th is still 22:00 on the 12th in New York.
      booking({
        id: "late",
        starts_at: "2026-10-13T02:00:00.000Z",
        ends_at: "2026-10-13T02:30:00.000Z",
      }) as never,
      booking({ id: "morning" }) as never,
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("2026-10-12");
    expect(groups[0].bookings.map((b) => b.id)).toEqual(["morning", "late"]);
  });
});

describe("Bookings — single account", () => {
  beforeEach(() => {
    getMergedBookings.mockResolvedValue({
      bookings: [booking({ id: "appt-only" })],
      connections: [ACCOUNTS[0]],
      total: 1,
    });
  });

  it("lists the bookings and hides the account filter", async () => {
    renderPage();

    const monday = await waitFor(() => screen.getByTestId("booking-day-2026-10-12"));
    const line = within(monday).getByTestId("booking-appt-only");
    expect(line).toHaveTextContent("09:00");
    // Still labelled: the label is what makes a second account legible later.
    expect(line).toHaveTextContent("Viral Ad Media");
    expect(line).toHaveTextContent("Jane Doe");

    // One account means nothing to filter between.
    expect(screen.queryByRole("group", { name: /filter by account/i })).toBeNull();
  });
});

describe("Bookings — empty states", () => {
  it("points at Integrations when no calendar is connected", async () => {
    getMergedBookings.mockResolvedValue({ bookings: [], connections: [], total: 0 });
    renderPage();

    const empty = await screen.findByTestId("bookings-empty");
    expect(empty).toHaveTextContent(/no calendars connected yet/i);
    expect(within(empty).getByRole("link", { name: /connect a calendar/i })).toHaveAttribute(
      "href",
      "/integrations",
    );
  });

  it("says nothing is booked yet when accounts exist but the window is empty", async () => {
    getMergedBookings.mockResolvedValue({ bookings: [], connections: ACCOUNTS, total: 0 });
    renderPage();

    const empty = await screen.findByTestId("bookings-empty");
    expect(empty).toHaveTextContent(/nothing booked yet/i);
    // Not the "connect a calendar" dead end: they already have accounts.
    expect(within(empty).queryByRole("link", { name: /connect a calendar/i })).toBeNull();
  });

  it("surfaces a load failure instead of rendering an empty day list", async () => {
    getMergedBookings.mockRejectedValue(new Error("Bookings service unavailable."));
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("Bookings service unavailable.");
  });
});
