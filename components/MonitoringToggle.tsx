import React, { useEffect, useState } from "react";
import knowledgeScrapeApi from "../services/knowledgeScrapeApi";

interface Props {
  knowledgeBaseId: string;
  initialEnabled?: boolean;
  initialMode?: "notify_only" | "auto_rescrape";
  initialIntervalHours?: number;
  lastCheckedAt?: string | null;
  onToast?: (message: string, ok?: boolean) => void;
}

const MonitoringToggle: React.FC<Props> = ({
  knowledgeBaseId,
  initialEnabled = false,
  initialMode = "auto_rescrape",
  lastCheckedAt = null,
  onToast,
}) => {
  const [enabled, setEnabled] = useState(initialEnabled);
  // change-monitor.js on the worker already has a complete, correct
  // notify_only branch (detect + notify, no auto-rescrape) — it was just
  // never reachable because this control always sent "auto_rescrape". Now it
  // sends whichever the tenant actually picks.
  const [mode, setMode] = useState<"notify_only" | "auto_rescrape">(
    initialMode,
  );
  const [changes, setChanges] = useState<
    Array<{ id: string; url: string; detectedAt: string }>
  >([]);
  const [busy, setBusy] = useState(false);

  useEffect(
    () => setEnabled(initialEnabled),
    [initialEnabled, knowledgeBaseId],
  );

  useEffect(
    () => setMode(initialMode),
    [initialMode, knowledgeBaseId],
  );

  useEffect(() => {
    if (!enabled) {
      setChanges([]);
      return;
    }
    knowledgeScrapeApi
      .listChanges(knowledgeBaseId)
      .then((r) => setChanges(Array.isArray(r?.changes) ? r.changes : []))
      .catch(() => undefined);
  }, [enabled, knowledgeBaseId]);

  const toggle = async () => {
    const next = !enabled;
    setEnabled(next);
    setBusy(true);
    try {
      await knowledgeScrapeApi.setMonitoring(knowledgeBaseId, {
        enabled: next,
        mode,
        intervalHours: 24,
      });
      onToast?.(
        next
          ? mode === "notify_only"
            ? "Daily change checks enabled. You'll be notified — nothing re-reads automatically."
            : "Daily automatic updates enabled. Selected pages will be checked every 24 hours."
          : "Daily change checks disabled.",
      );
    } catch (err: any) {
      setEnabled(!next);
      onToast?.(err?.message || "Could not save monitoring settings.", false);
    } finally {
      setBusy(false);
    }
  };

  const changeMode = async (next: "notify_only" | "auto_rescrape") => {
    if (next === mode) return;
    const prev = mode;
    setMode(next);
    setBusy(true);
    try {
      await knowledgeScrapeApi.setMonitoring(knowledgeBaseId, {
        enabled,
        mode: next,
        intervalHours: 24,
      });
      onToast?.(
        next === "notify_only"
          ? "Switched to notify-only — you'll review changes before they're re-read."
          : "Switched to automatic — changed pages re-read without waiting for you.",
      );
    } catch (err: any) {
      setMode(prev);
      onToast?.(err?.message || "Could not save monitoring settings.", false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-card sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-base font-black text-slate-900">
            Keep this up to date
          </h3>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">
            Every 24 hours, Agently checks only the pages you selected.{" "}
            {mode === "notify_only"
              ? "You'll be notified of any changes and decide when to re-read them."
              : "Changed pages are re-read automatically in the background, then your agents use the updated knowledge."}
          </p>
          {lastCheckedAt && enabled && (
            <p className="mt-2 text-[11px] font-semibold text-slate-400">
              Last checked {new Date(lastCheckedAt).toLocaleString()}
            </p>
          )}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Keep selected pages updated every 24 hours"
          disabled={busy}
          onClick={() => void toggle()}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${enabled ? "bg-emerald-500" : "bg-slate-300"} disabled:opacity-50`}
        >
          <span
            className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${enabled ? "left-6" : "left-1"}`}
          />
        </button>
      </div>

      {enabled && (
        <div className="mt-4 flex gap-2 rounded-xl bg-slate-50 p-1">
          <button
            type="button"
            disabled={busy}
            onClick={() => void changeMode("auto_rescrape")}
            className={`flex-1 rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-widest transition disabled:opacity-50 ${mode === "auto_rescrape" ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
          >
            Auto-update
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void changeMode("notify_only")}
            className={`flex-1 rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-widest transition disabled:opacity-50 ${mode === "notify_only" ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
          >
            Notify only
          </button>
        </div>
      )}

      {enabled && changes.length > 0 && (
        <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
          <p className="text-xs font-black text-indigo-900">
            {changes.length} update{changes.length === 1 ? "" : "s"} detected
          </p>
          <p className="mt-1 text-[11px] text-indigo-700">
            {mode === "notify_only"
              ? "Open Knowledge Bases to re-read these pages when you're ready."
              : "These pages are queued for automatic refresh. No action is needed."}
          </p>
          <ul className="mt-2 space-y-1">
            {changes.slice(0, 5).map((change) => {
              let label = change.url;
              try {
                label = new URL(change.url).pathname || "/";
              } catch {
                // Keep the original URL.
              }
              return (
                <li
                  key={change.id}
                  className="truncate font-mono text-[11px] text-indigo-700"
                >
                  {label}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};

export default MonitoringToggle;
