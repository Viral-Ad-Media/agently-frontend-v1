import React, { useEffect, useMemo, useState } from "react";
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
  progress?: Record<string, unknown>;
  [key: string]: unknown;
};

interface OutreachSchedulerProps {
  org: Organization;
  leads: Lead[];
  onChanged?: () => void;
}

const todayIso = () => new Date().toISOString().slice(0, 10);
const sixMonthsFromToday = () => {
  const date = new Date();
  date.setMonth(date.getMonth() + 6);
  return date.toISOString().slice(0, 10);
};

const makeRecipient = (): DirectRecipient => ({
  id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  name: "",
  phone: "",
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

const formatScheduleType = (value?: string) =>
  String(value || "schedule")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const getPreviewCalls = (preview: SchedulePreview | null) => {
  if (!preview) return [];
  const calls = preview.calls || preview.runs;
  return Array.isArray(calls) ? calls.slice(0, 12) : [];
};

const getPreviewTotal = (preview: SchedulePreview | null) => {
  if (!preview) return 0;
  if (typeof preview.totalCalls === "number") return preview.totalCalls;
  if (typeof preview.total_calls === "number") return preview.total_calls;
  const calls = preview.calls || preview.runs;
  return Array.isArray(calls) ? calls.length : 0;
};

const OutreachScheduler: React.FC<OutreachSchedulerProps> = ({ org, leads, onChanged }) => {
  const agents = useMemo(() => org.voiceAgents || [], [org.voiceAgents]);
  const [activeTab, setActiveTab] = useState<"create" | "scheduled">("create");
  const [toast, setToast] = useState<Toast>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [numbers, setNumbers] = useState<TwilioNumberRecord[]>([]);
  const [schedules, setSchedules] = useState<OutreachSchedule[]>([]);
  const [preview, setPreview] = useState<SchedulePreview | null>(null);

  const [callType, setCallType] = useState<CallType>("one_time");
  const [recipientMode, setRecipientMode] = useState<RecipientMode>("direct");
  const [voiceAgentId, setVoiceAgentId] = useState(org.activeVoiceAgentId || agents[0]?.id || "");
  const [fromNumber, setFromNumber] = useState("");
  const [directRecipients, setDirectRecipients] = useState<DirectRecipient[]>([makeRecipient()]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [callPurpose, setCallPurpose] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");
  const [scheduleName, setScheduleName] = useState("Customer follow-up call");
  const [timezone, setTimezone] = useState(org.profile.timezone || org.settings?.timezone || "America/New_York");
  const [startLocalDate, setStartLocalDate] = useState(todayIso());
  const [startTime, setStartTime] = useState("10:00");
  const [startTimesText, setStartTimesText] = useState("10:00");
  const [batchMode, setBatchMode] = useState<BatchMode>("spread_recipients_across_times");
  const [repeatCount, setRepeatCount] = useState(3);
  const [customEndDate, setCustomEndDate] = useState(sixMonthsFromToday());
  const [weekdayRules, setWeekdayRules] = useState<string[]>(["monday", "tuesday", "wednesday", "thursday", "friday"]);
  const [maxAttemptsPerLead, setMaxAttemptsPerLead] = useState(1);
  const [retryDelayMinutes, setRetryDelayMinutes] = useState(60);
  const [voicemailBehavior, setVoicemailBehavior] = useState("hangup");

  const selectedAgent = agents.find((agent) => agent.id === voiceAgentId) || agents[0];
  const tenantNumbers = useMemo(
    () => numbers.filter((number) => getNumberOrgId(number) === org.id),
    [numbers, org.id],
  );
  const assignedNumbers = useMemo(() => {
    if (!voiceAgentId) return tenantNumbers;
    const agentNumbers = tenantNumbers.filter((number) => getAssignedAgentId(number) === voiceAgentId);
    return agentNumbers.length ? agentNumbers : tenantNumbers;
  }, [tenantNumbers, voiceAgentId]);

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
      setSchedules(unwrapList<OutreachSchedule>(response, ["schedules", "data", "items", "results"]));
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
      current.map((recipient) => (recipient.id === id ? { ...recipient, [field]: value } : recipient)),
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

  const getValidDirectRecipients = () =>
    directRecipients
      .map((recipient) => ({ name: recipient.name.trim() || "Unknown", phone: recipient.phone.trim() }))
      .filter((recipient) => recipient.phone);

  const getStartTimes = () =>
    startTimesText
      .split(/[\n,]/)
      .map((value) => value.trim())
      .filter(Boolean);

  const validate = (forPreview = true) => {
    if (!voiceAgentId) return "Choose a voice agent.";
    if (!fromNumber && callType !== "call_now") return "Choose a from number.";
    if (!callPurpose.trim()) return "Call purpose is required.";
    if (recipientMode === "direct" && getValidDirectRecipients().length === 0) return "Add at least one direct recipient phone number.";
    if (recipientMode === "leads" && selectedLeadIds.length === 0) return "Select at least one lead.";
    if (startLocalDate > sixMonthsFromToday()) return "Schedules can only be created up to 6 months ahead. Please choose a closer date or reduce the recurrence duration.";
    if (callType === "one_time_batch" && getStartTimes().length === 0) return "Add at least one batch start time.";
    if (callType === "recurring_monthly" && repeatCount < 1) return "Recurring monthly count must be at least 1.";
    if (callType === "custom_rule") {
      if (customEndDate > sixMonthsFromToday()) return "Schedules can only be created up to 6 months ahead. Please choose a closer date or reduce the recurrence duration.";
      if (customEndDate < startLocalDate) return "Custom schedule end date must be after the start date.";
      if (weekdayRules.length === 0) return "Choose at least one day for the custom schedule.";
      if (getStartTimes().length === 0) return "Add at least one custom schedule time.";
    }
    if (!forPreview && callType !== "call_now" && !preview) return "Preview the generated calls before creating the schedule.";
    return "";
  };

  const buildPayload = () => {
    const base: Record<string, unknown> = {
      name: scheduleName.trim() || "Scheduled outreach call",
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

    if (callType === "one_time") {
      return { ...base, scheduleType: "one_time", startLocalDate, startTime };
    }

    if (callType === "one_time_batch") {
      return { ...base, scheduleType: "one_time_batch", startLocalDate, startTimes: getStartTimes(), batchMode };
    }

    if (callType === "recurring_monthly") {
      return {
        ...base,
        scheduleType: "recurring_monthly",
        startLocalDate,
        startTime,
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
          weeklyRules: [{ daysOfWeek: weekdayRules, times: getStartTimes() }],
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
    if (message) {
      showToast(message, false);
      return;
    }
    if (callType === "call_now") {
      showToast("Call Now does not need a schedule preview. Use Place Call.");
      return;
    }
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
    if (message) {
      showToast(message, false);
      return;
    }
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

  const handleDeleteSchedule = async (scheduleId: string) => {
    if (!window.confirm("Delete this schedule? This cannot be undone.")) return;
    setBusy(`delete-${scheduleId}`);
    try {
      await voiceCallsApi.outreach.deleteOutreachSchedule(scheduleId);
      showToast("Schedule deleted.");
      await loadSchedules();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Delete failed.", false);
    } finally {
      setBusy(null);
    }
  };

  const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
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
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-500">Phase 3</p>
          <h2 className="mt-1 text-2xl font-black text-slate-950">Outreach & Scheduled Calls</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Create direct-recipient or lead-backed outbound calls. The agent voice comes from the saved agent config — schedules only describe why and when to call.
          </p>
        </div>
        <div className="flex rounded-2xl bg-slate-100 p-1 text-xs font-black uppercase tracking-widest text-slate-500">
          <button
            onClick={() => setActiveTab("create")}
            className={`rounded-xl px-4 py-2 transition-all ${activeTab === "create" ? "bg-white text-slate-950 shadow-sm" : "hover:text-slate-800"}`}
          >
            Create
          </button>
          <button
            onClick={() => setActiveTab("scheduled")}
            className={`rounded-xl px-4 py-2 transition-all ${activeTab === "scheduled" ? "bg-white text-slate-950 shadow-sm" : "hover:text-slate-800"}`}
          >
            Scheduled
          </button>
        </div>
      </div>

      {activeTab === "scheduled" ? (
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-black text-slate-900">Existing schedules</h3>
              <p className="text-xs text-slate-400">Loaded from /api/outreach/schedules.</p>
            </div>
            <button
              onClick={() => void loadSchedules()}
              disabled={busy === "load-schedules"}
              className="rounded-xl border border-slate-200 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:border-slate-300 disabled:opacity-50"
            >
              {busy === "load-schedules" ? "Loading..." : "Refresh"}
            </button>
          </div>
          {schedules.length === 0 ? (
            <div className="rounded-3xl border-2 border-dashed border-slate-200 py-16 text-center">
              <p className="text-base font-black text-slate-900">No schedules yet</p>
              <p className="mt-1 text-sm text-slate-400">Create a scheduled call to see it here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {schedules.map((schedule, index) => {
                const scheduleId = String(schedule.id || index);
                const agent = agents.find((item) => item.id === (schedule.voiceAgentId || schedule.voice_agent_id));
                return (
                  <div key={scheduleId} className="rounded-3xl border border-slate-200 p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-black text-slate-900">{schedule.name || "Scheduled call"}</p>
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500">{formatScheduleType(schedule.scheduleType || schedule.schedule_type)}</span>
                          <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-700">{String(schedule.status || "active")}</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">{agent?.name || "Agent"} · {schedule.fromNumber || schedule.from_number || "No from number"} · {schedule.timezone || timezone}</p>
                        <p className="mt-1 text-xs text-slate-400">{schedule.callPurpose || schedule.call_purpose || "No purpose shown"}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => void handleCancelSchedule(scheduleId)}
                          disabled={busy === `cancel-${scheduleId}`}
                          className="rounded-xl border border-amber-200 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => void handleDeleteSchedule(scheduleId)}
                          disabled={busy === `delete-${scheduleId}`}
                          className="rounded-xl border border-red-100 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-red-500 hover:bg-red-50 disabled:opacity-50"
                        >
                          Delete
                        </button>
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
            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <p className="mb-4 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">1. Call type</p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
                {[
                  ["call_now", "Call Now"],
                  ["one_time", "One-time"],
                  ["one_time_batch", "Batch"],
                  ["recurring_monthly", "Monthly"],
                  ["custom_rule", "Custom"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => {
                      setCallType(value as CallType);
                      setPreview(null);
                    }}
                    className={`rounded-2xl border px-4 py-3 text-left text-xs font-black uppercase tracking-widest transition-all ${callType === value ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <p className="mb-4 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">2. Agent and from number</p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-xs font-bold text-slate-500">Voice agent</span>
                  <select
                    value={voiceAgentId}
                    onChange={(event) => setVoiceAgentId(event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-amber-300"
                  >
                    {agents.map((agent: AgentConfig) => (
                      <option key={agent.id} value={agent.id}>{agent.name} ({agent.direction})</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-bold text-slate-500">From number</span>
                  <select
                    value={fromNumber}
                    onChange={(event) => {
                      setFromNumber(event.target.value);
                      setPreview(null);
                    }}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-amber-300"
                  >
                    <option value="">Choose tenant number...</option>
                    {assignedNumbers.map((number) => {
                      const phone = getPhone(number);
                      return <option key={number.id || phone} value={phone}>{phone} {getAssignedAgentId(number) === voiceAgentId ? "- assigned" : ""}</option>;
                    })}
                  </select>
                </label>
              </div>
              <p className="mt-3 text-xs text-slate-400">Selected agent: <span className="font-bold text-slate-600">{selectedAgent?.name || "None"}</span>. Voice selection is not sent in this schedule body.</p>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <p className="mb-4 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">3. Recipients</p>
              <div className="mb-4 flex rounded-2xl bg-slate-100 p-1 text-xs font-black uppercase tracking-widest text-slate-500">
                <button onClick={() => { setRecipientMode("direct"); setPreview(null); }} className={`flex-1 rounded-xl px-4 py-2 ${recipientMode === "direct" ? "bg-white text-slate-950 shadow-sm" : ""}`}>Direct</button>
                <button onClick={() => { setRecipientMode("leads"); setPreview(null); }} className={`flex-1 rounded-xl px-4 py-2 ${recipientMode === "leads" ? "bg-white text-slate-950 shadow-sm" : ""}`}>Leads</button>
              </div>
              {recipientMode === "direct" ? (
                <div className="space-y-3">
                  {directRecipients.map((recipient, index) => (
                    <div key={recipient.id} className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto]">
                      <input value={recipient.name} onChange={(event) => updateRecipient(recipient.id, "name", event.target.value)} placeholder={`Recipient ${index + 1} name`} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-amber-300" />
                      <input value={recipient.phone} onChange={(event) => updateRecipient(recipient.id, "phone", event.target.value)} placeholder="+1..." className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-amber-300" />
                      <button onClick={() => removeRecipient(recipient.id)} className="rounded-2xl border border-red-100 px-4 py-3 text-xs font-black uppercase tracking-widest text-red-500 hover:bg-red-50">Remove</button>
                    </div>
                  ))}
                  <button onClick={() => setDirectRecipients((current) => [...current, makeRecipient()])} className="rounded-2xl border border-slate-200 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-500 hover:border-slate-300">+ Add recipient</button>
                </div>
              ) : (
                <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                  {leads.length === 0 ? <p className="text-sm text-slate-400">No leads available yet.</p> : leads.map((lead) => (
                    <label key={lead.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3">
                      <div>
                        <p className="text-sm font-black text-slate-900">{lead.name}</p>
                        <p className="text-xs text-slate-400">{lead.phone || lead.email || "No contact"}</p>
                      </div>
                      <input type="checkbox" checked={selectedLeadIds.includes(lead.id)} onChange={() => toggleLead(lead.id)} />
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <p className="mb-4 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">4. Purpose and timing</p>
              <div className="space-y-4">
                <input value={scheduleName} onChange={(event) => setScheduleName(event.target.value)} placeholder="Schedule name" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-amber-300" />
                <textarea value={callPurpose} onChange={(event) => { setCallPurpose(event.target.value); setPreview(null); }} placeholder="Required: why is the agent calling?" rows={3} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-amber-300" />
                <textarea value={customInstructions} onChange={(event) => { setCustomInstructions(event.target.value); setPreview(null); }} placeholder="Optional call-specific guidance" rows={3} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-amber-300" />
                {callType !== "call_now" && (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <label className="space-y-1.5"><span className="text-xs font-bold text-slate-500">Start date</span><input type="date" min={todayIso()} max={sixMonthsFromToday()} value={startLocalDate} onChange={(event) => { setStartLocalDate(event.target.value); setPreview(null); }} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" /></label>
                    <label className="space-y-1.5"><span className="text-xs font-bold text-slate-500">Timezone</span><input value={timezone} onChange={(event) => setTimezone(event.target.value)} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" /></label>
                    {callType !== "one_time_batch" && callType !== "custom_rule" ? <label className="space-y-1.5"><span className="text-xs font-bold text-slate-500">Time</span><input type="time" value={startTime} onChange={(event) => { setStartTime(event.target.value); setPreview(null); }} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" /></label> : <label className="space-y-1.5"><span className="text-xs font-bold text-slate-500">Times</span><input value={startTimesText} onChange={(event) => { setStartTimesText(event.target.value); setPreview(null); }} placeholder="10:00, 14:00" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" /></label>}
                  </div>
                )}
                {(callType === "one_time_batch" || callType === "custom_rule") && (
                  <label className="space-y-1.5 block"><span className="text-xs font-bold text-slate-500">Batch mode</span><select value={batchMode} onChange={(event) => setBatchMode(event.target.value as BatchMode)} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"><option value="spread_recipients_across_times">Spread recipients across times</option><option value="all_recipients_each_time">All recipients each time</option></select></label>
                )}
                {callType === "recurring_monthly" && (
                  <label className="space-y-1.5 block"><span className="text-xs font-bold text-slate-500">Monthly occurrences</span><input type="number" min={1} max={6} value={repeatCount} onChange={(event) => { setRepeatCount(Number(event.target.value)); setPreview(null); }} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" /></label>
                )}
                {callType === "custom_rule" && (
                  <div className="space-y-4 rounded-3xl bg-slate-50 p-4">
                    <label className="space-y-1.5 block"><span className="text-xs font-bold text-slate-500">End date</span><input type="date" min={startLocalDate} max={sixMonthsFromToday()} value={customEndDate} onChange={(event) => { setCustomEndDate(event.target.value); setPreview(null); }} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" /></label>
                    <div className="flex flex-wrap gap-2">{weekdays.map((day) => <button key={day} onClick={() => toggleWeekday(day)} className={`rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest ${weekdayRules.includes(day) ? "bg-slate-900 text-white" : "bg-white text-slate-500"}`}>{day.slice(0, 3)}</button>)}</div>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <label className="space-y-1.5"><span className="text-xs font-bold text-slate-500">Max attempts</span><input type="number" min={1} max={5} value={maxAttemptsPerLead} onChange={(event) => setMaxAttemptsPerLead(Number(event.target.value))} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" /></label>
                  <label className="space-y-1.5"><span className="text-xs font-bold text-slate-500">Retry delay</span><input type="number" min={15} value={retryDelayMinutes} onChange={(event) => setRetryDelayMinutes(Number(event.target.value))} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" /></label>
                  <label className="space-y-1.5"><span className="text-xs font-bold text-slate-500">Voicemail</span><select value={voicemailBehavior} onChange={(event) => setVoicemailBehavior(event.target.value)} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"><option value="hangup">Hang up</option><option value="leave_message">Leave message</option></select></label>
                </div>
              </div>
            </div>
          </div>

          <aside className="space-y-5">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">5. Preview and create</p>
              <div className="mt-4 space-y-3 rounded-3xl bg-slate-50 p-4 text-sm text-slate-600">
                <p><span className="font-black text-slate-900">Type:</span> {formatScheduleType(callType)}</p>
                <p><span className="font-black text-slate-900">Agent:</span> {selectedAgent?.name || "None"}</p>
                <p><span className="font-black text-slate-900">From:</span> {fromNumber || "Choose number"}</p>
                <p><span className="font-black text-slate-900">Recipients:</span> {recipientMode === "direct" ? getValidDirectRecipients().length : selectedLeadIds.length}</p>
              </div>
              {callType !== "call_now" && (
                <button onClick={() => void handlePreview()} disabled={busy === "preview"} className="mt-4 w-full rounded-2xl border border-slate-200 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-600 hover:border-slate-300 disabled:opacity-50">{busy === "preview" ? "Previewing..." : "Preview generated calls"}</button>
              )}
              <button onClick={() => void handleCreate()} disabled={busy === "create"} className="mt-3 w-full rounded-2xl bg-slate-900 px-4 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-amber-600 disabled:opacity-50">{busy === "create" ? "Working..." : callType === "call_now" ? "Place Call" : "Create Schedule"}</button>
            </div>

            {preview && (
              <div className="rounded-[2rem] border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-700">Preview ready</p>
                <p className="mt-2 text-3xl font-black text-emerald-950">{getPreviewTotal(preview)}</p>
                <p className="text-sm text-emerald-700">calls generated</p>
                {Array.isArray(preview.warnings) && preview.warnings.length > 0 && <div className="mt-3 rounded-2xl bg-white/70 p-3 text-xs text-amber-700">{preview.warnings.join(" ")}</div>}
                {previewCalls.length > 0 && (
                  <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
                    {previewCalls.map((call, index) => <pre key={index} className="overflow-hidden rounded-2xl bg-white/80 p-3 text-[10px] text-slate-500">{JSON.stringify(call, null, 2)}</pre>)}
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
};

export default OutreachScheduler;
