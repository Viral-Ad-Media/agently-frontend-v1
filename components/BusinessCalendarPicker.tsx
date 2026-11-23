import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../services/api";
import type { CalendarConnection } from "../services/api";

/**
 * Which business calendar this agent books into.
 *
 * Several agents can share one business's calendar. "Default" (null) means
 * the calendar marked as the booking default on the Integrations screen, so a
 * tenant with one calendar never has to touch this. Saves on change.
 */
export default function BusinessCalendarPicker({
  agentId,
  value,
  onSaved,
}: {
  agentId?: string;
  value?: string | null;
  onSaved?: (calendarIntegrationId: string | null) => void;
}) {
  const [connections, setConnections] = useState<CalendarConnection[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getIntegrationsStatus()
      .then((status) => {
        if (!cancelled) setConnections((status.connections || []).filter((c) => c.status !== "disconnected"));
      })
      .catch(() => {
        if (!cancelled) setConnections([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const label = (c: CalendarConnection) =>
    `${c.label || c.provider_user_email || c.provider} · ${c.provider === "google" ? "Google" : "Calendly"}`;
  const fallback = connections?.find((c) => c.is_booking_default);

  const change = async (next: string) => {
    if (!agentId) return;
    const id = next || null;
    setSaving(true);
    setError(null);
    try {
      await api.updateVoiceAgent(agentId, { calendarIntegrationId: id });
      onSaved?.(id);
    } catch (e: any) {
      setError(e?.message || "Could not save the calendar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-600">Business calendar</p>
          <h3 className="mt-1 text-lg font-medium text-[#232f3e]">Where this agent books appointments</h3>
          <p className="mt-1 max-w-2xl text-xs font-semibold leading-relaxed text-[#687386]">
            Pick the business this agent works for. Several agents can share one calendar. Availability is
            still checked across all of your connected calendars, so nobody gets double-booked.
          </p>
          {error && <p className="mt-2 text-xs font-bold text-red-600">{error}</p>}
        </div>
        {connections === null ? (
          <div className="text-xs font-bold text-[#687386]">Loading calendars…</div>
        ) : connections.length === 0 ? (
          <Link
            to="/integrations"
            className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-xs font-bold text-[#687386]"
          >
            Connect a calendar in Integrations
          </Link>
        ) : (
          <select
            value={value || ""}
            onChange={(event) => void change(event.target.value)}
            disabled={saving || !agentId}
            className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-700 outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100 sm:min-w-72"
          >
            <option value="">Default{fallback ? ` (${label(fallback)})` : ""}</option>
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {label(c)}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
