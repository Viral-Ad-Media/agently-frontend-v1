import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DashboardData, Organization } from "../types";
import { voiceCallsApi } from "../services/voiceCallsApi";

type DashboardProps = {
  org: Organization;
  dashboard: DashboardData;
};

type CallRow = {
  id: string;
  agentId: string | null;
  agentName: string;
  callerName: string;
  callerPhone: string;
  direction: "inbound" | "outbound" | "unknown";
  status: string;
  duration: number;
  createdAt: string;
  outcome: string;
};

type ScheduleRow = {
  id: string;
  status: string;
  scheduleType: string;
  createdAt: string;
};

type ExtraDashboardMetrics = {
  totalCallSeconds: number;
  totalCallMinutes: number;
  minuteLimit: number;
  remainingMinutes: number;
  usagePercent: number;
  chatbotMessagesAnswered: number;
  chatbotTotalMessages: number;
  chatbotLeadsCaptured: number;
  callLeadsCaptured: number;
  totalLeadsCaptured: number;
  convertedLeads: number;
  conversionRate: number;
  knowledgeChunks: number;
  estimatedStorageBytes: number;
  estimatedStorageLabel: string;
};

type DashboardLiveState = ExtraDashboardMetrics & {
  calls: CallRow[];
  totalCalls: number;
  completedCalls: number;
  failedCalls: number;
  outboundCalls: number;
  inboundCalls: number;
  activeSchedules: number;
  completedSchedules: number;
  failedSchedules: number;
  unreadNotifications: number;
};

type AgentStats = {
  agentId: string;
  agentName: string;
  totalCalls: number;
  completedCalls: number;
  failedCalls: number;
  totalDuration: number;
  inboundCalls: number;
  outboundCalls: number;
};

type FlowPoint = {
  name: string;
  calls: number;
  completed: number;
};

const EMPTY_EXTRA: ExtraDashboardMetrics = {
  totalCallSeconds: 0,
  totalCallMinutes: 0,
  minuteLimit: 500,
  remainingMinutes: 500,
  usagePercent: 0,
  chatbotMessagesAnswered: 0,
  chatbotTotalMessages: 0,
  chatbotLeadsCaptured: 0,
  callLeadsCaptured: 0,
  totalLeadsCaptured: 0,
  convertedLeads: 0,
  conversionRate: 0,
  knowledgeChunks: 0,
  estimatedStorageBytes: 0,
  estimatedStorageLabel: "0 KB",
};

const EMPTY_LIVE_STATE: DashboardLiveState = {
  calls: [],
  totalCalls: 0,
  completedCalls: 0,
  failedCalls: 0,
  outboundCalls: 0,
  inboundCalls: 0,
  activeSchedules: 0,
  completedSchedules: 0,
  failedSchedules: 0,
  unreadNotifications: 0,
  ...EMPTY_EXTRA,
};

const safeString = (value: unknown, fallback = ""): string => {
  if (value == null) return fallback;
  return String(value);
};

const safeNumber = (value: unknown, fallback = 0): number => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const titleCase = (value: string): string =>
  value.replace(/[_-]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

const getObject = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
};

const getArrayPayload = (payload: unknown, keys: string[]): unknown[] => {
  if (Array.isArray(payload)) return payload;
  const record = getObject(payload);
  for (const key of keys) {
    const candidate = record[key];
    if (Array.isArray(candidate)) return candidate;
    const nested: unknown[] = getArrayPayload(candidate, keys);
    if (nested.length) return nested;
  }
  return [];
};

