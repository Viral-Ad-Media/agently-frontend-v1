import React, { useEffect, useMemo, useState, useTransition } from "react";
import { useLocation } from "react-router-dom";
import { CallRecord, Organization } from "../types";
import AppModal from "../components/AppModal";
import { voiceCallsApi } from "../services/voiceCallsApi";

type TranscriptMessage = {
  speaker: "Agent" | "Caller" | "System" | "Unknown";
  text: string;
  at?: string;
  timestamp?: string;
};

type CallListItem = {
  id: string;
  callerName: string;
  callerPhone: string;
  direction: string;
  status: string;
  outcome: string;
  summary: string;
  duration: number;
  timestamp: string;
  voiceAgentId?: string | null;
  callCategory?: string;
  categoryLabel?: string;
  disposition?: string;
  answeredBy?: string;
  voicemailDetected?: boolean;
  screeningDetected?: boolean;
  rerunEligible?: boolean;
  tags?: string[];
  scheduleId?: string | null;
  campaignId?: string | null;
  recordingAvailable?: boolean;
  recordingUrl?: string;
  transcript?: TranscriptMessage[];
  raw?: Record<string, unknown>;
};

type CallDetail = CallListItem & {
  from?: string;
  to?: string;
  lead?: unknown;
  metadata?: unknown;
  messages?: TranscriptMessage[];
  unansweredQuestions?: unknown[];
  recording?: {
    signedUrl?: string;
    audioBase64?: string;
    recordingStatus?: string | null;
    mimeType?: string;
  } | null;
};

type CallMetrics = {
  totalCalls: number;
  completed: number;
  failed: number;
  avg: number;
  answeredHuman?: number;
  voicemail?: number;
  noAnswer?: number;
  screened?: number;
  rerunEligible?: number;
  categories?: Record<string, number>;
};

interface CallLogsProps {
  calls?: CallRecord[];
  org?: Organization | null;
  onDownloadReport: (callId: string) => Promise<void>;
  embedded?: boolean;
}

const PAGE_SIZE = 10;

const CATEGORY_OPTIONS = [
  { value: "all", label: "All outcomes" },
  { value: "answered_human", label: "Answered by human" },
  { value: "voicemail", label: "Voicemail" },
  { value: "left_voicemail", label: "Voicemail left" },
  { value: "no_answer", label: "No answer" },
  { value: "busy", label: "Busy" },
  { value: "failed", label: "Failed" },
  { value: "unavailable", label: "Unavailable" },
  { value: "screened", label: "Screened" },
  { value: "screened_then_connected", label: "Screened then connected" },
  { value: "callback_scheduled", label: "Callback scheduled" },
  { value: "manual_followup_required", label: "Needs follow-up" },
  { value: "opted_out", label: "Opted out" },
  { value: "transferred", label: "Transferred" },
];

const CATEGORY_STYLE: Record<string, string> = {
  answered_human: "bg-emerald-50 text-emerald-700 border-emerald-100",
  voicemail: "bg-violet-50 text-violet-700 border-violet-100",
  left_voicemail: "bg-violet-50 text-violet-700 border-violet-100",
  no_answer: "bg-amber-50 text-amber-700 border-amber-100",
  busy: "bg-orange-50 text-orange-700 border-orange-100",
  failed: "bg-red-50 text-red-600 border-red-100",
  unavailable: "bg-red-50 text-red-600 border-red-100",
  screened: "bg-blue-50 text-blue-700 border-blue-100",
  screened_then_connected: "bg-cyan-50 text-cyan-700 border-cyan-100",
  callback_scheduled: "bg-sky-50 text-sky-700 border-sky-100",
  manual_followup_required: "bg-pink-50 text-pink-700 border-pink-100",
  opted_out: "bg-slate-100 text-slate-600 border-slate-200",
  transferred: "bg-indigo-50 text-indigo-700 border-indigo-100",
};

const STATUS_STYLE: Record<string, string> = {
  completed: "bg-emerald-50 text-emerald-700 border-emerald-100",
  failed: "bg-red-50 text-red-600 border-red-100",
  queued: "bg-amber-50 text-amber-700 border-amber-100",
  initiated: "bg-blue-50 text-blue-700 border-blue-100",
  ringing: "bg-blue-50 text-blue-700 border-blue-100",
  "in-progress": "bg-indigo-50 text-indigo-700 border-indigo-100",
  canceled: "bg-slate-100 text-slate-500 border-slate-200",
  cancelled: "bg-slate-100 text-slate-500 border-slate-200",
};

const RERUN_ELIGIBLE_CATEGORIES = new Set([
  "voicemail",
  "left_voicemail",
  "no_answer",
  "busy",
  "failed",
  "unavailable",
  "callback_scheduled",
  "manual_followup_required",
  "screened",
]);

const toLocalDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const toLocalTimeInput = (date: Date) => {
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
};

const defaultRerunDateTime = () => {
  const date = new Date(Date.now() + 10 * 60 * 1000);
  return { date: toLocalDateInput(date), time: toLocalTimeInput(date) };
};

const safeString = (value: unknown, fallback = "") => {
  if (value == null) return fallback;
  return String(value);
};

const titleCase = (value: string) =>
  value
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

const formatDuration = (seconds?: number | null) => {
  const total = Math.max(0, Number(seconds || 0));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return mins ? `${mins}m ${secs}s` : `${secs}s`;
};

const formatCallLogDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const abbreviatePhone = (value?: string | null) => {
  const phone = safeString(value || "", "").trim();
  if (!phone) return "No number";
  return phone.length > 8 ? `${phone.slice(0, 8)}...` : phone;
};

const getTranscriptPreview = (call: CallListItem) => {
  const firstMessage = (call.transcript || []).find((item) =>
    item.text?.trim(),
  );
  const text = safeString(firstMessage?.text || call.summary || "", "").trim();
  if (!text) return "(no transcript)";
  const speaker = firstMessage?.speaker
    ? firstMessage.speaker.toLowerCase()
    : "assistant";
  const preview = text.length > 42 ? `${text.slice(0, 42)}...` : text;
  return `${speaker}: ${preview}`;
};

