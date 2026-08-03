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
  lastCheckedAt = null,
  onToast,
}) => {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [changes, setChanges] = useState<
    Array<{ id: string; url: string; detectedAt: string }>
  >([]);
  const [busy, setBusy] = useState(false);

  useEffect(
    () => setEnabled(initialEnabled),
    [initialEnabled, knowledgeBaseId],
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
        mode: "auto_rescrape",
        intervalHours: 24,
      });
      onToast?.(
        next
          ? "Daily automatic updates enabled. Selected pages will be checked every 24 hours."
          : "Daily automatic updates disabled.",
      );
    } catch (err: any) {
      setEnabled(!next);
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
            Every 24 hours, Agently checks only the pages you selected. Changed
            pages are re-read automatically in the background, then your agents
            use the updated knowledge and you receive a notification.
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

      {enabled && changes.length > 0 && (
        <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
          <p className="text-xs font-black text-indigo-900">
            {changes.length} update{changes.length === 1 ? "" : "s"} detected
          </p>
          <p className="mt-1 text-[11px] text-indigo-700">
            These pages are queued for automatic refresh. No action is needed.
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
