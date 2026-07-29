import React, { useEffect, useMemo, useState } from "react";
import {
  formatTimezoneOptionLabel,
  getAvailableTimezones,
  resolveOrgTimezone,
} from "@/utils/timezones";
import type { BusinessProfile, User, WorkspaceSettings } from "../types";
import SettingsTabs from "../components/SettingsTabs";

interface SettingsPayload {
  timezone: string;
  phoneNumber: string;
  account: {
    name: string;
    email: string;
  };
  businessProfile: Pick<BusinessProfile, "name" | "industry" | "website" | "location">;
}

interface SettingsProps {
  org: any;
  user: User | null;
  /*
   * Returns the saved settings rather than void.
   *
   * App.tsx's handleSaveSettings already had the saved record in hand —
   * api.updateSettings returns it — and was throwing it away. Handing it back
   * lets this page use the server's canonical values instead of assuming its
   * optimistic local copy is correct.
   *
   * The two files must agree: Promise<T> is NOT assignable to Promise<void>,
   * so if you revert this line you must also drop the `return saved;` at the
   * end of handleSaveSettings in App.tsx.
   */
  onSave: (settings: SettingsPayload) => Promise<WorkspaceSettings>;
  onRequestPasswordReset: (email: string) => Promise<unknown>;
  onChangePassword: (payload: {
    currentPassword: string;
    newPassword: string;
  }) => Promise<unknown>;
}

const cleanEmail = (value: string) => value.trim().toLowerCase();
const cleanText = (value: string) => value.replace(/\s+/g, " ").trim();