const isProtectedTwilioUrl = (url?: string | null) =>
  /api\.twilio\.com|twilio\.com\/2010-04-01/i.test(String(url || ""));

const getSafeAudioUrl = (url?: string | null) => {
  const value = safeString(url || "", "").trim();
  if (!value || isProtectedTwilioUrl(value)) return "";
  return value;
};

const normalizeCallStatus = (row: Record<string, unknown>) => {
  const rawStatus = safeString(
    row.status || row.call_status || "",
    "",
  ).toLowerCase();
  const outcome = safeString(row.outcome || row.result || "", "").toLowerCase();
  const duration =
    Number(
      row.duration || row.duration_seconds || row.recording_duration || 0,
    ) || 0;
  const completedAt =
    row.completed_at || row.completedAt || row.ended_at || row.endedAt;
  const failedHints = [
    "failed",
    "busy",
    "no-answer",
    "no_answer",
    "canceled",
    "cancelled",
    "error",
  ];
  if (
    failedHints.some(
      (hint) => rawStatus.includes(hint) || outcome.includes(hint),
    )
  )
    return rawStatus.includes("cancel") ? "cancelled" : "failed";
  if (
    completedAt ||
    duration > 0 ||
    rawStatus === "completed" ||
    outcome.includes("answered") ||
    outcome.includes("completed")
  )
    return "completed";
  return rawStatus || "queued";
};

const normalizeCallDirection = (row: Record<string, unknown>) => {
  const explicit = safeString(
    row.direction || row.callDirection || row.call_direction || "",
    "",
  ).toLowerCase();
  if (explicit === "outbound" || explicit === "inbound") return explicit;
  const meta =
    row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Record<string, unknown>)
      : {};
  const metadataText = JSON.stringify(meta).toLowerCase();
  if (
    metadataText.includes("outbound") ||
    row.schedule_id ||
    row.scheduleId ||
    row.outreach_run_id ||
    row.outreachRunId ||
    row.lead_outreach_run_id
  )
    return "outbound";
  return "inbound";
};

const getArrayPayload = (payload: unknown, keys: string[]): unknown[] => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") {
      const nested: unknown[] = getArrayPayload(value, keys);
      if (nested.length) return nested;
    }
  }
  return [];
};

const normalizeSpeaker = (raw: unknown): TranscriptMessage["speaker"] => {
  const value = safeString(raw, "").toLowerCase();
  if (["agent", "assistant", "ai", "model", "bot"].includes(value))
    return "Agent";
  if (["caller", "user", "human", "customer", "lead"].includes(value))
    return "Caller";
  if (["system", "tool"].includes(value)) return "System";
  return "Unknown";
};

const normalizeTranscript = (payload: unknown): TranscriptMessage[] => {
  if (typeof payload === "string") {
    return payload
      .split("\n")
      .map((line) => {
        const [speakerPart, ...rest] = line.split(":");
        const text = rest.length ? rest.join(":").trim() : line.trim();
        return {
          speaker: rest.length ? normalizeSpeaker(speakerPart) : "Unknown",
          text,
        } as TranscriptMessage;
      })
      .filter((line) => line.text);
  }

  const list = Array.isArray(payload)
    ? payload
    : getArrayPayload(payload, ["transcript", "messages", "items", "data"]);
  return list
    .map((item: unknown) => {
      if (typeof item === "string")
        return { speaker: "Unknown", text: item } as TranscriptMessage;
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const text = safeString(
        row.text ||
          row.transcript ||
          row.content ||
          row.message ||
          row.delta ||
          "",
        "",
      ).trim();
      if (!text) return null;
      return {
        speaker: normalizeSpeaker(
          row.speaker || row.role || row.author || row.type,
        ),
        text,
        at: safeString(row.at || row.created_at || row.timestamp || "", ""),
      } as TranscriptMessage;
    })
    .filter((item): item is TranscriptMessage => Boolean(item));
};

const getRecordObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const normalizeTagList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => safeString(item, "").trim().toLowerCase())
      .filter(Boolean)
      .filter((item, index, list) => list.indexOf(item) === index)
      .slice(0, 30);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
      .filter((item, index, list) => list.indexOf(item) === index)
      .slice(0, 30);
  }
  return [];
};

const normalizeCallCategory = (row: Record<string, unknown>) => {
  const meta = getRecordObject(row.metadata || row.call_metadata);
  const explicit = safeString(
    row.callCategory ||
      row.call_category ||
      meta.callCategory ||
      meta.call_category ||
      "",
    "",
  )
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (explicit) return explicit;
  const text = [
    row.status,
    row.outcome,
    row.disposition,
    row.answeredBy,
    row.answered_by,
    meta.disposition,
    meta.answered_by,
    meta.machine_detection_result,
    meta.hangup_reason,
  ]
    .map((item) => safeString(item, "").toLowerCase())
    .join(" ");
  if (
    Boolean(
      row.screeningDetected ||
      row.screening_detected ||
      meta.screening_detected,
    ) ||
    text.includes("screen")
  )
    return "screened";
  if (
    Boolean(
      row.voicemailDetected ||
      row.voicemail_detected ||
      meta.voicemail_detected,
    ) ||
    /voicemail|machine|answering_machine/.test(text)
  )
    return "voicemail";
  if (/busy/.test(text)) return "busy";
  if (/no[-_ ]?answer|unanswered|did not pick|not picked/.test(text))
    return "no_answer";
  if (/unavailable|invalid|not in service|not reachable/.test(text))
    return "unavailable";
  if (/failed|error|cancelled|canceled/.test(text)) return "failed";
  if (/callback/.test(text)) return "callback_scheduled";
  if (/follow/.test(text)) return "manual_followup_required";
  if (/transfer/.test(text)) return "transferred";
  if (/opt[_ -]?out|do not call|not interested/.test(text)) return "opted_out";
  if (normalizeCallStatus(row) === "completed") return "answered_human";
  return "unknown";
};

