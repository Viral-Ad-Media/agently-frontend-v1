import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import AppModal from "../components/AppModal";
import { Organization, Lead } from "../types";
import { voiceCallsApi, TwilioNumberRecord } from "../services/voiceCallsApi";
import {
  formatTimezoneOptionLabel,
  getAvailableTimezones,
  resolveOrgTimezone,
  resolveWorkspaceTimezone,
} from "@/utils/timezones";

type CallMode = "call-now" | "schedule";
type RecipientSource = "manual" | "bulk" | "lead" | "tag";

type Recipient = {
  id: string;
  name: string;
  phone: string;
  source?: RecipientSource;
  tag?: string;
};

type CampaignForm = {
  mode: CallMode;
  name: string;
  voiceAgentId: string;
  fromNumberId: string;
  fromNumber: string;
  manualRecipientName: string;
  manualRecipientPhone: string;
  bulkRecipientText: string;
  selectedTag: string;
  timezone: string;
  scheduleDateInput: string;
  scheduleTimeInput: string;
  syncExistingLeads: boolean;
};

type OutreachSchedule = {
  id?: string;
  scheduleId?: string;
  name?: string;
  status?: string;
  scheduleType?: string;
  schedule_type?: string;
  voiceAgentId?: string;
  voice_agent_id?: string;
  timezone?: string;
  callPurpose?: string;
  call_purpose?: string;
  startDate?: string;
  start_date?: string;
  startAt?: string;
  start_at?: string;
  scheduledFor?: string;
  scheduled_for?: string;
  directRecipients?: Recipient[];
  direct_recipients?: Recipient[];
  recipients?: Recipient[];
  createdAt?: string;
  created_at?: string;
  [key: string]: unknown;
};

interface OutreachSchedulerProps {
  org: Organization;
  leads?: Lead[];
  onChanged?: () => void;
}

const MODE_OPTIONS: Array<{
  value: CallMode;
  label: string;
  description: string;
}> = [
  {
    value: "call-now",
    label: "Call Now",
    description: "Start live calls for one or multiple recipients immediately.",
  },
  {
    value: "schedule",
    label: "Schedule Calls",
    description:
      "Pick one or many dates and times for single or bulk campaigns.",
  },
];

const normalizeCallablePhone = (value: string) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (!digits) return raw;
  if (hasPlus) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits.length >= 8 ? `+${digits}` : raw;
};

const isLikelyCallablePhone = (value: string) =>
  /^\+[1-9]\d{7,14}$/.test(normalizeCallablePhone(value));

const todayStr = () => new Date().toISOString().slice(0, 10);

const toLocalDateValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatDateDisplay = (value: string) => {
  if (!value) return "Choose date";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
};

const addMonths = (date: Date, months: number) => {
  const next = new Date(date);
  const targetMonth = next.getMonth() + months;
  const currentDate = next.getDate();
  next.setMonth(targetMonth);
  if (next.getDate() < currentDate) next.setDate(0);
  return next;
};

const maxScheduleDateStr = () =>
  addMonths(new Date(), 6).toISOString().slice(0, 10);
const SELECTED_AGENT_STORAGE_KEY = "agently:lastSelectedAgentId";
const LEGACY_SELECTED_AGENT_STORAGE_KEYS = [
  "agently:selected-agent-id",
  "agently:selected-voice-agent-id",
];

const readRememberedAgentId = () => {
  if (typeof window === "undefined") return "";
  return String(
    window.localStorage.getItem(SELECTED_AGENT_STORAGE_KEY) ||
      LEGACY_SELECTED_AGENT_STORAGE_KEYS.map((key) =>
        window.localStorage.getItem(key),
      ).find(Boolean) ||
      "",
  ).trim();
};

const isDateWithinScheduleWindow = (dateValue: string) => {
  if (!dateValue) return false;
  const selected = new Date(`${dateValue}T00:00:00`);
  const today = new Date(`${todayStr()}T00:00:00`);
  const max = new Date(`${maxScheduleDateStr()}T23:59:59`);
  return selected >= today && selected <= max;
};

const uniqueSorted = (values: string[]) =>
  [...new Set(values.filter(Boolean))].sort();

const getAgentId = (agent: unknown) => {
  const raw = (agent || {}) as Record<string, unknown>;
  return String(raw.id || raw.voiceAgentId || raw.voice_agent_id || "").trim();
};

const getAgentName = (agent: unknown) => {
  const raw = (agent || {}) as Record<string, unknown>;
  return String(
    raw.name ||
      raw.label ||
      raw.displayName ||
      raw.display_name ||
      "Voice Agent",
  ).trim();
};

const getAgentDirection = (agent: unknown) => {
  const raw = (agent || {}) as Record<string, unknown>;
  return String(raw.direction || raw.callDirection || "outbound").toLowerCase();
};

const getAgentCallPurpose = (agent: unknown) => {
  const raw = (agent || {}) as Record<string, unknown>;
  return String(
    raw.defaultCallPurpose ||
      raw.default_call_purpose ||
      raw.callPurpose ||
      raw.call_purpose ||
      raw.purpose ||
      "",
  ).trim();
};

const getAgentInstructions = (agent: unknown) => {
  const raw = (agent || {}) as Record<string, unknown>;
  return String(
    raw.defaultCallInstructions ||
      raw.default_call_instructions ||
      raw.customInstructions ||
      raw.custom_instructions ||
      raw.instructions ||
      raw.prompt ||
      raw.systemPrompt ||
      raw.system_prompt ||
      "",
  ).trim();
};

const getNumberId = (number: TwilioNumberRecord) =>
  String(
    number.id ||
      number.numberId ||
      number.twilioNumberId ||
      number.phone_sid ||
      number.phoneSid ||
      number.sid ||
      "",
  ).trim();

const getNumberValue = (number: TwilioNumberRecord) =>
  String(
    number.phone_number ||
      number.phoneNumber ||
      number.friendly_name ||
      number.friendlyName ||
      "",
  ).trim();

const getAssignedAgentIds = (number: TwilioNumberRecord) => {
  const ids = new Set<string>();
  const add = (value: unknown) => {
    const id = String(value || "").trim();
    if (id) ids.add(id);
  };
  add(number.assigned_voice_agent_id);
  add(number.assignedVoiceAgentId);
  add(number.voiceAgentId);
  add(number.agentId);
  const lists = [number.assignedAgents, number.outboundAssignedAgents];
  lists.forEach((list) => {
    if (!Array.isArray(list)) return;
    list.forEach((agent) => add(agent?.id));
  });
  return ids;
};