const formatDuration = (seconds: number): string => {
  const total = Math.max(0, Math.round(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours}h ${remainingMins}m`;
  }
  return mins ? `${mins}m ${secs}s` : `${secs}s`;
};

const formatMinutes = (minutes: number): string => {
  const rounded = Math.round(minutes * 10) / 10;
  if (rounded >= 60) {
    const hours = Math.floor(rounded / 60);
    const mins = Math.round(rounded % 60);
    return `${hours}h ${mins}m`;
  }
  return `${rounded}m`;
};

const formatUsageMinutes = (minutes: number): string => {
  const rounded = Math.round(Math.max(0, minutes) * 10) / 10;
  return `${rounded}m`;
};

const formatBytes = (bytes: number): string => {
  if (!bytes || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDateTime = (value: string): string => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

const normalizeDirection = (
  row: Record<string, unknown>,
): CallRow["direction"] => {
  const explicit = safeString(
    row.direction || row.callDirection || row.call_direction,
    "",
  ).toLowerCase();
  if (explicit === "inbound" || explicit === "outbound") return explicit;
  const metadata = getObject(row.metadata);
  const metadataText = JSON.stringify(metadata).toLowerCase();
  if (
    metadataText.includes("outbound") ||
    row.schedule_id ||
    row.scheduleId ||
    row.outreach_run_id ||
    row.outreachRunId
  ) {
    return "outbound";
  }
  return "unknown";
};

const normalizeStatus = (row: Record<string, unknown>): string => {
  const status = safeString(row.status || row.call_status, "").toLowerCase();
  const outcome = safeString(row.outcome || row.result, "").toLowerCase();
  const duration = safeNumber(
    row.duration || row.duration_seconds || row.recording_duration,
    0,
  );
  const completedAt =
    row.completed_at || row.completedAt || row.ended_at || row.endedAt;
  if (
    status.includes("fail") ||
    status.includes("busy") ||
    status.includes("no-answer") ||
    status.includes("no_answer") ||
    outcome.includes("fail")
  )
    return "failed";
  if (status.includes("cancel")) return "cancelled";
  if (
    completedAt ||
    duration > 0 ||
    status === "completed" ||
    outcome.includes("answered") ||
    outcome.includes("completed")
  )
    return "completed";
  return status || "queued";
};

const normalizeCall = (value: unknown): CallRow | null => {
  const row = getObject(value);
  const id = safeString(row.id || row.callId || row.call_id).trim();
  if (!id) return null;
  const status = normalizeStatus(row);
  const direction = normalizeDirection(row);
  return {
    id,
    agentId:
      safeString(row.voice_agent_id || row.voiceAgentId || "").trim() || null,
    agentName: safeString(row.agent_name || row.agentName || "", "").trim(),
    callerName: safeString(
      row.callerName ||
        row.caller_name ||
        row.target_name ||
        row.name ||
        "Unknown Caller",
      "Unknown Caller",
    ),
    callerPhone: safeString(
      row.callerPhone ||
        row.caller_phone ||
        row.target_phone ||
        row.destination_phone ||
        row.from ||
        row.to ||
        "",
      "",
    ),
    direction,
    status,
    duration: safeNumber(
      row.duration ||
        row.duration_seconds ||
        row.recording_duration ||
        row.durationSeconds,
      0,
    ),
    createdAt: safeString(
      row.timestamp ||
        row.createdAt ||
        row.created_at ||
        row.started_at ||
        new Date().toISOString(),
    ),
    outcome: safeString(row.outcome || status || "Call", "Call"),
  };
};

const normalizeSchedule = (value: unknown): ScheduleRow | null => {
  const row = getObject(value);
  const id = safeString(row.id || row.scheduleId || row.schedule_id).trim();
  if (!id) return null;
  return {
    id,
    status: safeString(
      row.status || (row.is_active === false ? "completed" : "active"),
      "active",
    ).toLowerCase(),
    scheduleType: safeString(
      row.schedule_type || row.scheduleType || "schedule",
      "schedule",
    ),
    createdAt: safeString(
      row.created_at ||
        row.createdAt ||
        row.start_at ||
        row.startAt ||
        new Date().toISOString(),
    ),
  };
};

const normalizeCallsResponse = (
  payload: unknown,
): { calls: CallRow[]; metrics: Partial<DashboardLiveState> } => {
  const record = getObject(payload);
  const calls = getArrayPayload(payload, ["calls", "data", "items", "results"])
    .map((item: unknown) => normalizeCall(item))
    .filter((call): call is CallRow => Boolean(call));
  const metricsRaw = getObject(record.metrics);
  return {
    calls,
    metrics: {
      totalCalls: safeNumber(
        metricsRaw.totalCalls || metricsRaw.total_calls || record.total,
        calls.length,
      ),
      completedCalls: safeNumber(
        metricsRaw.completed ||
          metricsRaw.completedCalls ||
          metricsRaw.completed_calls,
        0,
      ),
      failedCalls: safeNumber(
        metricsRaw.failed || metricsRaw.failedCalls || metricsRaw.failed_calls,
        0,
      ),
      totalCallSeconds: safeNumber(
        metricsRaw.totalCallSeconds ||
          metricsRaw.total_call_seconds ||
          metricsRaw.totalDurationSeconds,
        0,
      ),
      totalCallMinutes: safeNumber(
        metricsRaw.totalCallMinutes ||
          metricsRaw.total_call_minutes ||
          metricsRaw.totalMinutes,
        0,
      ),
    },
  };
};

const normalizeDashboardMetrics = (
  payload: unknown,
  fallbackMinuteLimit: number,
): ExtraDashboardMetrics => {
  const record = getObject(payload);
  const metrics = getObject(
    record.metrics || record.dashboard || record.data || record,
  );
  const usage = getObject(metrics.usage || record.usage);
  const chatbot = getObject(metrics.chatbot || record.chatbot);
  const leads = getObject(metrics.leads || record.leads);
  const knowledge = getObject(
    metrics.knowledge || metrics.storage || record.knowledge || record.storage,
  );
  const totalCallSeconds = safeNumber(
    usage.totalCallSeconds ||
      usage.total_call_seconds ||
      metrics.totalCallSeconds ||
      metrics.total_call_seconds,
    0,
  );
  const totalCallMinutes = safeNumber(
    usage.totalCallMinutes ||
      usage.total_call_minutes ||
      metrics.totalCallMinutes ||
      metrics.total_call_minutes,
    totalCallSeconds / 60,
  );
  const minuteLimit = safeNumber(
    usage.minuteLimit ||
      usage.minute_limit ||
      metrics.minuteLimit ||
      metrics.minute_limit,
    fallbackMinuteLimit,
  );
  const estimatedStorageBytes = safeNumber(
    knowledge.estimatedStorageBytes ||
      knowledge.estimated_storage_bytes ||
      knowledge.bytes ||
      0,
    0,
  );
  const totalLeadsCaptured = safeNumber(
    leads.totalCaptured ||
      leads.total_captured ||
      leads.total ||
      metrics.totalLeadsCaptured,
    0,
  );
  const convertedLeads = safeNumber(
    leads.converted ||
      leads.convertedLeads ||
      leads.converted_leads ||
      metrics.convertedLeads,
    0,
  );
  return {
    totalCallSeconds,
    totalCallMinutes,
    minuteLimit,
    remainingMinutes: Math.max(0, minuteLimit - totalCallMinutes),
    usagePercent: Math.min(
      100,
      minuteLimit ? (totalCallMinutes / minuteLimit) * 100 : 0,
    ),
    chatbotMessagesAnswered: safeNumber(
      chatbot.messagesAnswered ||
        chatbot.messages_answered ||
        chatbot.answers ||
        0,
      0,
    ),
    chatbotTotalMessages: safeNumber(
      chatbot.totalMessages || chatbot.total_messages || 0,
      0,
    ),
    chatbotLeadsCaptured: safeNumber(
      chatbot.leadsCaptured ||
        chatbot.leads_captured ||
        leads.chatbotLeadsCaptured ||
        leads.chatbot_leads_captured ||
        0,
      0,
    ),
    callLeadsCaptured: safeNumber(
      leads.callLeadsCaptured || leads.call_leads_captured || 0,
      0,
    ),
    totalLeadsCaptured,
    convertedLeads,
    conversionRate: totalLeadsCaptured
      ? Math.round((convertedLeads / totalLeadsCaptured) * 1000) / 10
      : 0,
    knowledgeChunks: safeNumber(
      knowledge.chunks ||
        knowledge.knowledgeChunks ||
        knowledge.knowledge_chunks ||
        0,
      0,
    ),
    estimatedStorageBytes,
    estimatedStorageLabel:
      safeString(
        knowledge.estimatedStorageLabel ||
          knowledge.estimated_storage_label ||
          "",
        "",
      ) || formatBytes(estimatedStorageBytes),
  };
};

const StatCard: React.FC<{
  label: string;
  value: string;
  sub?: string;
  icon: string;
}> = React.memo(({ label, value, sub, icon }) => (
  <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-center justify-between gap-2">
      <p className="truncate text-[9px] font-black uppercase tracking-widest text-slate-400">
        {label}
      </p>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-xs">
        {icon}
      </span>
    </div>
    <p className="mt-2 truncate text-2xl font-black tracking-tight text-slate-900">
      {value}
    </p>
    {sub && <p className="mt-1 truncate text-[11px] text-slate-400">{sub}</p>}
  </div>
));
StatCard.displayName = "StatCard";

const Dashboard: React.FC<DashboardProps> = ({ org, dashboard }) => {
  const minuteLimitFromOrg =
    dashboard.usage.minuteLimit || org.subscription?.usage?.minuteLimit || 500;
  const [live, setLive] = useState<DashboardLiveState>({
    ...EMPTY_LIVE_STATE,
    minuteLimit: minuteLimitFromOrg,
    remainingMinutes: minuteLimitFromOrg,
  });
  const [selectedAgentId, setSelectedAgentId] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [chartsReady, setChartsReady] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const run = () => setChartsReady(true);
    const windowWithIdle = window as Window & {
      requestIdleCallback?: (
        cb: () => void,
        opts?: { timeout?: number },
      ) => number;
    };
    if (windowWithIdle.requestIdleCallback) {
      const id = windowWithIdle.requestIdleCallback(run, { timeout: 900 });
      return () => {
        if ("cancelIdleCallback" in window)
          (
            window as Window & { cancelIdleCallback?: (id: number) => void }
          ).cancelIdleCallback?.(id);
      };
    }
    const timer = window.setTimeout(run, 80);
    return () => window.clearTimeout(timer);
  }, []);

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const [
        callsPayload,
        schedulesPayload,
        notificationPayload,
        dashboardPayload,
      ] = await Promise.allSettled([
        voiceCallsApi.calls.getCalls({ page: 1, limit: 200 }),
        voiceCallsApi.outreach.getOutreachSchedules(),
        voiceCallsApi.notifications.getUnreadNotificationCount(),
        voiceCallsApi.dashboard.getMetrics(),
      ]);

      const callsResult =
        callsPayload.status === "fulfilled"
          ? normalizeCallsResponse(callsPayload.value)
          : { calls: [], metrics: {} };
      const schedules =
        schedulesPayload.status === "fulfilled"
          ? getArrayPayload(schedulesPayload.value, [
              "schedules",
              "data",
              "items",
              "results",
            ])
              .map((item: unknown) => normalizeSchedule(item))
              .filter((item): item is ScheduleRow => Boolean(item))
          : [];
      const notificationRecord =
        notificationPayload.status === "fulfilled"
          ? getObject(notificationPayload.value)
          : {};
      const extraMetrics =
        dashboardPayload.status === "fulfilled"
          ? normalizeDashboardMetrics(
              dashboardPayload.value,
              minuteLimitFromOrg,
            )
          : {
              ...EMPTY_EXTRA,
              minuteLimit: minuteLimitFromOrg,
              remainingMinutes: minuteLimitFromOrg,
            };

      const calls = callsResult.calls;
      const completed = calls.filter(
        (call) => call.status === "completed",
      ).length;
      const failed = calls.filter((call) =>
        [
          "failed",
          "busy",
          "no-answer",
          "no_answer",
          "cancelled",
          "canceled",
        ].includes(call.status),
      ).length;
      const totalDurationFromCalls = calls.reduce(
        (sum, call) => sum + Math.max(0, call.duration),
        0,
      );
      const totalSeconds =
        extraMetrics.totalCallSeconds ||
        callsResult.metrics.totalCallSeconds ||
        totalDurationFromCalls;
      const totalMinutes =
        extraMetrics.totalCallMinutes ||
        callsResult.metrics.totalCallMinutes ||
        totalSeconds / 60;
      const minuteLimit = extraMetrics.minuteLimit || minuteLimitFromOrg;
      const activeSchedules = schedules.filter((schedule) =>
        ["active", "queued", "scheduled", "draft"].includes(schedule.status),
      ).length;
      const completedSchedules = schedules.filter(
        (schedule) => schedule.status === "completed",
      ).length;
      const failedSchedules = schedules.filter((schedule) =>
        ["failed", "cancelled", "canceled"].includes(schedule.status),
      ).length;

      startTransition(() => {
        setLive({
          calls,
          totalCalls: callsResult.metrics.totalCalls || calls.length,
          completedCalls: callsResult.metrics.completedCalls || completed,
          failedCalls: callsResult.metrics.failedCalls || failed,
          outboundCalls: calls.filter((call) => call.direction === "outbound")
            .length,
          inboundCalls: calls.filter((call) => call.direction === "inbound")
            .length,
          activeSchedules,
          completedSchedules,
          failedSchedules,
          unreadNotifications: safeNumber(
            notificationRecord.unreadCount ||
              notificationRecord.unread_count ||
              getObject(notificationRecord.metrics).unread,
            0,
          ),
          ...extraMetrics,
          totalCallSeconds: totalSeconds,
          totalCallMinutes: totalMinutes,
          minuteLimit,
          remainingMinutes: Math.max(0, minuteLimit - totalMinutes),
          usagePercent: Math.min(
            100,
            minuteLimit ? (totalMinutes / minuteLimit) * 100 : 0,
          ),
        });
        setLastUpdated(new Date().toISOString());
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load dashboard metrics.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [minuteLimitFromOrg]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const agentStats = useMemo<AgentStats[]>(() => {
    return org.voiceAgents.map((agent) => {
      const calls = live.calls.filter((call) => call.agentId === agent.id);
      const completed = calls.filter(
        (call) => call.status === "completed",
      ).length;
      const failed = calls.filter((call) =>
        ["failed", "cancelled", "canceled"].includes(call.status),
      ).length;
      return {
        agentId: agent.id,
        agentName: agent.name,
        totalCalls: calls.length,
        completedCalls: completed,
        failedCalls: failed,
        totalDuration: calls.reduce(
          (sum, call) => sum + Math.max(0, call.duration),
          0,
        ),
        inboundCalls: calls.filter((call) => call.direction === "inbound")
          .length,
        outboundCalls: calls.filter((call) => call.direction === "outbound")
          .length,
      };
    });
  }, [live.calls, org.voiceAgents]);

  const displayedCalls = useMemo(() => {
    const source =
      selectedAgentId === "all"
        ? live.calls
        : live.calls.filter((call) => call.agentId === selectedAgentId);
    return source.slice(0, 5);
  }, [live.calls, selectedAgentId]);

  const selectedStats = useMemo(() => {
    if (selectedAgentId === "all") {
      return {
        totalCalls: live.totalCalls,
        completedCalls: live.completedCalls,
        failedCalls: live.failedCalls,
        totalDuration: live.totalCallSeconds,
        inboundCalls: live.inboundCalls,
        outboundCalls: live.outboundCalls,
      };
    }
    return (
      agentStats.find((agent) => agent.agentId === selectedAgentId) || {
        totalCalls: 0,
        completedCalls: 0,
        failedCalls: 0,
        totalDuration: 0,
        inboundCalls: 0,
        outboundCalls: 0,
      }
    );
  }, [agentStats, live, selectedAgentId]);

  const flowData = useMemo<FlowPoint[]>(() => {
    const days: FlowPoint[] = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - index));
      return {
        name: new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(
          date,
        ),
        calls: 0,
        completed: 0,
      };
    });
    const dayKeys = days.map((_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - index));
      return date.toISOString().slice(0, 10);
    });
    const source =
      selectedAgentId === "all"
        ? live.calls
        : live.calls.filter((call) => call.agentId === selectedAgentId);
    source.forEach((call) => {
      const key = new Date(call.createdAt).toISOString().slice(0, 10);
      const index = dayKeys.indexOf(key);
      if (index >= 0) {
        days[index].calls += 1;
        if (call.status === "completed") days[index].completed += 1;
      }
    });
    return days;
  }, [live.calls, selectedAgentId]);

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">
            Dashboard
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900">
            Workspace overview
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Live voice, chatbot, lead, and usage metrics from your backend.
          </p>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:w-auto sm:flex sm:flex-wrap sm:items-center">
          {lastUpdated && (
            <span className="rounded-full bg-slate-100 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Updated {formatDateTime(lastUpdated)}
            </span>
          )}
          <button
            type="button"
            onClick={() => void loadDashboard()}
            disabled={isLoading}
            className="rounded-2xl bg-slate-900 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
          >
            {isLoading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-3xl border border-red-100 bg-red-50 p-4 text-sm font-semibold text-red-600">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <StatCard
          label="Total calls"
          value={String(selectedStats.totalCalls)}
          icon="☎️"
          sub="All call records"
        />
        <StatCard
          label="Completed"
          value={String(selectedStats.completedCalls)}
          icon="✅"
          sub="Finished calls"
        />
        <StatCard
          label="Failed"
          value={String(selectedStats.failedCalls)}
          icon="⚠️"
          sub="Failed/cancelled"
        />
        <StatCard
          label="Call usage"
          value={formatUsageMinutes(
            selectedStats.totalDuration / 60 || live.totalCallMinutes,
          )}
          icon="⏱️"
          sub={`of ${formatUsageMinutes(live.minuteLimit)} limit`}
        />
        <StatCard
          label="Chatbot answers"
          value={String(live.chatbotMessagesAnswered)}
          icon="💬"
          sub={`${live.chatbotTotalMessages} messages`}
        />
        <StatCard
          label="Leads captured"
          value={String(live.totalLeadsCaptured)}
          icon="🧲"
          sub={`${live.chatbotLeadsCaptured} bot · ${live.callLeadsCaptured} call`}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)]">
        <div className="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Call flow
              </p>
              <h2 className="text-base font-black text-slate-900">
                Last 7 days
              </h2>
            </div>
            <div className="flex max-h-28 w-full flex-wrap gap-2 overflow-y-auto pr-1 sm:w-auto">
              <button
                type="button"
                onClick={() => setSelectedAgentId("all")}
                className={`rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-colors ${selectedAgentId === "all" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
              >
                All agents
              </button>
              {org.voiceAgents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => setSelectedAgentId(agent.id)}
                  className={`rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-colors ${selectedAgentId === agent.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
                >
                  {agent.name}
                </button>
              ))}
            </div>
          </div>
          <div className="h-56 sm:h-64">
            {chartsReady ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={flowData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#f1f5f9"
                  />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#94a3b8", fontSize: 11, fontWeight: 700 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#94a3b8", fontSize: 11, fontWeight: 700 }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "14px",
                      border: "none",
                      boxShadow: "0 12px 35px rgba(15, 23, 42, 0.12)",
                      fontSize: "12px",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="calls"
                    name="Calls"
                    stroke="#6366f1"
                    fill="#6366f1"
                    fillOpacity={0.12}
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="completed"
                    name="Completed"
                    stroke="#10b981"
                    fill="#10b981"
                    fillOpacity={0.12}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center rounded-3xl bg-slate-50 text-sm font-semibold text-slate-400">
                Preparing chart…
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Agent performance
          </p>
          <div className="mt-4 max-h-[23rem] space-y-3 overflow-y-auto pr-1">
            {agentStats.map((agent) => (
              <button
                key={agent.agentId}
                type="button"
                onClick={() => setSelectedAgentId(agent.agentId)}
                className={`w-full rounded-2xl border p-4 text-left transition-colors ${selectedAgentId === agent.agentId ? "border-slate-900 bg-slate-900 text-white" : "border-slate-100 bg-slate-50 text-slate-700 hover:border-slate-200"}`}
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <p className="text-sm font-black">{agent.agentName}</p>
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-70">
                    {agent.totalCalls} calls
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 text-[10px] font-bold uppercase tracking-widest opacity-80 min-[420px]:grid-cols-3">
                  <span>{agent.completedCalls} done</span>
                  <span>{agent.outboundCalls} out</span>
                  <span>{formatDuration(agent.totalDuration)}</span>
                </div>
              </button>
            ))}
            {!agentStats.length && (
              <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
                No voice agents yet.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div className="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Direction mix
          </p>
          <div className="mt-4 h-64 sm:h-[21rem]">
            {chartsReady ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={[
                    { name: "Inbound", calls: selectedStats.inboundCalls },
                    { name: "Outbound", calls: selectedStats.outboundCalls },
                  ]}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#f1f5f9"
                  />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#94a3b8", fontSize: 11, fontWeight: 700 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#94a3b8", fontSize: 11, fontWeight: 700 }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "14px",
                      border: "none",
                      fontSize: "12px",
                    }}
                  />
                  <Bar
                    dataKey="calls"
                    name="Calls"
                    fill="#0f172a"
                    radius={[10, 10, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center rounded-3xl bg-slate-50 text-sm font-semibold text-slate-400">
                Preparing chart…
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Recent calls
              </p>
              <h2 className="text-base font-black text-slate-900">
                Latest 5 activities
              </h2>
            </div>
          </div>
          <div className="max-h-[21rem] space-y-2 overflow-y-auto pr-1">
            {displayedCalls.map((call) => (
              <div
                key={call.id}
                className="flex flex-col gap-3 rounded-2xl bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-900">
                    {call.callerName}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {call.callerPhone || "No phone"} ·{" "}
                    {titleCase(call.direction)} ·{" "}
                    {formatDateTime(call.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                    {formatDuration(call.duration)}
                  </span>
                  <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-white">
                    {titleCase(call.status)}
                  </span>
                </div>
              </div>
            ))}
            {!displayedCalls.length && (
              <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
                No calls found yet. New inbound and outbound calls will appear
                here.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Minute usage
            </p>
            <h2 className="text-base font-black text-slate-900">
              {org.subscription.plan} plan
            </h2>
          </div>
          <span className="text-xs font-black text-slate-500">
            {formatUsageMinutes(live.totalCallMinutes)} /{" "}
            {formatUsageMinutes(live.minuteLimit)}
          </span>
        </div>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-slate-900 transition-[width] duration-700"
            style={{ width: `${live.usagePercent}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-[10px] font-bold uppercase tracking-widest text-slate-400">
          <span>{formatUsageMinutes(live.totalCallMinutes)} used</span>
          <span>{formatUsageMinutes(live.remainingMinutes)} remaining</span>
        </div>
      </div>
    </div>
  );
};
export default Dashboard;
