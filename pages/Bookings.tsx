import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import BookingSetupPanel from "../components/BookingSetupPanel";
import BrandSurface, {
  BTN_PRIMARY,
  BTN_SECONDARY,
  CARD,
  CHIP,
  CHIP_ACTIVE,
  EYEBROW,
} from "../components/BrandSurface";
import { api } from "../services/api";
import type { User } from "../types";
import type { MergedBooking, MergedBookingsResponse } from "../services/api";

/*
 * Bookings: every appointment, across every connected calendar account, on one
 * page.
 *
 * The tenant runs several businesses from one Agently login, each with its own
 * Google account, and asked for exactly this -- "all of the appointments in a
 * single page view, at a glance, instead of switching between accounts". So
 * the organising axis here is the DAY, not the account: an owner wants to know
 * what their Monday looks like, and only then which business each slot
 * belongs to. Every line therefore carries its account's label.
 *
 * Grouping is done in each appointment's OWN timezone. A 09:00 appointment in
 * America/New_York belongs to that New York day even when the browser is in
 * Lagos; grouping by the viewer's local date would silently move early and
 * late bookings onto the wrong day.
 */

type Filter = "upcoming" | "past";

/** ISO yyyy-mm-dd in a given zone, which sorts lexicographically. */
const dayKeyIn = (iso: string, timeZone: string): string => {
  const date = new Date(iso);
  try {
    // en-CA renders as yyyy-mm-dd, which is both sortable and locale-stable.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    // An unknown IANA zone makes Intl throw. A booking must still appear.
    return new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  }
};

const formatInZone = (
  iso: string,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): string => {
  const date = new Date(iso);
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone, ...options }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-US", options).format(date);
  }
};

/** "Monday" — the day name the heading leads with. */
const weekdayOf = (booking: MergedBooking) =>
  formatInZone(booking.starts_at, booking.timezone, { weekday: "long" });

