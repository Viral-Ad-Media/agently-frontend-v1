import React, { useEffect, useMemo, useState } from "react";
import {
  formatTimezoneOptionLabel,
  getAvailableTimezones,
  resolveOrgTimezone,
} from "@/utils/timezones";
import type {
  BusinessSettingsProfile,
  KnowledgeBase,
  User,
  WorkspaceSettings,
} from "../types";
import SettingsTabs from "../components/SettingsTabs";
import { api } from "../services/api";

interface SettingsPayload {
  timezone: string;
  phoneNumber: string;
  account: {
    name: string;
    email: string;
  };
  businessProfile?: {
    name: string;
    industry: string;
    website: string;
    location: string;
  };
  businessProfiles: BusinessSettingsProfile[];
}

interface SettingsProps {
  org: any;
  user: User | null;
  knowledgeBases?: KnowledgeBase[];
  onSave: (settings: SettingsPayload) => Promise<WorkspaceSettings>;
  onRequestPasswordReset: (email: string) => Promise<unknown>;
  onChangePassword: (payload: {
    currentPassword: string;
    newPassword: string;
  }) => Promise<unknown>;
}

const cleanEmail = (value: string) => value.trim().toLowerCase();
const cleanText = (value: string) => value.replace(/\s+/g, " ").trim();
const cleanWebsite = (value: string) => value.trim();

const profileKey = (profile: BusinessSettingsProfile) =>
  `${profile.sourceType}:${profile.sourceId}`;

const locationFromMetadata = (metadata: unknown) => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata))
    return "";
  const record = metadata as Record<string, any>;
  const direct = record.location;
  const nested =
    record.businessProfile?.location || record.business_profile?.location;
  return typeof direct === "string"
    ? direct
    : typeof nested === "string"
      ? nested
      : "";
};

const normalizeBusinessSettingsProfile = (
  profile: Partial<BusinessSettingsProfile>,
  index = 0,
): BusinessSettingsProfile | null => {
  const sourceType =
    profile.sourceType === "knowledgeBase"
      ? "knowledgeBase"
      : profile.sourceType === "organization"
        ? "organization"
        : null;
  const sourceId =
    typeof profile.sourceId === "string" && profile.sourceId
      ? profile.sourceId
      : typeof profile.id === "string"
        ? profile.id.replace(/^knowledgeBase:|^organization:/, "")
        : "";
  if (!sourceType || !sourceId) return null;

  return {
    id: `${sourceType}:${sourceId}`,
    sourceType,
    sourceId,
    label:
      typeof profile.label === "string" && profile.label
        ? profile.label
        : sourceType === "knowledgeBase"
          ? `Business knowledge base ${index + 1}`
          : "Workspace business",
    name: typeof profile.name === "string" ? profile.name : "",
    industry: typeof profile.industry === "string" ? profile.industry : "",
    website: typeof profile.website === "string" ? profile.website : "",
    location: typeof profile.location === "string" ? profile.location : "",
    isPrimary: profile.isPrimary === true,
  };
};

