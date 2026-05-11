import React, { useState, useEffect, useCallback } from "react";
import { CallRecord, CallOutcome, Organization } from "../types";
import { voiceCallsApi } from "../services/voiceCallsApi";
import AppModal from "../components/AppModal";

const OUTCOME_STYLE: Record<string, string> = {
  "Lead Captured": "bg-emerald-50 text-emerald-700 border-emerald-100",
  "Appointment Booked": "bg-indigo-50 text-indigo-700 border-indigo-100",
  "FAQ Answered": "bg-blue-50 text-blue-600 border-blue-100",
  Escalated: "bg-amber-50 text-amber-700 border-amber-100",
  Voicemail: "bg-slate-100 text-slate-500 border-slate-200",
};
const OUTCOME_DOT: Record<string, string> = {
  "Lead Captured": "bg-emerald-500",
  "Appointment Booked": "bg-indigo-500",
  "FAQ Answered": "bg-blue-400",
  Escalated: "bg-amber-500",
  Voicemail: "bg-slate-300",
};
const DIRECTION_ICON: Record<string, string> = {
  inbound: "fa-phone-arrow-down-left",
  outbound: "fa-phone-arrow-up-right",
};
const FILTERS = ["All", ...Object.values(CallOutcome)];

type DetailedCall = CallRecord & {
  _transcript?: { speaker: string; text: string }[];
  _summary?: string;
  _recording?: {
    signed_url?: string;
    mime_type?: string;
    recording_status?: string;
  } | null;
  _unanswered?: { id: string; question: string; created_at?: string }[];
  _loading?: boolean;
};

interface CallLogsProps {
  org: Organization;
  onDownloadReport: (callId: string) => Promise<void>;
}

