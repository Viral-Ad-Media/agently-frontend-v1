import React, { useEffect, useMemo, useState, useTransition } from "react";
import { AgentConfig, Lead, Organization } from "../types";
import { TwilioNumberRecord, voiceCallsApi } from "../services/voiceCallsApi";

type CallType = "call_now" | "one_time" | "one_time_batch" | "recurring_monthly" | "custom_rule";
type RecipientMode = "direct" | "leads";
type BatchMode = "all_recipients_each_time" | "spread_recipients_across_times";
type Toast = { message: string; ok: boolean } | null;

type DirectRecipient = {
  id: string;
  name: string;
  phone: string;
  displayPhone: string;
  phoneError?: string;
};

type SchedulePreview = {
  totalCalls?: number;
  total_calls?: number;
  calls?: unknown[];
  runs?: unknown[];
  warnings?: string[];
  [key: string]: unknown;
};

type OutreachSchedule = {
  id?: string;
  name?: string;
  status?: string;
  schedule_type?: string;
  scheduleType?: string;
  voice_agent_id?: string;
  voiceAgentId?: string;
  from_number?: string;
  fromNumber?: string;
  call_purpose?: string;
  callPurpose?: string;
  timezone?: string;
  created_at?: string;
  createdAt?: string;
  start_at?: string;
  startAt?: string;
  direct_recipients?: unknown;
  directRecipients?: unknown;
  progress?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
};

interface OutreachSchedulerProps {
  org: Organization;
  leads: Lead[];
  onChanged?: () => void;
}

const TIMEZONES = [
  "Africa/Lagos",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "Europe/London",
  "Europe/Athens",
  "UTC",
];

const DAYS = [
  { key: "monday", label: "Mon" },
  { key: "tuesday", label: "Tue" },
  { key: "wednesday", label: "Wed" },
  { key: "thursday", label: "Thu" },
  { key: "friday", label: "Fri" },
  { key: "saturday", label: "Sat" },
  { key: "sunday", label: "Sun" },
];

const todayIso = () => new Date().toISOString().slice(0, 10);
const sixMonthsFromToday = () => {
  const date = new Date();
  date.setMonth(date.getMonth() + 6);
  return date.toISOString().slice(0, 10);
};

const pad = (value: number) => String(value).padStart(2, "0");
const timePlusMinutes = (minutes = 5) => {
  const now = new Date();
  now.setMinutes(now.getMinutes() + minutes);
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
};

const makeRecipient = (): DirectRecipient => ({
  id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  name: "",
  phone: "",
  displayPhone: "",
});

const unwrapList = <T,>(payload: unknown, keys: string[]): T[] => {
  if (Array.isArray(payload)) return payload as T[];
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value as T[];
    if (value && typeof value === "object") {
      const nested = unwrapList<T>(value, keys);
      if (nested.length) return nested;
    }
  }
  return [];
};

const getNumberOrgId = (number: TwilioNumberRecord) =>
  number.organization_id || number.organizationId || number.orgId || "";
const getPhone = (number: TwilioNumberRecord) => number.phone_number || number.phoneNumber || "";
const getAssignedAgentId = (number: TwilioNumberRecord) =>
  number.assigned_voice_agent_id || number.assignedVoiceAgentId || number.voiceAgentId || number.agentId || "";

const getScheduleId = (schedule: OutreachSchedule, fallback: number) => String(schedule.id || fallback);
const getScheduleStatus = (schedule: OutreachSchedule) => String(schedule.status || "active").toLowerCase();
const isDoneStatus = (status: string) => ["completed", "complete", "done", "cancelled", "canceled", "failed"].includes(status);

const formatScheduleType = (value?: string) =>
  String(value || "schedule")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const statusClass = (status: string) => {
  const s = status.toLowerCase();
  if (["completed", "complete", "done"].some((v) => s.includes(v))) return "bg-slate-100 text-slate-500";
  if (["cancel", "failed", "error"].some((v) => s.includes(v))) return "bg-red-50 text-red-600";
  if (["queued", "pending", "draft"].some((v) => s.includes(v))) return "bg-amber-50 text-amber-700";
  return "bg-emerald-50 text-emerald-700";
};

const getPreviewCalls = (preview: SchedulePreview | null) => {
  if (!preview) return [];
  const calls = preview.calls || preview.runs;
  return Array.isArray(calls) ? calls.slice(0, 8) : [];
};

