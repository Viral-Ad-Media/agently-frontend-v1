import React, {
  memo,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { AgentConfig, Lead, Organization } from "../types";
import { TwilioNumberRecord, voiceCallsApi } from "../services/voiceCallsApi";
import AppModal from "../components/AppModal";

type CallType =
  | "call_now"
  | "one_time"
  | "one_time_batch"
  | "recurring_monthly"
  | "custom_rule";
type RecipientMode = "direct" | "leads";
type BatchMode = "all_recipients_each_time" | "spread_recipients_across_times";
type Toast = { message: string; ok: boolean } | null;
type ValidationModal = { title: string; message: string } | null;

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
  lead_ids?: unknown;
  leadIds?: unknown;
  progress?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
};

interface OutreachSchedulerProps {
  org: Organization;
  leads: Lead[];
  onChanged?: () => void;
}

const FALLBACK_TIMEZONES = [
  "UTC",
  "Africa/Accra",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Africa/Lagos",
  "Africa/Nairobi",
  "America/Anchorage",
  "America/Argentina/Buenos_Aires",
  "America/Bogota",
  "America/Chicago",
  "America/Denver",
  "America/Detroit",
  "America/Halifax",
  "America/Los_Angeles",
  "America/Mexico_City",
  "America/New_York",
  "America/Phoenix",
  "America/Sao_Paulo",
  "America/Toronto",
  "America/Vancouver",
  "Asia/Bangkok",
  "Asia/Dubai",
  "Asia/Hong_Kong",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Riyadh",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Seoul",
  "Asia/Tokyo",
  "Australia/Melbourne",
  "Australia/Perth",
  "Australia/Sydney",
  "Europe/Amsterdam",
  "Europe/Athens",
  "Europe/Berlin",
  "Europe/Lisbon",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Moscow",
  "Europe/Paris",
  "Europe/Rome",
  "Europe/Stockholm",
  "Europe/Zurich",
  "Pacific/Auckland",
];

const getTimezones = () => {
  try {
    const zones = (Intl as any).supportedValuesOf?.("timeZone");
    if (Array.isArray(zones) && zones.length > 0) {
      return ["UTC", ...zones.filter((zone: string) => zone !== "UTC")];
    }
  } catch {
    // Browser does not support Intl.supportedValuesOf.
  }
  return FALLBACK_TIMEZONES;
};

const TIMEZONES = getTimezones();

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

const getNowPartsInTimezone = (timeZone: string) => {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date());
    const get = (type: string) =>
      parts.find((part) => part.type === type)?.value || "";
    return {
      date: `${get("year")}-${get("month")}-${get("day")}`,
      time: `${get("hour")}:${get("minute")}`,
    };
  } catch {
    return { date: todayIso(), time: timePlusMinutes(0) };
  }
};

const isPastScheduleWarning = (message: string) =>
  /past|already passed|future time|future date|must be in the future/i.test(
    message,
  );

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
const getPhone = (number: TwilioNumberRecord) =>
  number.phone_number || number.phoneNumber || "";
const getAssignedAgentId = (number: TwilioNumberRecord) =>
  number.assigned_voice_agent_id ||
  number.assignedVoiceAgentId ||
  number.voiceAgentId ||
  number.agentId ||
  "";

const getScheduleId = (schedule: OutreachSchedule, fallback: number) =>
  String(schedule.id || fallback);
const getScheduleProgress = (schedule: OutreachSchedule) => {
  const progress =
    schedule.progress && typeof schedule.progress === "object"
      ? (schedule.progress as Record<string, unknown>)
      : {};
  const total =
    Number(progress.totalRuns || progress.total_runs || progress.total || 0) ||
    0;
  const remaining = Number(progress.remaining || progress.pending || 0) || 0;
  const completed = Number(progress.completed || 0) || 0;
  const failed = Number(progress.failed || 0) || 0;
  return { total, remaining, completed, failed };
};

const getScheduleStatus = (schedule: OutreachSchedule) => {
  const raw = String(schedule.status || "active").toLowerCase();
  if (
    [
      "completed",
      "complete",
      "done",
      "cancelled",
      "canceled",
      "failed",
      "deleted",
    ].includes(raw)
  )
    return raw;
  const progress = getScheduleProgress(schedule);
  if (progress.total > 0 && progress.remaining <= 0) {
    if (progress.failed >= progress.total) return "failed";
    return "completed";
  }
  return raw;
};
const isDoneStatus = (status: string) =>
  ["completed", "complete", "done", "cancelled", "canceled", "failed"].includes(
    status,
  );

const formatScheduleType = (value?: string) =>
  String(value || "schedule")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const statusClass = (status: string) => {
  const s = status.toLowerCase();
  if (["completed", "complete", "done"].some((v) => s.includes(v)))
    return "bg-slate-100 text-slate-500";
  if (["cancel", "failed", "error"].some((v) => s.includes(v)))
    return "bg-red-50 text-red-600";
  if (["queued", "pending", "draft"].some((v) => s.includes(v)))
    return "bg-amber-50 text-amber-700";
  return "bg-emerald-50 text-emerald-700";
};