const categoryLabel = (category: string) =>
  CATEGORY_OPTIONS.find((item) => item.value === category)?.label ||
  titleCase(category || "Unknown");

const extractAgentName = (
  org: Organization | null | undefined,
  agentId?: string | null,
) => {
  if (!agentId) return "Unknown agent";
  const agent = org?.voiceAgents?.find((item) => item.id === agentId);
  return agent?.name || "Unknown agent";
};

const extractProvidedCallerName = (row: Record<string, unknown>) => {
  const meta = getRecordObject(row.metadata || row.call_metadata);
  const lead = getRecordObject(row.lead);
  const recipient = getRecordObject(
    row.recipient ||
      row.directRecipient ||
      row.direct_recipient ||
      meta.recipient ||
      meta.directRecipient ||
      meta.direct_recipient,
  );
  const target = getRecordObject(meta.target || meta.lead || meta.contact);
  const directRecipients = Array.isArray(meta.directRecipients)
    ? meta.directRecipients
    : Array.isArray(meta.direct_recipients)
      ? meta.direct_recipients
      : [];
  const firstDirectRecipient = getRecordObject(directRecipients[0]);
  const value = safeString(
    row.callerName ||
      row.caller_name ||
      row.recipientName ||
      row.recipient_name ||
      row.target_name ||
      row.name ||
      lead.name ||
      recipient.name ||
      target.name ||
      meta.callerName ||
      meta.caller_name ||
      meta.recipientName ||
      meta.recipient_name ||
      meta.targetName ||
      meta.target_name ||
      firstDirectRecipient.name ||
      "",
    "",
  ).trim();
  return value &&
    !/^unknown caller$/i.test(value) &&
    !/^outbound recipient$/i.test(value)
    ? value
    : "Unknown Caller";
};

const normalizeCall = (value: unknown): CallListItem | null => {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = safeString(row.id || row.callId || row.call_id || "").trim();
  if (!id) return null;
  const timestamp = safeString(
    row.timestamp ||
      row.createdAt ||
      row.created_at ||
      row.started_at ||
      row.created_at ||
      new Date().toISOString(),
  );
  const duration =
    Number(
      row.duration ||
        row.duration_seconds ||
        row.recording_duration ||
        row.durationSeconds ||
        0,
    ) || 0;
  const status = normalizeCallStatus(row);
  const callCategory = normalizeCallCategory(row);
  const outcome = safeString(
    row.outcome ||
      row.result ||
      categoryLabel(callCategory) ||
      status ||
      "Completed",
    "Completed",
  );
  const callerName = extractProvidedCallerName(row);
  const callerPhone = safeString(
    row.callerPhone ||
      row.caller_phone ||
      row.target_phone ||
      row.destination_phone ||
      row.from ||
      row.to ||
      "",
    "",
  );

  return {
    id,
    callerName,
    callerPhone,
    direction: normalizeCallDirection(row),
    status,
    outcome,
    summary: safeString(row.summary || "", ""),
    duration,
    timestamp,
    voiceAgentId:
      safeString(row.voice_agent_id || row.voiceAgentId || "", "") || null,
    callCategory,
    categoryLabel:
      safeString(row.categoryLabel || row.category_label || "", "") ||
      categoryLabel(callCategory),
    disposition: safeString(row.disposition || "", ""),
    answeredBy: safeString(row.answeredBy || row.answered_by || "", ""),
    voicemailDetected: Boolean(row.voicemailDetected || row.voicemail_detected),
    screeningDetected: Boolean(row.screeningDetected || row.screening_detected),
    rerunEligible: Boolean(row.rerunEligible || row.rerun_eligible),
    tags: normalizeTagList(row.tags),
    scheduleId: safeString(row.scheduleId || row.schedule_id || "", "") || null,
    campaignId: safeString(row.campaignId || row.campaign_id || "", "") || null,
    recordingAvailable: Boolean(
      row.recording_available ||
      row.recordingAvailable ||
      row.recordingUrl ||
      row.recording_url,
    ),
    recordingUrl: getSafeAudioUrl(
      safeString(
        row.recordingUrl || row.recording_url || row.recording_public_url || "",
        "",
      ),
    ),
    transcript: normalizeTranscript(row.transcript),
    raw: row,
  };
};

const normalizeCallsResponse = (
  payload: unknown,
): {
  calls: CallListItem[];
  total: number;
  page: number;
  limit: number;
  metrics?: CallMetrics;
} => {
  const list = getArrayPayload(payload, ["calls", "data", "items", "results"]);
  const record =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const calls = list
    .map((item: unknown) => normalizeCall(item))
    .filter((call: CallListItem | null): call is CallListItem => Boolean(call));
  const metricsRaw =
    record.metrics && typeof record.metrics === "object"
      ? (record.metrics as Record<string, unknown>)
      : null;
  const metrics = metricsRaw
    ? {
        totalCalls:
          Number(metricsRaw.totalCalls || metricsRaw.total_calls || 0) || 0,
        completed:
          Number(metricsRaw.completed || metricsRaw.completedCalls || 0) || 0,
        failed: Number(metricsRaw.failed || metricsRaw.failedCalls || 0) || 0,
        avg:
          Number(
            metricsRaw.avgDuration ||
              metricsRaw.avg_duration ||
              metricsRaw.averageDuration ||
              0,
          ) || 0,
        answeredHuman:
          Number(metricsRaw.answeredHuman || metricsRaw.answered_human || 0) ||
          0,
        voicemail: Number(metricsRaw.voicemail || 0) || 0,
        noAnswer: Number(metricsRaw.noAnswer || metricsRaw.no_answer || 0) || 0,
        screened: Number(metricsRaw.screened || 0) || 0,
        rerunEligible:
          Number(metricsRaw.rerunEligible || metricsRaw.rerun_eligible || 0) ||
          0,
        categories:
          metricsRaw.categories && typeof metricsRaw.categories === "object"
            ? (metricsRaw.categories as Record<string, number>)
            : {},
      }
    : undefined;
  return {
    calls,
    total: Number(record.total || record.count || calls.length) || calls.length,
    page: Number(record.page || 1) || 1,
    limit: Number(record.limit || PAGE_SIZE) || PAGE_SIZE,
    metrics,
  };
};

