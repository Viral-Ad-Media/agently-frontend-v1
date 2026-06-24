import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Organization } from "../types";
import { api } from "../services/api";
import { voiceCallsApi } from "../services/voiceCallsApi";

type CheckStatus = "idle" | "running" | "pass" | "warn" | "fail";

type CheckItem = {
  id: string;
  label: string;
  description: string;
  status: CheckStatus;
  detail?: string;
};

interface SystemCheckProps {
  org: Organization;
}

const statusClass = (status: CheckStatus) => {
  if (status === "pass") return "bg-emerald-50 text-emerald-700 ring-emerald-100";
  if (status === "warn") return "bg-amber-50 text-amber-700 ring-amber-100";
  if (status === "fail") return "bg-red-50 text-red-700 ring-red-100";
  if (status === "running") return "bg-indigo-50 text-indigo-700 ring-indigo-100";
  return "bg-slate-50 text-slate-500 ring-slate-100";
};

const statusLabel = (status: CheckStatus) => {
  if (status === "pass") return "Pass";
  if (status === "warn") return "Review";
  if (status === "fail") return "Fix";
  if (status === "running") return "Checking";
  return "Pending";
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  return "Unknown error";
};

const initialChecks: CheckItem[] = [
  {
    id: "browser",
    label: "Browser connection",
    description: "Confirms the browser is not reporting an offline state.",
    status: "idle",
  },
  {
    id: "knowledge-bases",
    label: "Knowledge Base API",
    description: "Checks that /api/knowledge-bases is reachable and authenticated.",
    status: "idle",
  },
  {
    id: "call-logs",
    label: "Call Logs API",
    description: "Checks that the merged Phone Numbers → Call Logs data endpoint responds.",
    status: "idle",
  },
  {
    id: "phone-numbers",
    label: "Phone Numbers API",
    description: "Checks tenant phone-number loading for this workspace.",
    status: "idle",
  },
  {
    id: "trial-line",
    label: "Free trial line readiness",
    description: "Checks whether the platform test line is configured before trial-call testing.",
    status: "idle",
  },
];

const SystemCheck: React.FC<SystemCheckProps> = ({ org }) => {
  const [checks, setChecks] = useState<CheckItem[]>(initialChecks);
  const [running, setRunning] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);

  const summary = useMemo(() => {
    const pass = checks.filter((check) => check.status === "pass").length;
    const warn = checks.filter((check) => check.status === "warn").length;
    const fail = checks.filter((check) => check.status === "fail").length;
    return { pass, warn, fail, total: checks.length };
  }, [checks]);

  const updateCheck = (id: string, updates: Partial<CheckItem>) => {
    setChecks((current) =>
      current.map((check) => (check.id === id ? { ...check, ...updates } : check)),
    );
  };

  const runChecks = async () => {
    setRunning(true);
    setChecks(initialChecks.map((check) => ({ ...check, status: "running", detail: undefined })));

    updateCheck("browser", {
      status: typeof navigator === "undefined" || navigator.onLine ? "pass" : "fail",
      detail:
        typeof navigator !== "undefined" && !navigator.onLine
          ? "The browser reports offline mode. Reconnect before testing."
          : "Browser connection is online.",
    });

    try {
      const knowledgeBases = await api.listKnowledgeBases();
      updateCheck("knowledge-bases", {
        status: knowledgeBases.length ? "pass" : "warn",
        detail: knowledgeBases.length
          ? `${knowledgeBases.length} knowledge base${knowledgeBases.length === 1 ? "" : "s"} returned.`
          : "Route works, but no knowledge base exists yet.",
      });
    } catch (error) {
      updateCheck("knowledge-bases", { status: "fail", detail: getErrorMessage(error) });
    }

    try {
      const response = await voiceCallsApi.calls.getCalls({ limit: 1 });
      const raw = response as { calls?: unknown[]; data?: unknown[]; items?: unknown[] };
      const calls = raw.calls || raw.data || raw.items || [];
      updateCheck("call-logs", {
        status: "pass",
        detail: `${Array.isArray(calls) ? calls.length : 0} sample call record${Array.isArray(calls) && calls.length === 1 ? "" : "s"} returned.`,
      });
    } catch (error) {
      updateCheck("call-logs", { status: "fail", detail: getErrorMessage(error) });
    }

    try {
      const response = await voiceCallsApi.phoneNumbers.getTwilioNumbers({ organizationId: org.id });
      const count = Array.isArray(response?.numbers) ? response.numbers.length : 0;
      updateCheck("phone-numbers", {
        status: "pass",
        detail: `${count} tenant phone number${count === 1 ? "" : "s"} returned.`,
      });
    } catch (error) {
      updateCheck("phone-numbers", { status: "fail", detail: getErrorMessage(error) });
    }

    try {
      const status = await api.getTestAgentStatus();
      const ready = Boolean(status?.ready || status?.sharedLineReady || status?.testLineReady || status?.canCall);
      updateCheck("trial-line", {
        status: ready ? "pass" : "warn",
        detail: ready
          ? "Free trial test line appears ready."
          : status?.message || "Free trial route works, but the platform test line still needs configuration.",
      });
    } catch (error) {
      updateCheck("trial-line", { status: "fail", detail: getErrorMessage(error) });
    }

    setLastRunAt(new Date().toLocaleString());
    setRunning(false);
  };

  useEffect(() => {
    void runChecks();
    // Run once on page open; user can rerun manually.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="animate-fade-up space-y-5">
      <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-card sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-600">
              Pre-test readiness
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
              System Check
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
              Use this before deep testing to catch broken API routing, missing backend mounts, trial-line configuration problems, or local frontend/backend connection issues.
            </p>
            {lastRunAt ? (
              <p className="mt-3 text-xs font-bold text-slate-400">Last checked: {lastRunAt}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Link
              to="/settings"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-600 transition hover:border-amber-200 hover:text-amber-700"
            >
              Back to Settings
            </Link>
            <button
              type="button"
              onClick={() => void runChecks()}
              disabled={running}
              className="rounded-2xl bg-slate-900 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-amber-600 disabled:opacity-40"
            >
              {running ? "Checking…" : "Run Checks"}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          ["Passed", summary.pass, "text-emerald-700 bg-emerald-50 ring-emerald-100"],
          ["Needs review", summary.warn, "text-amber-700 bg-amber-50 ring-amber-100"],
          ["Must fix", summary.fail, "text-red-700 bg-red-50 ring-red-100"],
        ].map(([label, value, tone]) => (
          <div key={String(label)} className={`rounded-2xl p-4 ring-1 ${tone}`}>
            <p className="text-[10px] font-black uppercase tracking-widest opacity-70">{label}</p>
            <p className="mt-2 text-2xl font-black">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3">
        {checks.map((check) => (
          <div key={check.id} className="rounded-[1.25rem] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-black text-slate-900">{check.label}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">{check.description}</p>
                {check.detail ? (
                  <p className="mt-2 break-words text-xs font-semibold text-slate-600">{check.detail}</p>
                ) : null}
              </div>
              <span className={`w-fit shrink-0 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ring-1 ${statusClass(check.status)}`}>
                {statusLabel(check.status)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SystemCheck;
