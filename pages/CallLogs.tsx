import React, { useEffect, useMemo, useState, useTransition } from "react";
import { useLocation } from "react-router-dom";
import { CallRecord } from "../types";
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
};

interface CallLogsProps {
  calls?: CallRecord[];
  onDownloadReport: (callId: string) => Promise<void>;
}

const PAGE_SIZE = 10;

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
  const outcome = safeString(
    row.outcome || row.result || status || "Completed",
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
  onDownloadReport,
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
  }, [statusFilter, directionFilter]);

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
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [calls, search]);

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
    return { totalCalls, completed, failed, avg };
  }, [calls, serverMetrics]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
      setSelected((current) =>
        current ? { ...current, summary: summary || current.summary } : current,
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

  return (
    <div className="space-y-5 animate-fade-up">
      {error ? (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          {
            label: "Total calls",
            value: stats.totalCalls,
            icon: "fa-phone-volume",
            color: "bg-indigo-50 text-indigo-600",
          },
          {
            label: "Completed",
            value: stats.completed,
            icon: "fa-circle-check",
            color: "bg-emerald-50 text-emerald-600",
          },
          {
            label: "Failed",
            value: stats.failed,
            icon: "fa-triangle-exclamation",
            color: "bg-red-50 text-red-600",
          },
          {
            label: "Avg duration",
            value: formatDuration(stats.avg),
            icon: "fa-stopwatch",
            color: "bg-blue-50 text-blue-600",
          },
        ].map((item) => (
          <div
            key={item.label}
            className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4"
          >
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-xl ${item.color}`}
            >
              <i className={`fa-sharp fa-solid ${item.icon} text-sm`} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                {item.label}
              </p>
              <p className="font-black text-slate-900">{item.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-xl font-black tracking-tight text-slate-900">
              Call Logs
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Review calls, transcripts, recordings, summaries, and captured
              questions.
            </p>
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search calls..."
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-amber-300 md:w-64"
            />
            <select
              value={directionFilter}
              onChange={(event) => {
                setDirectionFilter(event.target.value);
                setPage(1);
              }}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-amber-300"
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
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-amber-300"
            >
              <option value="all">All statuses</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="queued">Queued</option>
              <option value="in-progress">In progress</option>
            </select>
            <button
              onClick={() => void loadCalls(page)}
              disabled={loading || isPending}
              className="rounded-2xl bg-slate-900 px-5 py-3 text-xs font-black uppercase tracking-widest text-white transition-all hover:bg-amber-600 disabled:opacity-50"
            >
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
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
          <div className="divide-y divide-slate-100">
            {filtered.map((call) => {
              const statusKey = call.status.toLowerCase();
              return (
                <button
                  key={call.id}
                  type="button"
                  onClick={() => void openDetail(call)}
                  className="block w-full bg-white p-5 text-left transition-colors hover:bg-slate-50"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 items-center gap-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-sm font-black text-white">
                        {(call.callerName ||
                          call.callerPhone ||
                          "C")[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-black text-slate-900">
                            {call.callerName || "Unknown caller"}
                          </p>
                          <span
                            className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${STATUS_STYLE[statusKey] || "border-slate-200 bg-slate-100 text-slate-600"}`}
                          >
                            {titleCase(call.status || call.outcome)}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-500">
                            {titleCase(call.direction || "call")}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                          <span>{call.callerPhone || "No number"}</span>
                          <span>·</span>
                          <span>{formatDuration(call.duration)}</span>
                          <span>·</span>
                          <span>
                            {new Date(call.timestamp).toLocaleString()}
                          </span>
                        </div>
                        {call.summary ? (
                          <p className="mt-2 line-clamp-1 text-sm text-slate-500">
                            {call.summary}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {call.transcript?.length ? (
                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-600">
                          Transcript
                        </span>
                      ) : null}
                      {call.recordingAvailable ? (
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-blue-600">
                          Recording
                        </span>
                      ) : null}
                      <span className="rounded-xl border border-slate-200 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                        Details
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-500 md:flex-row md:items-center md:justify-between">
        <span>
          Showing page {page} of {totalPages} · {total} total calls
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => void loadCalls(Math.max(1, page - 1))}
            disabled={page <= 1 || loading}
            className="rounded-xl border border-slate-200 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 disabled:opacity-40"
          >
            Previous
          </button>
          <button
            onClick={() => void loadCalls(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages || loading}
            className="rounded-xl border border-slate-200 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>

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
                {summarizing ? "Summarizing..." : "Summarize"}
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

            <div className="grid gap-3 md:grid-cols-4">
              {[
                ["Direction", titleCase(selected.direction || "call")],
                ["Status", titleCase(selected.status || selected.outcome)],
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

            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-500">
                Summary
              </p>
              <p className="mt-2 text-sm font-medium text-amber-950">
                {selected.summary || "No summary is available yet."}
              </p>
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
                <div className="rounded-3xl border border-slate-200 bg-white p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Recording
                  </p>
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
                      className="mt-3 w-full rounded-2xl border border-slate-200 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-600 hover:border-slate-300 disabled:opacity-50"
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