const normalizeDetailResponse = (
  payload: unknown,
  fallback?: CallListItem,
): CallDetail => {
  const record =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const rawCall = (record.call || record.data || payload) as unknown;
  const base = normalizeCall(rawCall) ||
    fallback || {
      id: "",
      callerName: "Unknown Caller",
      callerPhone: "",
      direction: "inbound",
      status: "completed",
      outcome: "Completed",
      summary: "",
      duration: 0,
      timestamp: new Date().toISOString(),
    };
  const callRecord =
    rawCall && typeof rawCall === "object"
      ? (rawCall as Record<string, unknown>)
      : {};
  return {
    ...base,
    from: safeString(
      callRecord.from ||
        callRecord.caller_phone ||
        callRecord.callerPhone ||
        "",
      "",
    ),
    to: safeString(
      callRecord.to || callRecord.toPhone || callRecord.destination_phone || "",
      "",
    ),
    lead: callRecord.lead || null,
    metadata: callRecord.metadata || null,
    transcript: normalizeTranscript(
      callRecord.transcript || record.transcript || base.transcript || [],
    ),
  };
};

const CallLogs: React.FC<CallLogsProps> = ({
  calls: initialCalls = [],
  org = null,
  onDownloadReport,
  embedded = false,
}) => {
  const location = useLocation();
  const [calls, setCalls] = useState<CallListItem[]>(() =>
    initialCalls
      .map((item: CallRecord) => normalizeCall(item))
      .filter((call: CallListItem | null): call is CallListItem =>
        Boolean(call),
      ),
  );
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [directionFilter, setDirectionFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [savingTag, setSavingTag] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(initialCalls.length);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<CallDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [recordingLoading, setRecordingLoading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [serverMetrics, setServerMetrics] = useState<CallMetrics | null>(null);
  const [openedDeepLinkId, setOpenedDeepLinkId] = useState<string | null>(null);
  const [rerunOpen, setRerunOpen] = useState(false);
  const [rerunBusy, setRerunBusy] = useState(false);
  const [rerunPreview, setRerunPreview] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [rerunForm, setRerunForm] = useState(() => {
    const initial = defaultRerunDateTime();
    return {
      name: "Rerun campaign",
      date: initial.date,
      time: initial.time,
    };
  });

  const loadCalls = async (nextPage = page) => {
    setLoading(true);
    setError("");
    try {
      const params: Record<string, string | number | undefined> = {
        page: nextPage,
        limit: PAGE_SIZE,
      };
      if (directionFilter !== "all") params.direction = directionFilter;
      if (statusFilter !== "all") params.status = statusFilter;
      if (categoryFilter !== "all") params.callCategory = categoryFilter;
      if (agentFilter !== "all") params.voiceAgentId = agentFilter;
      if (tagFilter !== "all") params.tag = tagFilter;
      const payload = await voiceCallsApi.calls.getCalls(params);
      const normalized = normalizeCallsResponse(payload);
      startTransition(() => {
        setCalls(normalized.calls);
        setTotal(normalized.total);
        setPage(normalized.page || nextPage);
        setServerMetrics(normalized.metrics || null);
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load call logs.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCalls(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, directionFilter, categoryFilter, agentFilter, tagFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return calls;
    return calls.filter((call) => {
      return [
        call.callerName,
        call.callerPhone,
        call.summary,
        call.outcome,
        call.status,
        call.callCategory,
        call.categoryLabel,
        call.disposition,
        call.answeredBy,
        extractAgentName(org, call.voiceAgentId),
        ...(call.tags || []),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [calls, org, search]);

  const agentOptions = useMemo(() => org?.voiceAgents || [], [org]);

  const tagOptions = useMemo(() => {
    const tags = new Set<string>();
    calls.forEach((call) => (call.tags || []).forEach((tag) => tags.add(tag)));
    return Array.from(tags).sort();
  }, [calls]);

  const stats = useMemo(() => {
    if (serverMetrics) return serverMetrics;
    const totalCalls = calls.length;
    const completed = calls.filter(
      (call) =>
        call.status.includes("completed") ||
        call.outcome.toLowerCase().includes("completed"),
    ).length;
    const failed = calls.filter(
      (call) =>
        call.status.includes("failed") ||
        call.status.includes("cancelled") ||
        call.outcome.toLowerCase().includes("failed"),
    ).length;
    const avg = totalCalls
      ? Math.round(
          calls.reduce((sum, call) => sum + call.duration, 0) / totalCalls,
        )
      : 0;
    const categories = calls.reduce<Record<string, number>>((acc, call) => {
      const category = call.callCategory || "unknown";
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {});
    return {
      totalCalls,
      completed,
      failed,
      avg,
      categories,
      answeredHuman: categories.answered_human || 0,
      voicemail: (categories.voicemail || 0) + (categories.left_voicemail || 0),
      noAnswer: categories.no_answer || 0,
      screened:
        (categories.screened || 0) + (categories.screened_then_connected || 0),
      rerunEligible: calls.filter((call) => call.rerunEligible).length,
    };
  }, [calls, serverMetrics]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const filteredCallIds = useMemo(
    () => filtered.map((call) => call.id),
    [filtered],
  );

  const rerunEligibleVisible = useMemo(
    () =>
      filtered.filter((call) =>
        RERUN_ELIGIBLE_CATEGORIES.has(call.callCategory || ""),
      ),
    [filtered],
  );

  const activeFilterSummary = useMemo(() => {
    const labels: string[] = [];
    if (directionFilter !== "all") labels.push(titleCase(directionFilter));
    if (statusFilter !== "all") labels.push(titleCase(statusFilter));
    if (categoryFilter !== "all") labels.push(categoryLabel(categoryFilter));
    if (agentFilter !== "all") labels.push(extractAgentName(org, agentFilter));
    if (tagFilter !== "all") labels.push(`#${tagFilter}`);
    return labels.length ? labels.join(" · ") : "All calls";
  }, [
    agentFilter,
    categoryFilter,
    directionFilter,
    org,
    statusFilter,
    tagFilter,
  ]);

  const deepLinkedCallId = useMemo(
    () => new URLSearchParams(location.search).get("callId") || "",
    [location.search],
  );

  const openDetail = async (call: CallListItem) => {
    setSelected({
      ...call,
      messages: call.transcript || [],
      unansweredQuestions: [],
    });
    setDetailLoading(true);
    setError("");
    try {
      const [
        detailPayload,
        transcriptPayload,
        messagesPayload,
        unansweredPayload,
      ] = await Promise.allSettled([
        voiceCallsApi.calls.getCall(call.id),
        voiceCallsApi.calls.getCallTranscript(call.id),
        voiceCallsApi.calls.getCallMessages(call.id),
        voiceCallsApi.calls.getCallUnansweredQuestions(call.id),
      ]);

      const detail =
        detailPayload.status === "fulfilled"
          ? normalizeDetailResponse(detailPayload.value, call)
          : normalizeDetailResponse(call, call);
      const transcript =
        transcriptPayload.status === "fulfilled"
          ? normalizeTranscript(transcriptPayload.value)
          : normalizeTranscript(detail.transcript || []);
      const messages =
        messagesPayload.status === "fulfilled"
          ? normalizeTranscript(messagesPayload.value)
          : [];
      const unanswered =
        unansweredPayload.status === "fulfilled"
          ? getArrayPayload(unansweredPayload.value, [
              "unansweredQuestions",
              "questions",
              "data",
              "items",
            ])
          : [];

      const mergedTranscript = transcript.length
        ? transcript
        : messages.length
          ? messages
          : detail.transcript || [];
      setSelected({
        ...detail,
        transcript: mergedTranscript,
        messages,
        unansweredQuestions: unanswered,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load call details.",
      );
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    if (!deepLinkedCallId || openedDeepLinkId === deepLinkedCallId) return;
    const existing = calls.find((call) => call.id === deepLinkedCallId);
    const fallback: CallListItem = existing || {
      id: deepLinkedCallId,
      callerName: "Loading call...",
      callerPhone: "",
      direction: "outbound",
      status: "completed",
      outcome: "Completed",
      summary: "",
      duration: 0,
      timestamp: new Date().toISOString(),
      transcript: [],
    };
    setOpenedDeepLinkId(deepLinkedCallId);
    void openDetail(fallback);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkedCallId, calls, openedDeepLinkId]);

  const loadRecording = async () => {
    if (!selected) return;
    setRecordingLoading(true);
    setError("");
    try {
      const payload = (await voiceCallsApi.calls.getCallRecording(
        selected.id,
      )) as Record<string, unknown>;
      const recording = (payload.recording ||
        payload.data ||
        payload) as Record<string, unknown>;
      const signedUrl = getSafeAudioUrl(
        safeString(
          recording.signed_url || recording.signedUrl || recording.url || "",
          "",
        ),
      );
      const audioBase64 = safeString(
        recording.audioBase64 || recording.audio_base64 || "",
        "",
      );
      if (
        !audioBase64 &&
        !signedUrl &&
        isProtectedTwilioUrl(
          safeString(
            recording.signed_url || recording.signedUrl || recording.url || "",
            "",
          ),
        )
      ) {
        throw new Error(
          "Recording is protected by Twilio. The backend must proxy it or return audioBase64 before the browser can play it.",
        );
      }
      setSelected((current) =>
        current
          ? {
              ...current,
              recording: {
                signedUrl,
                audioBase64,
                recordingStatus: safeString(
                  recording.recording_status || recording.status || "",
                  "",
                ),
                mimeType: safeString(
                  recording.mime_type || recording.mimeType || "audio/mpeg",
                  "audio/mpeg",
                ),
              },
            }
          : current,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Recording is not available yet.",
      );
    } finally {
      setRecordingLoading(false);
    }
  };

  const handleDownload = async (callId: string, event?: React.MouseEvent) => {
    event?.stopPropagation();
    setDownloading(callId);
    setError("");
    try {
      await onDownloadReport(callId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setDownloading(null);
    }
  };

  const handleSummarize = async () => {
    if (!selected) return;
    setSummarizing(true);
    setError("");
    try {
      const payload = (await voiceCallsApi.calls.summarizeCall(selected.id, {
        force: true,
      })) as Record<string, unknown>;
      const summary = safeString(
        payload.summary ||
          (payload.call as Record<string, unknown> | undefined)?.summary ||
          "",
        "",
      );
      const nextSummary =
        summary ||
        "No call summary was returned yet. Try again after the transcript is available.";
      setSelected((current) =>
        current ? { ...current, summary: nextSummary } : current,
      );
      setCalls((current) =>
        current.map((call) =>
          call.id === selected.id ? { ...call, summary: nextSummary } : call,
        ),
      );
      await loadCalls(page);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not summarize this call.",
      );
    } finally {
      setSummarizing(false);
    }
  };

  const handleAddTagToSelected = async () => {
    if (!selected) return;
    const tags = normalizeTagList(tagDraft);
    if (!tags.length) return;
    setSavingTag(true);
    setError("");
    try {
      const response = (await voiceCallsApi.calls.updateCallTags(selected.id, {
        tags,
        action: "add",
      })) as Record<string, unknown>;
      const updated = getRecordObject(
        response.call || response.data || response,
      );
      const nextTags = normalizeTagList(
        updated.tags || [...(selected.tags || []), ...tags],
      );
      setSelected((current) =>
        current ? { ...current, tags: nextTags } : current,
      );
      setCalls((current) =>
        current.map((call) =>
          call.id === selected.id ? { ...call, tags: nextTags } : call,
        ),
      );
      setTagDraft("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update call tags.",
      );
    } finally {
      setSavingTag(false);
    }
  };

  const handleTagFilteredCalls = async () => {
    const tags = normalizeTagList(tagDraft);
    if (!tags.length || !filteredCallIds.length) return;
    setSavingTag(true);
    setError("");
    try {
      await voiceCallsApi.calls.bulkUpdateCallTags({
        callIds: filteredCallIds,
        tags,
        action: "add",
      });
      setTagDraft("");
      await loadCalls(page);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not tag filtered calls.",
      );
    } finally {
      setSavingTag(false);
    }
  };

  const buildRerunPayload = () => ({
    name: rerunForm.name.trim() || "Rerun campaign",
    callIds: filteredCallIds,
    voiceAgentId: agentFilter !== "all" ? agentFilter : undefined,
    callCategory: categoryFilter !== "all" ? categoryFilter : undefined,
    direction: directionFilter !== "all" ? directionFilter : undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    tag: tagFilter !== "all" ? tagFilter : undefined,
    startLocalDate: rerunForm.date,
    startTime: rerunForm.time,
    eligibleOnly: true,
  });

  const openRerunModal = async () => {
    const initial = defaultRerunDateTime();
    setRerunForm((current) => ({
      ...current,
      name:
        categoryFilter !== "all"
          ? `${categoryLabel(categoryFilter)} rerun campaign`
          : "Rerun campaign",
      date: current.date || initial.date,
      time: current.time || initial.time,
    }));
    setRerunOpen(true);
    setRerunPreview(null);
    setRerunBusy(true);
    setError("");
    try {
      const payload = await voiceCallsApi.outreach.previewRerunFromCalls({
        ...buildRerunPayload(),
        startLocalDate: initial.date,
        startTime: initial.time,
      });
      setRerunPreview(payload as Record<string, unknown>);
    } catch (err) {
      setRerunPreview(null);
      setError(
        err instanceof Error
          ? err.message
          : "Could not preview this rerun group.",
      );
    } finally {
      setRerunBusy(false);
    }
  };

  const refreshRerunPreview = async () => {
    setRerunBusy(true);
    setError("");
    try {
      const payload =
        await voiceCallsApi.outreach.previewRerunFromCalls(buildRerunPayload());
      setRerunPreview(payload as Record<string, unknown>);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not preview this rerun group.",
      );
    } finally {
      setRerunBusy(false);
    }
  };

  const createRerunCampaign = async () => {
    setRerunBusy(true);
    setError("");
    try {
      await voiceCallsApi.outreach.createRerunFromCalls(buildRerunPayload());
      setRerunOpen(false);
      setRerunPreview(null);
      await loadCalls(page);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not create the rerun campaign.",
      );
    } finally {
      setRerunBusy(false);
    }
  };

  return (
    <div className={`space-y-4 animate-fade-up ${embedded ? "" : ""}`}>
      {error ? (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-black tracking-tight text-slate-950 sm:text-2xl">
            Call Logs
          </h1>
          <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">
            Reviews calls, transcripts, recordings, summaries and captured
            questions.
          </p>
        </div>
        <button
          onClick={() => void loadCalls(page)}
          disabled={loading || isPending}
          className="inline-flex h-10 items-center justify-center rounded-xl border border-amber-300 bg-white px-4 text-[11px] font-black uppercase tracking-wider text-amber-600 transition hover:bg-amber-50 disabled:opacity-50"
        >
          <i
            className={`fa-sharp fa-solid ${loading ? "fa-spinner fa-spin" : "fa-rotate-right"} mr-2 text-[10px]`}
          />
          {loading ? "Refreshing" : "Refresh"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2.5 min-[390px]:grid-cols-3 sm:gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {[
          {
            label: "Total calls",
            value: stats.totalCalls,
            icon: "fa-phone-volume",
            color: "bg-indigo-50 text-indigo-600",
          },
          {
            label: "Answered",
            value: stats.answeredHuman || 0,
            icon: "fa-user-check",
            color: "bg-emerald-50 text-emerald-600",
          },
          {
            label: "Voicemail",
            value: stats.voicemail || 0,
            icon: "fa-voicemail",
            color: "bg-violet-50 text-violet-600",
          },
          {
            label: "No answer",
            value: stats.noAnswer || 0,
            icon: "fa-phone-slash",
            color: "bg-amber-50 text-amber-600",
          },
          {
            label: "Failed",
            value: stats.failed,
            icon: "fa-triangle-exclamation",
            color: "bg-red-50 text-red-600",
          },
          {
            label: "Rerun ready",
            value: stats.rerunEligible || 0,
            icon: "fa-rotate-right",
            color: "bg-blue-50 text-blue-600",
          },
        ].map((item) => (
          <div
            key={item.label}
            className="flex min-w-0 items-center gap-2.5 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm sm:gap-3 sm:p-3.5"
          >
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl sm:h-10 sm:w-10 ${item.color}`}
            >
              <i className={`fa-sharp fa-solid ${item.icon} text-sm`} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[9px] font-black uppercase tracking-[0.13em] text-slate-400 sm:text-[10px] sm:tracking-widest">
                {item.label}
              </p>
              <p className="mt-0.5 text-lg font-black leading-none text-slate-900 sm:text-base">
                {item.value}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-[minmax(0,1fr)_10.5rem_10.5rem_11rem]">
        <label className="relative block min-w-0 md:col-span-3 lg:col-span-1">
          <i className="fa-sharp fa-solid fa-magnifying-glass pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xs text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search calls, agents or tags..."
            className="h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm font-medium text-slate-700 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
          />
        </label>
        <select
          value={directionFilter}
          onChange={(event) => {
            setDirectionFilter(event.target.value);
            setPage(1);
          }}
          className="h-11 min-w-0 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
        >
          <option value="all">All directions</option>
          <option value="inbound">Inbound</option>
          <option value="outbound">Outbound</option>
        </select>
        <select
          value={statusFilter}
          onChange={(event) => {
            setStatusFilter(event.target.value);
            setPage(1);
          }}
          className="h-11 min-w-0 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
        >
          <option value="all">All statuses</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="queued">Queued</option>
          <option value="in-progress">In progress</option>
        </select>
        <select
          value={categoryFilter}
          onChange={(event) => {
            setCategoryFilter(event.target.value);
            setPage(1);
          }}
          className="h-11 min-w-0 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
        >
          {CATEGORY_OPTIONS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-[0_12px_28px_rgba(15,23,42,0.055)]">
        {loading && !calls.length ? (
          <div className="py-16 text-center text-sm font-bold text-slate-400">
            Loading call logs...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <i className="fa-sharp fa-solid fa-phone-slash mb-3 block text-4xl text-slate-200" />
            <p className="font-black text-slate-800">No calls found</p>
            <p className="mt-1 text-sm text-slate-400">
              Calls will appear here after your agents make or receive calls.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[55rem]">
              <div className="grid grid-cols-[minmax(18rem,1.45fr)_9rem_minmax(16rem,1.15fr)_12rem] border-b border-slate-200 bg-slate-50/80 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <span>Name / Info</span>
                <span>Date</span>
                <span>AI transcript preview</span>
                <span className="text-right">Actions</span>
              </div>
              <div className="divide-y divide-slate-200">
                {filtered.map((call, index) => {
                  const statusKey = call.status.toLowerCase();
                  const directionKey = call.direction.toLowerCase();
                  return (
                    <div
                      key={call.id}
                      onClick={() => void openDetail(call)}
                      className="grid cursor-pointer grid-cols-[minmax(18rem,1.45fr)_9rem_minmax(16rem,1.15fr)_12rem] items-center gap-4 px-5 py-4 transition-colors hover:bg-slate-50/80"
                    >
                      <div className="flex min-w-0 items-center gap-4">
                        <div
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-black text-white ${index % 3 === 1 ? "bg-slate-600" : index % 3 === 2 ? "bg-slate-800" : "bg-slate-900"}`}
                        >
                          {(call.callerName ||
                            call.callerPhone ||
                            "C")[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <p className="max-w-[8.5rem] truncate font-black text-slate-900">
                              {call.callerName || "Unknown caller"}
                            </p>
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${STATUS_STYLE[statusKey] || "border-slate-200 bg-slate-100 text-slate-600"}`}
                            >
                              {titleCase(call.status || call.outcome)}
                            </span>
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-600">
                              {titleCase(directionKey || "call")}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-xs font-medium text-slate-500">
                            {abbreviatePhone(call.callerPhone)} · agent:{" "}
                            {extractAgentName(org, call.voiceAgentId)}
                          </p>
                        </div>
                      </div>

                      <p className="text-sm font-medium text-slate-500">
                        {formatCallLogDate(call.timestamp)}
                      </p>

                      <p className="truncate text-sm italic text-slate-500">
                        {getTranscriptPreview(call)}
                      </p>

                      <div className="flex items-center justify-end gap-2">
                        {call.transcript?.length ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void openDetail(call);
                            }}
                            className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-blue-600 hover:bg-blue-50"
                          >
                            Transcript
                          </button>
                        ) : null}
                        {call.recordingAvailable ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void openDetail(call);
                            }}
                            className="rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-violet-600 hover:bg-violet-50"
                          >
                            Recording
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-b-[1.5rem] rounded-t-none border border-t-0 border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-500 md:flex-row md:items-center md:justify-between">
        <span>
          Showing page {page} of {totalPages} · {total} total calls
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => void loadCalls(Math.max(1, page - 1))}
            disabled={page <= 1 || loading}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 disabled:opacity-40"
          >
            Previous
          </button>
          <button
            onClick={() => void loadCalls(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages || loading}
            className="rounded-xl border border-amber-300 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-widest text-amber-600 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>

      <AppModal
        open={rerunOpen}
        onClose={() => setRerunOpen(false)}
        title="Create rerun campaign"
        description="Only rerun calls from the current visible filtered group that are safe to retry."
        size="lg"
        footer={
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              onClick={() => void refreshRerunPreview()}
              disabled={rerunBusy}
              className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-black text-slate-600 hover:border-slate-300 disabled:opacity-50"
            >
              {rerunBusy ? "Checking..." : "Refresh preview"}
            </button>
            <button
              onClick={() => void createRerunCampaign()}
              disabled={rerunBusy || rerunEligibleVisible.length === 0}
              className="flex-1 rounded-xl bg-slate-900 py-3 text-sm font-black text-white hover:bg-amber-600 disabled:opacity-50"
            >
              {rerunBusy ? "Creating..." : "Create rerun"}
            </button>
            <button
              onClick={() => setRerunOpen(false)}
              className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-black text-slate-600 hover:border-slate-300"
            >
              Cancel
            </button>
          </div>
        }
      >
        <div className="space-y-4 text-sm">
          <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-amber-950">
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">
              Safety rule
            </p>
            <p className="mt-2 font-semibold leading-relaxed">
              Agently excludes successful, transferred, opted-out, and
              screened-then-connected calls. This rerun will use only eligible
              outcomes such as voicemail, no answer, busy, failed, unavailable,
              screened, callback, or follow-up.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <label className="md:col-span-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Campaign name
              </span>
              <input
                value={rerunForm.name}
                onChange={(event) =>
                  setRerunForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-amber-300"
              />
            </label>
            <label>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Date
              </span>
              <input
                type="date"
                value={rerunForm.date}
                onChange={(event) =>
                  setRerunForm((current) => ({
                    ...current,
                    date: event.target.value,
                  }))
                }
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-amber-300"
              />
            </label>
            <label>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Time
              </span>
              <input
                type="time"
                value={rerunForm.time}
                onChange={(event) =>
                  setRerunForm((current) => ({
                    ...current,
                    time: event.target.value,
                  }))
                }
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-amber-300"
              />
            </label>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Visible eligible
              </p>
              <p className="mt-2 text-2xl font-black text-slate-900">
                {rerunEligibleVisible.length}
              </p>
            </div>
          </div>

          {rerunPreview ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Backend preview
              </p>
              <pre className="mt-3 max-h-64 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs leading-relaxed text-slate-100">
                {JSON.stringify(rerunPreview, null, 2)}
              </pre>
            </div>
          ) : null}
        </div>
      </AppModal>

      <AppModal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.callerName || "Call details"}
        description={
          selected
            ? `${selected.callerPhone || "No number"} · ${formatDuration(selected.duration)} · ${new Date(selected.timestamp).toLocaleString()}`
            : undefined
        }
        size="2xl"
        footer={
          selected ? (
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                onClick={handleSummarize}
                disabled={summarizing}
                className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-black text-slate-600 hover:border-slate-300 disabled:opacity-50"
              >
                {summarizing ? "Getting summary..." : "Get call summary"}
              </button>
              <button
                onClick={(event) => void handleDownload(selected.id, event)}
                disabled={downloading === selected.id}
                className="flex-1 rounded-xl bg-slate-900 py-3 text-sm font-black text-white hover:bg-amber-600 disabled:opacity-50"
              >
                {downloading === selected.id
                  ? "Downloading..."
                  : "Download Report"}
              </button>
              <button
                onClick={() => setSelected(null)}
                className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-black text-slate-600 hover:border-slate-300"
              >
                Close
              </button>
            </div>
          ) : null
        }
      >
        {selected ? (
          <div className="space-y-4 text-sm">
            {detailLoading ? (
              <div className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-400">
                Loading latest call details...
              </div>
            ) : null}

            {selected.summary ? (
              <div className="rounded-2xl bg-amber-50 p-4 text-sm leading-relaxed text-amber-900 ring-1 ring-amber-100">
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">
                  Call summary
                </p>
                <p className="mt-2 whitespace-pre-wrap">{selected.summary}</p>
              </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              {[
                ["Direction", titleCase(selected.direction || "call")],
                ["Status", titleCase(selected.status || selected.outcome)],
                [
                  "Outcome",
                  selected.categoryLabel ||
                    categoryLabel(selected.callCategory || "unknown"),
                ],
                ["Agent", extractAgentName(org, selected.voiceAgentId)],
                ["From", selected.from || selected.callerPhone || "—"],
                ["To", selected.to || "—"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    {label}
                  </p>
                  <p className="mt-1 break-words text-sm font-black text-slate-800">
                    {value}
                  </p>
                </div>
              ))}
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.45fr_0.55fr]">
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Conversation transcript
                  </p>
                </div>
                <div className="mb-3 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs font-semibold leading-relaxed text-amber-800">
                  Transcripts are AI-generated and may not be 100% accurate.
                  Please listen to the recording when auditing important calls.
                </div>
                <div className="space-y-2 rounded-3xl border border-slate-200 bg-slate-50 p-3">
                  {(selected.transcript && selected.transcript.length
                    ? selected.transcript
                    : []
                  ).length ? (
                    selected.transcript!.map((message, index) => {
                      const isAgent = message.speaker === "Agent";
                      const isCaller = message.speaker === "Caller";
                      return (
                        <div
                          key={`${message.speaker}-${index}`}
                          className={`flex ${isAgent ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[86%] rounded-2xl px-3 py-2 text-xs shadow-sm ${isAgent ? "rounded-tr-sm bg-slate-900 text-white" : isCaller ? "rounded-tl-sm bg-white text-slate-800" : "bg-slate-200 text-slate-700"}`}
                          >
                            <p
                              className={`mb-1 text-[10px] font-black uppercase tracking-widest ${isAgent ? "text-white/60" : "text-slate-400"}`}
                            >
                              {message.speaker}
                            </p>
                            <p className="whitespace-pre-wrap leading-relaxed">
                              {message.text}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-10 text-center text-sm text-slate-400">
                      No transcript is available yet for this call.
                    </div>
                  )}
                </div>
              </div>

              <aside className="space-y-4">
                <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Recording
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Load audio only when you need to audit the call.
                      </p>
                    </div>
                    <i className="fa-sharp fa-solid fa-waveform-lines text-slate-300" />
                  </div>
                  {selected.recording?.audioBase64 ? (
                    <audio
                      controls
                      src={`data:${selected.recording.mimeType || "audio/mpeg"};base64,${selected.recording.audioBase64}`}
                      className="mt-3 w-full"
                    />
                  ) : selected.recording?.signedUrl &&
                    getSafeAudioUrl(selected.recording.signedUrl) ? (
                    <audio
                      controls
                      src={getSafeAudioUrl(selected.recording.signedUrl)}
                      className="mt-3 w-full"
                    />
                  ) : selected.recordingUrl &&
                    getSafeAudioUrl(selected.recordingUrl) ? (
                    <audio
                      controls
                      src={getSafeAudioUrl(selected.recordingUrl)}
                      className="mt-3 w-full"
                    />
                  ) : (
                    <button
                      onClick={loadRecording}
                      disabled={recordingLoading}
                      className="mt-3 w-full rounded-2xl bg-white px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-600 shadow-sm ring-1 ring-slate-200 hover:ring-amber-200 disabled:opacity-50"
                    >
                      {recordingLoading
                        ? "Loading..."
                        : selected.recordingAvailable
                          ? "Load recording"
                          : "Check recording"}
                    </button>
                  )}
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Unanswered questions
                  </p>
                  {selected.unansweredQuestions?.length ? (
                    <div className="mt-3 space-y-2">
                      {selected.unansweredQuestions
                        .slice(0, 5)
                        .map((item, index) => {
                          const row =
                            item && typeof item === "object"
                              ? (item as Record<string, unknown>)
                              : {};
                          return (
                            <p
                              key={safeString(row.id || index)}
                              className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-600"
                            >
                              {safeString(
                                row.question || row.text || "Question captured",
                              )}
                            </p>
                          );
                        })}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-slate-400">
                      No unresolved questions captured for this call.
                    </p>
                  )}
                </div>

                {selected.lead ? (
                  <div className="rounded-3xl border border-slate-200 bg-white p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Related lead
                    </p>
                    <pre className="mt-3 max-h-36 overflow-auto rounded-2xl bg-slate-50 p-3 text-xs text-slate-500">
                      {JSON.stringify(selected.lead, null, 2)}
                    </pre>
                  </div>
                ) : null}
              </aside>
            </div>
          </div>
        ) : null}
      </AppModal>
    </div>
  );
};

export default CallLogs;