const leadId = (lead: Lead, index: number) => {
  const raw = lead as Lead & Record<string, unknown>;
  return String(
    raw.id || raw.leadId || raw.lead_id || raw.phone || `lead-${index}`,
  ).trim();
};

const leadName = (lead: Lead) => {
  const raw = lead as Lead & Record<string, unknown>;
  return String(
    raw.name ||
      raw.fullName ||
      raw.full_name ||
      raw.firstName ||
      raw.first_name ||
      "Lead",
  ).trim();
};

const leadPhone = (lead: Lead) => {
  const raw = lead as Lead & Record<string, unknown>;
  return String(
    raw.phone || raw.phoneNumber || raw.phone_number || raw.mobile || "",
  ).trim();
};

const parseBulkRecipients = (
  value: string,
  source: RecipientSource = "bulk",
): Recipient[] =>
  String(value || "")
    .split(/\n|;/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const parts = line
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
      if (parts.length >= 2) {
        const maybePhone = parts[parts.length - 1];
        const phone = normalizeCallablePhone(maybePhone);
        return {
          id: `${source}-${phone || index}`,
          name: parts.slice(0, -1).join(", ") || "Recipient",
          phone,
          source,
        };
      }
      const phone = normalizeCallablePhone(line);
      return {
        id: `${source}-${phone || index}`,
        name: "Recipient",
        phone,
        source,
      };
    })
    .filter((recipient) => isLikelyCallablePhone(recipient.phone));