const humanDateTime = (value: unknown) => {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const parseScheduleRecipients = (schedule: OutreachSchedule) => {
  const raw =
    schedule.directRecipients ||
    schedule.direct_recipients ||
    schedule.metadata?.directRecipients ||
    [];
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? (() => {
          try {
            return JSON.parse(raw);
          } catch {
            return [];
          }
        })()
      : [];
  return Array.isArray(list)
    ? list
        .map((item) =>
          item && typeof item === "object"
            ? (item as Record<string, unknown>)
            : null,
        )
        .filter(Boolean)
    : [];
};

const recipientSummary = (schedule: OutreachSchedule) => {
  const recipients = parseScheduleRecipients(schedule);
  if (recipients.length) {
    const names = recipients
      .map((recipient) =>
        String(recipient?.name || recipient?.phone || "Recipient"),
      )
      .slice(0, 3);
    return `${names.join(", ")}${recipients.length > 3 ? ` +${recipients.length - 3} more` : ""}`;
  }
  const leadIds = Array.isArray(schedule.lead_ids)
    ? schedule.lead_ids.length
    : Array.isArray(schedule.leadIds)
      ? schedule.leadIds.length
      : 0;
  return leadIds
    ? `${leadIds} lead${leadIds === 1 ? "" : "s"}`
    : "No recipients shown";
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
    error:
      "Currently, outbound calls are supported for U.S. and Canadian numbers only.",
  };
};

const addThirtyMinutes = (time: string) => {
  const [hour = "0", minute = "0"] = time.split(":");
  const date = new Date();
  date.setHours(Number(hour), Number(minute), 0, 0);
  date.setMinutes(date.getMinutes() + 30);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const PAGE_SIZE = 10;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const isValidTime = (value: string) => TIME_PATTERN.test(value);

const TimePicker = memo(
  ({
    label,
    value,
    onChange,
  }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
  }) => {
    const safeValue = isValidTime(value) ? value : timePlusMinutes(5);
    return (
      <label className="space-y-1.5">
        <span className="text-xs font-bold text-slate-500">{label}</span>
        <input
          type="time"
          step={60}
          value={safeValue}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-amber-300"
        />
        <span className="block text-[10px] font-semibold text-slate-400">
          Type a time or use your device time picker.
        </span>
      </label>
    );
  },
);
TimePicker.displayName = "TimePicker";

