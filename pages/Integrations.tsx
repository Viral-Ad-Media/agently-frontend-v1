import React, { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import SettingsTabs from "../components/SettingsTabs";
import { api, apiBaseUrl } from "../services/api";
import type { User } from "../types";

type Provider = "google" | "calendly";
type ConnectionStatus = "connected" | "needs_reconnect" | "disconnected" | "error";

interface Connection {
  id: string;
  provider: Provider;
  status: ConnectionStatus;
  provider_user_id: string | null;
  provider_user_email: string | null;
  provider_user_name: string | null;
  calendar_id: string | null;
  event_type_uri: string | null;
  event_type_name: string | null;
  timezone: string | null;
  last_error: string | null;
  connected_at: string;
  booking_settings: Partial<BookingPrefs> | null;
}

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

const prefsFromConnection = (connection: Connection | null): BookingPrefs => {
  const base = defaultPrefs();
  const saved = connection?.booking_settings;
  if (!saved) return base;
  return {
    slotMinutes:
      typeof saved.slotMinutes === "number" ? saved.slotMinutes : base.slotMinutes,
    windowDays:
      typeof saved.windowDays === "number" ? saved.windowDays : base.windowDays,
    workingHours:
      saved.workingHours && typeof saved.workingHours === "object"
        ? { ...base.workingHours, ...saved.workingHours }
        : base.workingHours,
    sendUpdates: saved.sendUpdates === "none" ? "none" : "all",
  };
};

interface StatusResponse {
  encryptionConfigured: boolean;
  encryptionHelp: string | null;
  googleConfigured: boolean;
  calendlyConfigured: boolean;
  connections: Connection[];
}

interface PickerOption {
  id: string;
  name: string;
  primary?: boolean;
  slug?: string;
}

const PROVIDER_META: Record<
  Provider,
  { title: string; blurb: string; icon: string; note: string }
> = {
  google: {
    title: "Google Calendar",
    blurb:
      "Let the agent check your availability and book straight into your Google calendar during a call.",
    icon: "fa-brands fa-google",
    note: "Uses your Google account. Agently only asks for availability + event access — never full mailbox scope.",
  },
  calendly: {
    title: "Calendly",
    blurb:
      "Let the agent book directly into your Calendly event types. Used first whenever it's connected.",
    icon: "fa-sharp fa-solid fa-calendar-check",
    note: "Calendly requires a paid plan on your Calendly account for API booking.",
  },
};

const statusBadge = (status: ConnectionStatus) => {
  if (status === "connected")
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "needs_reconnect") return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-slate-100 text-slate-600 ring-slate-200";
};

const statusLabel = (status: ConnectionStatus) =>
  status === "connected"
    ? "Connected"
    : status === "needs_reconnect"
      ? "Needs reconnect"
      : status === "error"
        ? "Error"
        : "Disconnected";

