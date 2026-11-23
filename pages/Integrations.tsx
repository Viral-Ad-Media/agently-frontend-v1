import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import SettingsTabs from "../components/SettingsTabs";
import GmailSenderCard from "../components/GmailSenderCard";
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
 * So this is a LIST now. Each row is one account and can be renamed or removed.
 * Booking behavior is configured on the Bookings page; this page stays focused
 * on connecting and managing accounts.
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

interface BusinessGroup {
  id: string;
  owner_label: string;
  policy: "block" | "flag_for_review";
  invite_code: string | null;
  invite_expires_at: string | null;
  members: Array<{ organization_id: string; name: string; joined_at: string }>;
}

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

  const [groups, setGroups] = useState<BusinessGroup[]>([]);
  const [joinCode, setJoinCode] = useState("");
  const [ownerLabel, setOwnerLabel] = useState("");
  const [groupBusy, setGroupBusy] = useState<string | null>(null);

  const isAdmin = user?.role === "Owner" || user?.role === "Admin";

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getIntegrationsStatus();
      setStatus(data);
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
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // OAuth callback lands back here with ?connected= or ?error=.
  useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");
    const message = searchParams.get("message");
    if (connected === "gmail") {
      setBanner({ kind: "ok", text: "Gmail connected. Agently can now send emails from it (send-only)." });
    } else if (connected === "google" || connected === "calendly") {
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
          Connect the calendar and email accounts your agents use. Set availability and booking destinations on the Bookings page.
        </p>
        <Link to="/bookings" className="mt-3 inline-flex text-sm font-medium text-[var(--orange-deep)] hover:underline">
          Manage booking setup
        </Link>
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
            <GmailSenderCard />
          </div>
        )}
      </main>
    </BrandSurface>
  );
};

export default Integrations;
