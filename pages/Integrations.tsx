import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import SettingsTabs from "../components/SettingsTabs";
import BrandSurface, {
  BTN_PRIMARY,
  BTN_QUIET,
  BTN_SECONDARY,
  CARD,
  EYEBROW,
  FIELD,
  PANEL_ACCENT,
  PILL,
} from "../components/BrandSurface";
import { api, apiBaseUrl } from "../services/api";
import type {
  CalendarBookingSettings,
  CalendarConnection,
  CalendarConnectionStatus,
  CalendarProvider,
  IntegrationsStatus,
} from "../services/api";
import type { User } from "../types";

/*
 * Integrations: one row per CONNECTED ACCOUNT.
 *
 * The page used to render exactly two cards -- one Google, one Calendly -- and
 * the tenant who runs several businesses from a single Agently login told us
 * plainly that they could see no way to add a second Google account. There was
 * none: the table carried unique (organization_id, provider), so a second
 * account would have overwritten the first.
 *
 * So this is a LIST now. Each row is one account and can be renamed, made the
 * booking target, or removed. Below the list sit the add buttons, which are the
 * point of the whole change.
 *
 * Two behaviours the UI has to teach, because they are not guessable:
 *   AVAILABILITY merges across every connected account -- a slot is offered
 *     only when the owner is free on all of them. That is what removes
 *     double-booking between the tenant's own businesses.
 *   BOOKING writes to ONE connection, the booking target, so a caller's
 *     appointment lands somewhere predictable.
 *
 * business_groups -- cross-ACCOUNT pairing by invite code, for two genuinely
 * separate Agently logins -- is deliberately NOT shown on this screen. Several
 * businesses run from one login are served by the connections above, which
 * need no code exchange. Offering both put two mechanisms in front of the
 * tenant for one job, and the pairing copy is what sent them looking for a
 * second login that does not exist. The API and tables remain; this screen
 * simply does not use them.
 */

type Provider = CalendarProvider;

interface BookingPrefs {
  slotMinutes: number;
  windowDays: number;
  workingHours: Record<string, Array<[string, string]>>;
  sendUpdates: "all" | "none";
}

interface BusinessGroup {
  id: string;
  owner_label: string;
  policy: "block" | "flag_for_review";
  invite_code: string | null;
  invite_expires_at: string | null;
  members: Array<{ organization_id: string; name: string; joined_at: string }>;
}

interface PickerOption {
  id: string;
  name: string;
  primary?: boolean;
  slug?: string;
}

const WEEKDAYS: Array<{ key: string; label: string }> = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];

const defaultPrefs = (): BookingPrefs => ({
  slotMinutes: 30,
  windowDays: 14,
  workingHours: {
    mon: [["09:00", "17:00"]],
    tue: [["09:00", "17:00"]],
    wed: [["09:00", "17:00"]],
    thu: [["09:00", "17:00"]],
    fri: [["09:00", "17:00"]],
    sat: [],
    sun: [],
  },
  sendUpdates: "all",
});

const prefsFromConnection = (connection: CalendarConnection | null): BookingPrefs => {
  const base = defaultPrefs();
  const saved = connection?.booking_settings as CalendarBookingSettings | null | undefined;
  if (!saved) return base;
  return {
    slotMinutes: typeof saved.slotMinutes === "number" ? saved.slotMinutes : base.slotMinutes,
    windowDays: typeof saved.windowDays === "number" ? saved.windowDays : base.windowDays,
    workingHours:
      saved.workingHours && typeof saved.workingHours === "object"
        ? { ...base.workingHours, ...saved.workingHours }
        : base.workingHours,
    sendUpdates: saved.sendUpdates === "none" ? "none" : "all",
  };
};

/*
 * Each provider's own mark, served from public/integrations/.
 *
 * These were Font Awesome glyphs: a generic Google "G" for Google Calendar,
 * and fa-calendar-check -- a plain calendar tick -- standing in for Calendly.
 * Neither is the product it names, and a tenant deciding whether to hand over
 * calendar access should see the brand they are actually authorising.
 */
const PROVIDER_META: Record<
  Provider,
  { title: string; short: string; logo: string; note: string }
> = {
  google: {
    title: "Google Calendar",
    short: "Google",
    logo: "/integrations/google-calendar.svg",
    note: "Agently only asks for availability and event access — never full mailbox scope.",
  },
  calendly: {
    title: "Calendly",
    short: "Calendly",
    logo: "/integrations/calendly.svg",
    note: "Calendly requires a paid plan on your Calendly account for API booking.",
  },
};