const TimezonePicker = memo(
  ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (value: string) => void;
  }) => {
    const [query, setQuery] = useState(value || "");
    const [open, setOpen] = useState(false);

    useEffect(() => {
      setQuery(value || "");
    }, [value]);

    const filtered = useMemo(() => {
      const needle = query.trim().toLowerCase();
      const base = needle
        ? TIMEZONES.filter((zone) => zone.toLowerCase().includes(needle))
        : TIMEZONES;
      return base.slice(0, 50);
    }, [query]);

    const isValid = TIMEZONES.includes(value);

    return (
      <div className="relative space-y-1.5">
        <span className="text-xs font-bold text-slate-500">Timezone</span>
        <input
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onBlur={() => {
            window.setTimeout(() => {
              setOpen(false);
              if (!TIMEZONES.includes(query)) setQuery(value);
            }, 120);
          }}
          placeholder="Search timezone..."
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-amber-300"
        />
        {!isValid ? (
          <p className="text-[10px] font-bold text-red-500">
            Choose a valid timezone from the list.
          </p>
        ) : null}
        {open ? (
          <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-xl">
            {filtered.length ? (
              filtered.map((zone) => (
                <button
                  key={zone}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange(zone);
                    setQuery(zone);
                    setOpen(false);
                  }}
                  className={`block w-full rounded-xl px-3 py-2 text-left text-xs font-bold transition-all ${zone === value ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
                >
                  {zone}
                </button>
              ))
            ) : (
              <p className="px-3 py-3 text-xs font-bold text-slate-400">
                No matching timezones.
              </p>
            )}
          </div>
        ) : null}
      </div>
    );
  },
);
TimezonePicker.displayName = "TimezonePicker";

const TimeListEditor = memo(
  ({
    values,
    onChange,
  }: {
    values: string[];
    onChange: (values: string[]) => void;
  }) => {
    const update = (index: number, value: string) => {
      onChange(
        values.map((item, itemIndex) => (itemIndex === index ? value : item)),
      );
    };
    const remove = (index: number) => {
      onChange(
        values.length <= 1
          ? values
          : values.filter((_, itemIndex) => itemIndex !== index),
      );
    };
    return (
      <div className="space-y-3 rounded-3xl bg-slate-50 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">
              Call times
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              Pick exact hour and minute for each call window.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              onChange([
                ...values,
                addThirtyMinutes(
                  values[values.length - 1] || timePlusMinutes(5),
                ),
              ])
            }
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-slate-300"
          >
            + Time
          </button>
        </div>
        {values.map((time, index) => (
          <div
            key={`${index}-${time}`}
            className="grid grid-cols-[1fr_auto] items-end gap-3 rounded-2xl border border-slate-100 bg-white p-3"
          >
            <TimePicker
              label={`Time ${index + 1}`}
              value={time}
              onChange={(value) => update(index, value)}
            />
            <button
              type="button"
              onClick={() => remove(index)}
              disabled={values.length <= 1}
              className="mb-0.5 rounded-xl border border-red-100 px-3 py-3 text-[10px] font-black uppercase tracking-widest text-red-500 hover:bg-red-50 disabled:opacity-40"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    );
  },
);
TimeListEditor.displayName = "TimeListEditor";

const OutreachScheduler: React.FC<OutreachSchedulerProps> = ({
  org,
  leads,
  onChanged,
}) => {
  const agents = useMemo(() => org.voiceAgents || [], [org.voiceAgents]);
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<"create" | "scheduled">("create");
  const [toast, setToast] = useState<Toast>(null);
  const [validationModal, setValidationModal] = useState<ValidationModal>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [numbers, setNumbers] = useState<TwilioNumberRecord[]>([]);
  const [schedules, setSchedules] = useState<OutreachSchedule[]>([]);
  const [preview, setPreview] = useState<SchedulePreview | null>(null);
  const [selectedSchedule, setSelectedSchedule] =
    useState<OutreachSchedule | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name?: string;
    bulk?: boolean;
  } | null>(null);
  const [selectedScheduleIds, setSelectedScheduleIds] = useState<string[]>([]);
  const [schedulePage, setSchedulePage] = useState(1);

  const [callType, setCallType] = useState<CallType>("one_time");
  const [recipientMode, setRecipientMode] = useState<RecipientMode>("direct");
  const [voiceAgentId, setVoiceAgentId] = useState(
    agents[0]?.id || org.activeVoiceAgentId || "",
  );
  const [fromNumber, setFromNumber] = useState("");
  const [directRecipients, setDirectRecipients] = useState<DirectRecipient[]>([
    makeRecipient(),
  ]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [callPurpose, setCallPurpose] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");
  const [scheduleName, setScheduleName] = useState("");
  const [timezone, setTimezone] = useState(
    org.profile.timezone || org.settings?.timezone || "Africa/Lagos",
  );
  const [startLocalDate, setStartLocalDate] = useState(todayIso());
  const [startTime, setStartTime] = useState(timePlusMinutes(5));
  const [startTimes, setStartTimes] = useState<string[]>([timePlusMinutes(5)]);
  const [batchMode, setBatchMode] = useState<BatchMode>(
    "spread_recipients_across_times",
  );
  const [repeatCount, setRepeatCount] = useState(3);
  const [monthlyDays, setMonthlyDays] = useState<number[]>([
    new Date().getDate(),
  ]);
  const [customEndDate, setCustomEndDate] = useState(sixMonthsFromToday());
  const [weekdayRules, setWeekdayRules] = useState<string[]>([
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
  ]);
  const [maxAttemptsPerLead, setMaxAttemptsPerLead] = useState(1);
  const [retryDelayMinutes, setRetryDelayMinutes] = useState(60);
  const [voicemailBehavior, setVoicemailBehavior] = useState("hangup");
  const orgTimezone =
    org.settings?.timezone || org.profile.timezone || "Africa/Lagos";

  useEffect(() => {
    setTimezone(orgTimezone);
  }, [orgTimezone]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash || "";
    const query = hash.includes("?")
      ? new URLSearchParams(hash.split("?")[1])
      : new URLSearchParams();
    const tag = query.get("tag");
    if (!tag) return;
    const taggedLeads = leads.filter((lead) =>
      (lead.tags || []).some(
        (leadTag) => leadTag.toLowerCase() === tag.toLowerCase(),
      ),
    );
    if (!taggedLeads.length) return;
    setActiveTab("create");
    setRecipientMode("leads");
    setSelectedLeadIds(taggedLeads.map((lead) => lead.id));
    setScheduleName(`${tag} outreach`);
    setCallPurpose((current) => current || `Follow up with ${tag} leads.`);
    setPreview(null);
  }, [leads]);

  const tenantNumbers = useMemo(
    () => numbers.filter((number) => getNumberOrgId(number) === org.id),
    [numbers, org.id],
  );
  const assignedNumbers = useMemo(() => {
    if (!voiceAgentId) return tenantNumbers;
    const agentNumbers = tenantNumbers.filter(
      (number) => getAssignedAgentId(number) === voiceAgentId,
    );
    return agentNumbers.length ? agentNumbers : tenantNumbers;
  }, [tenantNumbers, voiceAgentId]);
  const selectedAgent =
    agents.find((agent) => agent.id === voiceAgentId) || agents[0];
  const totalSchedulePages = Math.max(
    1,
    Math.ceil(schedules.length / PAGE_SIZE),
  );
  const pagedSchedules = useMemo(
    () =>
      schedules.slice((schedulePage - 1) * PAGE_SIZE, schedulePage * PAGE_SIZE),
    [schedules, schedulePage],
  );
  const pageScheduleIds = useMemo(
    () => pagedSchedules.map(getScheduleId),
    [pagedSchedules],
  );
  const allScheduleIds = useMemo(
    () => schedules.map(getScheduleId),
    [schedules],
  );

  const showToast = (message: string, ok = true) => {
    setToast({ message, ok });
    window.setTimeout(() => setToast(null), 4200);
  };

  const showValidationMessage = (message: string) => {
    if (isPastScheduleWarning(message)) {
      setValidationModal({
        title: "Choose a future call time",
        message,
      });
      return;
    }
    showToast(message, false);
  };

  const openDeleteModal = (target: {
    id: string;
    name?: string;
    bulk?: boolean;
  }) => {
    window.requestAnimationFrame(() => setDeleteTarget(target));
  };

  const loadNumbers = async () => {
    if (!org.id) return;
    try {
      const response = await voiceCallsApi.phoneNumbers.getTwilioNumbers({
        organizationId: org.id,
      });
      const scoped = response.numbers.filter(
        (number) => getNumberOrgId(number) === org.id,
      );
      setNumbers(scoped);
      const preferred =
        scoped.find((number) => getAssignedAgentId(number) === voiceAgentId) ||
        scoped[0];
      if (!fromNumber && preferred) setFromNumber(getPhone(preferred));
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "Could not load phone numbers.",
        false,
      );
    }
  };

  const loadSchedules = async () => {
    setBusy("load-schedules");
    try {
      const response = await voiceCallsApi.outreach.getOutreachSchedules();
      const nextSchedules = unwrapList<OutreachSchedule>(response, [
        "schedules",
        "data",
        "items",
        "results",
      ]);
      startTransition(() => {
        setSchedules(nextSchedules);
        setSchedulePage(1);
        setSelectedScheduleIds([]);
      });
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Could not load schedules.",
        false,
      );
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
    const preferred =
      assignedNumbers.find(
        (number) => getAssignedAgentId(number) === voiceAgentId,
      ) || assignedNumbers[0];
    if (preferred) setFromNumber(getPhone(preferred));
    setPreview(null);
  }, [voiceAgentId, assignedNumbers]);

  const updateRecipient = (
    id: string,
    field: keyof DirectRecipient,
    value: string,
  ) => {
    setDirectRecipients((current) =>
      current.map((recipient) => {
        if (recipient.id !== id) return recipient;
        if (field !== "phone" && field !== "displayPhone")
          return { ...recipient, [field]: value };
        const normalized = normalizeNorthAmericaPhone(value);
        return {
          ...recipient,
          displayPhone: value,
          phone: normalized.value,
          phoneError: normalized.error,
        };
      }),
    );
    setPreview(null);
  };

  const removeRecipient = (id: string) => {
    setDirectRecipients((current) =>
      current.length === 1
        ? current
        : current.filter((recipient) => recipient.id !== id),
    );
    setPreview(null);
  };

  const toggleLead = (leadId: string) => {
    setSelectedLeadIds((current) =>
      current.includes(leadId)
        ? current.filter((id) => id !== leadId)
        : [...current, leadId],
    );
    setPreview(null);
  };

  const toggleWeekday = (day: string) => {
    setWeekdayRules((current) =>
      current.includes(day)
        ? current.filter((value) => value !== day)
        : [...current, day],
    );
    setPreview(null);
  };

  const toggleMonthlyDay = (day: number) => {
    setMonthlyDays((current) =>
      current.includes(day)
        ? current.filter((value) => value !== day)
        : [...current, day].sort((a, b) => a - b),
    );
    setPreview(null);
  };

  const getValidDirectRecipients = () =>
    directRecipients
      .map((recipient) => ({
        name: recipient.name.trim() || "Unknown",
        phone: recipient.phone.trim(),
      }))
      .filter((recipient) => recipient.phone);

  const validate = (forPreview = true) => {
    if (!voiceAgentId) return "Choose a voice agent.";
    if (!fromNumber) return "Choose a from number.";
    if (!callPurpose.trim()) return "Call purpose is required.";
    const invalidRecipient = directRecipients.find(
      (recipient) => recipient.displayPhone && recipient.phoneError,
    );
    if (invalidRecipient)
      return (
        invalidRecipient.phoneError ||
        "Enter a valid U.S. or Canadian recipient number."
      );
    if (recipientMode === "direct" && getValidDirectRecipients().length === 0)
      return "Add at least one direct recipient phone number.";
    if (recipientMode === "leads" && selectedLeadIds.length === 0)
      return "Select at least one lead.";
    if (startLocalDate > sixMonthsFromToday())
      return "Schedules can only be created up to 6 months ahead. Please choose a closer date or reduce the recurrence duration.";
    if (
      callType !== "call_now" &&
      callType !== "one_time_batch" &&
      callType !== "custom_rule" &&
      !isValidTime(startTime)
    )
      return "Choose a valid call time.";
    if (callType === "one_time_batch" && startTimes.length === 0)
      return "Add at least one batch start time.";
    if (
      (callType === "one_time_batch" || callType === "custom_rule") &&
      startTimes.some((time) => !isValidTime(time))
    )
      return "Choose valid call times.";
    if (callType === "recurring_monthly") {
      if (repeatCount < 1)
        return "Monthly occurrence count must be at least 1.";
      if (monthlyDays.length === 0)
        return "Choose at least one day of the month.";
    }
    if (callType === "custom_rule") {
      if (customEndDate > sixMonthsFromToday())
        return "Schedules can only be created up to 6 months ahead. Please choose a closer date or reduce the recurrence duration.";
      if (customEndDate < startLocalDate)
        return "Custom schedule end date must be after the start date.";
      if (weekdayRules.length === 0)
        return "Choose at least one day for the custom schedule.";
      if (startTimes.length === 0)
        return "Add at least one custom schedule time.";
    }
    if (callType !== "call_now") {
      const nowInScheduleZone = getNowPartsInTimezone(timezone);
      if (startLocalDate < nowInScheduleZone.date) {
        return `The selected start date has already passed in ${timezone}. Please choose today or a future date.`;
      }
      if (startLocalDate === nowInScheduleZone.date) {
        const candidateTimes =
          callType === "one_time_batch" || callType === "custom_rule"
            ? startTimes
            : [startTime];
        const pastTimes = candidateTimes.filter(
          (time) => isValidTime(time) && time <= nowInScheduleZone.time,
        );
        if (pastTimes.length > 0) {
          return `The selected call time ${pastTimes[0]} has already passed in ${timezone}. Please choose a future time before previewing or creating this schedule.`;
        }
      }
    }
    if (!forPreview && callType !== "call_now" && !preview)
      return "Preview the generated calls before creating the schedule.";
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

    if (callType === "one_time")
      return { ...base, scheduleType: "one_time", startLocalDate, startTime };
    if (callType === "one_time_batch")
      return {
        ...base,
        scheduleType: "one_time_batch",
        startLocalDate,
        startTimes,
        batchMode,
      };
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
    if (message) return showValidationMessage(message);
    if (callType === "call_now")
      return showToast("Call Now does not need preview. Use Place Call.");
    setBusy("preview");
    try {
      const response =
        await voiceCallsApi.outreach.previewOutreachSchedule(buildPayload());
      setPreview(response as SchedulePreview);
      showToast("Schedule preview generated.");
    } catch (error) {
      setPreview(null);
      const message =
        error instanceof Error ? error.message : "Preview failed.";
      if (isPastScheduleWarning(message)) showValidationMessage(message);
      else showToast(message, false);
    } finally {
      setBusy(null);
    }
  };

  const handleCreate = async () => {
    const message = validate(false);
    if (message) return showValidationMessage(message);
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
      const message = error instanceof Error ? error.message : "Create failed.";
      if (isPastScheduleWarning(message)) showValidationMessage(message);
      else showToast(message, false);
    } finally {
      setBusy(null);
    }
  };

  const handleCancelSchedule = async (scheduleId: string) => {
    setBusy(`cancel-${scheduleId}`);
    try {
      await voiceCallsApi.outreach.cancelOutreachSchedule(scheduleId, {
        reason: "User cancelled from dashboard.",
      });
      showToast("Schedule cancelled.");
      await loadSchedules();
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Cancel failed.",
        false,
      );
    } finally {
      setBusy(null);
    }
  };

  const confirmDeleteSchedule = async () => {
    if (!deleteTarget) return;
    const scheduleId = deleteTarget.id;
    setBusy(`delete-${scheduleId}`);
    try {
      await voiceCallsApi.outreach.deleteOutreachSchedule(scheduleId);
      showToast("Schedule deleted.");
      setDeleteTarget(null);
      await loadSchedules();
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Delete failed.",
        false,
      );
    } finally {
      setBusy(null);
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedScheduleIds.length) return;
    setBusy("bulk-delete");
    try {
      await Promise.all(
        selectedScheduleIds.map((scheduleId) =>
          voiceCallsApi.outreach.deleteOutreachSchedule(scheduleId),
        ),
      );
      showToast("Selected schedules deleted.");
      setSelectedScheduleIds([]);
      setDeleteTarget(null);
      await loadSchedules();
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Bulk delete failed.",
        false,
      );
    } finally {
      setBusy(null);
    }
  };

  const previewCalls = getPreviewCalls(preview);
  const previewTotal = getPreviewTotal(preview);

  return (
    <div className="animate-fade-up space-y-6">
      {toast && (
        <div
          className={`fixed right-5 top-5 z-[200] rounded-2xl px-5 py-3 text-sm font-bold shadow-xl ${toast.ok ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}
        >
          {toast.message}
        </div>
      )}

      <div className="flex flex-col gap-4 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-950">
            Outreach & Scheduled Calls
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Create immediate, scheduled, batch, monthly, and custom outbound
            calls.
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
            Scheduled Calls
          </button>
        </div>
      </div>

      {activeTab === "scheduled" ? (
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-lg font-black text-slate-900">
                Scheduled calls
              </h3>
              <p className="text-xs text-slate-400">
                Completed, failed, and cancelled schedules are greyed out.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() =>
                  setSelectedScheduleIds((current) =>
                    pageScheduleIds.every((id) => current.includes(id))
                      ? current.filter((id) => !pageScheduleIds.includes(id))
                      : Array.from(new Set([...current, ...pageScheduleIds])),
                  )
                }
                className="rounded-xl border border-slate-200 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:border-slate-300"
              >
                {pageScheduleIds.length > 0 &&
                pageScheduleIds.every((id) => selectedScheduleIds.includes(id))
                  ? "Clear Page"
                  : "Select Page"}
              </button>
              {selectedScheduleIds.length > 0 && (
                <button
                  onClick={() =>
                    openDeleteModal({
                      id: "bulk",
                      name: `${selectedScheduleIds.length} selected schedules`,
                      bulk: true,
                    })
                  }
                  className="rounded-xl border border-red-100 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-red-500 hover:bg-red-50"
                >
                  Delete Selected
                </button>
              )}
              <button
                onClick={() => void loadSchedules()}
                disabled={busy === "load-schedules"}
                className="rounded-xl border border-slate-200 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:border-slate-300 disabled:opacity-50"
              >
                {busy === "load-schedules" ? "Loading..." : "Refresh"}
              </button>
            </div>
          </div>

          {schedules.length === 0 ? (
            <div className="rounded-3xl border-2 border-dashed border-slate-200 py-16 text-center">
              <p className="text-base font-black text-slate-900">
                No schedules yet
              </p>
              <p className="mt-1 text-sm text-slate-400">
                Create a scheduled call to see it here.
              </p>
            </div>
          ) : (
            <div className="space-y-3 opacity-100 transition-opacity">
              {pagedSchedules.map((schedule, index) => {
                const scheduleId = getScheduleId(
                  schedule,
                  (schedulePage - 1) * PAGE_SIZE + index,
                );
                const agent = agents.find(
                  (item) =>
                    item.id ===
                    (schedule.voiceAgentId || schedule.voice_agent_id),
                );
                const status = getScheduleStatus(schedule);
                const completed = isDoneStatus(status);
                return (
                  <div
                    key={scheduleId}
                    className={`rounded-3xl border p-4 transition-all ${completed ? "border-slate-100 bg-slate-50 opacity-70" : "border-slate-200 bg-white"}`}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex gap-3">
                        <input
                          type="checkbox"
                          checked={selectedScheduleIds.includes(scheduleId)}
                          onChange={() =>
                            setSelectedScheduleIds((current) =>
                              current.includes(scheduleId)
                                ? current.filter((id) => id !== scheduleId)
                                : [...current, scheduleId],
                            )
                          }
                          className="mt-1 h-4 w-4"
                        />
                        <button
                          type="button"
                          onClick={() => setSelectedSchedule(schedule)}
                          className="text-left"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-black text-slate-900">
                              {schedule.name || "Scheduled call"}
                            </p>
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                              {formatScheduleType(
                                schedule.scheduleType || schedule.schedule_type,
                              )}
                            </span>
                            <span
                              className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-widest ${statusClass(status)}`}
                            >
                              {status}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            {agent?.name || "Agent"} ·{" "}
                            {schedule.fromNumber ||
                              schedule.from_number ||
                              "No from number"}{" "}
                            · {recipientSummary(schedule)}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            {humanDateTime(
                              schedule.startAt || schedule.start_at,
                            )}{" "}
                            ·{" "}
                            {schedule.callPurpose ||
                              schedule.call_purpose ||
                              "No purpose shown"}
                          </p>
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {!completed && (
                          <button
                            onClick={() =>
                              void handleCancelSchedule(scheduleId)
                            }
                            disabled={busy === `cancel-${scheduleId}`}
                            className="rounded-xl border border-amber-200 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        )}
                        <button
                          onClick={() =>
                            openDeleteModal({
                              id: scheduleId,
                              name: schedule.name || "Scheduled call",
                            })
                          }
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
              {schedules.length > PAGE_SIZE && (
                <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs font-bold text-slate-400">
                    Showing {(schedulePage - 1) * PAGE_SIZE + 1}-
                    {Math.min(schedulePage * PAGE_SIZE, schedules.length)} of{" "}
                    {schedules.length} schedules
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setSchedulePage((page) => Math.max(1, page - 1))
                      }
                      disabled={schedulePage <= 1}
                      className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-black text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <span className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-black text-slate-600">
                      Page {schedulePage} of {totalSchedulePages}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setSchedulePage((page) =>
                          Math.min(totalSchedulePages, page + 1),
                        )
                      }
                      disabled={schedulePage >= totalSchedulePages}
                      className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-black text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.35fr_0.65fr]">
          <div className="space-y-5">
            <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <p className="mb-4 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
                Call type
              </p>
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
            </section>

            <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <p className="mb-4 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
                Agent and number
              </p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-xs font-bold text-slate-500">
                    Agent
                  </span>
                  <select
                    value={voiceAgentId}
                    onChange={(event) => setVoiceAgentId(event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-amber-300"
                  >
                    {agents.map((agent: AgentConfig) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name} ({agent.direction})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-bold text-slate-500">
                    From number
                  </span>
                  <select
                    value={fromNumber}
                    onChange={(event) => setFromNumber(event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-amber-300"
                  >
                    <option value="">Choose number</option>
                    {assignedNumbers.map((number) => (
                      <option key={getPhone(number)} value={getPhone(number)}>
                        {getPhone(number)}
                        {getAssignedAgentId(number) === voiceAgentId
                          ? " · assigned"
                          : ""}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>

            <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <p className="mb-4 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
                Recipients
              </p>
              <div className="mb-4 flex rounded-2xl bg-slate-100 p-1 text-xs font-black uppercase tracking-widest text-slate-500">
                <button
                  onClick={() => {
                    setRecipientMode("direct");
                    setPreview(null);
                  }}
                  className={`flex-1 rounded-xl px-4 py-2 ${recipientMode === "direct" ? "bg-white text-slate-950 shadow-sm" : ""}`}
                >
                  Direct
                </button>
                <button
                  onClick={() => {
                    setRecipientMode("leads");
                    setPreview(null);
                  }}
                  className={`flex-1 rounded-xl px-4 py-2 ${recipientMode === "leads" ? "bg-white text-slate-950 shadow-sm" : ""}`}
                >
                  Leads
                </button>
              </div>
              {recipientMode === "direct" ? (
                <div className="space-y-3">
                  {directRecipients.map((recipient, index) => (
                    <div key={recipient.id} className="space-y-1">
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto]">
                        <input
                          value={recipient.name}
                          onChange={(event) =>
                            updateRecipient(
                              recipient.id,
                              "name",
                              event.target.value,
                            )
                          }
                          placeholder={`Recipient ${index + 1} name`}
                          className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-amber-300"
                        />
                        <input
                          value={recipient.displayPhone}
                          onChange={(event) =>
                            updateRecipient(
                              recipient.id,
                              "phone",
                              event.target.value,
                            )
                          }
                          placeholder="+1 (555) 123-4567"
                          className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-amber-300"
                        />
                        <button
                          onClick={() => removeRecipient(recipient.id)}
                          className="rounded-2xl border border-red-100 px-4 py-3 text-xs font-black uppercase tracking-widest text-red-500 hover:bg-red-50"
                        >
                          Remove
                        </button>
                      </div>
                      {recipient.phone && (
                        <p className="text-[11px] font-bold text-emerald-600">
                          Will call {recipient.phone}
                        </p>
                      )}
                      {recipient.phoneError && (
                        <p className="text-[11px] font-bold text-red-500">
                          {recipient.phoneError}
                        </p>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={() =>
                      setDirectRecipients((current) => [
                        ...current,
                        makeRecipient(),
                      ])
                    }
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-500 hover:border-slate-300"
                  >
                    + Add recipient
                  </button>
                </div>
              ) : (
                <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                  {leads.length === 0 ? (
                    <p className="text-sm text-slate-400">
                      No leads available yet.
                    </p>
                  ) : (
                    leads.map((lead) => (
                      <label
                        key={lead.id}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3"
                      >
                        <div>
                          <p className="text-sm font-black text-slate-900">
                            {lead.name}
                          </p>
                          <p className="text-xs text-slate-400">
                            {lead.phone || lead.email || "No contact"}
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={selectedLeadIds.includes(lead.id)}
                          onChange={() => toggleLead(lead.id)}
                        />
                      </label>
                    ))
                  )}
                </div>
              )}
            </section>

            <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <p className="mb-4 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
                Purpose and timing
              </p>
              <div className="space-y-4">
                <input
                  value={scheduleName}
                  onChange={(event) => setScheduleName(event.target.value)}
                  placeholder="Schedule name, e.g. Renewal follow-up"
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-amber-300"
                />
                <textarea
                  value={callPurpose}
                  onChange={(event) => {
                    setCallPurpose(event.target.value);
                    setPreview(null);
                  }}
                  placeholder="Required: why is the agent calling?"
                  rows={3}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-amber-300"
                />
                <textarea
                  value={customInstructions}
                  onChange={(event) => {
                    setCustomInstructions(event.target.value);
                    setPreview(null);
                  }}
                  placeholder="Optional: call-specific guidance"
                  rows={3}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-amber-300"
                />
                {callType !== "call_now" && (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <label className="space-y-1.5">
                      <span className="text-xs font-bold text-slate-500">
                        Start date
                      </span>
                      <input
                        type="date"
                        min={todayIso()}
                        max={sixMonthsFromToday()}
                        value={startLocalDate}
                        onChange={(event) => {
                          setStartLocalDate(event.target.value);
                          setPreview(null);
                        }}
                        className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                      />
                    </label>
                    <TimezonePicker
                      value={timezone}
                      onChange={(value) => {
                        setTimezone(value);
                        setPreview(null);
                      }}
                    />
                    {callType !== "one_time_batch" &&
                    callType !== "custom_rule" ? (
                      <TimePicker
                        label="Time"
                        value={startTime}
                        onChange={(value) => {
                          setStartTime(value);
                          setPreview(null);
                        }}
                      />
                    ) : (
                      <div className="md:col-span-3">
                        <TimeListEditor
                          values={startTimes}
                          onChange={(values) => {
                            setStartTimes(values);
                            setPreview(null);
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}
                {(callType === "one_time_batch" ||
                  callType === "custom_rule") && (
                  <label className="block space-y-1.5">
                    <span className="text-xs font-bold text-slate-500">
                      Batch mode
                    </span>
                    <select
                      value={batchMode}
                      onChange={(event) =>
                        setBatchMode(event.target.value as BatchMode)
                      }
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                    >
                      <option value="spread_recipients_across_times">
                        Spread recipients across times
                      </option>
                      <option value="all_recipients_each_time">
                        All recipients each time
                      </option>
                    </select>
                  </label>
                )}
                {callType === "recurring_monthly" && (
                  <div className="space-y-4 rounded-3xl bg-slate-50 p-4">
                    <label className="block space-y-1.5">
                      <span className="text-xs font-bold text-slate-500">
                        Number of months
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={6}
                        value={repeatCount}
                        onChange={(event) => {
                          setRepeatCount(Number(event.target.value));
                          setPreview(null);
                        }}
                        className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                      />
                    </label>
                    <div>
                      <p className="mb-2 text-xs font-bold text-slate-500">
                        Days of the month
                      </p>
                      <div className="grid grid-cols-7 gap-2">
                        {Array.from({ length: 31 }, (_, i) => i + 1).map(
                          (day) => (
                            <button
                              key={day}
                              onClick={() => toggleMonthlyDay(day)}
                              className={`rounded-xl px-2 py-2 text-xs font-black ${monthlyDays.includes(day) ? "bg-slate-900 text-white" : "bg-white text-slate-500"}`}
                            >
                              {day}
                            </button>
                          ),
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {callType === "custom_rule" && (
                  <div className="space-y-4 rounded-3xl bg-slate-50 p-4">
                    <label className="block space-y-1.5">
                      <span className="text-xs font-bold text-slate-500">
                        End date
                      </span>
                      <input
                        type="date"
                        min={startLocalDate}
                        max={sixMonthsFromToday()}
                        value={customEndDate}
                        onChange={(event) => {
                          setCustomEndDate(event.target.value);
                          setPreview(null);
                        }}
                        className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                      />
                    </label>
                    <div>
                      <p className="mb-2 text-xs font-bold text-slate-500">
                        Call days
                      </p>
                      <div className="grid grid-cols-7 gap-2">
                        {DAYS.map((day) => (
                          <button
                            key={day.key}
                            onClick={() => toggleWeekday(day.key)}
                            className={`rounded-xl px-3 py-3 text-[10px] font-black uppercase tracking-widest ${weekdayRules.includes(day.key) ? "bg-slate-900 text-white" : "bg-white text-slate-500"}`}
                          >
                            {day.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <label className="space-y-1.5">
                    <span className="text-xs font-bold text-slate-500">
                      Max attempts
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={maxAttemptsPerLead}
                      onChange={(event) =>
                        setMaxAttemptsPerLead(Number(event.target.value))
                      }
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-bold text-slate-500">
                      Retry delay
                    </span>
                    <select
                      value={retryDelayMinutes}
                      onChange={(event) =>
                        setRetryDelayMinutes(Number(event.target.value))
                      }
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                    >
                      <option value={30}>30 minutes</option>
                      <option value={60}>1 hour</option>
                      <option value={180}>3 hours</option>
                      <option value={1440}>Next day</option>
                    </select>
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-bold text-slate-500">
                      Voicemail
                    </span>
                    <select
                      value={voicemailBehavior}
                      onChange={(event) =>
                        setVoicemailBehavior(event.target.value)
                      }
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                    >
                      <option value="hangup">Hang up</option>
                      <option value="leave_message">Leave message</option>
                    </select>
                  </label>
                </div>
              </div>
            </section>
          </div>

          <aside className="space-y-5">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
                Preview and create
              </p>
              <div className="mt-4 space-y-3 rounded-3xl bg-slate-50 p-4 text-sm text-slate-600">
                <p>
                  <span className="font-black text-slate-900">Type:</span>{" "}
                  {formatScheduleType(callType)}
                </p>
                <p>
                  <span className="font-black text-slate-900">Agent:</span>{" "}
                  {selectedAgent?.name || "None"}
                </p>
                <p>
                  <span className="font-black text-slate-900">From:</span>{" "}
                  {fromNumber || "Choose number"}
                </p>
                <p>
                  <span className="font-black text-slate-900">Recipients:</span>{" "}
                  {recipientMode === "direct"
                    ? getValidDirectRecipients().length
                    : selectedLeadIds.length}
                </p>
              </div>
              {callType !== "call_now" && (
                <button
                  onClick={() => void handlePreview()}
                  disabled={busy === "preview"}
                  className="mt-4 w-full rounded-2xl border border-slate-200 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-600 hover:border-slate-300 disabled:opacity-50"
                >
                  {busy === "preview" ? "Previewing..." : "Preview calls"}
                </button>
              )}
              <button
                onClick={() => void handleCreate()}
                disabled={busy === "create" || isPending}
                className="mt-3 w-full rounded-2xl bg-slate-900 px-4 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-amber-600 disabled:opacity-50"
              >
                {busy === "create"
                  ? "Working..."
                  : callType === "call_now"
                    ? "Place Call"
                    : "Create Schedule"}
              </button>
              {preview && (
                <div className="mt-4 rounded-3xl border border-emerald-100 bg-emerald-50 p-4">
                  <p className="text-sm font-black text-emerald-800">
                    {previewTotal > 0
                      ? `${previewTotal} calls ready to schedule`
                      : "No eligible calls were generated for this preview"}
                  </p>
                  {previewTotal === 0 && (
                    <p className="mt-1 text-xs font-bold text-emerald-700/80">
                      Adjust the recipients, date, time, or recurrence rules and
                      preview again.
                    </p>
                  )}
                  {previewCalls.length > 0 && (
                    <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-2xl bg-white p-3 text-[11px] text-slate-500">
                      {JSON.stringify(previewCalls, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      <AppModal
        open={!!validationModal}
        onClose={() => setValidationModal(null)}
        title={validationModal?.title || "Schedule warning"}
        description="Please review this before continuing."
        size="md"
        footer={
          <button
            type="button"
            onClick={() => setValidationModal(null)}
            className="w-full rounded-xl bg-slate-900 py-3 text-sm font-black text-white hover:bg-amber-600"
          >
            Got it
          </button>
        }
      >
        <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-bold leading-6 text-amber-800">
          {validationModal?.message}
        </div>
      </AppModal>

      <AppModal
        open={!!selectedSchedule}
        onClose={() => setSelectedSchedule(null)}
        title={selectedSchedule?.name || "Schedule details"}
        description={
          selectedSchedule
            ? `${formatScheduleType(selectedSchedule.scheduleType || selectedSchedule.schedule_type)} · ${getScheduleStatus(selectedSchedule)}`
            : undefined
        }
        size="lg"
        footer={
          <button
            type="button"
            onClick={() => setSelectedSchedule(null)}
            className="w-full rounded-xl border border-slate-200 py-3 text-sm font-black text-slate-600 hover:bg-slate-50"
          >
            Close
          </button>
        }
      >
        {selectedSchedule && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  From
                </p>
                <p className="mt-1 font-bold text-slate-900">
                  {selectedSchedule.fromNumber ||
                    selectedSchedule.from_number ||
                    "—"}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Timezone
                </p>
                <p className="mt-1 font-bold text-slate-900">
                  {selectedSchedule.timezone || "—"}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4 md:col-span-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Recipients
                </p>
                <p className="mt-1 font-medium text-slate-700">
                  {recipientSummary(selectedSchedule)}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4 md:col-span-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Purpose
                </p>
                <p className="mt-1 font-medium text-slate-700">
                  {selectedSchedule.callPurpose ||
                    selectedSchedule.call_purpose ||
                    "—"}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Created
                </p>
                <p className="mt-1 font-bold text-slate-900">
                  {humanDateTime(
                    selectedSchedule.createdAt || selectedSchedule.created_at,
                  )}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Starts
                </p>
                <p className="mt-1 font-bold text-slate-900">
                  {humanDateTime(
                    selectedSchedule.startAt || selectedSchedule.start_at,
                  )}
                </p>
              </div>
            </div>
          </div>
        )}
      </AppModal>

      <AppModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete schedule"
        description="This cannot be undone."
        size="md"
        footer={
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              disabled={busy === "bulk-delete" || !!busy?.startsWith("delete-")}
              className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-black text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() =>
                deleteTarget?.bulk
                  ? void handleBulkDelete()
                  : void confirmDeleteSchedule()
              }
              disabled={busy === "bulk-delete" || !!busy?.startsWith("delete-")}
              className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-black text-white hover:bg-red-700 disabled:opacity-50"
            >
              {busy === "bulk-delete" || !!busy?.startsWith("delete-")
                ? "Deleting…"
                : "Yes, delete permanently"}
            </button>
          </div>
        }
      >
        <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          Permanently deleting{" "}
          <strong>
            {deleteTarget?.bulk
              ? `${selectedScheduleIds.length} selected schedules`
              : deleteTarget?.name || "this schedule"}
          </strong>
          . This cannot be recovered.
        </div>
      </AppModal>
    </div>
  );
};

export default OutreachScheduler;