const getPreviewTotal = (preview: SchedulePreview | null) => {
  if (!preview) return 0;
  if (typeof preview.totalCalls === "number") return preview.totalCalls;
  if (typeof preview.total_calls === "number") return preview.total_calls;
  const calls = preview.calls || preview.runs;
  return Array.isArray(calls) ? calls.length : 0;
};

const normalizeNorthAmericaPhone = (raw: string) => {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return { display: "", value: "", error: "" };

  if (digits.length === 10) {
    return { display: `+1${digits}`, value: `+1${digits}`, error: "" };
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return { display: `+${digits}`, value: `+${digits}`, error: "" };
  }

  return {
    display: raw,
    value: "",
    error: "Currently, outbound calls are supported for U.S. and Canadian numbers only.",
  };
};

const addThirtyMinutes = (time: string) => {
  const [hour = "0", minute = "0"] = time.split(":");
  const date = new Date();
  date.setHours(Number(hour), Number(minute), 0, 0);
  date.setMinutes(date.getMinutes() + 30);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const OutreachScheduler: React.FC<OutreachSchedulerProps> = ({ org, leads, onChanged }) => {
  const agents = useMemo(() => org.voiceAgents || [], [org.voiceAgents]);
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<"create" | "scheduled">("create");
  const [toast, setToast] = useState<Toast>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [numbers, setNumbers] = useState<TwilioNumberRecord[]>([]);
  const [schedules, setSchedules] = useState<OutreachSchedule[]>([]);
  const [preview, setPreview] = useState<SchedulePreview | null>(null);
  const [selectedSchedule, setSelectedSchedule] = useState<OutreachSchedule | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OutreachSchedule | null>(null);
  const [selectedScheduleIds, setSelectedScheduleIds] = useState<string[]>([]);

  const [callType, setCallType] = useState<CallType>("one_time");
  const [recipientMode, setRecipientMode] = useState<RecipientMode>("direct");
  const [voiceAgentId, setVoiceAgentId] = useState(agents[0]?.id || org.activeVoiceAgentId || "");
  const [fromNumber, setFromNumber] = useState("");
  const [directRecipients, setDirectRecipients] = useState<DirectRecipient[]>([makeRecipient()]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [callPurpose, setCallPurpose] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");
  const [scheduleName, setScheduleName] = useState("");
  const [timezone, setTimezone] = useState(org.profile.timezone || org.settings?.timezone || "Africa/Lagos");
  const [startLocalDate, setStartLocalDate] = useState(todayIso());
  const [startTime, setStartTime] = useState(timePlusMinutes(5));
  const [startTimes, setStartTimes] = useState<string[]>([timePlusMinutes(5)]);
  const [batchMode, setBatchMode] = useState<BatchMode>("spread_recipients_across_times");
  const [repeatCount, setRepeatCount] = useState(3);
  const [monthlyDays, setMonthlyDays] = useState<number[]>([new Date().getDate()]);
  const [customEndDate, setCustomEndDate] = useState(sixMonthsFromToday());
  const [weekdayRules, setWeekdayRules] = useState<string[]>(["monday", "tuesday", "wednesday", "thursday", "friday"]);
  const [maxAttemptsPerLead, setMaxAttemptsPerLead] = useState(1);
  const [retryDelayMinutes, setRetryDelayMinutes] = useState(60);
  const [voicemailBehavior, setVoicemailBehavior] = useState("hangup");

  const tenantNumbers = useMemo(
    () => numbers.filter((number) => getNumberOrgId(number) === org.id),
    [numbers, org.id],
  );
  const assignedNumbers = useMemo(() => {
    if (!voiceAgentId) return tenantNumbers;
    const agentNumbers = tenantNumbers.filter((number) => getAssignedAgentId(number) === voiceAgentId);
    return agentNumbers.length ? agentNumbers : tenantNumbers;
  }, [tenantNumbers, voiceAgentId]);
  const selectedAgent = agents.find((agent) => agent.id === voiceAgentId) || agents[0];
  const allScheduleIds = useMemo(() => schedules.map(getScheduleId), [schedules]);

  const showToast = (message: string, ok = true) => {
    setToast({ message, ok });
    window.setTimeout(() => setToast(null), 4200);
  };

  const loadNumbers = async () => {
    if (!org.id) return;
    try {
      const response = await voiceCallsApi.phoneNumbers.getTwilioNumbers({ organizationId: org.id });
      const scoped = response.numbers.filter((number) => getNumberOrgId(number) === org.id);
      setNumbers(scoped);
      const preferred = scoped.find((number) => getAssignedAgentId(number) === voiceAgentId) || scoped[0];
      if (!fromNumber && preferred) setFromNumber(getPhone(preferred));
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not load phone numbers.", false);
    }
  };

  const loadSchedules = async () => {
    setBusy("load-schedules");
    try {
      const response = await voiceCallsApi.outreach.getOutreachSchedules();
      const nextSchedules = unwrapList<OutreachSchedule>(response, ["schedules", "data", "items", "results"]);
      startTransition(() => setSchedules(nextSchedules));
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not load schedules.", false);
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    void loadNumbers();
    void loadSchedules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org.id]);

  useEffect(() => {
    const preferred = assignedNumbers.find((number) => getAssignedAgentId(number) === voiceAgentId) || assignedNumbers[0];
    if (preferred) setFromNumber(getPhone(preferred));
    setPreview(null);
  }, [voiceAgentId, assignedNumbers]);

  const updateRecipient = (id: string, field: keyof DirectRecipient, value: string) => {
    setDirectRecipients((current) =>
      current.map((recipient) => {
        if (recipient.id !== id) return recipient;
        if (field !== "phone" && field !== "displayPhone") return { ...recipient, [field]: value };
        const normalized = normalizeNorthAmericaPhone(value);
        return { ...recipient, displayPhone: value, phone: normalized.value, phoneError: normalized.error };
      }),
    );
    setPreview(null);
  };

  const removeRecipient = (id: string) => {
    setDirectRecipients((current) => (current.length === 1 ? current : current.filter((recipient) => recipient.id !== id)));
    setPreview(null);
  };

  const toggleLead = (leadId: string) => {
    setSelectedLeadIds((current) =>
      current.includes(leadId) ? current.filter((id) => id !== leadId) : [...current, leadId],
    );
    setPreview(null);
  };

  const toggleWeekday = (day: string) => {
    setWeekdayRules((current) =>
      current.includes(day) ? current.filter((value) => value !== day) : [...current, day],
    );
    setPreview(null);
  };

  const toggleMonthlyDay = (day: number) => {
    setMonthlyDays((current) =>
      current.includes(day) ? current.filter((value) => value !== day) : [...current, day].sort((a, b) => a - b),
    );
    setPreview(null);
  };

  const getValidDirectRecipients = () =>
    directRecipients
      .map((recipient) => ({ name: recipient.name.trim() || "Unknown", phone: recipient.phone.trim() }))
      .filter((recipient) => recipient.phone);

  const validate = (forPreview = true) => {
    if (!voiceAgentId) return "Choose a voice agent.";
    if (!fromNumber) return "Choose a from number.";
    if (!callPurpose.trim()) return "Call purpose is required.";
    const invalidRecipient = directRecipients.find((recipient) => recipient.displayPhone && recipient.phoneError);
    if (invalidRecipient) return invalidRecipient.phoneError || "Enter a valid U.S. or Canadian recipient number.";
    if (recipientMode === "direct" && getValidDirectRecipients().length === 0) return "Add at least one direct recipient phone number.";
    if (recipientMode === "leads" && selectedLeadIds.length === 0) return "Select at least one lead.";
    if (startLocalDate > sixMonthsFromToday()) return "Schedules can only be created up to 6 months ahead. Please choose a closer date or reduce the recurrence duration.";
    if (callType === "one_time_batch" && startTimes.length === 0) return "Add at least one batch start time.";
    if (callType === "recurring_monthly") {
      if (repeatCount < 1) return "Monthly occurrence count must be at least 1.";
      if (monthlyDays.length === 0) return "Choose at least one day of the month.";
    }
    if (callType === "custom_rule") {
      if (customEndDate > sixMonthsFromToday()) return "Schedules can only be created up to 6 months ahead. Please choose a closer date or reduce the recurrence duration.";
      if (customEndDate < startLocalDate) return "Custom schedule end date must be after the start date.";
      if (weekdayRules.length === 0) return "Choose at least one day for the custom schedule.";
      if (startTimes.length === 0) return "Add at least one custom schedule time.";
    }
    if (!forPreview && callType !== "call_now" && !preview) return "Preview the generated calls before creating the schedule.";
    return "";
  };

  const buildPayload = () => {
    const base: Record<string, unknown> = {
      name: scheduleName.trim() || `${selectedAgent?.name || "Agent"} outreach`,
      voiceAgentId,
      fromNumber,
      callPurpose: callPurpose.trim(),
      customInstructions: customInstructions.trim(),
      timezone,
      maxAttemptsPerLead,
      retryDelayMinutes,
      voicemailBehavior,
      status: "active",
    };

    if (recipientMode === "direct") {
      base.directRecipients = getValidDirectRecipients();
    } else if (selectedLeadIds.length === 1) {
      base.leadId = selectedLeadIds[0];
      base.leadIds = selectedLeadIds;
    } else {
      base.leadIds = selectedLeadIds;
    }

    if (callType === "one_time") return { ...base, scheduleType: "one_time", startLocalDate, startTime };
    if (callType === "one_time_batch") return { ...base, scheduleType: "one_time_batch", startLocalDate, startTimes, batchMode };
    if (callType === "recurring_monthly") {
      return {
        ...base,
        scheduleType: "recurring_monthly",
        startLocalDate,
        startTime,
        monthlyDays,
        repeat: { frequency: "monthly", interval: 1, count: repeatCount },
        monthEndBehavior: "last_day",
      };
    }
    if (callType === "custom_rule") {
      return {
        ...base,
        scheduleType: "custom_rule",
        scheduleConfig: {
          dateRange: { startDate: startLocalDate, endDate: customEndDate },
          weeklyRules: [{ daysOfWeek: weekdayRules, times: startTimes }],
          batchMode,
        },
      };
    }

    return {
      voiceAgentId,
      fromNumber,
      to: getValidDirectRecipients()[0]?.phone || "",
      recipient: getValidDirectRecipients()[0],
      callPurpose: callPurpose.trim(),
      customInstructions: customInstructions.trim(),
    };
  };

  const handlePreview = async () => {
    const message = validate(true);
    if (message) return showToast(message, false);
    if (callType === "call_now") return showToast("Call Now does not need preview. Use Place Call.");
    setBusy("preview");
    try {
      const response = await voiceCallsApi.outreach.previewOutreachSchedule(buildPayload());
      setPreview(response as SchedulePreview);
      showToast("Schedule preview generated.");
    } catch (error) {
      setPreview(null);
      showToast(error instanceof Error ? error.message : "Preview failed.", false);
    } finally {
      setBusy(null);
    }
  };

  const handleCreate = async () => {
    const message = validate(false);
    if (message) return showToast(message, false);
    setBusy("create");
    try {
      if (callType === "call_now") {
        await voiceCallsApi.calls.createOutboundCall(buildPayload());
        showToast("Call placed successfully.");
      } else {
        await voiceCallsApi.outreach.createOutreachSchedule(buildPayload());
        showToast("Schedule created successfully.");
      }
      setPreview(null);
      await loadSchedules();
      onChanged?.();
      setActiveTab("scheduled");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Create failed.", false);
    } finally {
      setBusy(null);
    }
  };

  const handleCancelSchedule = async (scheduleId: string) => {
    setBusy(`cancel-${scheduleId}`);
    try {
      await voiceCallsApi.outreach.cancelOutreachSchedule(scheduleId, { reason: "User cancelled from dashboard." });
      showToast("Schedule cancelled.");
      await loadSchedules();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Cancel failed.", false);
    } finally {
      setBusy(null);
    }
  };

  const confirmDeleteSchedule = async () => {
    if (!deleteTarget) return;
    const scheduleId = getScheduleId(deleteTarget, 0);
    setBusy(`delete-${scheduleId}`);
    try {
      await voiceCallsApi.outreach.deleteOutreachSchedule(scheduleId);
      showToast("Schedule deleted.");
      setDeleteTarget(null);
      await loadSchedules();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Delete failed.", false);
    } finally {
      setBusy(null);
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedScheduleIds.length) return;
    setBusy("bulk-delete");
    try {
      for (const scheduleId of selectedScheduleIds) {
        await voiceCallsApi.outreach.deleteOutreachSchedule(scheduleId);
      }
      showToast("Selected schedules deleted.");
      setSelectedScheduleIds([]);
      await loadSchedules();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Bulk delete failed.", false);
    } finally {
      setBusy(null);
    }
  };

  const previewCalls = getPreviewCalls(preview);

  return (
    <div className="animate-fade-up space-y-6">
      {toast && (
        <div className={`fixed right-5 top-5 z-[200] rounded-2xl px-5 py-3 text-sm font-bold shadow-xl ${toast.ok ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>
          {toast.message}
        </div>
      )}

      <div className="flex flex-col gap-4 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-950">Outreach & Scheduled Calls</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">Create immediate, scheduled, batch, monthly, and custom outbound calls.</p>
        </div>
        <div className="flex rounded-2xl bg-slate-100 p-1 text-xs font-black uppercase tracking-widest text-slate-500">
          <button onClick={() => setActiveTab("create")} className={`rounded-xl px-4 py-2 transition-all ${activeTab === "create" ? "bg-white text-slate-950 shadow-sm" : "hover:text-slate-800"}`}>Create</button>
          <button onClick={() => setActiveTab("scheduled")} className={`rounded-xl px-4 py-2 transition-all ${activeTab === "scheduled" ? "bg-white text-slate-950 shadow-sm" : "hover:text-slate-800"}`}>Scheduled Calls</button>
        </div>
      </div>

      {activeTab === "scheduled" ? (
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-lg font-black text-slate-900">Scheduled calls</h3>
              <p className="text-xs text-slate-400">Completed, failed, and cancelled schedules are greyed out.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedScheduleIds((current) => current.length === allScheduleIds.length ? [] : allScheduleIds)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:border-slate-300"
              >
                {selectedScheduleIds.length === allScheduleIds.length ? "Clear" : "Select All"}
              </button>
              {selectedScheduleIds.length > 0 && (
                <button onClick={() => setDeleteTarget({ id: "bulk", name: `${selectedScheduleIds.length} selected schedules` })} className="rounded-xl border border-red-100 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-red-500 hover:bg-red-50">Delete Selected</button>
              )}
              <button onClick={() => void loadSchedules()} disabled={busy === "load-schedules"} className="rounded-xl border border-slate-200 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:border-slate-300 disabled:opacity-50">
                {busy === "load-schedules" ? "Loading..." : "Refresh"}
              </button>
            </div>
          </div>

          {schedules.length === 0 ? (
            <div className="rounded-3xl border-2 border-dashed border-slate-200 py-16 text-center">
              <p className="text-base font-black text-slate-900">No schedules yet</p>
              <p className="mt-1 text-sm text-slate-400">Create a scheduled call to see it here.</p>
            </div>
          ) : (
            <div className="space-y-3 opacity-100 transition-opacity">
              {schedules.map((schedule, index) => {
                const scheduleId = getScheduleId(schedule, index);
                const agent = agents.find((item) => item.id === (schedule.voiceAgentId || schedule.voice_agent_id));
                const status = getScheduleStatus(schedule);
                const completed = isDoneStatus(status);
                return (
                  <div key={scheduleId} className={`rounded-3xl border p-4 transition-all ${completed ? "border-slate-100 bg-slate-50 opacity-70" : "border-slate-200 bg-white"}`}>
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex gap-3">
                        <input
                          type="checkbox"
                          checked={selectedScheduleIds.includes(scheduleId)}
                          onChange={() => setSelectedScheduleIds((current) => current.includes(scheduleId) ? current.filter((id) => id !== scheduleId) : [...current, scheduleId])}
                          className="mt-1 h-4 w-4"
                        />
                        <button type="button" onClick={() => setSelectedSchedule(schedule)} className="text-left">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-black text-slate-900">{schedule.name || "Scheduled call"}</p>
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500">{formatScheduleType(schedule.scheduleType || schedule.schedule_type)}</span>
                            <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-widest ${statusClass(status)}`}>{status}</span>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">{agent?.name || "Agent"} · {schedule.fromNumber || schedule.from_number || "No from number"} · {schedule.timezone || timezone}</p>
                          <p className="mt-1 text-xs text-slate-400">{schedule.callPurpose || schedule.call_purpose || "No purpose shown"}</p>
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {!completed && (
                          <button onClick={() => void handleCancelSchedule(scheduleId)} disabled={busy === `cancel-${scheduleId}`} className="rounded-xl border border-amber-200 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-amber-700 hover:bg-amber-50 disabled:opacity-50">Cancel</button>
                        )}
                        <button onClick={() => setDeleteTarget(schedule)} disabled={busy === `delete-${scheduleId}`} className="rounded-xl border border-red-100 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-red-500 hover:bg-red-50 disabled:opacity-50">Delete</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.35fr_0.65fr]">
          <div className="space-y-5">
            <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <p className="mb-4 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Call type</p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
                {[
                  ["call_now", "Call Now"],
                  ["one_time", "One-time"],
                  ["one_time_batch", "Batch"],
                  ["recurring_monthly", "Monthly"],
                  ["custom_rule", "Custom"],
                ].map(([value, label]) => (
                  <button key={value} onClick={() => { setCallType(value as CallType); setPreview(null); }} className={`rounded-2xl border px-4 py-3 text-left text-xs font-black uppercase tracking-widest transition-all ${callType === value ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"}`}>{label}</button>
                ))}
              </div>
            </section>

            <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <p className="mb-4 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Agent and number</p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-xs font-bold text-slate-500">Agent</span>
                  <select value={voiceAgentId} onChange={(event) => setVoiceAgentId(event.target.value)} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-amber-300">
                    {agents.map((agent: AgentConfig) => <option key={agent.id} value={agent.id}>{agent.name} ({agent.direction})</option>)}
                  </select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-bold text-slate-500">From number</span>
                  <select value={fromNumber} onChange={(event) => setFromNumber(event.target.value)} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-amber-300">
                    <option value="">Choose number</option>
                    {assignedNumbers.map((number) => <option key={getPhone(number)} value={getPhone(number)}>{getPhone(number)}{getAssignedAgentId(number) === voiceAgentId ? " · assigned" : ""}</option>)}
                  </select>
                </label>
              </div>
            </section>

            <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <p className="mb-4 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Recipients</p>
              <div className="mb-4 flex rounded-2xl bg-slate-100 p-1 text-xs font-black uppercase tracking-widest text-slate-500">
                <button onClick={() => { setRecipientMode("direct"); setPreview(null); }} className={`flex-1 rounded-xl px-4 py-2 ${recipientMode === "direct" ? "bg-white text-slate-950 shadow-sm" : ""}`}>Direct</button>
                <button onClick={() => { setRecipientMode("leads"); setPreview(null); }} className={`flex-1 rounded-xl px-4 py-2 ${recipientMode === "leads" ? "bg-white text-slate-950 shadow-sm" : ""}`}>Leads</button>
              </div>
              {recipientMode === "direct" ? (
                <div className="space-y-3">
                  {directRecipients.map((recipient, index) => (
                    <div key={recipient.id} className="space-y-1">
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto]">
                        <input value={recipient.name} onChange={(event) => updateRecipient(recipient.id, "name", event.target.value)} placeholder={`Recipient ${index + 1} name`} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-amber-300" />
                        <input value={recipient.displayPhone} onChange={(event) => updateRecipient(recipient.id, "phone", event.target.value)} placeholder="+1 (555) 123-4567" className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-amber-300" />
                        <button onClick={() => removeRecipient(recipient.id)} className="rounded-2xl border border-red-100 px-4 py-3 text-xs font-black uppercase tracking-widest text-red-500 hover:bg-red-50">Remove</button>
                      </div>
                      {recipient.phone && <p className="text-[11px] font-bold text-emerald-600">Will call {recipient.phone}</p>}
                      {recipient.phoneError && <p className="text-[11px] font-bold text-red-500">{recipient.phoneError}</p>}
                    </div>
                  ))}
                  <button onClick={() => setDirectRecipients((current) => [...current, makeRecipient()])} className="rounded-2xl border border-slate-200 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-500 hover:border-slate-300">+ Add recipient</button>
                </div>
              ) : (
                <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                  {leads.length === 0 ? <p className="text-sm text-slate-400">No leads available yet.</p> : leads.map((lead) => (
                    <label key={lead.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3">
                      <div><p className="text-sm font-black text-slate-900">{lead.name}</p><p className="text-xs text-slate-400">{lead.phone || lead.email || "No contact"}</p></div>
                      <input type="checkbox" checked={selectedLeadIds.includes(lead.id)} onChange={() => toggleLead(lead.id)} />
                    </label>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <p className="mb-4 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Purpose and timing</p>
              <div className="space-y-4">
                <input value={scheduleName} onChange={(event) => setScheduleName(event.target.value)} placeholder="Schedule name, e.g. Renewal follow-up" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-amber-300" />
                <textarea value={callPurpose} onChange={(event) => { setCallPurpose(event.target.value); setPreview(null); }} placeholder="Required: why is the agent calling?" rows={3} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-amber-300" />
                <textarea value={customInstructions} onChange={(event) => { setCustomInstructions(event.target.value); setPreview(null); }} placeholder="Optional: call-specific guidance" rows={3} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-amber-300" />
                {callType !== "call_now" && (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <label className="space-y-1.5"><span className="text-xs font-bold text-slate-500">Start date</span><input type="date" min={todayIso()} max={sixMonthsFromToday()} value={startLocalDate} onChange={(event) => { setStartLocalDate(event.target.value); setPreview(null); }} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" /></label>
                    <label className="space-y-1.5"><span className="text-xs font-bold text-slate-500">Timezone</span><select value={timezone} onChange={(event) => setTimezone(event.target.value)} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm">{TIMEZONES.map((zone) => <option key={zone} value={zone}>{zone}</option>)}</select></label>
                    {callType !== "one_time_batch" && callType !== "custom_rule" ? (
                      <label className="space-y-1.5"><span className="text-xs font-bold text-slate-500">Time</span><input type="time" value={startTime} onChange={(event) => { setStartTime(event.target.value); setPreview(null); }} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" /></label>
                    ) : (
                      <label className="space-y-1.5"><span className="text-xs font-bold text-slate-500">Times</span><select multiple value={startTimes} onChange={(event) => { setStartTimes(Array.from(event.target.selectedOptions).map((option) => option.value)); setPreview(null); }} className="h-32 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm">{Array.from({ length: 24 }, (_, h) => ["00", "30"].map((m) => `${pad(h)}:${m}`)).flat().map((time) => <option key={time} value={time}>{time}</option>)}</select></label>
                    )}
                  </div>
                )}
                {(callType === "one_time_batch" || callType === "custom_rule") && (
                  <label className="block space-y-1.5"><span className="text-xs font-bold text-slate-500">Batch mode</span><select value={batchMode} onChange={(event) => setBatchMode(event.target.value as BatchMode)} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"><option value="spread_recipients_across_times">Spread recipients across times</option><option value="all_recipients_each_time">All recipients each time</option></select></label>
                )}
                {callType === "recurring_monthly" && (
                  <div className="space-y-4 rounded-3xl bg-slate-50 p-4">
                    <label className="block space-y-1.5"><span className="text-xs font-bold text-slate-500">Number of months</span><input type="number" min={1} max={6} value={repeatCount} onChange={(event) => { setRepeatCount(Number(event.target.value)); setPreview(null); }} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" /></label>
                    <div><p className="mb-2 text-xs font-bold text-slate-500">Days of the month</p><div className="grid grid-cols-7 gap-2">{Array.from({ length: 31 }, (_, i) => i + 1).map((day) => <button key={day} onClick={() => toggleMonthlyDay(day)} className={`rounded-xl px-2 py-2 text-xs font-black ${monthlyDays.includes(day) ? "bg-slate-900 text-white" : "bg-white text-slate-500"}`}>{day}</button>)}</div></div>
                  </div>
                )}
                {callType === "custom_rule" && (
                  <div className="space-y-4 rounded-3xl bg-slate-50 p-4">
                    <label className="block space-y-1.5"><span className="text-xs font-bold text-slate-500">End date</span><input type="date" min={startLocalDate} max={sixMonthsFromToday()} value={customEndDate} onChange={(event) => { setCustomEndDate(event.target.value); setPreview(null); }} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" /></label>
                    <div><p className="mb-2 text-xs font-bold text-slate-500">Call days</p><div className="grid grid-cols-7 gap-2">{DAYS.map((day) => <button key={day.key} onClick={() => toggleWeekday(day.key)} className={`rounded-xl px-3 py-3 text-[10px] font-black uppercase tracking-widest ${weekdayRules.includes(day.key) ? "bg-slate-900 text-white" : "bg-white text-slate-500"}`}>{day.label}</button>)}</div></div>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <label className="space-y-1.5"><span className="text-xs font-bold text-slate-500">Max attempts</span><input type="number" min={1} max={5} value={maxAttemptsPerLead} onChange={(event) => setMaxAttemptsPerLead(Number(event.target.value))} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" /></label>
                  <label className="space-y-1.5"><span className="text-xs font-bold text-slate-500">Retry delay</span><select value={retryDelayMinutes} onChange={(event) => setRetryDelayMinutes(Number(event.target.value))} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"><option value={30}>30 minutes</option><option value={60}>1 hour</option><option value={180}>3 hours</option><option value={1440}>Next day</option></select></label>
                  <label className="space-y-1.5"><span className="text-xs font-bold text-slate-500">Voicemail</span><select value={voicemailBehavior} onChange={(event) => setVoicemailBehavior(event.target.value)} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"><option value="hangup">Hang up</option><option value="leave_message">Leave message</option></select></label>
                </div>
              </div>
            </section>
          </div>

          <aside className="space-y-5">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Preview and create</p>
              <div className="mt-4 space-y-3 rounded-3xl bg-slate-50 p-4 text-sm text-slate-600">
                <p><span className="font-black text-slate-900">Type:</span> {formatScheduleType(callType)}</p>
                <p><span className="font-black text-slate-900">Agent:</span> {selectedAgent?.name || "None"}</p>
                <p><span className="font-black text-slate-900">From:</span> {fromNumber || "Choose number"}</p>
                <p><span className="font-black text-slate-900">Recipients:</span> {recipientMode === "direct" ? getValidDirectRecipients().length : selectedLeadIds.length}</p>
              </div>
              {callType !== "call_now" && <button onClick={() => void handlePreview()} disabled={busy === "preview"} className="mt-4 w-full rounded-2xl border border-slate-200 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-600 hover:border-slate-300 disabled:opacity-50">{busy === "preview" ? "Previewing..." : "Preview calls"}</button>}
              <button onClick={() => void handleCreate()} disabled={busy === "create" || isPending} className="mt-3 w-full rounded-2xl bg-slate-900 px-4 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-amber-600 disabled:opacity-50">{busy === "create" ? "Working..." : callType === "call_now" ? "Place Call" : "Create Schedule"}</button>
              {preview && <div className="mt-4 rounded-3xl border border-emerald-100 bg-emerald-50 p-4"><p className="text-sm font-black text-emerald-800">{getPreviewTotal(preview)} calls generated</p>{previewCalls.length > 0 && <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-2xl bg-white p-3 text-[11px] text-slate-500">{JSON.stringify(previewCalls, null, 2)}</pre>}</div>}
            </div>
          </aside>
        </div>
      )}

      {selectedSchedule && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-[2rem] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4"><div><h3 className="text-xl font-black text-slate-900">{selectedSchedule.name || "Schedule details"}</h3><p className="text-sm text-slate-500">{formatScheduleType(selectedSchedule.scheduleType || selectedSchedule.schedule_type)} · {getScheduleStatus(selectedSchedule)}</p></div><button onClick={() => setSelectedSchedule(null)} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black uppercase tracking-widest text-slate-500">Close</button></div>
            <div className="mt-5 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
              <p><span className="font-black">From:</span> {selectedSchedule.fromNumber || selectedSchedule.from_number || "—"}</p>
              <p><span className="font-black">Timezone:</span> {selectedSchedule.timezone || "—"}</p>
              <p className="md:col-span-2"><span className="font-black">Purpose:</span> {selectedSchedule.callPurpose || selectedSchedule.call_purpose || "—"}</p>
              <p><span className="font-black">Created:</span> {selectedSchedule.createdAt || selectedSchedule.created_at || "—"}</p>
              <p><span className="font-black">Starts:</span> {selectedSchedule.startAt || selectedSchedule.start_at || "—"}</p>
            </div>
            <pre className="mt-5 max-h-80 overflow-auto rounded-2xl bg-slate-50 p-4 text-[11px] text-slate-500">{JSON.stringify(selectedSchedule, null, 2)}</pre>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-[230] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[2rem] bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-black text-slate-900">Delete schedule?</h3>
            <p className="mt-2 text-sm text-slate-500">This action cannot be undone. {deleteTarget.id === "bulk" ? `You are deleting ${selectedScheduleIds.length} selected schedules.` : `You are deleting ${deleteTarget.name || "this schedule"}.`}</p>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-500">Cancel</button>
              <button onClick={() => deleteTarget.id === "bulk" ? void handleBulkDelete() : void confirmDeleteSchedule()} disabled={busy?.includes("delete")} className="rounded-xl bg-red-600 px-4 py-2 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OutreachScheduler;