/** Status pill tones, written against the palette rather than slate/indigo. */
const statusTone = (status: CalendarConnectionStatus) => {
  if (status === "connected")
    return "border-[var(--line)] bg-[var(--warm)] text-[var(--ink)]";
  if (status === "needs_reconnect")
    return "border-[var(--orange)] bg-[var(--orange-tint-strong)] text-[var(--orange-deep)]";
  return "border-[var(--line)] bg-[var(--warm)] text-[var(--muted)]";
};

const statusLabel = (status: CalendarConnectionStatus) =>
  status === "connected"
    ? "Connected"
    : status === "needs_reconnect"
      ? "Needs reconnect"
      : status === "error"
        ? "Error"
        : "Disconnected";

/**
 * What to call a connection. The tenant's own label wins; the provider
 * account's name or email is the fallback for rows written before the label
 * column existed, and the provider title is the last resort so a row can never
 * render as an empty string.
 */
export const connectionLabel = (connection: CalendarConnection): string =>
  connection.label?.trim() ||
  connection.provider_user_name?.trim() ||
  connection.provider_user_email?.trim() ||
  PROVIDER_META[connection.provider].title;

const Integrations: React.FC<{ user: User | null }> = ({ user }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<IntegrationsStatus | null>(null);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [connectingProvider, setConnectingProvider] = useState<Provider | null>(null);

  /*
   * Per-row UI state is keyed by connection id, not by provider. Keying it by
   * provider is exactly the bug this page exists to remove: with three Google
   * accounts, one "busy" flag would spin all three rows and a rename would
   * open in the wrong one.
   */
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);

  const [options, setOptions] = useState<Record<Provider, PickerOption[]>>({
    google: [],
    calendly: [],
  });
  const [optionsLoading, setOptionsLoading] = useState<Provider | null>(null);
  const [selection, setSelection] = useState<Record<Provider, string>>({
    google: "",
    calendly: "",
  });
  const [savingSelection, setSavingSelection] = useState<Provider | null>(null);
  const [prefs, setPrefs] = useState<Record<Provider, BookingPrefs>>({
    google: defaultPrefs(),
    calendly: defaultPrefs(),
  });
  const [savingPrefs, setSavingPrefs] = useState<Provider | null>(null);

  const [groups, setGroups] = useState<BusinessGroup[]>([]);
  const [joinCode, setJoinCode] = useState("");
  const [ownerLabel, setOwnerLabel] = useState("");
  const [groupBusy, setGroupBusy] = useState<string | null>(null);

  const isAdmin = user?.role === "Owner" || user?.role === "Admin";

  const seedPrefs = useCallback((rows: CalendarConnection[]) => {
    // The booking target's settings are the ones that govern, so they seed the
    // form; any connection of that provider is the fallback.
    const pick = (provider: Provider) =>
      rows.find((c) => c.provider === provider && c.is_booking_default) ||
      rows.find((c) => c.provider === provider) ||
      null;
    setPrefs({
      google: prefsFromConnection(pick("google")),
      calendly: prefsFromConnection(pick("calendly")),
    });
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getIntegrationsStatus();
      setStatus(data);
      seedPrefs(data.connections || []);
    } catch (error) {
      setBanner({
        kind: "err",
        text: error instanceof Error ? error.message : "Could not load integrations.",
      });
    } finally {
      setLoading(false);
    }
    // Business groups are admin-only and independent of connection status.
    try {
      const { groups: loaded } = await api.getBusinessGroups();
      setGroups(loaded);
    } catch {
      // Non-admins get a 403 here; silently leave the section hidden.
    }
  }, [seedPrefs]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // OAuth callback lands back here with ?connected= or ?error=.
  useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");
    const message = searchParams.get("message");
    if (connected === "google" || connected === "calendly") {
      setBanner({
        kind: "ok",
        text: `${PROVIDER_META[connected].title} account connected. Give it a name below so you can tell your businesses apart.`,
      });
    } else if (error) {
      setBanner({
        kind: "err",
        text: message || `The calendar connection failed (${error}). Please try again.`,
      });
    }
    if (connected || error) {
      // Clean the URL so a refresh doesn't replay the banner.
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connections = useMemo(() => {
    const rows = [...(status?.connections || [])];
    /*
     * Booking target first, then by the name the tenant sees. The server
     * orders by provider, which scatters one business's accounts through the
     * list -- the opposite of what a "which business is this?" list needs.
     */
    rows.sort((a, b) => {
      if (a.is_booking_default !== b.is_booking_default) return a.is_booking_default ? -1 : 1;
      return connectionLabel(a).localeCompare(connectionLabel(b));
    });
    return rows;
  }, [status]);

  const countFor = (provider: Provider) =>
    connections.filter((c) => c.provider === provider).length;

  const bookingTarget = connections.find((c) => c.is_booking_default) || null;

  /*
   * A single connection IS the booking target whether or not the column says
   * so -- there is nowhere else a booking could go. Saying that in the UI keeps
   * the one-account case (every tenant today) from looking misconfigured.
   */
  const isBookingTarget = (connection: CalendarConnection) =>
    connection.is_booking_default || connections.length === 1;

  const startConnect = async (provider: Provider) => {
    setConnectingProvider(provider);
    try {
      const { url } = await api.createIntegrationStartToken(provider);
      window.location.href = `${apiBaseUrl}${url}`;
    } catch (error) {
      setBanner({
        kind: "err",
        text: error instanceof Error ? error.message : "Could not start the connection.",
      });
      setConnectingProvider(null);
    }
  };

  const beginRename = (connection: CalendarConnection) => {
    setConfirmRemoveId(null);
    setRenamingId(connection.id);
    setRenameDraft(connectionLabel(connection));
  };

  const commitRename = async (connection: CalendarConnection) => {
    const next = renameDraft.trim();
    if (!next || next === connectionLabel(connection)) {
      setRenamingId(null);
      return;
    }
    setRowBusyId(connection.id);
    try {
      await api.renameCalendarConnection(connection.id, next);
      setStatus((prev) =>
        prev
          ? {
              ...prev,
              connections: prev.connections.map((c) =>
                c.id === connection.id ? { ...c, label: next } : c,
              ),
            }
          : prev,
      );
      setBanner({ kind: "ok", text: `Renamed to “${next}”.` });
      setRenamingId(null);
    } catch (error) {
      setBanner({
        kind: "err",
        text: error instanceof Error ? error.message : "Could not rename this account.",
      });
    } finally {
      setRowBusyId(null);
    }
  };

  const makeBookingTarget = async (connection: CalendarConnection) => {
    setRowBusyId(connection.id);
    try {
      await api.setCalendarBookingDefault(connection.id);
      /*
       * Re-read rather than flip the flag locally. The write CLEARS whichever
       * row was the default — the database permits only one per organization —
       * and the response describes just the winner, so the row that LOST is
       * only knowable from a fresh read. Patching state here is how a UI ends
       * up showing two booking targets at once.
       */
      await refresh();
      setBanner({
        kind: "ok",
        text: `The agent now books into “${connectionLabel(connection)}”.`,
      });
    } catch (error) {
      setBanner({
        kind: "err",
        text: error instanceof Error ? error.message : "Could not change the booking target.",
      });
    } finally {
      setRowBusyId(null);
    }
  };

  const removeConnection = async (connection: CalendarConnection) => {
    setRowBusyId(connection.id);
    try {
      const { promotedConnectionId } = await api.disconnectCalendarConnection(connection.id);
      setConfirmRemoveId(null);
      // Removing the default promotes another connection server-side, so the
      // list has changed in a way only a re-read can report.
      await refresh();
      const revoked = `“${connectionLabel(connection)}” removed and access revoked at ${
        PROVIDER_META[connection.provider].short
      }.`;
      setBanner({
        kind: "ok",
        text: promotedConnectionId
          ? `${revoked} Another account is now the booking target.`
          : revoked,
      });
    } catch (error) {
      setBanner({
        kind: "err",
        text: error instanceof Error ? error.message : "Could not remove this account.",
      });
    } finally {
      setRowBusyId(null);
    }
  };

  const loadOptions = async (provider: Provider, connectionId?: string) => {
    setOptionsLoading(provider);
    try {
      const data = await api.getIntegrationOptions(provider, connectionId);
      setOptions((prev) => ({ ...prev, [provider]: data.options }));
      setSelection((prev) => ({ ...prev, [provider]: data.selected || "" }));
    } catch (error) {
      setBanner({
        kind: "err",
        text: error instanceof Error ? error.message : "Could not load options.",
      });
    } finally {
      setOptionsLoading(null);
    }
  };

  const saveSelection = async (provider: Provider, connectionId?: string) => {
    const value = selection[provider];
    if (!value) return;
    setSavingSelection(provider);
    try {
      /*
       * connectionId is passed explicitly. Without it the server falls back to
       * this provider's booking default — which is the row the panel happens to
       * be showing today, but naming it means the save cannot land on a
       * different account than the one on screen.
       */
      await api.saveIntegrationSelection(
        provider,
        provider === "google"
          ? { calendarId: value, connectionId }
          : {
              eventTypeUri: value,
              eventTypeName: options.calendly.find((o) => o.id === value)?.name || undefined,
              connectionId,
            },
      );
      setBanner({ kind: "ok", text: "Booking destination saved." });
      await refresh();
    } catch (error) {
      setBanner({
        kind: "err",
        text: error instanceof Error ? error.message : "Could not save the selection.",
      });
    } finally {
      setSavingSelection(null);
    }
  };

  const saveBookingPrefs = async (provider: Provider, connectionId?: string) => {
    const p = prefs[provider];
    setSavingPrefs(provider);
    try {
      const payload: CalendarBookingSettings & { connectionId?: string } = {
        windowDays: p.windowDays,
        connectionId,
      };
      if (provider === "google") {
        payload.slotMinutes = p.slotMinutes;
        payload.workingHours = p.workingHours;
        payload.sendUpdates = p.sendUpdates;
      }
      await api.saveBookingSettings(provider, payload);
      setBanner({ kind: "ok", text: "Booking preferences saved." });
      await refresh();
    } catch (error) {
      setBanner({
        kind: "err",
        text: error instanceof Error ? error.message : "Could not save preferences.",
      });
    } finally {
      setSavingPrefs(null);
    }
  };

  // -------------------------------------------------------------------------
  // Business groups (cross-ACCOUNT linking — a different mechanism, untouched)
  // -------------------------------------------------------------------------

  const reloadGroups = async () => {
    try {
      const { groups: loaded } = await api.getBusinessGroups();
      setGroups(loaded);
    } catch (error) {
      setBanner({
        kind: "err",
        text: error instanceof Error ? error.message : "Could not load linked businesses.",
      });
    }
  };

  const createGroup = async () => {
    setGroupBusy("create");
    try {
      await api.createBusinessGroup(ownerLabel.trim());
      setOwnerLabel("");
      setBanner({
        kind: "ok",
        text: "Link created. Log into the other Agently account and join with the code below.",
      });
      await reloadGroups();
    } catch (error) {
      setBanner({
        kind: "err",
        text: error instanceof Error ? error.message : "Could not create the link.",
      });
    } finally {
      setGroupBusy(null);
    }
  };

  const joinGroup = async () => {
    if (!joinCode.trim()) return;
    setGroupBusy("join");
    try {
      await api.joinBusinessGroup(joinCode.trim());
      setJoinCode("");
      setBanner({ kind: "ok", text: "Account linked." });
      await reloadGroups();
    } catch (error) {
      setBanner({
        kind: "err",
        text:
          error instanceof Error
            ? error.message
            : "Could not join. Check the code and try again.",
      });
    } finally {
      setGroupBusy(null);
    }
  };

  const setGroupPolicy = async (id: string, policy: "block" | "flag_for_review") => {
    setGroupBusy(`policy-${id}`);
    try {
      await api.updateBusinessGroup(id, { policy });
      setBanner({ kind: "ok", text: "Clash policy updated." });
      await reloadGroups();
    } catch (error) {
      setBanner({
        kind: "err",
        text: error instanceof Error ? error.message : "Could not update the policy.",
      });
    } finally {
      setGroupBusy(null);
    }
  };

  const regenerateCode = async (id: string) => {
    setGroupBusy(`code-${id}`);
    try {
      await api.updateBusinessGroup(id, { regenerate_code: true });
      setBanner({ kind: "ok", text: "New invite code generated." });
      await reloadGroups();
    } catch (error) {
      setBanner({
        kind: "err",
        text: error instanceof Error ? error.message : "Could not generate a code.",
      });
    } finally {
      setGroupBusy(null);
    }
  };

  const leaveGroup = async (id: string) => {
    setGroupBusy(`leave-${id}`);
    try {
      await api.leaveBusinessGroup(id);
      setBanner({ kind: "ok", text: "Account unlinked." });
      await reloadGroups();
    } catch (error) {
      setBanner({
        kind: "err",
        text: error instanceof Error ? error.message : "Could not unlink.",
      });
    } finally {
      setGroupBusy(null);
    }
  };

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  const renderRow = (connection: CalendarConnection) => {
    const meta = PROVIDER_META[connection.provider];
    const target = isBookingTarget(connection);
    const busy = rowBusyId === connection.id;
    const renaming = renamingId === connection.id;
    const confirming = confirmRemoveId === connection.id;

    return (
      <li
        key={connection.id}
        data-testid={`calendar-connection-${connection.id}`}
        className="flex flex-col gap-3 border-b border-[var(--line)] px-4 py-4 last:border-b-0 sm:px-5"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-[var(--line)] bg-[var(--bg)]">
              <img
                src={meta.logo}
                alt={`${meta.title} logo`}
                width={20}
                height={20}
                className="h-5 w-5"
              />
            </span>

            <div className="min-w-0">
              {renaming ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <label className="sr-only" htmlFor={`rename-${connection.id}`}>
                    Name for this account
                  </label>
                  <input
                    id={`rename-${connection.id}`}
                    autoFocus
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void commitRename(connection);
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    placeholder="e.g. Nutra Wellness"
                    className={`${FIELD} sm:w-56`}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void commitRename(connection)}
                      disabled={busy}
                      className={BTN_PRIMARY}
                    >
                      {busy ? "Saving…" : "Save name"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenamingId(null)}
                      className={BTN_QUIET}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-[15px] font-medium text-[var(--ink)]">
                    {connectionLabel(connection)}
                  </h3>
                  {target && (
                    <span
                      className={`${PILL} border-[var(--orange)] bg-[var(--orange-tint)] text-[var(--orange-deep)]`}
                    >
                      Booking target
                    </span>
                  )}
                  <span className={`${PILL} ${statusTone(connection.status)}`}>
                    {statusLabel(connection.status)}
                  </span>
                </div>
              )}

              <p className="mt-1 truncate text-[13px] text-[var(--muted)]">
                {connection.provider_user_email || "Account email unavailable"}
              </p>
              <p className={`${EYEBROW} mt-1`}>{meta.short}</p>

              {connection.status === "needs_reconnect" && connection.last_error && (
                <p className="mt-1.5 text-xs text-[var(--orange-deep)]">
                  {connection.last_error}
                </p>
              )}
            </div>
          </div>

          {isAdmin && !renaming && (
            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              <button type="button" onClick={() => beginRename(connection)} className={BTN_QUIET}>
                Rename
              </button>
              {!target && connection.status === "connected" && (
                <button
                  type="button"
                  onClick={() => void makeBookingTarget(connection)}
                  disabled={busy}
                  className={BTN_QUIET}
                >
                  {busy ? "Working…" : "Make booking target"}
                </button>
              )}
              {connection.status === "needs_reconnect" && (
                <button
                  type="button"
                  onClick={() => void startConnect(connection.provider)}
                  className={BTN_SECONDARY}
                >
                  Reconnect
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setRenamingId(null);
                  setConfirmRemoveId(confirming ? null : connection.id);
                }}
                className={`${BTN_QUIET} hover:text-[var(--orange-deep)]`}
              >
                Remove
              </button>
            </div>
          )}
        </div>

        {confirming && (
          <div
            role="alertdialog"
            aria-label={`Remove ${connectionLabel(connection)}`}
            className={`${PANEL_ACCENT} px-3 py-2.5`}
          >
            <p className="text-[13px] leading-[1.5] text-[var(--ink)]">
              Remove <span className="font-medium">{connectionLabel(connection)}</span>? Agently
              revokes its access at {meta.short} and deletes the stored tokens.
              {target && connections.length > 1
                ? " Another connected account becomes the booking target."
                : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void removeConnection(connection)}
                disabled={busy}
                className={BTN_PRIMARY}
              >
                {busy ? "Removing…" : "Yes, remove it"}
              </button>
              <button type="button" onClick={() => setConfirmRemoveId(null)} className={BTN_QUIET}>
                Keep it
              </button>
            </div>
          </div>
        )}
      </li>
    );
  };

  const renderAddButtons = () => (
    <div className="flex flex-col gap-2 border-t border-[var(--line)] px-4 py-4 sm:flex-row sm:px-5">
      {(["google", "calendly"] as Provider[]).map((provider) => {
        const meta = PROVIDER_META[provider];
        const ready =
          provider === "google" ? status?.googleConfigured : status?.calendlyConfigured;
        const has = countFor(provider) > 0;
        const disabled =
          !ready || !isAdmin || !status?.encryptionConfigured || connectingProvider === provider;
        return (
          <button
            key={provider}
            type="button"
            onClick={() => void startConnect(provider)}
            disabled={disabled}
            title={
              !isAdmin
                ? "Only owners and admins can connect calendars"
                : !ready
                  ? "This integration is not configured on the server yet"
                  : !status?.encryptionConfigured
                    ? "Token encryption must be configured first"
                    : undefined
            }
            className={provider === "google" ? BTN_PRIMARY : BTN_SECONDARY}
          >
            <img
              src={meta.logo}
              alt=""
              aria-hidden="true"
              width={16}
              height={16}
              className="h-4 w-4"
            />
            {connectingProvider === provider
              ? "Opening…"
              : has
                ? `Add another ${meta.short} account`
                : `Connect ${meta.title}`}
          </button>
        );
      })}
    </div>
  );

  const renderAccounts = () => (
    <section className={CARD} aria-labelledby="connected-accounts-heading">
      <div className="border-b border-[var(--line)] px-4 py-4 sm:px-5">
        <p className={EYEBROW}>Connected accounts</p>
        <h2
          id="connected-accounts-heading"
          className="mt-1.5 text-lg font-medium tracking-[-0.01em] text-[var(--ink)]"
        >
          Calendars Agently works with
        </h2>
        <p className="mt-1.5 max-w-xl text-[13px] leading-[1.55] text-[var(--muted)]">
          Connect one account per business. Agently checks every account before it offers a time,
          so a caller can never be given a slot you are busy in somewhere else — and it books into
          the one account you mark as the booking target.
        </p>
      </div>

      {connections.length === 0 ? (
        <div className="px-4 py-8 text-center sm:px-5" data-testid="connections-empty">
          <p className="text-[15px] font-medium text-[var(--ink)]">No calendars connected yet</p>
          <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-[1.55] text-[var(--muted)]">
            Connect the Google or Calendly account for your first business. You can add one for
            each of your other businesses afterwards.
          </p>
        </div>
      ) : (
        <ul className="list-none" aria-label="Connected calendar accounts">
          {connections.map(renderRow)}
        </ul>
      )}

      {renderAddButtons()}
    </section>
  );

  const renderHowItWorks = () => (
    <section className={`${CARD} p-4 sm:p-5`}>
      <p className={EYEBROW}>How the merge works</p>
      <dl className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-[14px] font-medium text-[var(--ink)]">
            Availability spans every account
          </dt>
          <dd className="mt-1 text-[13px] leading-[1.55] text-[var(--muted)]">
            A time is offered only when you are free on all of your connected calendars, so one
            business can never double-book another.
          </dd>
        </div>
        <div>
          <dt className="text-[14px] font-medium text-[var(--ink)]">
            Bookings land in one calendar
          </dt>
          <dd className="mt-1 text-[13px] leading-[1.55] text-[var(--muted)]">
            {bookingTarget
              ? `New appointments are written to “${connectionLabel(bookingTarget)}”. Change that with “Make booking target” above.`
              : "Mark one account as the booking target and new appointments go there."}
          </dd>
        </div>
      </dl>
      <Link to="/bookings" className={`${BTN_SECONDARY} mt-4`}>
        See all bookings in one view
      </Link>
    </section>
  );

  const renderBookingTargetPanel = () => {
    if (!bookingTarget || !isAdmin) return null;
    const provider = bookingTarget.provider;
    const list = options[provider];
    const p = prefs[provider];
    const set = (patch: Partial<BookingPrefs>) =>
      setPrefs((prev) => ({ ...prev, [provider]: { ...prev[provider], ...patch } }));

    const setDayOpen = (day: string, open: boolean) =>
      set({ workingHours: { ...p.workingHours, [day]: open ? [["09:00", "17:00"]] : [] } });
    const setDayWindow = (day: string, index: 0 | 1, value: string) => {
      const windows = [...(p.workingHours[day] || [["09:00", "17:00"]])];
      const current: [string, string] = [...(windows[0] || ["09:00", "17:00"])] as [
        string,
        string,
      ];
      current[index] = value;
      windows[0] = current;
      set({ workingHours: { ...p.workingHours, [day]: windows } });
    };

    return (
      <section className={`${CARD} p-4 sm:p-5`} aria-labelledby="booking-target-heading">
        <p className={EYEBROW}>Booking target</p>
        <h2
          id="booking-target-heading"
          className="mt-1.5 text-lg font-medium tracking-[-0.01em] text-[var(--ink)]"
        >
          Where the agent books: {connectionLabel(bookingTarget)}
        </h2>
        <p className="mt-1.5 max-w-xl text-[13px] leading-[1.55] text-[var(--muted)]">
          {PROVIDER_META[provider].note}
        </p>

        <div className="mt-4 border-t border-[var(--line)] pt-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <p className={EYEBROW}>
              {provider === "google" ? "Book into calendar" : "Book into event type"}
            </p>
            {list.length === 0 && (
              <button
                type="button"
                onClick={() => void loadOptions(provider, bookingTarget.id)}
                disabled={optionsLoading === provider}
                className={BTN_QUIET}
              >
                {optionsLoading === provider ? "Loading…" : "Load options"}
              </button>
            )}
          </div>

          {list.length > 0 && (
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <label className="sr-only" htmlFor={`destination-${provider}`}>
                {provider === "google" ? "Calendar to book into" : "Event type to book into"}
              </label>
              <select
                id={`destination-${provider}`}
                value={selection[provider]}
                onChange={(e) => setSelection((prev) => ({ ...prev, [provider]: e.target.value }))}
                className={`${FIELD} sm:max-w-sm`}
              >
                <option value="">Choose…</option>
                {list.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name}
                    {opt.primary ? " (primary)" : ""}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void saveSelection(provider, bookingTarget.id)}
                disabled={!selection[provider] || savingSelection === provider}
                className={BTN_PRIMARY}
              >
                {savingSelection === provider ? "Saving…" : "Save"}
              </button>
            </div>
          )}

          {provider === "google" && bookingTarget.calendar_id && list.length === 0 && (
            <p className="mt-2 text-[13px] text-[var(--muted)]">
              Currently booking into{" "}
              <span className="font-medium text-[var(--ink)]">{bookingTarget.calendar_id}</span>
            </p>
          )}
          {provider === "calendly" && bookingTarget.event_type_name && list.length === 0 && (
            <p className="mt-2 text-[13px] text-[var(--muted)]">
              Currently booking into{" "}
              <span className="font-medium text-[var(--ink)]">
                {bookingTarget.event_type_name}
              </span>
            </p>
          )}
        </div>

        <div className="mt-4 border-t border-[var(--line)] pt-4">
          <p className={EYEBROW}>Booking preferences</p>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {provider === "google" && (
              <label className="block">
                <span className="text-[13px] text-[var(--muted)]">Appointment length</span>
                <select
                  value={p.slotMinutes}
                  onChange={(e) => set({ slotMinutes: Number(e.target.value) })}
                  className={`${FIELD} mt-1`}
                >
                  {[15, 30, 45, 60, 90].map((m) => (
                    <option key={m} value={m}>
                      {m} minutes
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="block">
              <span className="text-[13px] text-[var(--muted)]">Offer slots this far ahead</span>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={p.windowDays}
                  onChange={(e) =>
                    set({ windowDays: Math.max(1, Math.min(60, Number(e.target.value) || 1)) })
                  }
                  className={`${FIELD} w-24`}
                />
                <span className="text-[13px] text-[var(--muted)]">days</span>
              </div>
            </label>
          </div>

          {provider === "calendly" && (
            <p className="mt-2 text-xs text-[var(--muted)]">
              Appointment length comes from your Calendly event type.
            </p>
          )}

          {provider === "google" && (
            <>
              <div className="mt-3">
                <span className="text-[13px] text-[var(--muted)]">Working hours</span>
                <div className="mt-1 overflow-hidden rounded-lg border border-[var(--line)]">
                  {WEEKDAYS.map(({ key, label }, i) => {
                    const windows = p.workingHours[key] || [];
                    const open = windows.length > 0;
                    const [start, end] = windows[0] || ["09:00", "17:00"];
                    return (
                      <div
                        key={key}
                        className={`flex items-center gap-3 px-3 py-2 ${
                          i > 0 ? "border-t border-[var(--line)]" : ""
                        } ${open ? "bg-[var(--surface)]" : "bg-[var(--warm)]"}`}
                      >
                        <span className="w-10 font-['IBM_Plex_Mono',monospace] text-[11px] uppercase tracking-[0.8px] text-[var(--muted)]">
                          {label}
                        </span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={open}
                          aria-label={`${label} open`}
                          onClick={() => setDayOpen(key, !open)}
                          className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                            open ? "bg-[var(--orange)]" : "bg-[var(--line)]"
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                              open ? "left-[18px]" : "left-0.5"
                            }`}
                          />
                        </button>
                        {open ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="time"
                              aria-label={`${label} opening time`}
                              value={start}
                              onChange={(e) => setDayWindow(key, 0, e.target.value)}
                              className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--ink)] outline-none focus:border-[var(--orange)]"
                            />
                            <span className="text-xs text-[var(--muted)]">–</span>
                            <input
                              type="time"
                              aria-label={`${label} closing time`}
                              value={end}
                              onChange={(e) => setDayWindow(key, 1, e.target.value)}
                              className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--ink)] outline-none focus:border-[var(--orange)]"
                            />
                          </div>
                        ) : (
                          <span className="text-xs text-[var(--muted)]">Closed</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <label className="mt-3 flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={p.sendUpdates === "all"}
                  onChange={(e) => set({ sendUpdates: e.target.checked ? "all" : "none" })}
                  className="mt-0.5 h-4 w-4 accent-[var(--orange)]"
                />
                <span className="text-[13px] leading-[1.5] text-[var(--muted)]">
                  <span className="font-medium text-[var(--ink)]">Email the caller</span> a
                  calendar invite when the agent books.
                </span>
              </label>
            </>
          )}

          <button
            type="button"
            onClick={() => void saveBookingPrefs(provider, bookingTarget.id)}
            disabled={savingPrefs === provider}
            className={`${BTN_PRIMARY} mt-3`}
          >
            {savingPrefs === provider ? "Saving…" : "Save preferences"}
          </button>
        </div>
      </section>
    );
  };

  /*
   * The "Linked businesses" section lived here: cross-ACCOUNT pairing by
   * invite code, for two separate Agently logins. Several businesses run from
   * ONE login is now served by connecting several calendar accounts above,
   * which needs no code exchange, so the pairing UI was two mechanisms for
   * one job and the more confusing of the two. The business_groups API and
   * tables are left intact and simply unused by this screen.
   */

  return (
    <BrandSurface className="w-full max-w-none pb-8">
      <header className="border-b border-[var(--line)] pb-5">
        <p className={EYEBROW}>Integrations</p>
        <h1 className="mt-2 text-2xl font-medium tracking-[-0.02em] text-[var(--ink)] sm:text-[28px]">
          Calendars &amp; connected accounts
        </h1>
        <p className="mt-1.5 max-w-xl text-sm leading-[1.55] text-[var(--muted)]">
          Add an account for each business you run. Agently merges their availability and shows
          every booking in one place.
        </p>
      </header>

      <SettingsTabs active="integrations" />

      <main className="w-full max-w-none">
        {banner && (
          <div
            className={`mt-4 rounded-lg border px-4 py-3 text-[13px] ${
              banner.kind === "ok"
                ? "border-[var(--line)] bg-[var(--warm)] text-[var(--ink)]"
                : "border-[var(--orange)] bg-[var(--orange-tint)] text-[var(--orange-deep)]"
            }`}
            role={banner.kind === "ok" ? "status" : "alert"}
          >
            <div className="flex items-start justify-between gap-3">
              <span>{banner.text}</span>
              <button
                type="button"
                onClick={() => setBanner(null)}
                className="shrink-0 text-xs opacity-60 transition-opacity hover:opacity-100"
                aria-label="Dismiss"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="mt-6 text-sm text-[var(--muted)]">Loading integrations…</p>
        ) : (
          <div className="mt-6 flex flex-col gap-4">
            {status && !status.encryptionConfigured && (
              <div
                className="rounded-[14px] border border-[var(--orange)] bg-[var(--orange-tint)] p-4 sm:p-5"
                role="alert"
              >
                <h2 className="text-sm font-medium text-[var(--orange-deep)]">
                  Token encryption is not set up
                </h2>
                <p className="mt-1 text-xs leading-[1.55] text-[var(--ink)]">
                  Calendar tokens are encrypted before storage and the encryption key is missing
                  on the server. Connections are disabled until it is configured.
                </p>
                {status.encryptionHelp && (
                  <p className="mt-2 font-['IBM_Plex_Mono',monospace] text-[11px] leading-relaxed text-[var(--orange-deep)]">
                    {status.encryptionHelp}
                  </p>
                )}
              </div>
            )}

            {renderAccounts()}
            {renderHowItWorks()}
            {renderBookingTargetPanel()}
          </div>
        )}
      </main>
    </BrandSurface>
  );
};

export default Integrations;
