import React, { useEffect, useMemo, useState } from "react";
import { Organization, WorkspaceSettings } from "../types";
import { NETWORK_OFFLINE_MESSAGE, api } from "../services/api";

interface SettingsProps {
  org: Organization;
  onSave: (settings: {
    timezone: string;
    phoneNumber: string;
  }) => Promise<void>;
}

const getTimeZones = () => {
  try {
    const supported = Intl.supportedValuesOf?.("timeZone") || [];
    if (supported.length) return supported;
  } catch {
    // Fall through.
  }
  return [
    "Africa/Lagos",
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "America/Toronto",
    "Europe/London",
    "Europe/Paris",
    "Europe/Berlin",
    "Asia/Dubai",
    "Asia/Singapore",
    "Asia/Tokyo",
    "Australia/Sydney",
    "UTC",
  ];
};

const cleanError = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : fallback;
  const lower = message.toLowerCase();
  if (
    lower.includes("failed to fetch") ||
    lower.includes("network") ||
    lower.includes("offline")
  ) {
    return NETWORK_OFFLINE_MESSAGE;
  }
  return message;
};

const Settings: React.FC<SettingsProps> = ({ org, onSave }) => {
  const [timezone, setTimezone] = useState(
    org.settings.timezone || org.profile.timezone || "Africa/Lagos",
  );
  const [phoneNumber, setPhoneNumber] = useState(
    org.settings.phoneNumber || org.phoneNumber || "",
  );
  const [timezoneSearch, setTimezoneSearch] = useState(timezone);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const timezones = useMemo(() => getTimeZones(), []);
  const filteredTimezones = useMemo(() => {
    const query = timezoneSearch.trim().toLowerCase();
    return timezones
      .filter((zone) => zone.toLowerCase().includes(query))
      .slice(0, 80);
  }, [timezoneSearch, timezones]);

  const applySettings = (settings: Partial<WorkspaceSettings>) => {
    const nextTimezone =
      settings.timezone ||
      org.settings.timezone ||
      org.profile.timezone ||
      "Africa/Lagos";
    const nextPhone =
      settings.phoneNumber || org.settings.phoneNumber || org.phoneNumber || "";
    setTimezone(nextTimezone);
    setTimezoneSearch(nextTimezone);
    setPhoneNumber(nextPhone);
  };

  const loadSettings = async () => {
    setLoading(true);
    setError("");
    try {
      const settings = await api.getSettings();
      applySettings(settings);
    } catch (err) {
      setError(cleanError(err, "Unable to load settings."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    applySettings(org.settings);
    void loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org.id]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    try {
      if (!timezones.includes(timezone)) {
        setError("Choose a valid timezone from the list.");
        return;
      }
      await onSave({ timezone, phoneNumber });
      await loadSettings();
      setMessage("Settings saved.");
    } catch (e) {
      setError(cleanError(e, "Unable to save settings."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-900">
            Organization Settings
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Manage global settings for {org.profile.name}.
          </p>
        </div>
        <button
          type="button"
          onClick={loadSettings}
          disabled={loading}
          className="rounded-xl border border-slate-200 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:border-slate-300 disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {(message || error) && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm font-medium ${error ? "border-red-100 bg-red-50 text-red-600" : "border-emerald-100 bg-emerald-50 text-emerald-700"}`}
        >
          {error || `✓ ${message}`}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 gap-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">
              Organization Name
            </label>
            <input
              type="text"
              value={org.profile.name}
              disabled
              className="w-full rounded-xl border border-slate-100 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-500"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">
              Industry
            </label>
            <input
              value={org.profile.industry}
              disabled
              className="w-full rounded-xl border border-slate-100 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-500"
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">
              Timezone
            </label>
            <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
              <div>
                <input
                  value={timezoneSearch}
                  onChange={(e) => setTimezoneSearch(e.target.value)}
                  placeholder="Search timezones..."
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-amber-400"
                />
                <p className="mt-1 text-xs text-slate-400">
                  Selected: {timezone}
                </p>
              </div>
              <select
                value={timezone}
                onChange={(e) => {
                  setTimezone(e.target.value);
                  setTimezoneSearch(e.target.value);
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-amber-400"
              >
                {filteredTimezones.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">
              Primary Contact Number
            </label>
            <input
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+1 555 000 0000"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">
              Website
            </label>
            <input
              value={org.profile.website || ""}
              disabled
              className="w-full rounded-xl border border-slate-100 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-500"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-2xl bg-slate-900 px-8 py-3 text-[10px] font-black uppercase tracking-widest text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Settings"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default Settings;