const fmtDur = (s: number) => `${Math.floor(s / 60)}m ${s % 60}s`;
const fmtTime = (ts: string) =>
  new Date(ts).toLocaleDateString() +
  " " +
  new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const CallLogs: React.FC<CallLogsProps> = ({ org, onDownloadReport }) => {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const LIMIT = 25;

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [dirFilter, setDirFilter] = useState<"all" | "inbound" | "outbound">(
    "all",
  );

  const [selected, setSelected] = useState<DetailedCall | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<{ msg: string; ok: boolean } | null>(
    null,
  );

  const showToast = (msg: string, ok = true) => {
    setToastMsg({ msg, ok });
    window.setTimeout(() => setToastMsg(null), 4000);
  };

  const loadCalls = useCallback(async (pg = 1) => {
    setLoading(true);
    setLoadError("");
    try {
      const res = (await voiceCallsApi.calls.getCalls({
        page: pg,
        limit: LIMIT,
      })) as any;
      const list: CallRecord[] = (res?.calls || []).map((c: any) => ({
        id: c.id,
        callerName: c.caller_name || c.callerName || "Unknown Caller",
        callerPhone: c.caller_phone || c.callerPhone || "",
        duration: c.duration || 0,
        timestamp: c.timestamp || c.created_at || "",
        outcome: (c.outcome as CallOutcome) || CallOutcome.FAQ_ANSWERED,
        summary: c.summary || "",
        transcript: c.transcript || [],
        direction: c.direction,
        status: c.status,
        voice_agent_id: c.voice_agent_id,
        recording_available: c.recording_available,
        recording_status: c.recording_status,
      }));
      setCalls(list);
      setTotal(res?.total || list.length);
      setPage(pg);
    } catch (err: any) {
      setLoadError(err?.message || "Failed to load call records.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCalls(1);
  }, [loadCalls]);

  const openCall = async (call: CallRecord) => {
    const detail: DetailedCall = { ...call, _loading: true };
    setSelected(detail);
    try {
      const [txRes, uqRes] = await Promise.allSettled([
        voiceCallsApi.calls.getCallTranscript(call.id),
        voiceCallsApi.calls.getCallUnansweredQuestions(call.id),
      ]);
      const tx = txRes.status === "fulfilled" ? (txRes.value as any) : null;
      const uq = uqRes.status === "fulfilled" ? (uqRes.value as any) : null;

      let recording = null;
      if (call.recording_available) {
        try {
          recording = (await voiceCallsApi.calls.getCallRecording(
            call.id,
          )) as any;
          recording = recording?.recording || recording;
        } catch {
          /* recording may not be ready */
        }
      }

      setSelected({
        ...call,
        _loading: false,
        _transcript: tx?.transcript || call.transcript || [],
        _summary: tx?.summary || call.summary || "",
        _recording: recording,
        _unanswered: uq?.unansweredQuestions || [],
      });
    } catch {
      setSelected({ ...call, _loading: false });
    }
  };

  const handleDownload = async (callId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDownloading(callId);
    try {
      await onDownloadReport(callId);
    } catch (err: any) {
      showToast(err?.message || "Download failed.", false);
    } finally {
      setDownloading(null);
    }
  };

  const handleSummarize = async (callId: string) => {
    try {
      const res = (await voiceCallsApi.calls.summarizeCall(callId)) as any;
      setSelected((prev) =>
        prev ? { ...prev, _summary: res?.summary || prev._summary } : prev,
      );
      showToast("Summary regenerated.");
    } catch (err: any) {
      showToast(err?.message || "Summarize failed.", false);
    }
  };

  const filtered = calls.filter((c) => {
    const matchSearch =
      (c.callerName || "").toLowerCase().includes(search.toLowerCase()) ||
      (c.callerPhone || "").includes(search);
    const matchOutcome = filter === "All" || c.outcome === filter;
    const matchDir = dirFilter === "all" || c.direction === dirFilter;
    return matchSearch && matchOutcome && matchDir;
  });

  const stats = {
    total: total,
    leads: calls.filter(
      (c) =>
        c.outcome === CallOutcome.LEAD_CAPTURED ||
        c.outcome === CallOutcome.APPOINTMENT_BOOKED,
    ).length,
    missed: calls.filter(
      (c) =>
        c.outcome === CallOutcome.VOICEMAIL ||
        c.outcome === CallOutcome.ESCALATED,
    ).length,
    avgDur: calls.length
      ? Math.round(calls.reduce((s, c) => s + c.duration, 0) / calls.length)
      : 0,
  };

  const agentMap = Object.fromEntries(
    (org.voiceAgents || []).map((a) => [a.id, a.name]),
  );

  return (
    <div className="space-y-5 animate-fade-up">
      {toastMsg && (
        <div
          className={`fixed top-5 right-5 z-[200] px-5 py-3 rounded-2xl shadow-xl text-sm font-bold ${toastMsg.ok ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}
        >
          {toastMsg.msg}
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          {
            label: "Total Calls",
            value: stats.total,
            icon: "fa-phone-volume",
            color: "text-indigo-600 bg-indigo-50",
          },
          {
            label: "Leads",
            value: stats.leads,
            icon: "fa-users",
            color: "text-emerald-600 bg-emerald-50",
          },
          {
            label: "Missed",
            value: stats.missed,
            icon: "fa-phone-slash",
            color: "text-amber-600 bg-amber-50",
          },
          {
            label: "Avg Duration",
            value: fmtDur(stats.avgDur),
            icon: "fa-stopwatch",
            color: "text-blue-600 bg-blue-50",
          },
        ].map((s) => (
          <div
            key={s.label}
            className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3"
          >
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center ${s.color}`}
            >
              <i className={`fa-sharp fa-solid ${s.icon} text-sm`} />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                {s.label}
              </p>
              <p className="font-black text-slate-900">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Header + filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div>
          <h2 className="text-xl font-black text-slate-900">Call History</h2>
          <p className="text-xs text-slate-400">
            {filtered.length} of {total} calls
          </p>
        </div>
        <div className="flex gap-3 sm:ml-auto flex-wrap items-center">
          <div className="relative">
            <i className="fa-sharp fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
            <input
              type="text"
              placeholder="Search caller…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium outline-none focus:ring-2 focus:ring-amber-400 w-48"
            />
          </div>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-slate-200 text-[10px] font-black uppercase tracking-widest outline-none bg-white focus:ring-2 focus:ring-amber-400"
          >
            {FILTERS.map((f) => (
              <option key={f} value={f}>
                {f === "All" ? "All Outcomes" : f}
              </option>
            ))}
          </select>
          <select
            value={dirFilter}
            onChange={(e) => setDirFilter(e.target.value as any)}
            className="px-3 py-2.5 rounded-xl border border-slate-200 text-[10px] font-black uppercase tracking-widest outline-none bg-white focus:ring-2 focus:ring-amber-400"
          >
            <option value="all">All Directions</option>
            <option value="inbound">Inbound</option>
            <option value="outbound">Outbound</option>
          </select>
          <button
            onClick={() => void loadCalls(1)}
            disabled={loading}
            className="px-4 py-2.5 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 disabled:opacity-50 transition-all"
          >
            {loading ? (
              <i className="fa-sharp fa-solid fa-spinner fa-spin" />
            ) : (
              "Refresh"
            )}
          </button>
        </div>
      </div>

      {/* Outcome pills */}
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all border ${filter === f ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 text-slate-500 hover:border-slate-300"}`}
          >
            {f}
          </button>
        ))}
      </div>

      {loadError && (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
          {loadError}
        </div>
      )}

      {loading && calls.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-card p-16 text-center">
          <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400">Loading call records…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-3xl border-2 border-dashed border-slate-200 py-20 text-center">
          <i className="fa-sharp fa-solid fa-phone-slash text-4xl text-slate-200 mb-4 block" />
          <p className="text-slate-400 font-bold">
            No calls match your filters
          </p>
          <p className="text-xs text-slate-300 mt-1">
            {calls.length === 0
              ? "Calls will appear here once your agent starts receiving them."
              : "Try a different filter."}
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {filtered.map((call) => (
              <div
                key={call.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer"
                onClick={() => void openCall(call)}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-black text-sm shrink-0">
                      {(call.callerName || "U")[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-black text-slate-900">
                          {call.callerName || "Unknown Caller"}
                        </p>
                        <span
                          className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border uppercase tracking-wider ${OUTCOME_STYLE[call.outcome] || "bg-slate-100 text-slate-500 border-slate-200"}`}
                        >
                          <span
                            className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${OUTCOME_DOT[call.outcome] || "bg-slate-400"}`}
                          />
                          {call.outcome}
                        </span>
                        {call.direction && (
                          <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-slate-500 uppercase tracking-wider">
                            <i
                              className={`fa-sharp fa-solid ${DIRECTION_ICON[call.direction] || "fa-phone"} mr-1`}
                            />
                            {call.direction}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <p className="text-xs text-slate-400">
                          {call.callerPhone}
                        </p>
                        <span className="text-slate-200">·</span>
                        <p className="text-xs text-slate-400">
                          {fmtDur(call.duration)}
                        </p>
                        <span className="text-slate-200">·</span>
                        <p className="text-xs text-slate-400">
                          {fmtTime(call.timestamp)}
                        </p>
                        {call.voice_agent_id &&
                          agentMap[call.voice_agent_id] && (
                            <>
                              <span className="text-slate-200">·</span>
                              <p className="text-xs text-slate-400">
                                {agentMap[call.voice_agent_id]}
                              </p>
                            </>
                          )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void openCall(call);
                      }}
                      className="px-4 py-2 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-amber-600 transition-all"
                    >
                      View
                    </button>
                    <button
                      onClick={(e) => void handleDownload(call.id, e)}
                      disabled={downloading === call.id}
                      className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 text-[10px] font-black uppercase tracking-widest hover:border-slate-300 disabled:opacity-50 transition-all"
                    >
                      {downloading === call.id ? (
                        <i className="fa-sharp fa-solid fa-spinner fa-spin" />
                      ) : (
                        "Report"
                      )}
                    </button>
                  </div>
                </div>
                {call.summary && (
                  <p className="mt-3 text-xs text-slate-500 italic bg-slate-50 rounded-xl px-4 py-2.5 line-clamp-2">
                    "{call.summary}"
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Pagination */}
          {total > LIMIT && (
            <div className="flex items-center justify-center gap-3 py-4">
              <button
                onClick={() => void loadCalls(page - 1)}
                disabled={page <= 1 || loading}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-black text-slate-600 hover:border-slate-300 disabled:opacity-40 transition-all"
              >
                ← Prev
              </button>
              <span className="text-xs text-slate-400 font-medium">
                Page {page} of {Math.ceil(total / LIMIT)}
              </span>
              <button
                onClick={() => void loadCalls(page + 1)}
                disabled={page * LIMIT >= total || loading}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-black text-slate-600 hover:border-slate-300 disabled:opacity-40 transition-all"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}

      {/* Detail Modal */}
      <AppModal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.callerName || "Call Details"}
        description={
          selected
            ? `${selected.callerPhone} · ${fmtDur(selected.duration)}`
            : undefined
        }
        size="xl"
        footer={
          selected ? (
            <div className="flex gap-3">
              <button
                onClick={(e) => void handleDownload(selected.id, e)}
                disabled={downloading === selected.id}
                className="flex-1 bg-slate-900 text-white py-3 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-amber-600 disabled:opacity-50 transition-all"
              >
                {downloading === selected.id
                  ? "Downloading…"
                  : "Download Report"}
              </button>
              <button
                onClick={() => void handleSummarize(selected.id)}
                className="px-4 border-2 border-slate-200 text-slate-600 py-3 rounded-xl font-black uppercase tracking-widest text-[10px] hover:border-slate-300 transition-all"
              >
                Re-summarize
              </button>
              <button
                onClick={() => setSelected(null)}
                className="flex-1 border-2 border-slate-200 text-slate-600 py-3 rounded-xl font-black uppercase tracking-widest text-[10px] hover:border-slate-300 transition-all"
              >
                Close
              </button>
            </div>
          ) : null
        }
      >
        {selected ? (
          <div className="space-y-5">
            {selected._loading && (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                Loading call details…
              </div>
            )}

            {/* Meta badges */}
            <div className="flex flex-wrap gap-2 items-center">
              <span
                className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border ${OUTCOME_STYLE[selected.outcome] || ""}`}
              >
                {selected.outcome}
              </span>
              {selected.direction && (
                <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-slate-500 uppercase">
                  <i
                    className={`fa-sharp fa-solid ${DIRECTION_ICON[selected.direction] || "fa-phone"} mr-1`}
                  />
                  {selected.direction}
                </span>
              )}
              {selected.status && (
                <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 uppercase">
                  {selected.status}
                </span>
              )}
              <p className="text-xs text-slate-400 ml-auto">
                {fmtTime(selected.timestamp)}
              </p>
            </div>

            {/* Summary */}
            {(selected._summary || selected.summary) && (
              <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
                <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-1">
                  AI Summary
                </p>
                <p className="text-sm text-amber-900 font-medium">
                  {selected._summary || selected.summary}
                </p>
              </div>
            )}

            {/* Linked lead */}
            {selected.lead && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">
                  Linked Lead
                </p>
                <p className="text-sm font-black text-slate-900">
                  {selected.lead.name}
                </p>
                {selected.lead.phone && (
                  <p className="text-xs text-slate-500">
                    {selected.lead.phone}
                  </p>
                )}
                {selected.lead.email && (
                  <p className="text-xs text-slate-500">
                    {selected.lead.email}
                  </p>
                )}
              </div>
            )}

            {/* Transcript */}
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                Full Transcript
              </p>
              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {(
                  (selected._transcript && selected._transcript.length > 0
                    ? selected._transcript
                    : selected.transcript) || []
                ).length > 0 ? (
                  (selected._transcript && selected._transcript.length > 0
                    ? selected._transcript
                    : selected.transcript
                  ).map((m, i) => {
                    const isAgent =
                      String(m.speaker || "")
                        .toLowerCase()
                        .includes("agent") ||
                      String(m.speaker || "")
                        .toLowerCase()
                        .includes("assistant");
                    return (
                      <div
                        key={i}
                        className={`flex flex-col gap-1 ${isAgent ? "items-start" : "items-end"}`}
                      >
                        <span
                          className={`text-[10px] font-black uppercase ${isAgent ? "text-amber-600" : "text-slate-400"}`}
                        >
                          {m.speaker}
                        </span>
                        <p
                          className={`px-4 py-2.5 rounded-2xl text-sm font-medium max-w-[82%] ${isAgent ? "bg-slate-50 text-slate-800 rounded-tl-none" : "bg-slate-900 text-white rounded-tr-none"}`}
                        >
                          {m.text}
                        </p>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-slate-400 italic">
                    No transcript available for this call.
                  </p>
                )}
              </div>
            </div>

            {/* Unanswered questions */}
            {(selected._unanswered || []).length > 0 && (
              <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
                <p className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-2">
                  Unanswered Questions ({selected._unanswered!.length})
                </p>
                <ul className="space-y-1">
                  {selected._unanswered!.map((uq) => (
                    <li key={uq.id} className="text-sm text-red-800">
                      • {uq.question}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Recording */}
            {selected._recording?.signed_url ? (
              <div className="bg-slate-50 rounded-2xl p-4">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                  Recording
                </p>
                <audio
                  controls
                  src={selected._recording.signed_url}
                  className="w-full"
                />
              </div>
            ) : selected.recording_available ? (
              <div className="bg-slate-50 rounded-2xl p-4 text-center">
                <p className="text-xs text-slate-400">
                  Recording is processing…
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </AppModal>
    </div>
  );
};

export default CallLogs;
