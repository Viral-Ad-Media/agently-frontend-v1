import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BTN_PRIMARY, CARD, EYEBROW, FIELD } from "./BrandSurface";
import { api } from "../services/api";
import type { CalendarBookingSettings, CalendarConnection } from "../services/api";
import type { User } from "../types";

const WEEKDAYS = [
  ["mon", "Mon"], ["tue", "Tue"], ["wed", "Wed"], ["thu", "Thu"],
  ["fri", "Fri"], ["sat", "Sat"], ["sun", "Sun"],
] as const;

type BookingPrefs = {
  slotMinutes: number;
  windowDays: number;
  workingHours: Record<string, Array<[string, string]>>;
  sendUpdates: "all" | "none";
};

const defaultPrefs = (): BookingPrefs => ({
  slotMinutes: 30,
  windowDays: 14,
  workingHours: {
    mon: [["09:00", "17:00"]], tue: [["09:00", "17:00"]],
    wed: [["09:00", "17:00"]], thu: [["09:00", "17:00"]],
    fri: [["09:00", "17:00"]], sat: [], sun: [],
  },
  sendUpdates: "all",
});

const prefsFromConnection = (connection: CalendarConnection | null): BookingPrefs => {
  const base = defaultPrefs();
  const saved = connection?.booking_settings;
  if (!saved) return base;
  return {
    slotMinutes: saved.slotMinutes ?? base.slotMinutes,
    windowDays: saved.windowDays ?? base.windowDays,
    workingHours: saved.workingHours ? { ...base.workingHours, ...saved.workingHours } : base.workingHours,
    sendUpdates: saved.sendUpdates === "none" ? "none" : "all",
  };
};

const labelFor = (connection: CalendarConnection) =>
  connection.label?.trim() || connection.provider_user_name?.trim() ||
  connection.provider_user_email?.trim() || (connection.provider === "google" ? "Google Calendar" : "Calendly");

