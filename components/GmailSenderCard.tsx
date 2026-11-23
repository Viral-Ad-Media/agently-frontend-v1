import React, { useCallback, useEffect, useState } from "react";
import { BTN_PRIMARY, BTN_QUIET, CARD, EYEBROW } from "./BrandSurface";
import { api, apiBaseUrl } from "../services/api";
import type { GmailConnection } from "../services/api";

/**
 * Gmail senders on the Integrations screen. Send-only: Agently never reads
 * the inbox. One sender per business; the default is used by automations.
 */
export default function GmailSenderCard() {
  const [connections, setConnections] = useState<GmailConnection[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await api.getGmailConnections();
      setConnections(result.connections);
      setSetupRequired(Boolean(result.setupRequired));
    } catch (e: any) {
      setConnections([]);
      setError(e?.message || null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e: any) {
      setError(e?.message || "That didn't work. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const connect = () =>
    run("connect", async () => {
      const { url } = await api.createIntegrationStartToken("gmail");
      window.location.href = `${apiBaseUrl}${url}`;
    });

  return (
    <section className={`${CARD} p-4 sm:p-5`} aria-labelledby="gmail-heading">
      <p className={EYEBROW}>Email</p>
      <h2 id="gmail-heading" className="mt-1 text-lg font-medium text-[var(--ink)]">
        Send from your Gmail
      </h2>
      <p className="mt-1 max-w-2xl text-xs leading-[1.55] text-[var(--ink-soft,#5b6170)]">
        Agently writes a personal email for each lead (a follow-up, a meeting link, a new time) and sends it from your own
        address. It can only send; it never reads your inbox.
      </p>

      {error && <p className="mt-3 text-xs font-semibold text-red-600">{error}</p>}
      {setupRequired && (
        <p className="mt-3 text-xs font-semibold text-[var(--orange-deep)]">
          Email sending isn't switched on for this server yet. An administrator needs to finish its setup.
        </p>
      )}

      <div className="mt-4 space-y-2">
        {connections === null && <p className="text-xs text-[var(--ink-soft,#5b6170)]">Loading…</p>}
        {(connections || []).map((c) => (
          <div
            key={c.id}
            className="flex flex-col gap-3 rounded-[12px] border border-[var(--line,#e6e2da)] p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[var(--ink)]">
                {c.provider_user_email || c.label}
                {c.is_default && (
                  <span className="ml-2 rounded-full bg-[var(--orange-tint)] px-2 py-0.5 text-[10px] font-semibold text-[var(--orange-deep)]">
                    Default
                  </span>
                )}
              </p>
              {c.status === "needs_reconnect" && (
                <p className="mt-0.5 text-xs text-red-600">{c.last_error || "Needs to be reconnected."}</p>
              )}
              <label className="mt-2 flex items-center gap-2 text-xs text-[var(--ink)]">
                <input
                  type="checkbox"
                  checked={Boolean(c.automations?.booking_confirmation)}
                  disabled={busy !== null}
                  onChange={(e) =>
                    void run(`auto-${c.id}`, () => api.setGmailAutomations(c.id, { booking_confirmation: e.target.checked }))
                  }
                />
                Email a personal confirmation when an agent books an appointment
              </label>
            </div>
            <div className="flex shrink-0 gap-2">
              {c.status === "needs_reconnect" && (
                <button type="button" className={BTN_PRIMARY} disabled={busy !== null} onClick={() => void connect()}>
                  Reconnect
                </button>
              )}
              {!c.is_default && (
                <button
                  type="button"
                  className={BTN_QUIET}
                  disabled={busy !== null}
                  onClick={() => void run(`default-${c.id}`, () => api.setGmailDefault(c.id))}
                >
                  Make default
                </button>
              )}
              <button
                type="button"
                className={BTN_QUIET}
                disabled={busy !== null}
                onClick={() => {
                  if (window.confirm("Disconnect this Gmail? Agently will stop sending from it.")) {
                    void run(`remove-${c.id}`, () => api.disconnectGmail(c.id));
                  }
                }}
              >
                Disconnect
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        className={`${BTN_PRIMARY} mt-4`}
        disabled={busy !== null || setupRequired}
        onClick={() => void connect()}
      >
        {busy === "connect" ? "Opening Google…" : connections && connections.length > 0 ? "Add another Gmail" : "Connect Gmail"}
      </button>
    </section>
  );
}