const Integrations: React.FC<{ user: User | null }> = ({ user }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState<Provider | null>(null);
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

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getIntegrationsStatus();
      setStatus(data);
      // Seed the booking-preference forms from the saved settings.
      setPrefs({
        google: prefsFromConnection(
          data.connections.find((c) => c.provider === "google") || null,
        ),
        calendly: prefsFromConnection(
          data.connections.find((c) => c.provider === "calendly") || null,
        ),
      });
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
    if (connected === "google" || connected === "calendly") {
      setBanner({
        kind: "ok",
        text: `${PROVIDER_META[connected].title} connected. Pick where the agent should book below.`,
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

  const connectionFor = (provider: Provider) =>
    status?.connections.find((c) => c.provider === provider) || null;

  const loadOptions = async (provider: Provider) => {
    setOptionsLoading(provider);
    try {
      const data = await api.getIntegrationOptions(provider);
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

  const saveSelection = async (provider: Provider) => {
    const value = selection[provider];
    if (!value) return;
    setSavingSelection(provider);
    try {
      const connection = connectionFor(provider);
      await api.saveIntegrationSelection(
        provider,
        provider === "google"
          ? { calendarId: value }
          : {
              eventTypeUri: value,
              eventTypeName:
                options.calendly.find((o) => o.id === value)?.name || undefined,
            },
      );
      setBanner({ kind: "ok", text: "Booking target saved." });
      // Keep the local connection row in sync without a full reload.
      setStatus((prev) =>
        prev
          ? {
              ...prev,
              connections: prev.connections.map((c) =>
                c.id === connection?.id
                  ? provider === "google"
                    ? { ...c, calendar_id: value }
                    : {
                        ...c,
                        event_type_uri: value,
                        event_type_name:
                          options.calendly.find((o) => o.id === value)?.name ||
                          c.event_type_name,
                      }
                  : c,
              ),
            }
          : prev,
      );
    } catch (error) {
      setBanner({
        kind: "err",
        text: error instanceof Error ? error.message : "Could not save the selection.",
      });
    } finally {
      setSavingSelection(null);
    }
  };

  const saveBookingPrefs = async (provider: Provider) => {
    const p = prefs[provider];
    setSavingPrefs(provider);
    try {
      const payload: {
        slotMinutes?: number;
        windowDays?: number;
        workingHours?: Record<string, Array<[string, string]>>;
        sendUpdates?: "all" | "none";
      } = { windowDays: p.windowDays };
      if (provider === "google") {
        payload.slotMinutes = p.slotMinutes;
        payload.workingHours = p.workingHours;
        payload.sendUpdates = p.sendUpdates;
      }
      const { connection } = await api.saveBookingSettings(provider, payload);
      setBanner({ kind: "ok", text: "Booking preferences saved." });
      setStatus((prev) =>
        prev
          ? {
              ...prev,
              connections: prev.connections.map((c) =>
                c.provider === provider
                  ? { ...c, booking_settings: (connection.booking_settings as BookingPrefs) || p }
                  : c,
              ),
            }
          : prev,
      );
    } catch (error) {
      setBanner({
        kind: "err",
        text: error instanceof Error ? error.message : "Could not save preferences.",
      });
    } finally {
      setSavingPrefs(null);
    }
  };

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
        text: "Link created. Log into your other business and join with the code below.",
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
      setBanner({ kind: "ok", text: "Business linked. The agent now guards your time across both." });
      await reloadGroups();
    } catch (error) {
      setBanner({
        kind: "err",
        text: error instanceof Error ? error.message : "Could not join. Check the code and try again.",
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
    if (!window.confirm("Unlink this business? The cross-business guard stops immediately.")) return;
    setGroupBusy(`leave-${id}`);
    try {
      await api.leaveBusinessGroup(id);
      setBanner({ kind: "ok", text: "Business unlinked." });
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

  const disconnect = async (provider: Provider) => {
    if (
      !window.confirm(
        `Disconnect ${PROVIDER_META[provider].title}? The agent will stop booking into it.`,
      )
    )
      return;
    setBusy(provider);
    try {
      await api.disconnectIntegration(provider);
      setBanner({ kind: "ok", text: `${PROVIDER_META[provider].title} disconnected.` });
      await refresh();
    } catch (error) {
      setBanner({
        kind: "err",
        text: error instanceof Error ? error.message : "Could not disconnect.",
      });
    } finally {
      setBusy(null);
    }
  };

  const startConnect = async (provider: Provider) => {
    setBusy(provider);
    try {
      const { url } = await api.createIntegrationStartToken(provider);
      window.location.href = `${apiBaseUrl}${url}`;
    } catch (error) {
      setBanner({
        kind: "err",
        text: error instanceof Error ? error.message : "Could not start the connection.",
      });
      setBusy(null);
    }
  };

  const renderPicker = (provider: Provider) => {
    const connection = connectionFor(provider);
    if (!connection || connection.status !== "connected") return null;
    const list = options[provider];
    return (
      <div className="mt-4 border-t border-slate-100 pt-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="text-xs font-black uppercase tracking-wide text-slate-500">
            {provider === "google" ? "Book into calendar" : "Book into event type"}
          </label>
          {list.length === 0 && (
            <button
              type="button"
              onClick={() => void loadOptions(provider)}
              disabled={optionsLoading === provider}
              className="inline-flex items-center gap-1.5 text-xs font-black text-amber-700 hover:text-amber-800 disabled:opacity-50"
            >
              <i className="fa-sharp fa-solid fa-rotate" aria-hidden="true" />
              {optionsLoading === provider ? "Loading..." : "Load options"}
            </button>
          )}
        </div>
        {list.length > 0 && (
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <select
              value={selection[provider]}
              onChange={(e) =>
                setSelection((prev) => ({ ...prev, [provider]: e.target.value }))
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none transition focus:border-amber-400 sm:max-w-sm"
            >
              <option value="">Choose...</option>
              {list.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.name}
                  {opt.primary ? " (primary)" : ""}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void saveSelection(provider)}
              disabled={!selection[provider] || savingSelection === provider || !isAdmin}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-900 px-4 text-xs font-black text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {savingSelection === provider ? "Saving..." : "Save"}
            </button>
          </div>
        )}
        {provider === "google" && connection.calendar_id && list.length === 0 && (
          <p className="mt-2 text-xs font-medium text-slate-500">
            Currently booking into:{" "}
            <span className="font-bold text-slate-700">{connection.calendar_id}</span>
          </p>
        )}
        {provider === "calendly" && connection.event_type_name && list.length === 0 && (
          <p className="mt-2 text-xs font-medium text-slate-500">
            Currently booking into:{" "}
            <span className="font-bold text-slate-700">{connection.event_type_name}</span>
          </p>
        )}
      </div>
    );
  };

  const renderBookingPrefs = (provider: Provider) => {
    const connection = connectionFor(provider);
    if (!connection || connection.status !== "connected" || !isAdmin) return null;
    const p = prefs[provider];
    const set = (patch: Partial<BookingPrefs>) =>
      setPrefs((prev) => ({ ...prev, [provider]: { ...prev[provider], ...patch } }));

    const setDayOpen = (day: string, open: boolean) =>
      set({
        workingHours: {
          ...p.workingHours,
          [day]: open ? [["09:00", "17:00"]] : [],
        },
      });
    const setDayWindow = (day: string, index: 0 | 1, value: string) => {
      const windows = [...(p.workingHours[day] || [["09:00", "17:00"]])];
      const current: [string, string] = [...(windows[0] || ["09:00", "17:00"])] as [string, string];
      current[index] = value;
      windows[0] = current;
      set({ workingHours: { ...p.workingHours, [day]: windows } });
    };

    return (
      <div className="mt-4 border-t border-slate-100 pt-4">
        <h4 className="text-xs font-black uppercase tracking-wide text-slate-500">
          Booking preferences
        </h4>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {provider === "google" && (
            <label className="block">
              <span className="text-xs font-bold text-slate-600">Appointment length</span>
              <select
                value={p.slotMinutes}
                onChange={(e) => set({ slotMinutes: Number(e.target.value) })}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none transition focus:border-amber-400"
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
            <span className="text-xs font-bold text-slate-600">
              Offer slots this far ahead
            </span>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={60}
                value={p.windowDays}
                onChange={(e) =>
                  set({ windowDays: Math.max(1, Math.min(60, Number(e.target.value) || 1)) })
                }
                className="w-24 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none transition focus:border-amber-400"
              />
              <span className="text-xs font-medium text-slate-500">days</span>
            </div>
          </label>
        </div>

        {provider === "calendly" && (
          <p className="mt-2 text-xs font-medium text-slate-400">
            Appointment length comes from your Calendly event type.
          </p>
        )}

        {provider === "google" && (
          <div className="mt-3">
            <span className="text-xs font-bold text-slate-600">Working hours</span>
            <div className="mt-1 overflow-hidden rounded-xl border border-slate-200">
              {WEEKDAYS.map(({ key, label }, i) => {
                const windows = p.workingHours[key] || [];
                const open = windows.length > 0;
                const [start, end] = windows[0] || ["09:00", "17:00"];
                return (
                  <div
                    key={key}
                    className={`flex items-center gap-3 px-3 py-2 ${i > 0 ? "border-t border-slate-100" : ""} ${open ? "bg-white" : "bg-slate-50"}`}
                  >
                    <span className="w-10 text-xs font-black text-slate-600">{label}</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={open}
                      aria-label={`${label} open`}
                      onClick={() => setDayOpen(key, !open)}
                      className={`relative h-5 w-9 shrink-0 rounded-full transition ${open ? "bg-emerald-500" : "bg-slate-300"}`}
                    >
                      <span
                        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${open ? "left-[18px]" : "left-0.5"}`}
                      />
                    </button>
                    {open ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="time"
                          value={start}
                          onChange={(e) => setDayWindow(key, 0, e.target.value)}
                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 outline-none focus:border-amber-400"
                        />
                        <span className="text-xs text-slate-400">–</span>
                        <input
                          type="time"
                          value={end}
                          onChange={(e) => setDayWindow(key, 1, e.target.value)}
                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 outline-none focus:border-amber-400"
                        />
                      </div>
                    ) : (
                      <span className="text-xs font-medium text-slate-400">Closed</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {provider === "google" && (
          <label className="mt-3 flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={p.sendUpdates === "all"}
              onChange={(e) => set({ sendUpdates: e.target.checked ? "all" : "none" })}
              className="mt-0.5 h-4 w-4 rounded accent-amber-600"
            />
            <span className="text-xs font-medium text-slate-600">
              <span className="font-bold text-slate-700">Email the caller</span> a calendar
              invite when the agent books.
            </span>
          </label>
        )}

        <button
          type="button"
          onClick={() => void saveBookingPrefs(provider)}
          disabled={savingPrefs === provider}
          className="mt-3 inline-flex h-10 items-center justify-center rounded-xl bg-slate-900 px-4 text-xs font-black text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {savingPrefs === provider ? "Saving..." : "Save preferences"}
        </button>
      </div>
    );
  };

  const renderLinkedBusinesses = () => {
    if (!isAdmin) return null;
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <h3 className="text-base font-black text-slate-900">Linked businesses</h3>
        <p className="mt-1 max-w-xl text-sm font-medium text-slate-500">
          Run more than one business on Agently and share your own time across them? Link
          them here and the agent will never offer a slot where you're busy with another
          linked business. If a clash still slips through, you get a notification asking
          you to take action.
        </p>

        {groups.map((g) => (
          <div key={g.id} className="mt-4 rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-center gap-2">
              {g.members.map((m) => (
                <span
                  key={m.organization_id}
                  className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700 ring-1 ring-slate-200"
                >
                  <i className="fa-sharp fa-solid fa-briefcase mr-1.5 text-slate-400" aria-hidden="true" />
                  {m.name}
                </span>
              ))}
              {g.owner_label && (
                <span className="text-xs font-medium text-slate-400">· {g.owner_label}</span>
              )}
            </div>

            <div className="mt-3">
              <span className="text-xs font-bold text-slate-600">When schedules clash</span>
              <div className="mt-1 flex flex-col gap-1.5">
                <label className="flex cursor-pointer items-start gap-2.5">
                  <input
                    type="radio"
                    name={`policy-${g.id}`}
                    checked={g.policy === "flag_for_review"}
                    onChange={() => void setGroupPolicy(g.id, "flag_for_review")}
                    disabled={groupBusy === `policy-${g.id}`}
                    className="mt-0.5 h-4 w-4 accent-amber-600"
                  />
                  <span className="text-xs font-medium text-slate-600">
                    <span className="font-bold text-slate-700">Book, then flag for review</span>{" "}
                    (recommended) — the booking goes through and you get a notification
                    naming the clash so you can act.
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2.5">
                  <input
                    type="radio"
                    name={`policy-${g.id}`}
                    checked={g.policy === "block"}
                    onChange={() => void setGroupPolicy(g.id, "block")}
                    disabled={groupBusy === `policy-${g.id}`}
                    className="mt-0.5 h-4 w-4 accent-amber-600"
                  />
                  <span className="text-xs font-medium text-slate-600">
                    <span className="font-bold text-slate-700">Block overlapping slots</span> —
                    the agent treats the time as taken and offers alternatives.
                  </span>
                </label>
              </div>
            </div>

            {g.invite_code ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 ring-1 ring-amber-200">
                <span className="text-xs font-bold text-amber-800">Invite code:</span>
                <code className="rounded bg-white px-2 py-0.5 font-mono text-sm font-black tracking-widest text-slate-900 ring-1 ring-amber-200">
                  {g.invite_code}
                </code>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard?.writeText(g.invite_code || "")}
                  className="text-xs font-black text-amber-700 hover:text-amber-900"
                >
                  Copy
                </button>
                <button
                  type="button"
                  onClick={() => void regenerateCode(g.id)}
                  disabled={groupBusy === `code-${g.id}`}
                  className="text-xs font-black text-amber-700 hover:text-amber-900 disabled:opacity-50"
                >
                  {groupBusy === `code-${g.id}` ? "Generating..." : "New code"}
                </button>
                <span className="w-full text-[11px] font-medium text-amber-700">
                  Log into your other business on Agently and paste this code there. Expires
                  in 24 hours.
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void regenerateCode(g.id)}
                disabled={groupBusy === `code-${g.id}`}
                className="mt-3 text-xs font-black text-amber-700 hover:text-amber-900 disabled:opacity-50"
              >
                {groupBusy === `code-${g.id}` ? "Generating..." : "Generate invite code"}
              </button>
            )}

            <button
              type="button"
              onClick={() => void leaveGroup(g.id)}
              disabled={groupBusy === `leave-${g.id}`}
              className="mt-3 text-xs font-black text-rose-600 hover:text-rose-800 disabled:opacity-50"
            >
              {groupBusy === `leave-${g.id}` ? "Unlinking..." : "Unlink this business"}
            </button>
          </div>
        ))}

        {groups.length === 0 && (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 p-4">
              <h4 className="text-xs font-black uppercase tracking-wide text-slate-500">
                Start a link
              </h4>
              <input
                type="text"
                value={ownerLabel}
                onChange={(e) => setOwnerLabel(e.target.value)}
                placeholder="Label (e.g. your name) — optional"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none transition focus:border-amber-400"
              />
              <button
                type="button"
                onClick={() => void createGroup()}
                disabled={groupBusy === "create"}
                className="mt-2 inline-flex h-10 items-center justify-center rounded-xl bg-slate-900 px-4 text-xs font-black text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {groupBusy === "create" ? "Creating..." : "Create link"}
              </button>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <h4 className="text-xs font-black uppercase tracking-wide text-slate-500">
                Join with a code
              </h4>
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="Paste the invite code"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 font-mono text-sm font-bold tracking-widest text-slate-800 outline-none transition focus:border-amber-400"
              />
              <button
                type="button"
                onClick={() => void joinGroup()}
                disabled={!joinCode.trim() || groupBusy === "join"}
                className="mt-2 inline-flex h-10 items-center justify-center rounded-xl bg-slate-900 px-4 text-xs font-black text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {groupBusy === "join" ? "Joining..." : "Join"}
              </button>
            </div>
          </div>
        )}
      </section>
    );
  };

  const renderCard = (provider: Provider) => {
    const meta = PROVIDER_META[provider];
    const connection = connectionFor(provider);
    const providerReady =
      provider === "google" ? status?.googleConfigured : status?.calendlyConfigured;
    const connecting = busy === provider;

    return (
      <section
        key={provider}
        className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-lg text-white">
              <i className={meta.icon} aria-hidden="true" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-black text-slate-900">{meta.title}</h3>
                {connection ? (
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-black ring-1 ${statusBadge(connection.status)}`}
                  >
                    {statusLabel(connection.status)}
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-black text-slate-500 ring-1 ring-slate-200">
                    Not connected
                  </span>
                )}
              </div>
              <p className="mt-1 max-w-xl text-sm font-medium text-slate-500">{meta.blurb}</p>
              {connection?.provider_user_email && (
                <p className="mt-1 text-xs font-bold text-slate-700">
                  {connection.provider_user_name
                    ? `${connection.provider_user_name} · `
                    : ""}
                  {connection.provider_user_email}
                </p>
              )}
              {connection?.status === "needs_reconnect" && connection.last_error && (
                <p className="mt-1 text-xs font-semibold text-amber-700">
                  {connection.last_error}
                </p>
              )}
              <p className="mt-2 text-xs font-medium text-slate-400">{meta.note}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {!connection || connection.status === "needs_reconnect" ? (
              <button
                type="button"
                onClick={() => void startConnect(provider)}
                disabled={!providerReady || !isAdmin || connecting}
                title={
                  !isAdmin
                    ? "Only owners and admins can connect calendars"
                    : !providerReady
                      ? "This integration is not configured on the server yet"
                      : `Connect ${meta.title}`
                }
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-black text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <i className="fa-sharp fa-solid fa-plug" aria-hidden="true" />
                {connection?.status === "needs_reconnect" ? "Reconnect" : "Connect"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void disconnect(provider)}
                disabled={!isAdmin || connecting}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-xs font-black text-slate-600 transition hover:border-rose-300 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <i className="fa-sharp fa-solid fa-unlink" aria-hidden="true" />
                {connecting ? "Working..." : "Disconnect"}
              </button>
            )}
          </div>
        </div>
        {renderPicker(provider)}
        {renderBookingPrefs(provider)}
      </section>
    );
  };

  return (
    <div className="w-full max-w-none pb-8">
      <header className="flex items-center justify-between gap-3 border-b border-slate-200 pb-5">
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
            Integrations
          </h2>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Connect the calendars your voice agent books into during calls.
          </p>
        </div>
      </header>

      <SettingsTabs active="integrations" />

      <main className="w-full max-w-none">
        {banner && (
          <div
            className={`mt-4 rounded-xl border px-4 py-3 text-sm font-semibold ${
              banner.kind === "ok"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
            role={banner.kind === "ok" ? "status" : "alert"}
          >
            <div className="flex items-start justify-between gap-3">
              <span>{banner.text}</span>
              <button
                type="button"
                onClick={() => setBanner(null)}
                className="shrink-0 text-xs font-black opacity-60 hover:opacity-100"
                aria-label="Dismiss"
              >
                <i className="fa-sharp fa-solid fa-xmark" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="mt-6 flex items-center gap-2 text-sm font-semibold text-slate-500">
            <i className="fa-sharp fa-solid fa-circle-notch fa-spin" aria-hidden="true" />
            Loading integrations...
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-4">
            {status && !status.encryptionConfigured && (
              <div
                className="rounded-2xl border border-amber-200 bg-amber-50 p-5"
                role="alert"
              >
                <h3 className="flex items-center gap-2 text-sm font-black text-amber-800">
                  <i className="fa-sharp fa-solid fa-triangle-exclamation" aria-hidden="true" />
                  Token encryption is not set up
                </h3>
                <p className="mt-1 text-xs font-medium text-amber-700">
                  Calendar tokens are encrypted before storage, and the encryption key is
                  missing on the server. Connections are disabled until it's configured.
                </p>
                {status.encryptionHelp && (
                  <p className="mt-2 font-mono text-[11px] leading-relaxed text-amber-800">
                    {status.encryptionHelp}
                  </p>
                )}
              </div>
            )}

            {(["calendly", "google"] as Provider[]).map(renderCard)}

            {renderLinkedBusinesses()}

            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <h3 className="text-sm font-black text-slate-900">How booking works</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs font-medium text-slate-500">
                <li>
                  When a caller asks to book, the agent checks live availability and offers
                  open slots — if a slot gets taken, it suggests the next best one.
                </li>
                <li>
                  When both are connected, Calendly is used first; Google Calendar is the
                  fallback.
                </li>
                <li>
                  Every booking notifies you here and by your usual notification channels,
                  and lands in your connected calendar immediately.
                </li>
              </ul>
            </section>
          </div>
        )}
      </main>
    </div>
  );
};

export default Integrations;