const preferKnowledgeBaseBusinesses = (profiles: BusinessSettingsProfile[]) => {
  const seen = new Set<string>();
  const deduped = profiles.filter((profile) => {
    const key = profileKey(profile);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const knowledgeBaseProfiles = deduped.filter(
    (profile) => profile.sourceType === "knowledgeBase",
  );
  return knowledgeBaseProfiles.length ? knowledgeBaseProfiles : deduped;
};

const buildBusinessProfiles = (
  org: any,
  knowledgeBases: KnowledgeBase[] = [],
  serverProfiles: BusinessSettingsProfile[] = [],
): BusinessSettingsProfile[] => {
  const normalizedServerProfiles = serverProfiles
    .map((profile, index) => normalizeBusinessSettingsProfile(profile, index))
    .filter(Boolean) as BusinessSettingsProfile[];
  if (normalizedServerProfiles.length) {
    return preferKnowledgeBaseBusinesses(normalizedServerProfiles);
  }

  const kbProfiles = knowledgeBases
    .map((base, index) =>
      normalizeBusinessSettingsProfile(
        {
          id: `knowledgeBase:${base.id}`,
          sourceType: "knowledgeBase",
          sourceId: base.id,
          label: base.isPrimary
            ? "Primary knowledge base"
            : `Business knowledge base ${index + 1}`,
          name: base.businessName || base.name || "",
          industry: base.industry || "",
          website: base.primaryUrl || "",
          location: locationFromMetadata(base.metadata),
          isPrimary: base.isPrimary === true,
        },
        index,
      ),
    )
    .filter(Boolean) as BusinessSettingsProfile[];

  if (kbProfiles.length) return preferKnowledgeBaseBusinesses(kbProfiles);

  const orgProfile = normalizeBusinessSettingsProfile({
    id: `organization:${org?.id || "workspace"}`,
    sourceType: "organization",
    sourceId: org?.id || "workspace",
    label: "Workspace business",
    name: org?.profile?.name || "",
    industry: org?.profile?.industry || "",
    website: org?.profile?.website || "",
    location: org?.profile?.location || "",
    isPrimary: true,
  });

  return orgProfile ? [orgProfile] : [];
};

const normalizeBusinessProfile = (
  profile: BusinessSettingsProfile,
): BusinessSettingsProfile => ({
  ...profile,
  name: cleanText(profile.name),
  industry: cleanText(profile.industry || ""),
  website: cleanWebsite(profile.website || ""),
  location: cleanText(profile.location || ""),
});

const comparableProfiles = (profiles: BusinessSettingsProfile[]) =>
  profiles.map((profile) => ({
    sourceType: profile.sourceType,
    sourceId: profile.sourceId,
    name: cleanText(profile.name),
    industry: cleanText(profile.industry || ""),
    website: cleanWebsite(profile.website || ""),
    location: cleanText(profile.location || ""),
  }));

const Settings: React.FC<SettingsProps> = ({
  org,
  user,
  knowledgeBases = [],
  onSave,
  onRequestPasswordReset,
  onChangePassword,
}) => {
  const [remoteSettings, setRemoteSettings] =
    useState<WorkspaceSettings | null>(null);

  const initialTimezone = remoteSettings?.timezone || resolveOrgTimezone(org);
  const initialPhone =
    remoteSettings?.phoneNumber ||
    org?.settings?.phoneNumber ||
    org?.phoneNumber ||
    "";
  const initialAccountName = remoteSettings?.account?.name || user?.name || "";
  const initialAccountEmail =
    remoteSettings?.account?.email || user?.email || "";
  const initialBusinessProfiles = useMemo(
    () =>
      buildBusinessProfiles(
        org,
        knowledgeBases,
        remoteSettings?.businessProfiles || [],
      ),
    [
      org?.id,
      org?.profile?.name,
      org?.profile?.industry,
      org?.profile?.website,
      org?.profile?.location,
      knowledgeBases,
      remoteSettings?.businessProfiles,
    ],
  );

  const [timezone, setTimezone] = useState(initialTimezone);
  const [phoneNumber, setPhoneNumber] = useState(initialPhone);
  const [accountName, setAccountName] = useState(initialAccountName);
  const [accountEmail, setAccountEmail] = useState(initialAccountEmail);
  const [businessProfiles, setBusinessProfiles] = useState<
    BusinessSettingsProfile[]
  >(initialBusinessProfiles);
  const [activeBusinessIndex, setActiveBusinessIndex] = useState(0);
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
    let mounted = true;

    api
      .getSettings()
      .then((settings) => {
        if (!mounted) return;
        setRemoteSettings(settings);
      })
      .catch((error) => {
        // Settings can still render from bootstrap data. The direct settings fetch
        // only makes the knowledge-base business pager authoritative when the
        // bootstrap payload did not include all knowledge bases.
        console.warn("[settings] could not load live business profiles", error);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (isEditing) return;
    setTimezone(initialTimezone);
    setPhoneNumber(initialPhone);
    setAccountName(initialAccountName);
    setAccountEmail(initialAccountEmail);
    setBusinessProfiles(initialBusinessProfiles);
    setActiveBusinessIndex((index) =>
      Math.min(index, Math.max(0, initialBusinessProfiles.length - 1)),
    );
  }, [
    isEditing,
    initialTimezone,
    initialPhone,
    initialAccountName,
    initialAccountEmail,
    initialBusinessProfiles,
  ]);

  const activeBusiness =
    businessProfiles[activeBusinessIndex] || businessProfiles[0];
  const activeBusinessNumber = businessProfiles.length
    ? activeBusinessIndex + 1
    : 0;
  const totalBusinesses = businessProfiles.length;

  const hasUnsavedChanges = useMemo(
    () =>
      timezone !== initialTimezone ||
      phoneNumber !== initialPhone ||
      accountName !== initialAccountName ||
      cleanEmail(accountEmail) !== cleanEmail(initialAccountEmail) ||
      JSON.stringify(comparableProfiles(businessProfiles)) !==
        JSON.stringify(comparableProfiles(initialBusinessProfiles)),
    [
      timezone,
      phoneNumber,
      accountName,
      accountEmail,
      businessProfiles,
      initialTimezone,
      initialPhone,
      initialAccountName,
      initialAccountEmail,
      initialBusinessProfiles,
    ],
  );

  const updateActiveBusiness = (
    field: keyof Pick<
      BusinessSettingsProfile,
      "name" | "industry" | "website" | "location"
    >,
    value: string,
  ) => {
    setBusinessProfiles((profiles) =>
      profiles.map((profile, index) =>
        index === activeBusinessIndex
          ? { ...profile, [field]: value }
          : profile,
      ),
    );
  };

  const selectBusinessIndex = (nextIndex: number) => {
    setActiveBusinessIndex(
      Math.min(
        Math.max(nextIndex, 0),
        Math.max(0, businessProfiles.length - 1),
      ),
    );
    setMessage(null);
  };

  const saveSettings = async () => {
    const nextAccountName = cleanText(accountName);
    const nextEmail = cleanEmail(accountEmail);
    const cleanedProfiles = businessProfiles.map(normalizeBusinessProfile);
    const workspaceProfile = cleanedProfiles.find(
      (profile) => profile.sourceType === "organization",
    );

    if (!nextAccountName) {
      setMessage({ type: "error", text: "Your name is required." });
      return;
    }
    if (!nextEmail || !/^\S+@\S+\.\S+$/.test(nextEmail)) {
      setMessage({
        type: "error",
        text: "Enter a valid account email address.",
      });
      return;
    }

    const incompleteProfile = cleanedProfiles.find((profile) => !profile.name);
    if (incompleteProfile) {
      setMessage({
        type: "error",
        text: `Business name is required for ${incompleteProfile.label || "this business"}.`,
      });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const saved = await onSave({
        timezone,
        phoneNumber,
        account: {
          name: nextAccountName,
          email: nextEmail,
        },
        ...(workspaceProfile
          ? {
              businessProfile: {
                name: workspaceProfile.name,
                industry: workspaceProfile.industry || "",
                website: workspaceProfile.website || "",
                location: workspaceProfile.location || "",
              },
            }
          : {}),
        businessProfiles: cleanedProfiles,
      });
      const nextBusinessProfiles = buildBusinessProfiles(
        org,
        knowledgeBases,
        saved?.businessProfiles?.length
          ? saved.businessProfiles
          : cleanedProfiles,
      );
      setRemoteSettings(saved || null);
      setAccountName(nextAccountName);
      setAccountEmail(nextEmail);
      setBusinessProfiles(nextBusinessProfiles);
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
    setBusinessProfiles(initialBusinessProfiles);
    setActiveBusinessIndex(0);
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
      setPasswordMessage({
        type: "error",
        text: "Save an account email first.",
      });
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
      setPasswordMessage({
        type: "error",
        text: "New passwords do not match.",
      });
      return;
    }

    setPasswordSaving(true);
    setPasswordMessage(null);
    try {
      await onChangePassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage({
        type: "success",
        text: "Password updated successfully.",
      });
    } catch (error) {
      setPasswordMessage({
        type: "error",
        text:
          error instanceof Error ? error.message : "Could not change password.",
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
  const labelClass =
    "text-[10px] font-black uppercase tracking-widest text-slate-400";
  const sectionClass = "border-b border-slate-200/80 py-6 last:border-b-0";

  return (
    <div className="w-full max-w-none pb-8">
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-600">
            Settings
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
            Profile
          </h2>
        </div>

        <div className="flex shrink-0 items-start justify-end gap-2">
          {isEditing && (
            <button
              type="button"
              onClick={discardChanges}
              disabled={saving || passwordSaving}
              className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white/80 text-slate-500 transition hover:border-slate-300 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 sm:h-10 sm:w-10 sm:rounded-xl"
              aria-label="Cancel profile edits"
              title="Cancel"
            >
              <i
                className="fa-sharp fa-solid fa-xmark text-sm"
                aria-hidden="true"
              />
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
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-300 bg-white/80 text-slate-700 transition hover:border-amber-300 hover:text-amber-700 disabled:cursor-not-allowed disabled:opacity-50 sm:h-10 sm:w-10 sm:rounded-xl"
            aria-label={
              isEditing ? "Lock profile fields" : "Edit profile fields"
            }
            title={isEditing ? "Lock" : "Edit"}
          >
            <i
              className={`fa-sharp fa-solid ${isEditing ? "fa-lock" : "fa-pen"} text-sm`}
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            onClick={() => void saveSettings()}
            disabled={!isEditing || !hasUnsavedChanges || saving}
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-40 sm:h-10 sm:w-10 sm:rounded-xl"
            aria-label="Save profile changes"
            title={saving ? "Saving" : "Save"}
          >
            <i
              className={`fa-sharp fa-solid ${saving ? "fa-spinner fa-spin" : "fa-floppy-disk"} text-sm`}
              aria-hidden="true"
            />
          </button>
        </div>
      </header>

      <SettingsTabs active="profile" />

      <main className="w-full max-w-none">
        <section className={sectionClass} data-tour="settings-general">
          <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-base font-black text-slate-900">
                Customer Account
              </h3>
              <p className="mt-1 text-xs font-medium text-slate-500">
                Name and registered email for the customer account.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-base font-black text-slate-900">
                Business Profile
              </h3>
              <p className="mt-1 text-xs font-medium text-slate-500">
                Business details used across the workspace.
              </p>
            </div>

            {businessProfiles.length > 1 && (
              <div className="flex items-center gap-2 self-start sm:self-auto sm:justify-end">
                <button
                  type="button"
                  onClick={() => selectBusinessIndex(activeBusinessIndex - 1)}
                  disabled={activeBusinessIndex <= 0 || saving}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-xs text-slate-600 transition hover:border-amber-300 hover:text-amber-700 disabled:cursor-not-allowed disabled:opacity-35"
                  aria-label="Previous business profile"
                >
                  <i className="fa-sharp fa-solid fa-chevron-left" />
                </button>
                <span className="whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700">
                  {activeBusinessNumber} of {totalBusinesses}
                </span>
                <button
                  type="button"
                  onClick={() => selectBusinessIndex(activeBusinessIndex + 1)}
                  disabled={
                    activeBusinessIndex >= businessProfiles.length - 1 || saving
                  }
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-xs text-slate-600 transition hover:border-amber-300 hover:text-amber-700 disabled:cursor-not-allowed disabled:opacity-35"
                  aria-label="Next business profile"
                >
                  <i className="fa-sharp fa-solid fa-chevron-right" />
                </button>
              </div>
            )}
          </div>

          {activeBusiness && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className={labelClass}>Business name</span>
                  <input
                    value={activeBusiness.name}
                    onChange={(event) =>
                      updateActiveBusiness("name", event.target.value)
                    }
                    placeholder="Business name"
                    disabled={disabled}
                    className={fieldClass}
                  />
                </label>

                <label className="block">
                  <span className={labelClass}>Industry</span>
                  <input
                    value={activeBusiness.industry || ""}
                    onChange={(event) =>
                      updateActiveBusiness("industry", event.target.value)
                    }
                    placeholder="Healthcare, real estate, ecommerce..."
                    disabled={disabled}
                    className={fieldClass}
                  />
                </label>

                <label className="block">
                  <span className={labelClass}>Website</span>
                  <input
                    value={activeBusiness.website || ""}
                    onChange={(event) =>
                      updateActiveBusiness("website", event.target.value)
                    }
                    placeholder="https://example.com"
                    disabled={disabled}
                    className={fieldClass}
                  />
                </label>

                <label className="block">
                  <span className={labelClass}>Location</span>
                  <input
                    value={activeBusiness.location || ""}
                    onChange={(event) =>
                      updateActiveBusiness("location", event.target.value)
                    }
                    placeholder="City, country"
                    disabled={disabled}
                    className={fieldClass}
                  />
                </label>
              </div>
            </>
          )}
        </section>

        <section className={sectionClass}>
          <div className="mb-5">
            <h3 className="text-base font-black text-slate-900">
              Workspace Preferences
            </h3>
            <p className="mt-1 text-xs font-medium text-slate-500">
              Default phone number and timezone for the organization.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              <h3 className="text-base font-black text-slate-900">
                Password Access
              </h3>
              <p className="mt-1 text-xs font-medium text-slate-500">
                Change the password in edit mode, or send a reset link to the
                registered email.
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
              disabled={
                !isEditing ||
                passwordSaving ||
                (!currentPassword && !!user?.email) ||
                !newPassword ||
                !confirmPassword
              }
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
