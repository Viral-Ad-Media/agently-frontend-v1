import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  formatTimezoneOptionLabel,
  getAvailableTimezones,
  resolveOrgTimezone,
} from "@/utils/timezones";

interface SettingsProps {
  org: any;
  onSave: (settings: {
    timezone: string;
    phoneNumber: string;
  }) => Promise<void>;
}

const Settings: React.FC<SettingsProps> = ({ org, onSave }) => {
  const initialTimezone = resolveOrgTimezone(org);
  const initialPhone = org?.settings?.phoneNumber || org?.phoneNumber || "";
  const [timezone, setTimezone] = useState(initialTimezone);
  const [phoneNumber, setPhoneNumber] = useState(initialPhone);
  const timezoneOptions = useMemo(
    () => getAvailableTimezones(timezone || initialTimezone),
    [timezone, initialTimezone],
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    setTimezone(initialTimezone);
    setPhoneNumber(initialPhone);
  }, [initialTimezone, initialPhone]);

  const hasUnsavedChanges = useMemo(
    () => timezone !== initialTimezone || phoneNumber !== initialPhone,
    [timezone, phoneNumber, initialTimezone, initialPhone],
  );

  const saveSettings = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await onSave({ timezone, phoneNumber });
      setMessage({
        type: "success",
        text: "Workspace settings updated successfully.",
      });
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Could not update workspace settings.",
      });
    } finally {
      setSaving(false);
    }
  };

  const settingCards = [
    {
      title: "Knowledge Bases",
      description:
        "Create separate business knowledge bases and assign them to agents or chatbots.",
      href: "/knowledge-bases",
      icon: "fa-layer-group",
      accent: "bg-amber-50 text-amber-700 border-amber-100",
    },
    {
      title: "Team",
      description:
        "Invite members, manage roles, and control workspace access.",
      href: "/team",
      icon: "fa-users",
      accent: "bg-indigo-50 text-indigo-700 border-indigo-100",
    },
    {
      title: "Billing",
      description: "Review your plan, usage, invoices, and payment settings.",
      href: "/billing",
      icon: "fa-credit-card",
      accent: "bg-emerald-50 text-emerald-700 border-emerald-100",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-600">
              Settings
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">
              Workspace Settings
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
              Manage your workspace preferences, team access, billing, and setup
              from one place.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasUnsavedChanges ? (
              <span className="rounded-full bg-amber-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-amber-700 ring-1 ring-amber-100">
                Unsaved changes
              </span>
            ) : (
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-700 ring-1 ring-emerald-100">
                Saved
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-card lg:col-span-2 sm:p-6">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-base font-black text-slate-900">General</h3>
              <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">
                Click Save Changes to update workspace-level settings.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Default timezone
              </span>
              <select
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
              >
                {timezoneOptions.map((tz) => (
                  <option key={tz} value={tz}>
                    {formatTimezoneOptionLabel(tz)}
                  </option>
                ))}
              </select>
              <span className="mt-2 block text-[11px] font-semibold text-slate-400">
                Default is Central Time (US). If your workspace saved a
                different timezone during onboarding or in Settings, Agently
                uses that timezone across scheduling and call campaign pages.
              </span>
            </label>

            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Workspace phone
              </span>
              <input
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(event.target.value)}
                placeholder="(123) 456-7890"
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
              />
            </label>
          </div>

          {message && (
            <div
              className={`mt-5 rounded-2xl border px-4 py-3 text-sm font-bold ${
                message.type === "success"
                  ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                  : "border-red-100 bg-red-50 text-red-700"
              }`}
            >
              {message.text}
            </div>
          )}

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => {
                setTimezone(initialTimezone);
                setPhoneNumber(initialPhone);
                setMessage(null);
              }}
              disabled={!hasUnsavedChanges || saving}
              className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-black text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={() => void saveSettings()}
              disabled={!hasUnsavedChanges || saving}
              className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-black text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {settingCards.map((card) => (
            <Link
              key={card.title}
              to={card.href}
              className="group block rounded-3xl border border-slate-200 bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:border-amber-200 hover:shadow-lg"
            >
              <div className="flex items-start gap-4">
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${card.accent}`}
                >
                  <i className={`fa-sharp fa-solid ${card.icon}`} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-black text-slate-900">
                    {card.title}
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-slate-500">
                    {card.description}
                  </span>
                </span>
                <i className="fa-sharp fa-solid fa-chevron-right mt-1 text-xs text-slate-300 transition group-hover:text-amber-500" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Settings;