const toDateTimeLabel = (value?: string) => {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

const getScheduleId = (schedule: OutreachSchedule) =>
  String(schedule.id || schedule.scheduleId || "").trim();

const unwrapScheduleList = (payload: unknown): OutreachSchedule[] => {
  if (Array.isArray(payload)) return payload as OutreachSchedule[];
  if (!payload || typeof payload !== "object") return [];
  const raw = payload as Record<string, unknown>;
  const list = raw.schedules || raw.data || raw.results || raw.items;
  return Array.isArray(list) ? (list as OutreachSchedule[]) : [];
};

const getScheduleRecipients = (schedule: OutreachSchedule) => {
  const direct =
    schedule.directRecipients ||
    schedule.direct_recipients ||
    schedule.recipients;
  return Array.isArray(direct) ? direct.length : 0;
};

const buildRecipientKey = (recipient: Pick<Recipient, "phone">) =>
  normalizeCallablePhone(recipient.phone);

const OutreachScheduler: React.FC<OutreachSchedulerProps> = ({
  org,
  leads = [],
  onChanged,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useMemo(
    () => new URLSearchParams(location.search),
    [location.search],
  );
  const defaultTimezone = resolveOrgTimezone(org);

  const orgRecord = org as unknown as Record<string, unknown>;
  const rawAgents = useMemo(() => {
    const candidates = [
      orgRecord.voiceAgents,
      orgRecord.voice_agents,
      orgRecord.agents,
    ];
    const first = candidates.find(Array.isArray) as unknown[] | undefined;
    const active = orgRecord.agent ? [orgRecord.agent] : [];
    const merged = [...(first || []), ...active];
    const seen = new Set<string>();
    return merged.filter((agent) => {
      const id = getAgentId(agent);
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [
    orgRecord.voiceAgents,
    orgRecord.voice_agents,
    orgRecord.agents,
    orgRecord.agent,
  ]);

  const outboundAgents = useMemo(() => {
    const outbound = rawAgents.filter(
      (agent) => getAgentDirection(agent) !== "inbound",
    );
    return outbound.length ? outbound : rawAgents;
  }, [rawAgents]);

  const agentMap = useMemo(() => {
    const map = new Map<string, unknown>();
    rawAgents.forEach((agent) => map.set(getAgentId(agent), agent));
    return map;
  }, [rawAgents]);

  const initialAgentId = String(params.get("agentId") || "").trim();
  const activeAgentId = getAgentId(orgRecord.agent);
  const rememberedAgentId = readRememberedAgentId();
  const rememberedAgentIsAvailable = rawAgents.some(
    (agent) => getAgentId(agent) === rememberedAgentId,
  );
  const fallbackAgentId =
    initialAgentId ||
    (rememberedAgentIsAvailable ? rememberedAgentId : "") ||
    activeAgentId ||
    getAgentId(outboundAgents[0]) ||
    getAgentId(rawAgents[0]);
  const initialMode = ((): CallMode => {
    const mode = String(params.get("mode") || "call-now").trim();
    return mode === "schedule" || mode === "batch" ? "schedule" : "call-now";
  })();

  const [form, setForm] = useState<CampaignForm>(() => ({
    mode: initialMode,
    name: params.get("agentName")
      ? `${params.get("agentName")} campaign`
      : "New call campaign",
    voiceAgentId: fallbackAgentId,
    fromNumberId: "",
    fromNumber: "",
    manualRecipientName: "",
    manualRecipientPhone: "",
    bulkRecipientText: "",
    selectedTag: params.get("tag") || "",
    timezone: resolveWorkspaceTimezone(
      params.get("timezone") || defaultTimezone,
    ),
    scheduleDateInput: todayStr(),
    scheduleTimeInput: "",
    syncExistingLeads: true,
  }));

  const [numbers, setNumbers] = useState<TwilioNumberRecord[]>([]);
  const [schedules, setSchedules] = useState<OutreachSchedule[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [scheduleDates, setScheduleDates] = useState<string[]>([todayStr()]);
  const [scheduleTimes, setScheduleTimes] = useState<string[]>([]);
  const [leadSearch, setLeadSearch] = useState("");
  const [loadingNumbers, setLoadingNumbers] = useState(false);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [messageModal, setMessageModal] = useState<{
    title: string;
    message: string;
    ok: boolean;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OutreachSchedule | null>(
    null,
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarPlacement, setCalendarPlacement] = useState<"top" | "bottom">(
    "bottom",
  );
  const [calendarMonth, setCalendarMonth] = useState<Date>(
    () => new Date(`${todayStr()}T00:00:00`),
  );
  const [bulkOpen, setBulkOpen] = useState(false);
  const [recipientImportMode, setRecipientImportMode] = useState<
    "" | "tag" | "leads"
  >("");
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const [importedTags, setImportedTags] = useState<string[]>([]);
  const tagDropdownRef = useRef<HTMLDivElement | null>(null);
  const calendarRef = useRef<HTMLDivElement | null>(null);

  const selectedAgent = agentMap.get(form.voiceAgentId) || null;
  const selectedAgentName = selectedAgent
    ? getAgentName(selectedAgent)
    : params.get("agentName") || "Voice Agent";
  const selectedNumber =
    numbers.find((number) => getNumberId(number) === form.fromNumberId) || null;
  const routeCallPurpose = String(params.get("callPurpose") || "").trim();
  const routeInstructions = String(params.get("instructions") || "").trim();
  const agentCallPurpose =
    getAgentCallPurpose(selectedAgent) || routeCallPurpose;
  const agentInstructions =
    getAgentInstructions(selectedAgent) || routeInstructions;
  const effectiveInstructions = agentInstructions;

  const availableNumbers = useMemo(() => {
    if (!form.voiceAgentId) return numbers;
    const assigned = numbers.filter((number) =>
      getAssignedAgentIds(number).has(form.voiceAgentId),
    );
    return assigned.length ? assigned : numbers;
  }, [numbers, form.voiceAgentId]);

  const leadTags = useMemo(() => {
    const set = new Set<string>();
    leads.forEach((lead) => (lead.tags || []).forEach((tag) => set.add(tag)));
    return [...set].sort();
  }, [leads]);

  const filteredLeads = useMemo(() => {
    const query = leadSearch.trim().toLowerCase();
    return leads.filter((lead, index) => {
      const phone = leadPhone(lead);
      if (!isLikelyCallablePhone(phone)) return false;
      if (!query) return true;
      const searchable =
        `${leadId(lead, index)} ${leadName(lead)} ${phone} ${(lead.tags || []).join(" ")}`.toLowerCase();
      return searchable.includes(query);
    });
  }, [leads, leadSearch]);

  const scheduleWindows = useMemo(() => {
    const dates = uniqueSorted(scheduleDates);
    const times = uniqueSorted(scheduleTimes);
    return dates.flatMap((date) =>
      times.map((time) => ({ date, time, scheduledFor: `${date}T${time}:00` })),
    );
  }, [scheduleDates, scheduleTimes]);

  useEffect(() => {
    setForm((current) => {
      if (current.voiceAgentId || !fallbackAgentId) return current;
      return { ...current, voiceAgentId: fallbackAgentId };
    });
  }, [fallbackAgentId]);

  useEffect(() => {
    let mounted = true;
    setLoadingNumbers(true);
    void voiceCallsApi.phoneNumbers
      .getTwilioNumbers()
      .then((payload) => {
        if (!mounted) return;
        setNumbers(payload.numbers || []);
      })
      .catch(() => {
        if (mounted) setNumbers([]);
      })
      .finally(() => {
        if (mounted) setLoadingNumbers(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    setLoadingSchedules(true);
    void voiceCallsApi.outreach
      .getOutreachSchedules()
      .then((payload) => {
        if (!mounted) return;
        setSchedules(unwrapScheduleList(payload));
      })
      .catch(() => {
        if (mounted) setSchedules([]);
      })
      .finally(() => {
        if (mounted) setLoadingSchedules(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      const insideTagDropdown = Boolean(
        tagDropdownRef.current?.contains(target),
      );
      const insideCalendar = Boolean(calendarRef.current?.contains(target));
      if (!insideTagDropdown) setTagDropdownOpen(false);
      if (!insideCalendar) setCalendarOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, []);

  useEffect(() => {
    if (!availableNumbers.length) return;
    const currentStillAvailable = availableNumbers.some(
      (number) => getNumberId(number) === form.fromNumberId,
    );
    if (currentStillAvailable) return;
    const first = availableNumbers[0];
    setForm((current) => ({
      ...current,
      fromNumberId: getNumberId(first),
      fromNumber: getNumberValue(first),
    }));
  }, [availableNumbers, form.fromNumberId]);

  const updateForm = <K extends keyof CampaignForm>(
    key: K,
    value: CampaignForm[K],
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const showMessage = (title: string, message: string, ok = true) => {
    setMessageModal({ title, message, ok });
  };

  const addRecipients = (nextRecipients: Recipient[], clearDraft = false) => {
    const valid = nextRecipients
      .map((recipient) => ({
        ...recipient,
        phone: normalizeCallablePhone(recipient.phone),
      }))
      .filter((recipient) => isLikelyCallablePhone(recipient.phone));
    if (!valid.length) {
      showMessage(
        "No valid recipients",
        "Add at least one callable phone number. US numbers can be entered with or without +1.",
        false,
      );
      return;
    }
    setRecipients((current) => {
      const map = new Map<string, Recipient>();
      current.forEach((recipient) =>
        map.set(buildRecipientKey(recipient), recipient),
      );
      valid.forEach((recipient) =>
        map.set(buildRecipientKey(recipient), {
          ...recipient,
          id: recipient.id || buildRecipientKey(recipient),
        }),
      );
      return [...map.values()];
    });
    if (clearDraft) {
      setForm((current) => ({
        ...current,
        manualRecipientName: "",
        manualRecipientPhone: "",
        bulkRecipientText: "",
      }));
    }
  };

  const addManualRecipient = () => {
    addRecipients(
      [
        {
          id: `manual-${normalizeCallablePhone(form.manualRecipientPhone)}`,
          name: form.manualRecipientName.trim() || "Recipient",
          phone: form.manualRecipientPhone,
          source: "manual",
        },
      ],
      true,
    );
  };

  const addBulkRecipients = () => {
    addRecipients(parseBulkRecipients(form.bulkRecipientText), true);
  };

  const addRecipientsFromTag = (tagValue = form.selectedTag) => {
    const selectedTag = String(tagValue || "").trim();
    if (!selectedTag) {
      showMessage(
        "Select a tag",
        "Choose the lead tag you want to import recipients from.",
        false,
      );
      return;
    }
    const matches = leads
      .filter((lead) => (lead.tags || []).includes(selectedTag))
      .map((lead, index) => ({
        id: `tag-${selectedTag}-${leadId(lead, index)}`,
        name: leadName(lead),
        phone: leadPhone(lead),
        source: "tag" as RecipientSource,
        tag: selectedTag,
      }))
      .filter((recipient) => isLikelyCallablePhone(recipient.phone));
    if (!matches.length) {
      showMessage(
        "No callable recipients",
        `No callable phone numbers were found under the ${selectedTag} tag.`,
        false,
      );
      return;
    }
    addRecipients(matches);
    setImportedTags((current) =>
      current.includes(selectedTag) ? current : [...current, selectedTag],
    );
    updateForm("selectedTag", selectedTag);
    setTagDropdownOpen(false);
  };

  const removeImportedTag = (tagValue: string) => {
    const selectedTag = String(tagValue || "").trim();
    setImportedTags((current) => current.filter((tag) => tag !== selectedTag));
    setRecipients((current) =>
      current.filter(
        (recipient) =>
          !(recipient.source === "tag" && recipient.tag === selectedTag),
      ),
    );
    if (form.selectedTag === selectedTag) updateForm("selectedTag", "");
  };

  const addSelectedLeads = () => {
    const selected = leads
      .map((lead, index) => ({ lead, index, id: leadId(lead, index) }))
      .filter((item) => selectedLeadIds.includes(item.id))
      .map(({ lead, index }) => ({
        id: `lead-${leadId(lead, index)}`,
        name: leadName(lead),
        phone: leadPhone(lead),
        source: "lead" as RecipientSource,
      }));
    addRecipients(selected);
  };

  const removeRecipient = (phone: string) => {
    const key = normalizeCallablePhone(phone);
    setRecipients((current) =>
      current.filter((recipient) => buildRecipientKey(recipient) !== key),
    );
  };

  const addScheduleDate = (dateValue = form.scheduleDateInput) => {
    if (!isDateWithinScheduleWindow(dateValue)) {
      showMessage(
        "Date not allowed",
        `Schedule dates must be between today and ${maxScheduleDateStr()}.`,
        false,
      );
      return;
    }
    setScheduleDates((current) => uniqueSorted([...current, dateValue]));
  };

  const removeScheduleDate = (dateValue: string) => {
    setScheduleDates((current) => current.filter((item) => item !== dateValue));
  };

  const addScheduleTime = (timeValue = form.scheduleTimeInput) => {
    if (!/^\d{2}:\d{2}$/.test(timeValue)) {
      showMessage("Invalid time", "Choose a valid call time.", false);
      return;
    }
    setScheduleTimes((current) => uniqueSorted([...current, timeValue]));
  };

  const removeScheduleTime = (timeValue: string) => {
    setScheduleTimes((current) => current.filter((item) => item !== timeValue));
  };

  const toggleLeadSelection = (id: string) => {
    setSelectedLeadIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  };

  const validate = () => {
    if (!form.voiceAgentId)
      return "Select the voice agent that should make this call.";
    if (!agentCallPurpose.trim())
      return "The selected agent does not have a saved call purpose yet. Add one in the Agent Workspace before launching calls.";
    if (!availableNumbers.length)
      return "Connect or assign a business number before making live calls.";
    if (!form.fromNumberId && !form.fromNumber)
      return "Select the business number this agent should call from.";
    if (!recipients.length)
      return "Add at least one recipient before launching this campaign.";
    if (form.mode !== "call-now") {
      if (!scheduleDates.length) return "Add at least one schedule date.";
      if (!scheduleTimes.length) return "Add at least one schedule time.";
      if (
        scheduleDates.some(
          (dateValue) => !isDateWithinScheduleWindow(dateValue),
        )
      ) {
        return `Schedule dates cannot be earlier than today or later than ${maxScheduleDateStr()}.`;
      }
      if (scheduleWindows.length > 120)
        return "This schedule creates too many call windows. Reduce the selected dates or times.";
    }
    return "";
  };

  const buildBasePayload = () => ({
    name: form.name.trim() || `${selectedAgentName} campaign`,
    voiceAgentId: form.voiceAgentId,
    voice_agent_id: form.voiceAgentId,
    agentId: form.voiceAgentId,
    agent_id: form.voiceAgentId,
    fromNumberId: form.fromNumberId || undefined,
    from_number_id: form.fromNumberId || undefined,
    numberId: form.fromNumberId || undefined,
    fromNumber: selectedNumber
      ? getNumberValue(selectedNumber)
      : form.fromNumber || undefined,
    from_number: selectedNumber
      ? getNumberValue(selectedNumber)
      : form.fromNumber || undefined,
    from: selectedNumber
      ? getNumberValue(selectedNumber)
      : form.fromNumber || undefined,
    callPurpose: agentCallPurpose.trim(),
    call_purpose: agentCallPurpose.trim(),
    agentCallPurpose: agentCallPurpose.trim(),
    agent_call_purpose: agentCallPurpose.trim(),
    purposeSource: "agent_config",
    purpose_source: "agent_config",
    customInstructions: effectiveInstructions,
    custom_instructions: effectiveInstructions,
    agentInstructions: agentInstructions || undefined,
    agent_instructions: agentInstructions || undefined,
    timezone: form.timezone,
    metadata: {
      source: "call_campaigns_workspace",
      openedFromAgentWorkspace: Boolean(params.get("agentId")),
      agentName: selectedAgentName,
      agentCallPurpose: agentCallPurpose.trim(),
      usesAgentConfiguredPurpose: true,
    },
  });

  const buildSchedulePayload = (window: {
    date: string;
    time: string;
    scheduledFor: string;
  }) => {
    const scheduleType = recipients.length > 1 ? "one_time_batch" : "one_time";
    return {
      ...buildBasePayload(),
      name:
        scheduleWindows.length > 1
          ? `${form.name.trim() || selectedAgentName} - ${window.date} ${window.time}`
          : form.name.trim() || `${selectedAgentName} campaign`,
      scheduleType,
      schedule_type: scheduleType,
      directRecipients: recipients,
      direct_recipients: recipients,
      recipients,
      startDate: window.date,
      start_date: window.date,
      startLocalDate: window.date,
      start_local_date: window.date,
      date: window.date,
      startTime: window.time,
      start_time: window.time,
      startLocalTime: window.time,
      start_local_time: window.time,
      time: window.time,
      scheduledFor: window.scheduledFor,
      scheduled_for: window.scheduledFor,
      startTimes: [window.time],
      start_times: [window.time],
      scheduleDates,
      schedule_dates: scheduleDates,
      scheduleWindows,
      schedule_windows: scheduleWindows,
      syncExistingLeads: form.syncExistingLeads,
      sync_existing_leads: form.syncExistingLeads,
    };
  };

  const submitCallNow = async () => {
    const error = validate();
    if (error) {
      showMessage("Check call details", error, false);
      return;
    }
    setBusy("call-now");
    const failures: string[] = [];
    let started = 0;
    try {
      for (const recipient of recipients) {
        try {
          await voiceCallsApi.calls.createOutboundCall({
            ...buildBasePayload(),
            toPhone: recipient.phone,
            to_phone: recipient.phone,
            to: recipient.phone,
            recipientName: recipient.name,
            recipient_name: recipient.name,
            targetName: recipient.name,
            target_name: recipient.name,
            directRecipients: [recipient],
            direct_recipients: [recipient],
          });
          started += 1;
        } catch (error) {
          failures.push(
            `${recipient.name || recipient.phone}: ${error instanceof Error ? error.message : "Call failed"}`,
          );
        }
      }
      if (failures.length) {
        showMessage(
          started ? "Some calls started" : "Calls failed",
          `${started} call${started === 1 ? "" : "s"} started. ${failures.length} failed. ${failures.slice(0, 3).join(" ")}`,
          started > 0,
        );
      } else {
        showMessage(
          "Calls started",
          `Agently started ${started} live call${started === 1 ? "" : "s"}.`,
        );
      }
      onChanged?.();
    } finally {
      setBusy(null);
    }
  };

  const submitSchedule = async () => {
    const error = validate();
    if (error) {
      showMessage("Check campaign details", error, false);
      return;
    }
    setBusy("schedule");
    try {
      for (const window of scheduleWindows) {
        await voiceCallsApi.outreach.createOutreachSchedule(
          buildSchedulePayload(window),
        );
      }
      showMessage(
        "Campaign created",
        `Created ${scheduleWindows.length} scheduled call window${scheduleWindows.length === 1 ? "" : "s"} for ${recipients.length} recipient${recipients.length === 1 ? "" : "s"}.`,
      );
      const next = await voiceCallsApi.outreach.getOutreachSchedules();
      setSchedules(unwrapScheduleList(next));
      onChanged?.();
    } catch (error) {
      showMessage(
        "Campaign failed",
        error instanceof Error
          ? error.message
          : "Could not create this campaign.",
        false,
      );
    } finally {
      setBusy(null);
    }
  };

  const deleteSchedule = async () => {
    if (!deleteTarget) return;
    const id = getScheduleId(deleteTarget);
    if (!id) return;
    setBusy(`delete-${id}`);
    try {
      await voiceCallsApi.outreach.deleteOutreachSchedule(id);
      setSchedules((current) =>
        current.filter((schedule) => getScheduleId(schedule) !== id),
      );
      setDeleteTarget(null);
      showMessage("Campaign deleted", "The call campaign has been removed.");
      onChanged?.();
    } catch (error) {
      showMessage(
        "Delete failed",
        error instanceof Error
          ? error.message
          : "Could not delete this campaign.",
        false,
      );
    } finally {
      setBusy(null);
    }
  };

  const campaignHistory = useMemo(() => schedules.slice(0, 24), [schedules]);

  const calendarMonthLabel = useMemo(() => {
    return new Intl.DateTimeFormat(undefined, {
      month: "long",
      year: "numeric",
    }).format(calendarMonth);
  }, [calendarMonth]);

  const calendarDays = useMemo(() => {
    const monthStart = new Date(
      calendarMonth.getFullYear(),
      calendarMonth.getMonth(),
      1,
    );
    const gridStart = new Date(monthStart);
    gridStart.setDate(monthStart.getDate() - monthStart.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(gridStart);
      day.setDate(gridStart.getDate() + index);
      const value = toLocalDateValue(day);
      return {
        value,
        day: day.getDate(),
        inMonth: day.getMonth() === calendarMonth.getMonth(),
        selected: scheduleDates.includes(value),
        disabled: !isDateWithinScheduleWindow(value),
      };
    });
  }, [calendarMonth, scheduleDates]);

  const changeCalendarMonth = (amount: number) => {
    setCalendarMonth((current) => {
      const next = new Date(current);
      next.setMonth(current.getMonth() + amount, 1);
      return next;
    });
  };

  const pickCalendarDate = (dateValue: string) => {
    updateForm("scheduleDateInput", dateValue);
    addScheduleDate(dateValue);
  };

  const primaryAction =
    form.mode === "call-now" ? submitCallNow : submitSchedule;

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-amber-600">
              Call Campaigns
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
              Start or schedule calls from one workspace
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Choose an outbound agent, select a business number, add one or
              many recipients, and launch calls using the agent purpose saved in
              Agent Workspace.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-700 transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700"
            >
              <i className="fa-solid fa-clock-rotate-left" />
              Campaign History
            </button>
            {params.get("agentId") ? (
              <button
                type="button"
                onClick={() => navigate("/agent")}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-600 transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700"
              >
                <i className="fa-solid fa-chevron-left" />
                Back to agent
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <div className="space-y-6">
        <section className="space-y-6 rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {MODE_OPTIONS.map((option) => {
              const active = form.mode === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => updateForm("mode", option.value)}
                  className={`min-h-[7.5rem] rounded-3xl border p-4 text-left transition-all ${
                    active
                      ? "border-amber-300 bg-amber-50 shadow-sm"
                      : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-700 ring-1 ring-slate-200">
                      <i
                        className={`fa-solid ${option.value === "call-now" ? "fa-phone" : "fa-calendar-days"}`}
                      />
                    </div>
                    {active ? (
                      <i className="fa-solid fa-circle-check text-amber-500" />
                    ) : null}
                  </div>
                  <p
                    className={`mt-3 text-sm font-black ${active ? "text-amber-700" : "text-slate-900"}`}
                  >
                    {option.label}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    {option.description}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <label className="text-xs font-black uppercase tracking-widest text-slate-400">
                Voice Agent
              </label>
              <select
                value={form.voiceAgentId}
                onChange={(event) =>
                  updateForm("voiceAgentId", event.target.value)
                }
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-300/40"
              >
                <option value="">Select voice agent</option>
                {outboundAgents.map((agent) => {
                  const id = getAgentId(agent);
                  return (
                    <option key={id} value={id}>
                      {getAgentName(agent)}
                    </option>
                  );
                })}
              </select>
              {selectedAgent ? (
                <p className="mt-2 text-xs text-slate-400">
                  Currently using{" "}
                  <span className="font-bold text-slate-600">
                    {selectedAgentName}
                  </span>
                  . The call purpose is pulled from this agent.
                </p>
              ) : null}
            </div>

            <div>
              <label className="text-xs font-black uppercase tracking-widest text-slate-400">
                From Number
              </label>
              <select
                value={form.fromNumberId}
                onChange={(event) => {
                  const number = numbers.find(
                    (item) => getNumberId(item) === event.target.value,
                  );
                  setForm((current) => ({
                    ...current,
                    fromNumberId: event.target.value,
                    fromNumber: number ? getNumberValue(number) : "",
                  }));
                }}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-300/40"
              >
                <option value="">
                  {loadingNumbers
                    ? "Loading numbers..."
                    : "Select business number"}
                </option>
                {availableNumbers.map((number) => {
                  const id = getNumberId(number);
                  const value = getNumberValue(number);
                  return (
                    <option key={id || value} value={id}>
                      {value || id}
                    </option>
                  );
                })}
              </select>
              {!availableNumbers.length && !loadingNumbers ? (
                <p className="mt-2 text-xs text-amber-700">
                  No business number is available yet. Connect or assign a
                  number before making live calls.
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <label className="text-xs font-black uppercase tracking-widest text-slate-400">
                Campaign Name
              </label>
              <input
                value={form.name}
                onChange={(event) => updateForm("name", event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-300/40"
                placeholder="Example: Demo follow-up campaign"
              />
            </div>
            <div>
              <label className="text-xs font-black uppercase tracking-widest text-slate-400">
                Timezone
              </label>
              <select
                value={form.timezone}
                onChange={(event) =>
                  updateForm(
                    "timezone",
                    resolveWorkspaceTimezone(event.target.value),
                  )
                }
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-300/40"
              >
                {getAvailableTimezones(form.timezone || defaultTimezone).map(
                  (timezone) => (
                    <option key={timezone} value={timezone}>
                      {formatTimezoneOptionLabel(timezone)}
                    </option>
                  ),
                )}
              </select>
            </div>
          </div>

          <section className="space-y-4 rounded-[2rem] border border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">
                  Recipients
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Add recipients manually, paste a list, or import from your
                  Lead CRM.
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
                {recipients.length} selected
              </span>
            </div>

            <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-3 sm:p-4">
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_auto]">
                <input
                  value={form.manualRecipientName}
                  onChange={(event) =>
                    updateForm("manualRecipientName", event.target.value)
                  }
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-300/40"
                  placeholder="Recipient name"
                />
                <input
                  value={form.manualRecipientPhone}
                  onChange={(event) =>
                    updateForm("manualRecipientPhone", event.target.value)
                  }
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-300/40"
                  placeholder="(123) 456-7890"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={addManualRecipient}
                    className="flex-1 rounded-2xl bg-slate-950 px-4 py-3 text-xs font-black uppercase tracking-widest text-white lg:flex-none"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkOpen((open) => !open)}
                    className={`rounded-2xl border px-4 py-3 text-xs font-black uppercase tracking-widest transition ${bulkOpen ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-200 bg-white text-slate-600 hover:border-amber-300"}`}
                    aria-label="Paste multiple recipients"
                  >
                    <i className="fa-solid fa-list" />
                  </button>
                </div>
              </div>

              {bulkOpen ? (
                <div className="mt-3 rounded-3xl border border-slate-200 bg-white p-3">
                  <textarea
                    value={form.bulkRecipientText}
                    onChange={(event) =>
                      updateForm("bulkRecipientText", event.target.value)
                    }
                    rows={3}
                    className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-300/40"
                    placeholder={
                      "One per line or comma separated:\nJane Doe, (123) 456-7890\n+1 123 456 7890"
                    }
                  />
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-slate-400">
                      {parseBulkRecipients(form.bulkRecipientText).length} valid
                      detected
                    </p>
                    <button
                      type="button"
                      onClick={addBulkRecipients}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black uppercase tracking-widest text-slate-700"
                    >
                      Add pasted list
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="p-0">
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                <select
                  value={recipientImportMode}
                  onChange={(event) =>
                    setRecipientImportMode(
                      event.target.value as "" | "tag" | "leads",
                    )
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-300/40"
                >
                  <option value="">Import recipients</option>
                  <option value="tag">Import from lead tags</option>
                  <option value="leads">Select from Lead CRM</option>
                </select>
                {recipientImportMode === "leads" ? (
                  <button
                    type="button"
                    onClick={addSelectedLeads}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-700 transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700"
                  >
                    Add selected
                  </button>
                ) : null}
              </div>

              {recipientImportMode === "tag" ? (
                <div className="mt-3 space-y-3">
                  <div ref={tagDropdownRef} className="relative">
                    <button
                      type="button"
                      onClick={() => setTagDropdownOpen((open) => !open)}
                      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-semibold text-slate-800 outline-none transition hover:border-amber-300 focus:border-amber-300 focus:ring-2 focus:ring-amber-300/40"
                    >
                      <span className="truncate">
                        {form.selectedTag || "Choose lead tag"}
                      </span>
                      <i
                        className={`fa-solid fa-chevron-${tagDropdownOpen ? "up" : "down"} text-xs text-slate-400`}
                      />
                    </button>
                    {tagDropdownOpen ? (
                      <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-40 max-h-64 overflow-y-auto rounded-3xl border border-slate-200 bg-white p-2 shadow-2xl shadow-slate-900/12">
                        {leadTags.length ? (
                          leadTags.map((tag) => {
                            const active = importedTags.includes(tag);
                            return (
                              <button
                                key={tag}
                                type="button"
                                onClick={() => addRecipientsFromTag(tag)}
                                className={`flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-bold transition ${active ? "bg-amber-50 text-amber-700" : "text-slate-700 hover:bg-slate-50"}`}
                              >
                                <span className="min-w-0 flex-1 truncate">
                                  {tag}
                                </span>
                                {active ? (
                                  <i className="fa-solid fa-check text-xs" />
                                ) : null}
                              </button>
                            );
                          })
                        ) : (
                          <p className="px-3 py-4 text-center text-sm text-slate-400">
                            No lead tags found.
                          </p>
                        )}
                      </div>
                    ) : null}
                  </div>

                  {importedTags.length ? (
                    <div className="flex max-h-24 flex-wrap gap-2 overflow-y-auto pr-1">
                      {importedTags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-700"
                        >
                          <span className="max-w-[12rem] truncate">{tag}</span>
                          <button
                            type="button"
                            onClick={() => removeImportedTag(tag)}
                            className="text-amber-500 hover:text-rose-500"
                            aria-label={`Remove ${tag} recipients`}
                          >
                            <i className="fa-solid fa-xmark" />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {recipientImportMode === "leads" ? (
                <div className="mt-3 rounded-3xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">
                        Lead CRM
                      </p>
                      <p className="mt-1 truncate text-xs text-slate-400">
                        Select leads, add them, then close this panel.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setRecipientImportMode("");
                        setLeadSearch("");
                      }}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500"
                      aria-label="Close Lead CRM import"
                    >
                      <i className="fa-solid fa-xmark" />
                    </button>
                  </div>
                  <input
                    value={leadSearch}
                    onChange={(event) => setLeadSearch(event.target.value)}
                    className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-300/40"
                    placeholder="Search leads"
                  />
                  <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
                    {filteredLeads.length ? (
                      filteredLeads.slice(0, 60).map((lead, index) => {
                        const id = leadId(lead, index);
                        return (
                          <label
                            key={id}
                            className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                          >
                            <input
                              type="checkbox"
                              checked={selectedLeadIds.includes(id)}
                              onChange={() => toggleLeadSelection(id)}
                              className="h-4 w-4 rounded border-slate-300 text-amber-500"
                            />
                            <span className="min-w-0 flex-1 truncate font-bold">
                              {leadName(lead)}
                            </span>
                            <span className="text-xs text-slate-400">
                              {normalizeCallablePhone(leadPhone(lead))}
                            </span>
                          </label>
                        );
                      })
                    ) : (
                      <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-400">
                        No callable leads found.
                      </p>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-3">
              {recipients.length ? (
                <div className="max-h-40 overflow-y-auto pr-1">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                    {recipients.map((recipient) => (
                      <span
                        key={buildRecipientKey(recipient)}
                        className="inline-flex min-w-0 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm"
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {recipient.name}
                        </span>
                        <span className="hidden shrink-0 text-slate-400 sm:inline">
                          {recipient.phone}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeRecipient(recipient.phone)}
                          className="shrink-0 text-slate-300 hover:text-rose-500"
                        >
                          <i className="fa-solid fa-xmark" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="p-4 text-center text-sm text-slate-400">
                  Recipients you add will appear here as compact badges.
                </p>
              )}
            </div>
          </section>

          {form.mode !== "call-now" ? (
            <section className="space-y-3 rounded-[1.75rem] border border-amber-100 bg-amber-50/50 p-3 sm:p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-700">
                    Schedule Windows
                  </p>
                  <p className="mt-1 text-sm leading-6 text-amber-800/80">
                    Add as many dates and times as needed. Calls cannot be
                    scheduled more than 6 months ahead.
                  </p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-amber-700 ring-1 ring-amber-200">
                  {scheduleWindows.length} window
                  {scheduleWindows.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="rounded-[1.35rem] border border-amber-200 bg-white p-2.5">
                  <label className="text-xs font-black uppercase tracking-widest text-amber-700">
                    Dates
                  </label>
                  <div ref={calendarRef} className="relative mt-2">
                    <button
                      type="button"
                      onClick={(event) => {
                        const rect =
                          event.currentTarget.getBoundingClientRect();
                        const spaceBelow = window.innerHeight - rect.bottom;
                        const spaceAbove = rect.top;
                        setCalendarPlacement(
                          spaceBelow < 340 && spaceAbove > spaceBelow
                            ? "top"
                            : "bottom",
                        );
                        setCalendarOpen((open) => !open);
                      }}
                      className="flex h-11 w-full items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-white px-4 text-left text-sm font-bold text-slate-800 outline-none transition hover:border-amber-300 focus:border-amber-300 focus:ring-2 focus:ring-amber-300/40"
                    >
                      <span>{formatDateDisplay(form.scheduleDateInput)}</span>
                      <i className="fa-solid fa-calendar-days text-amber-500" />
                    </button>
                    {calendarOpen ? (
                      <div
                        className={`absolute left-0 z-30 w-full max-w-xs rounded-[1.25rem] border border-amber-100 bg-white p-2.5 shadow-2xl shadow-amber-900/10 ${calendarPlacement === "top" ? "bottom-[calc(100%+0.5rem)]" : "top-[calc(100%+0.5rem)]"}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <button
                            type="button"
                            onClick={() => changeCalendarMonth(-1)}
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"
                          >
                            <i className="fa-solid fa-chevron-left" />
                          </button>
                          <p className="text-sm font-black text-slate-900">
                            {calendarMonthLabel}
                          </p>
                          <button
                            type="button"
                            onClick={() => changeCalendarMonth(1)}
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"
                          >
                            <i className="fa-solid fa-chevron-right" />
                          </button>
                        </div>
                        <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[9px] font-black uppercase tracking-widest text-slate-400">
                          {[
                            "Sun",
                            "Mon",
                            "Tue",
                            "Wed",
                            "Thu",
                            "Fri",
                            "Sat",
                          ].map((day) => (
                            <span key={day}>{day}</span>
                          ))}
                        </div>
                        <div className="mt-2 grid grid-cols-7 gap-1">
                          {calendarDays.map((day) => (
                            <button
                              key={day.value}
                              type="button"
                              disabled={day.disabled}
                              onClick={() => pickCalendarDate(day.value)}
                              className={`flex h-7 items-center justify-center rounded-lg text-[11px] font-black transition ${
                                day.selected
                                  ? "bg-amber-500 text-white"
                                  : day.disabled
                                    ? "cursor-not-allowed text-slate-200"
                                    : day.inMonth
                                      ? "text-slate-700 hover:bg-amber-50 hover:text-amber-700"
                                      : "text-slate-300 hover:bg-slate-50"
                              }`}
                            >
                              {day.day}
                            </button>
                          ))}
                        </div>
                        <div className="mt-3 flex flex-wrap justify-between gap-2 border-t border-slate-100 pt-2">
                          <button
                            type="button"
                            onClick={() => {
                              updateForm("scheduleDateInput", todayStr());
                              addScheduleDate(todayStr());
                            }}
                            className="rounded-2xl bg-slate-100 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600"
                          >
                            Today
                          </button>
                          <button
                            type="button"
                            onClick={() => setCalendarOpen(false)}
                            className="rounded-2xl bg-slate-950 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white"
                          >
                            Done
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-2 flex max-h-12 flex-wrap gap-1.5 overflow-y-auto pr-1">
                    {scheduleDates.map((dateValue) => (
                      <span
                        key={dateValue}
                        className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-black text-amber-800"
                      >
                        {formatDateDisplay(dateValue)}
                        <button
                          type="button"
                          onClick={() => removeScheduleDate(dateValue)}
                          className="text-amber-500 hover:text-rose-500"
                        >
                          <i className="fa-solid fa-xmark" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="rounded-[1.35rem] border border-amber-200 bg-white p-2.5">
                  <label className="text-xs font-black uppercase tracking-widest text-amber-700">
                    Times
                  </label>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <input
                      type="time"
                      value={form.scheduleTimeInput}
                      onChange={(event) =>
                        updateForm("scheduleTimeInput", event.target.value)
                      }
                      className="h-11 w-full rounded-2xl border border-amber-200 bg-white px-4 text-sm font-semibold text-slate-800 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-300/40"
                    />
                    <button
                      type="button"
                      onClick={() => addScheduleTime()}
                      className="h-11 rounded-2xl bg-amber-500 px-4 text-xs font-black uppercase tracking-widest text-white"
                    >
                      Add Time
                    </button>
                  </div>
                  <div className="mt-2 flex max-h-12 flex-wrap gap-1.5 overflow-y-auto pr-1">
                    {scheduleTimes.length ? (
                      scheduleTimes.map((timeValue) => (
                        <span
                          key={timeValue}
                          className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-black text-amber-800"
                        >
                          {timeValue}
                          <button
                            type="button"
                            onClick={() => removeScheduleTime(timeValue)}
                            className="text-amber-500 hover:text-rose-500"
                          >
                            <i className="fa-solid fa-xmark" />
                          </button>
                        </span>
                      ))
                    ) : (
                      <span className="text-xs font-semibold text-amber-700/70">
                        No times added yet.
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-slate-400">
              {form.mode === "call-now"
                ? `${recipients.length || "No"} recipient${recipients.length === 1 ? "" : "s"} ready for live calling.`
                : `This campaign will use ${formatTimezoneOptionLabel(form.timezone)} and create ${scheduleWindows.length} call window${scheduleWindows.length === 1 ? "" : "s"}.`}
            </p>
            <button
              type="button"
              onClick={() => void primaryAction()}
              disabled={Boolean(busy)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-xs font-black uppercase tracking-widest text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <i
                className={`fa-solid ${form.mode === "call-now" ? "fa-phone" : "fa-calendar-check"}`}
              />
              {busy
                ? "Working..."
                : form.mode === "call-now"
                  ? "Start Calls"
                  : "Create Campaign"}
            </button>
          </div>
        </section>
      </div>

      <AppModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title="Campaign History"
        description="Review and manage recent scheduled call campaigns."
        size="lg"
        footer={
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setHistoryOpen(false)}
              className="rounded-2xl bg-slate-950 px-5 py-3 text-xs font-black uppercase tracking-widest text-white"
            >
              Close
            </button>
          </div>
        }
      >
        <div className="max-h-[70vh] overflow-y-auto pr-1">
          {loadingSchedules ? (
            <div className="flex items-center justify-center rounded-3xl border border-slate-200 bg-slate-50 p-8 text-sm font-bold text-slate-400">
              <i className="fa-solid fa-spinner fa-spin mr-2" /> Loading
              campaigns...
            </div>
          ) : campaignHistory.length ? (
            <div className="space-y-3">
              {campaignHistory.map((schedule) => {
                const id = getScheduleId(schedule);
                const status = String(
                  schedule.status || "active",
                ).toLowerCase();
                const when = String(
                  schedule.scheduledFor ||
                    schedule.scheduled_for ||
                    schedule.startAt ||
                    schedule.start_at ||
                    schedule.createdAt ||
                    schedule.created_at ||
                    "",
                );
                return (
                  <div
                    key={id || `${schedule.name}-${when}`}
                    className="rounded-3xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-slate-900">
                          {schedule.name || "Call campaign"}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {toDateTimeLabel(when)} -{" "}
                          {getScheduleRecipients(schedule)} recipient
                          {getScheduleRecipients(schedule) === 1 ? "" : "s"}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${status === "active" || status === "queued" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
                        >
                          {status}
                        </span>
                        {id ? (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(schedule)}
                            className="rounded-full bg-rose-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-rose-600 transition hover:bg-rose-100"
                          >
                            Delete
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-400">
              No call campaigns yet.
            </div>
          )}
        </div>
      </AppModal>

      <AppModal
        open={!!messageModal}
        onClose={() => setMessageModal(null)}
        title={messageModal?.title || "Notification"}
        description={
          messageModal?.ok ? "Action completed" : "Please review and try again"
        }
        size="md"
        footer={
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setMessageModal(null)}
              className="rounded-2xl bg-slate-950 px-5 py-3 text-xs font-black uppercase tracking-widest text-white"
            >
              Close
            </button>
          </div>
        }
      >
        <div
          className={`rounded-2xl border p-4 text-sm leading-6 ${messageModal?.ok ? "border-emerald-100 bg-emerald-50 text-emerald-800" : "border-rose-100 bg-rose-50 text-rose-700"}`}
        >
          {messageModal?.message}
        </div>
      </AppModal>

      <AppModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete campaign"
        description="This removes the scheduled campaign from your workspace."
        size="md"
        footer={
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="rounded-2xl border border-slate-200 px-5 py-3 text-xs font-black uppercase tracking-widest text-slate-600"
            >
              Keep campaign
            </button>
            <button
              type="button"
              onClick={() => void deleteSchedule()}
              disabled={Boolean(busy)}
              className="rounded-2xl bg-rose-600 px-5 py-3 text-xs font-black uppercase tracking-widest text-white disabled:opacity-60"
            >
              Confirm deletion
            </button>
          </div>
        }
      >
        <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm leading-6 text-rose-700">
          Are you sure you want to delete{" "}
          <span className="font-black">
            {deleteTarget?.name || "this campaign"}
          </span>
          ?
        </div>
      </AppModal>
    </div>
  );
};

export default OutreachScheduler;