/** "12 October 2026" — enough to disambiguate two Mondays. */
const dateOf = (booking: MergedBooking) =>
  formatInZone(booking.starts_at, booking.timezone, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

/** "09:00" — 24-hour, so column widths do not jump between am and pm. */
const timeOf = (booking: MergedBooking) =>
  formatInZone(booking.starts_at, booking.timezone, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

/**
 * The business this booking belongs to. Falls back to the provider rather than
 * rendering an unlabelled line: "which business is this?" is the whole reason
 * the page exists, so a blank there is worse than a rough answer.
 */
export const bookingAccountLabel = (booking: MergedBooking): string =>
  booking.connectionLabel?.trim() ||
  (booking.provider === "google" ? "Google Calendar" : "Calendly");

const attendeeOf = (booking: MergedBooking): string =>
  booking.attendee_name?.trim() ||
  booking.attendee_email?.trim() ||
  booking.attendee_phone?.trim() ||
  booking.title?.trim() ||
  "No attendee name";

interface DayGroup {
  key: string;
  weekday: string;
  date: string;
  bookings: MergedBooking[];
}

/**
 * Bucket bookings into days, ascending within each day. Exported because the
 * day-grouping rule is the one piece of logic on this page worth testing
 * without a DOM.
 */
export const groupByDay = (bookings: MergedBooking[]): DayGroup[] => {
  const buckets = new Map<string, DayGroup>();
  for (const booking of bookings) {
    const key = dayKeyIn(booking.starts_at, booking.timezone);
    const existing = buckets.get(key);
    if (existing) {
      existing.bookings.push(booking);
    } else {
      buckets.set(key, {
        key,
        weekday: weekdayOf(booking),
        date: dateOf(booking),
        bookings: [booking],
      });
    }
  }
  const groups = [...buckets.values()];
  groups.sort((a, b) => a.key.localeCompare(b.key));
  for (const group of groups) {
    group.bookings.sort(
      (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
    );
  }
  return groups;
};

const STATUS_NOTE: Partial<Record<MergedBooking["status"], string>> = {
  cancelled: "Cancelled",
  rescheduled: "Rescheduled",
  no_show: "No show",
  completed: "Completed",
};

const Bookings: React.FC<{ user?: User | null }> = ({ user }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<MergedBookingsResponse | null>(null);
  const [filter, setFilter] = useState<Filter>("upcoming");
  const [accountId, setAccountId] = useState<string>("all");
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [hideCancelled, setHideCancelled] = useState(false);
  const cancel = async (booking: MergedBooking) => {
    if (!window.confirm(`Cancel ${attendeeOf(booking)} on ${dateOf(booking)} at ${timeOf(booking)} (${booking.timezone})? This also cancels it on the connected calendar and may notify attendees.`)) return;
    setCancelling(booking.id);
    try {
      const result = await api.cancelBooking(booking.id);
      if (!result.success) throw new Error(result.message || "Cancellation failed. The appointment is still shown.");
      await load(filter);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel this appointment.");
    } finally { setCancelling(null); }
  };

  const load = useCallback(async (which: Filter) => {
    setLoading(true);
    setError(null);
    try {
      /*
       * The window is computed here rather than server-side so "upcoming"
       * means the same thing as the clock the tenant is reading. 90 days
       * forward and 90 back is wide enough to be useful and narrow enough
       * that the response stays one page.
       */
      const now = new Date();
      const horizon = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
      const history = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const range =
        which === "upcoming"
          ? { from: now.toISOString(), to: horizon.toISOString() }
          : { from: history.toISOString(), to: now.toISOString() };
      setData(await api.getMergedBookings(range));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load bookings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(filter);
  }, [load, filter]);

  const accounts = data?.connections || [];

  const visible = useMemo(() => {
    const rows = (data?.bookings || []).filter((b) => !hideCancelled || b.status !== "cancelled");
    return accountId === "all" ? rows : rows.filter((b) => b.connectionId === accountId);
  }, [data, accountId, hideCancelled]);

  const groups = useMemo(() => {
    const ordered = groupByDay(visible);
    // Past bookings read best newest-first; upcoming ones soonest-first.
    return filter === "past" ? [...ordered].reverse() : ordered;
  }, [visible, filter]);

  /*
   * The server guarantees a non-blank label on these summaries (it falls back
   * to the account email, then the provider), so this only has to cope with an
   * id that is not in the list at all.
   */
  const accountName = (id: string) => {
    const match = accounts.find((a) => a.id === id);
    if (!match) return "This account";
    return (
      match.label.trim() || (match.provider === "google" ? "Google Calendar" : "Calendly")
    );
  };

  const renderLine = (booking: MergedBooking) => {
    const note = STATUS_NOTE[booking.status];
    return (
      <li
        key={booking.id}
        data-testid={`booking-${booking.id}`}
        className="flex flex-col gap-1 border-t border-[var(--line)] px-4 py-3 first:border-t-0 sm:flex-row sm:items-center sm:gap-4 sm:px-5"
      >
        {/*
          * On a phone the row stacks, and a stacked flex child stretches: the
          * account pill filled the whole width and read as a banner rather
          * than a tag. This wrapper keeps the time and the pill on one line
          * there, then `sm:contents` dissolves it so the wide layout still
          * lays all three out as siblings of the <li> row.
          */}
        <div className="flex items-center gap-2 sm:contents">
          <time
            dateTime={booking.starts_at}
            className="shrink-0 font-['IBM_Plex_Mono',monospace] text-[13px] tabular-nums text-[var(--ink)] sm:w-14"
          >
            {timeOf(booking)}
          </time>

          <span className="inline-flex min-w-0 max-w-full shrink items-center truncate rounded-full border border-[var(--line)] bg-[var(--warm)] px-2.5 py-0.5 text-xs text-[var(--ink)] sm:max-w-[13rem] sm:shrink-0">
            {bookingAccountLabel(booking)}
          </span>
        </div>

        <span className="min-w-0 flex-1 truncate text-[14px] text-[var(--ink)]">
          {attendeeOf(booking)}
        </span>

        {note && (
          <span className="shrink-0 font-['IBM_Plex_Mono',monospace] text-[10px] uppercase tracking-[0.8px] text-[var(--orange-deep)]">
            {note}
          </span>
        )}
        {booking.status !== "cancelled" && user && ["Owner", "Admin"].includes(user.role) && (
          <button type="button" className={`${BTN_SECONDARY} text-xs`} disabled={cancelling !== null}
            onClick={() => void cancel(booking)} aria-label={`Cancel appointment for ${attendeeOf(booking)}`}>
            {cancelling === booking.id ? "Cancelling…" : "Cancel appointment"}
          </button>
        )}
      </li>
    );
  };

  const renderGroup = (group: DayGroup) => (
    <section
      key={group.key}
      data-testid={`booking-day-${group.key}`}
      className={CARD}
      aria-labelledby={`day-heading-${group.key}`}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-[var(--line)] px-4 py-3 sm:px-5">
        <h2
          id={`day-heading-${group.key}`}
          className="text-[15px] font-medium tracking-[-0.01em] text-[var(--ink)]"
        >
          {group.weekday}
        </h2>
        <p className="text-[13px] text-[var(--muted)]">{group.date}</p>
        <p className={`${EYEBROW} ml-auto`}>
          {group.bookings.length} {group.bookings.length === 1 ? "booking" : "bookings"}
        </p>
      </div>
      <ul className="list-none">{group.bookings.map(renderLine)}</ul>
    </section>
  );

  const renderEmpty = () => (
    <div className={`${CARD} px-5 py-10 text-center`} data-testid="bookings-empty">
      <p className="text-[15px] font-medium text-[var(--ink)]">
        {accounts.length === 0
          ? "No calendars connected yet"
          : filter === "upcoming"
            ? "Nothing booked yet"
            : "No past bookings"}
      </p>
      <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-[1.55] text-[var(--muted)]">
        {accounts.length === 0
          ? "Connect a calendar account for each business and every booking across them will appear here together."
          : accountId !== "all"
            ? `Nothing in this window for ${accountName(accountId)}.`
            : "When your agent books an appointment on any connected account, it shows up here."}
      </p>
      {accounts.length === 0 && (
        <Link to="/integrations" className={`${BTN_PRIMARY} mt-4`}>
          Connect a calendar
        </Link>
      )}
    </div>
  );

  return (
    <BrandSurface className="w-full max-w-none pb-8">
      <header className="flex flex-col gap-3 border-b border-[var(--line)] pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className={EYEBROW}>Bookings</p>
          <h1 className="mt-2 text-2xl font-medium tracking-[-0.02em] text-[var(--ink)] sm:text-[28px]">
            All your appointments
          </h1>
          <p className="mt-1.5 max-w-xl text-sm leading-[1.55] text-[var(--muted)]">
            Every booking across every connected calendar, grouped by day, each one labelled with
            the business it belongs to.
          </p>
        </div>
        <Link to="/integrations" className={`${BTN_SECONDARY} shrink-0 self-start`}>
          Manage accounts
        </Link>
      </header>

      <BookingSetupPanel user={user} />

      <div className="mt-4 flex flex-col gap-3">
        <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
          <input type="checkbox" checked={hideCancelled} onChange={(event) => setHideCancelled(event.target.checked)} />
          Hide cancelled appointments
        </label>
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="Booking window"
        >
          {(["upcoming", "past"] as Filter[]).map((which) => (
            <button
              key={which}
              type="button"
              aria-pressed={filter === which}
              onClick={() => setFilter(which)}
              className={
                filter === which
                  ? CHIP_ACTIVE
                  : CHIP
              }
            >
              {which === "upcoming" ? "Upcoming" : "Past"}
            </button>
          ))}
        </div>

        {accounts.length > 1 && (
          <div
            className="flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label="Filter by account"
          >
            <button
              type="button"
              aria-pressed={accountId === "all"}
              onClick={() => setAccountId("all")}
              className={
                accountId === "all"
                  ? CHIP_ACTIVE
                  : CHIP
              }
            >
              All businesses
            </button>
            {accounts.map((account) => (
              <button
                key={account.id}
                type="button"
                aria-pressed={accountId === account.id}
                onClick={() => setAccountId(account.id)}
                className={
                  accountId === account.id
                    ? CHIP_ACTIVE
                    : CHIP
                }
              >
                {accountName(account.id)}
              </button>
            ))}
          </div>
        )}
      </div>

      <main className="mt-4 flex flex-col gap-4">
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-[var(--orange)] bg-[var(--orange-tint)] px-4 py-3 text-[13px] text-[var(--orange-deep)]"
          >
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-[var(--muted)]">Loading bookings…</p>
        ) : groups.length === 0 ? (
          renderEmpty()
        ) : (
          groups.map(renderGroup)
        )}
      </main>
    </BrandSurface>
  );
};

export default Bookings;