const BookingSetupPanel: React.FC<{ user?: User | null }> = ({ user }) => {
  const isAdmin = user?.role === "Owner" || user?.role === "Admin";
  const [connections, setConnections] = useState<CalendarConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [targetId, setTargetId] = useState("");
  const [targetBusy, setTargetBusy] = useState(false);
  const [options, setOptions] = useState<Array<{ id: string; name: string; primary?: boolean }>>([]);
  const [selected, setSelected] = useState("");
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [savingDestination, setSavingDestination] = useState(false);
  const [prefs, setPrefs] = useState<BookingPrefs>(defaultPrefs);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const target = useMemo(() => connections.find((item) => item.id === targetId) || null, [connections, targetId]);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const status = await api.getIntegrationsStatus();
      const available = (status.connections || []).filter((item) => item.status !== "disconnected");
      setConnections(available);
      const nextTarget = available.find((item) => item.is_booking_default) || (available.length === 1 ? available[0] : null);
      setTargetId(nextTarget?.id || "");
      setPrefs(prefsFromConnection(nextTarget));
      if (!nextTarget) {
        setOptions([]);
        setSelected("");
      }
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Could not load booking settings." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const chooseTarget = async (id: string) => {
    setTargetId(id);
    const next = connections.find((item) => item.id === id) || null;
    setPrefs(prefsFromConnection(next));
    setOptions([]);
    setSelected("");
    if (!next || next.is_booking_default) return;
    setTargetBusy(true);
    setMessage(null);
    try {
      await api.setCalendarBookingDefault(next.id);
      setMessage({ type: "ok", text: `${labelFor(next)} is now the booking calendar.` });
      await refresh();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Could not change the booking calendar." });
      await refresh();
    } finally {
      setTargetBusy(false);
    }
  };

  const loadOptions = async () => {
    if (!target) return;
    setOptionsLoading(true);
    setMessage(null);
    try {
      const result = await api.getIntegrationOptions(target.provider, target.id);
      setOptions(result.options);
      setSelected(result.selected || "");
      if (!result.options.length) setMessage({ type: "error", text: "No booking destinations were found for this account." });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Could not load booking destinations." });
    } finally {
      setOptionsLoading(false);
    }
  };

  const saveDestination = async () => {
    if (!target || !selected) return;
    setSavingDestination(true);
    setMessage(null);
    try {
      await api.saveIntegrationSelection(target.provider, target.provider === "google"
        ? { calendarId: selected, connectionId: target.id }
        : { eventTypeUri: selected, eventTypeName: options.find((item) => item.id === selected)?.name, connectionId: target.id });
      setMessage({ type: "ok", text: "Booking destination saved." });
      await refresh();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Could not save the booking destination." });
    } finally {
      setSavingDestination(false);
    }
  };

  const savePrefs = async () => {
    if (!target) return;
    setSavingPrefs(true);
    setMessage(null);
    const payload: CalendarBookingSettings & { connectionId: string } = { windowDays: prefs.windowDays, connectionId: target.id };
    if (target.provider === "google") Object.assign(payload, {
      slotMinutes: prefs.slotMinutes,
      workingHours: prefs.workingHours,
      sendUpdates: prefs.sendUpdates,
    });
    try {
      await api.saveBookingSettings(target.provider, payload);
      setMessage({ type: "ok", text: "Booking preferences saved." });
      await refresh();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Could not save booking preferences." });
    } finally {
      setSavingPrefs(false);
    }
  };

  if (!isAdmin) return null;

  return (
    <details className={`${CARD} mb-5`} data-testid="booking-setup-panel">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <span className="min-w-0">
          <span className={EYEBROW}>Booking setup</span>
          <span className="mt-1 block text-sm text-[var(--muted)]">
            {target ? `Appointments go to ${labelFor(target)}.` : "Choose where your agent books appointments."}
          </span>
        </span>
        <span className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--ink)]">Manage</span>
      </summary>
      <div className="border-t border-[var(--line)] px-4 py-4 sm:px-5">
        {message && <p role={message.type === "error" ? "alert" : "status"} className={`mb-3 text-sm ${message.type === "error" ? "text-red-700" : "text-emerald-700"}`}>{message.text}</p>}
        {loading ? <p className="text-sm text-[var(--muted)]">Loading booking settings…</p> : connections.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[var(--muted)]">Connect a calendar account before configuring bookings.</p>
            <Link to="/integrations" className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm font-medium text-[var(--ink)]">Connect calendar</Link>
          </div>
        ) : target ? (
          <div className="space-y-4">
            {connections.length > 1 && <label className="block max-w-lg"><span className="text-xs text-[var(--muted)]">Booking account</span><select aria-label="Booking account" value={target.id} onChange={(event) => void chooseTarget(event.target.value)} disabled={targetBusy} className={`${FIELD} mt-1`}>{connections.map((connection) => <option key={connection.id} value={connection.id}>{labelFor(connection)} · {connection.provider === "google" ? "Google Calendar" : "Calendly"}</option>)}</select></label>}
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="rounded-xl border border-[var(--line)] p-3" aria-label="Booking destination">
                <p className="text-sm font-medium text-[var(--ink)]">Destination</p>
                <p className="mt-1 text-xs text-[var(--muted)]">{target.provider === "google" ? "Choose the calendar that receives new appointments." : "Choose the Calendly event type."}</p>
                {options.length === 0 ? <button type="button" onClick={() => void loadOptions()} disabled={optionsLoading} className="mt-3 rounded-lg border border-[var(--line)] px-3 py-2 text-sm font-medium text-[var(--ink)]">{optionsLoading ? "Loading…" : "Load destinations"}</button> : <div className="mt-3 flex flex-wrap gap-2"><select aria-label="Booking destination" value={selected} onChange={(event) => setSelected(event.target.value)} className={`${FIELD} min-w-0 flex-1`}>{options.map((option) => <option key={option.id} value={option.id}>{option.name}{option.primary ? " (primary)" : ""}</option>)}</select><button type="button" onClick={() => void saveDestination()} disabled={!selected || savingDestination} className={BTN_PRIMARY}>{savingDestination ? "Saving…" : "Save"}</button></div>}
                {options.length === 0 && (target.provider === "google" ? target.calendar_id : target.event_type_name) && <p className="mt-2 text-xs text-[var(--muted)]">Currently: {target.provider === "google" ? target.calendar_id : target.event_type_name}</p>}
              </section>
              <section className="rounded-xl border border-[var(--line)] p-3" aria-label="Booking preferences">
                <p className="text-sm font-medium text-[var(--ink)]">Preferences</p>
                <label className="mt-3 block max-w-xs"><span className="text-xs text-[var(--muted)]">Offer appointments this far ahead</span><span className="mt-1 flex items-center gap-2"><input type="number" min={1} max={60} value={prefs.windowDays} onChange={(event) => setPrefs((current) => ({ ...current, windowDays: Math.max(1, Math.min(60, Number(event.target.value) || 1)) }))} className={`${FIELD} w-24`} /><span className="text-sm text-[var(--muted)]">days</span></span></label>
                {target.provider === "google" && <>
                  <label className="mt-3 block max-w-xs"><span className="text-xs text-[var(--muted)]">Appointment length</span><select aria-label="Appointment length" value={prefs.slotMinutes} onChange={(event) => setPrefs((current) => ({ ...current, slotMinutes: Number(event.target.value) }))} className={`${FIELD} mt-1`}>{[15, 30, 45, 60, 90].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</select></label>
                  <div className="mt-3"><p className="text-xs text-[var(--muted)]">Working hours</p><div className="mt-1 grid gap-1 sm:grid-cols-2">{WEEKDAYS.map(([key, day]) => { const windows = prefs.workingHours[key] || []; const open = windows.length > 0; const [start, end] = windows[0] || ["09:00", "17:00"]; return <div key={key} className="flex items-center gap-2 rounded-lg border border-[var(--line)] px-2 py-1.5"><span className="w-8 text-xs text-[var(--muted)]">{day}</span><input type="checkbox" aria-label={`${day} open`} checked={open} onChange={(event) => setPrefs((current) => ({ ...current, workingHours: { ...current.workingHours, [key]: event.target.checked ? [["09:00", "17:00"]] : [] } }))} /><span className="text-xs text-[var(--muted)]">{open ? `${start}–${end}` : "Closed"}</span></div>; })}</div></div>
                  <label className="mt-3 flex items-center gap-2 text-xs text-[var(--muted)]"><input type="checkbox" checked={prefs.sendUpdates === "all"} onChange={(event) => setPrefs((current) => ({ ...current, sendUpdates: event.target.checked ? "all" : "none" }))} />Email a calendar invite when an agent books</label>
                </>}
                <button type="button" onClick={() => void savePrefs()} disabled={savingPrefs} className={`${BTN_PRIMARY} mt-3`}>{savingPrefs ? "Saving…" : "Save preferences"}</button>
              </section>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="block min-w-64"><span className="text-xs text-[var(--muted)]">Choose a booking account</span><select aria-label="Booking account" value="" onChange={(event) => void chooseTarget(event.target.value)} disabled={targetBusy} className={`${FIELD} mt-1`}><option value="">Select account</option>{connections.filter((item) => item.status === "connected").map((connection) => <option key={connection.id} value={connection.id}>{labelFor(connection)}</option>)}</select></label>
          </div>
        )}
      </div>
    </details>
  );
};

export default BookingSetupPanel;