const Settings: React.FC<SettingsProps> = ({
  org,
  user,
  onSave,
  onRequestPasswordReset,
  onChangePassword,
}) => {
  const initialTimezone = resolveOrgTimezone(org);
  const initialPhone = org?.settings?.phoneNumber || org?.phoneNumber || "";
  const initialAccountName = user?.name || "";
  const initialAccountEmail = user?.email || "";
  const initialBusinessName = org?.profile?.name || "";
  const initialIndustry = org?.profile?.industry || "";
  const initialWebsite = org?.profile?.website || "";
  const initialLocation = org?.profile?.location || "";

  const [timezone, setTimezone] = useState(initialTimezone);
  const [phoneNumber, setPhoneNumber] = useState(initialPhone);
  const [accountName, setAccountName] = useState(initialAccountName);
  const [accountEmail, setAccountEmail] = useState(initialAccountEmail);
  const [businessName, setBusinessName] = useState(initialBusinessName);
  const [industry, setIndustry] = useState(initialIndustry);
  const [website, setWebsite] = useState(initialWebsite);
  const [location, setLocation] = useState(initialLocation);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  const timezoneOptions = useMemo(
    () => getAvailableTimezones(timezone || initialTimezone),
    [timezone, initialTimezone],
  );
  const [saving, setSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [resetSending, setResetSending] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    if (isEditing) return;
    setTimezone(initialTimezone);
    setPhoneNumber(initialPhone);
    setAccountName(initialAccountName);
    setAccountEmail(initialAccountEmail);
    setBusinessName(initialBusinessName);
    setIndustry(initialIndustry);
    setWebsite(initialWebsite);
    setLocation(initialLocation);
  }, [
    isEditing,
    initialTimezone,
    initialPhone,
    initialAccountName,
    initialAccountEmail,
    initialBusinessName,
    initialIndustry,
    initialWebsite,
    initialLocation,
  ]);

  const hasUnsavedChanges = useMemo(
    () =>
      timezone !== initialTimezone ||
      phoneNumber !== initialPhone ||
      accountName !== initialAccountName ||
      cleanEmail(accountEmail) !== cleanEmail(initialAccountEmail) ||
      businessName !== initialBusinessName ||
      industry !== initialIndustry ||
      website !== initialWebsite ||
      location !== initialLocation,
    [
      timezone,
      phoneNumber,
      accountName,
      accountEmail,
      businessName,
      industry,
      website,
      location,
      initialTimezone,
      initialPhone,
      initialAccountName,
      initialAccountEmail,
      initialBusinessName,
      initialIndustry,
      initialWebsite,
      initialLocation,
    ],
  );

  const saveSettings = async () => {
    const nextAccountName = cleanText(accountName);
    const nextEmail = cleanEmail(accountEmail);
    const nextBusinessName = cleanText(businessName);

    if (!nextAccountName) {
      setMessage({ type: "error", text: "Your name is required." });
      return;
    }
    if (!nextEmail || !/^\S+@\S+\.\S+$/.test(nextEmail)) {
      setMessage({ type: "error", text: "Enter a valid account email address." });
      return;
    }
    if (!nextBusinessName) {
      setMessage({ type: "error", text: "Business name is required." });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      await onSave({
        timezone,
        phoneNumber,
        account: {
          name: nextAccountName,
          email: nextEmail,
        },
        businessProfile: {
          name: nextBusinessName,
          industry: cleanText(industry),
          website: website.trim(),
          location: cleanText(location),
        },
      });
      setIsEditing(false);
      setMessage({
        type: "success",
        text: "Profile settings updated successfully.",
      });
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Could not update account or business settings.",
      });
    } finally {
      setSaving(false);
    }
  };

  const discardChanges = () => {
    setTimezone(initialTimezone);
    setPhoneNumber(initialPhone);
    setAccountName(initialAccountName);
    setAccountEmail(initialAccountEmail);
    setBusinessName(initialBusinessName);
    setIndustry(initialIndustry);
    setWebsite(initialWebsite);
    setLocation(initialLocation);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setMessage(null);
    setPasswordMessage(null);
    setIsEditing(false);
  };

  const sendResetLink = async () => {
    const targetEmail = cleanEmail(accountEmail || initialAccountEmail);
    if (!targetEmail) {
      setPasswordMessage({ type: "error", text: "Save an account email first." });
      return;
    }
    setResetSending(true);
    setPasswordMessage(null);
    try {
      await onRequestPasswordReset(targetEmail);
      setPasswordMessage({
        type: "success",
        text: "Password reset instructions have been sent to the account email if it exists.",
      });
    } catch (error) {
      setPasswordMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Could not send password reset instructions.",
      });
    } finally {
      setResetSending(false);
    }
  };

  const changePassword = async () => {
    if (!newPassword || newPassword.length < 8) {
      setPasswordMessage({
        type: "error",
        text: "New password must be at least 8 characters.",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: "error", text: "New passwords do not match." });
      return;
    }

    setPasswordSaving(true);
    setPasswordMessage(null);
    try {
      await onChangePassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage({ type: "success", text: "Password updated successfully." });
    } catch (error) {
      setPasswordMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Could not change password.",
      });
    } finally {
      setPasswordSaving(false);
    }
  };

  const disabled = !isEditing || saving;
  const fieldClass = `mt-2 w-full rounded-xl border px-4 py-3 text-sm font-semibold outline-none transition ${
    disabled
      ? "cursor-not-allowed border-slate-200 bg-slate-100/70 text-slate-500"
      : "border-slate-300 bg-white text-slate-900 focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
  }`;
  const selectClass = `${fieldClass} appearance-none`;
  const labelClass = "text-[10px] font-black uppercase tracking-widest text-slate-400";
  const sectionClass = "border-b border-slate-200/80 py-6 last:border-b-0";

  return (
    <div className="w-full max-w-none pb-8">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-600">
            Settings
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
            Profile
          </h2>
        </div>

        <div className="flex flex-col-reverse gap-2 min-[420px]:flex-row min-[420px]:items-center lg:justify-end">
          {isEditing && (
            <button
              type="button"
              onClick={discardChanges}
              disabled={saving || passwordSaving}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black text-slate-600 transition hover:border-slate-300 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setIsEditing((value) => !value);
              setMessage(null);
              setPasswordMessage(null);
            }}
            disabled={saving || passwordSaving}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-xs font-black text-slate-700 transition hover:border-amber-300 hover:text-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={isEditing ? "Lock profile fields" : "Edit profile fields"}
          >
            <i className={`fa-sharp fa-solid ${isEditing ? "fa-lock" : "fa-pen"}`} />
            {isEditing ? "Lock" : "Edit"}
          </button>
          <button
            type="button"
            onClick={() => void saveSettings()}
            disabled={!isEditing || !hasUnsavedChanges || saving}
            className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-black text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Saving..." : "Save Profile"}
          </button>
        </div>
      </header>

      <SettingsTabs active="profile" />

      <main className="w-full max-w-none">
        <section className={sectionClass} data-tour="settings-general">
          <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-base font-black text-slate-900">Customer Account</h3>
              <p className="mt-1 text-xs font-medium text-slate-500">
                Name and registered email for the customer account.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="block">
              <span className={labelClass}>Customer name</span>
              <input
                value={accountName}
                onChange={(event) => setAccountName(event.target.value)}
                placeholder="Account owner name"
                disabled={disabled}
                className={fieldClass}
              />
            </label>

            <label className="block">
              <span className={labelClass}>Registered email</span>
              <input
                value={accountEmail}
                onChange={(event) => setAccountEmail(event.target.value)}
                placeholder="customer@example.com"
                type="email"
                disabled={disabled}
                className={fieldClass}
              />
            </label>
          </div>
        </section>

        <section className={sectionClass}>
          <div className="mb-5">
            <h3 className="text-base font-black text-slate-900">Business Profile</h3>
            <p className="mt-1 text-xs font-medium text-slate-500">
              Business details used across the workspace.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="block">
              <span className={labelClass}>Business name</span>
              <input
                value={businessName}
                onChange={(event) => setBusinessName(event.target.value)}
                placeholder="Business name"
                disabled={disabled}
                className={fieldClass}
              />
            </label>

            <label className="block">
              <span className={labelClass}>Industry</span>
              <input
                value={industry}
                onChange={(event) => setIndustry(event.target.value)}
                placeholder="Healthcare, real estate, ecommerce..."
                disabled={disabled}
                className={fieldClass}
              />
            </label>

            <label className="block">
              <span className={labelClass}>Website</span>
              <input
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
                placeholder="https://example.com"
                disabled={disabled}
                className={fieldClass}
              />
            </label>

            <label className="block">
              <span className={labelClass}>Location</span>
              <input
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="City, country"
                disabled={disabled}
                className={fieldClass}
              />
            </label>
          </div>
        </section>

        <section className={sectionClass}>
          <div className="mb-5">
            <h3 className="text-base font-black text-slate-900">Workspace Preferences</h3>
            <p className="mt-1 text-xs font-medium text-slate-500">
              Default phone number and timezone for the organization.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="block">
              <span className={labelClass}>Default timezone</span>
              <select
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                disabled={disabled}
                className={selectClass}
              >
                {timezoneOptions.map((tz) => (
                  <option key={tz} value={tz}>
                    {formatTimezoneOptionLabel(tz)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className={labelClass}>Workspace phone</span>
              <input
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(event.target.value)}
                placeholder="(123) 456-7890"
                disabled={disabled}
                className={fieldClass}
              />
            </label>
          </div>
        </section>

        <section className={sectionClass}>
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-base font-black text-slate-900">Password Access</h3>
              <p className="mt-1 text-xs font-medium text-slate-500">
                Change the password in edit mode, or send a reset link to the registered email.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void sendResetLink()}
              disabled={resetSending || saving}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black text-slate-700 transition hover:border-slate-300 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {resetSending ? "Sending..." : "Send reset link"}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <label className="block">
              <span className={labelClass}>Current password</span>
              <input
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                type="password"
                autoComplete="current-password"
                disabled={disabled}
                className={fieldClass}
              />
            </label>
            <label className="block">
              <span className={labelClass}>New password</span>
              <input
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                type="password"
                autoComplete="new-password"
                disabled={disabled}
                className={fieldClass}
              />
            </label>
            <label className="block">
              <span className={labelClass}>Confirm password</span>
              <input
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                type="password"
                autoComplete="new-password"
                disabled={disabled}
                className={fieldClass}
              />
            </label>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={() => void changePassword()}
              disabled={!isEditing || passwordSaving || (!currentPassword && !!user?.email) || !newPassword || !confirmPassword}
              className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-black text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {passwordSaving ? "Updating..." : "Apply Password Change"}
            </button>
          </div>
        </section>

        {message && (
          <div
            className={`mt-5 rounded-xl border px-4 py-3 text-sm font-bold ${
              message.type === "success"
                ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                : "border-red-100 bg-red-50 text-red-700"
            }`}
          >
            {message.text}
          </div>
        )}

        {passwordMessage && (
          <div
            className={`mt-5 rounded-xl border px-4 py-3 text-sm font-bold ${
              passwordMessage.type === "success"
                ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                : "border-red-100 bg-red-50 text-red-700"
            }`}
          >
            {passwordMessage.text}
          </div>
        )}
      </main>
    </div>
  );
};

export default Settings;
