/**
 * agently/components/MonitoringToggle.tsx   <-- NEW FILE
 * PATCH 26 — P3. CURRENT_ISSUES → Settings page → 4(i), 4(j), 4(k).
 *
 * "there should be a button that could be toggled on — this button runs a
 *  check on the website every 24 hours ... it shows in the notification
 *  section — something like 4 new changes discovered in .product page"
 */

import React, { useEffect, useState } from 'react';
import knowledgeScrapeApi from '../services/knowledgeScrapeApi';

interface Props {
  knowledgeBaseId: string;
  initialEnabled?: boolean;
  initialMode?: 'notify_only' | 'auto_rescrape';
  initialIntervalHours?: number;
  lastCheckedAt?: string | null;
  onToast?: (message: string, ok?: boolean) => void;
}

const MonitoringToggle: React.FC<Props> = ({
  knowledgeBaseId,
  initialEnabled = false,
  initialMode = 'notify_only',
  initialIntervalHours = 24,
  lastCheckedAt = null,
  onToast,
}) => {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [mode, setMode] = useState(initialMode);
  const [interval, setIntervalHours] = useState(initialIntervalHours);
  const [changes, setChanges] = useState<Array<{ id: string; url: string; detectedAt: string }>>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    knowledgeScrapeApi
      .listChanges(knowledgeBaseId)
      .then((r) => setChanges(r.changes))
      .catch(() => undefined);
  }, [enabled, knowledgeBaseId]);

  const save = async (patch: Parameters<typeof knowledgeScrapeApi.setMonitoring>[1]) => {
    setBusy(true);
    try {
      await knowledgeScrapeApi.setMonitoring(knowledgeBaseId, patch);
      onToast?.('Monitoring settings saved.');
    } catch (err: any) {
      onToast?.(err?.message || 'Could not save monitoring settings.', false);
    } finally {
      setBusy(false);
    }
  };

  const resync = async () => {
    setBusy(true);
    try {
      const result = await knowledgeScrapeApi.resyncChanges(knowledgeBaseId);
      onToast?.(result.message);
      setChanges([]);
    } catch (err: any) {
      onToast?.(err?.message || 'Could not start the update.', false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-black text-slate-900">Keep this up to date</h3>
          <p className="mt-1 max-w-md text-xs text-slate-500">
            We'll check the pages you selected every {interval} hours and tell you when
            something on your website changes — new products, updated prices, new blog posts.
          </p>
        </div>
        <button
          role="switch"
          aria-checked={enabled}
          disabled={busy}
          onClick={() => {
            const next = !enabled;
            setEnabled(next);
            void save({ enabled: next });
          }}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${enabled ? 'bg-emerald-500' : 'bg-slate-300'} disabled:opacity-50`}
        >
          <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${enabled ? 'left-6' : 'left-1'}`} />
        </button>
      </div>

      {enabled && (
        <div className="mt-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {/* Issue 4(k) — the two modes. */}
            <button
              onClick={() => { setMode('notify_only'); void save({ mode: 'notify_only' }); }}
              className={`rounded-2xl border p-4 text-left transition-all ${mode === 'notify_only' ? 'border-amber-400 bg-amber-50' : 'border-slate-200 hover:border-slate-300'}`}
            >
              <p className="text-xs font-black text-slate-900">Tell me first</p>
              <p className="mt-1 text-[11px] text-slate-500">
                We notify you when something changes. You decide what to update.
              </p>
            </button>
            <button
              onClick={() => { setMode('auto_rescrape'); void save({ mode: 'auto_rescrape' }); }}
              className={`rounded-2xl border p-4 text-left transition-all ${mode === 'auto_rescrape' ? 'border-amber-400 bg-amber-50' : 'border-slate-200 hover:border-slate-300'}`}
            >
              <p className="text-xs font-black text-slate-900">Update automatically</p>
              <p className="mt-1 text-[11px] text-slate-500">
                We re-read changed pages for you and notify you that we started. Uses credit.
              </p>
            </button>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Check every
            </label>
            <select
              value={interval}
              disabled={busy}
              onChange={(e) => {
                const v = Number(e.target.value);
                setIntervalHours(v);
                void save({ intervalHours: v });
              }}
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold outline-none focus:border-amber-300"
            >
              <option value={6}>6 hours</option>
              <option value={12}>12 hours</option>
              <option value={24}>24 hours</option>
              <option value={72}>3 days</option>
              <option value={168}>1 week</option>
            </select>
            {lastCheckedAt && (
              <span className="text-[11px] text-slate-400">
                Last checked {new Date(lastCheckedAt).toLocaleString()}
              </span>
            )}
          </div>

          {/* Issue 4(j) — pending changes, actionable from here. */}
          {changes.length > 0 && (
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
              <p className="text-xs font-black text-indigo-900">
                {changes.length} change{changes.length === 1 ? '' : 's'} found
              </p>
              <ul className="mt-2 space-y-1">
                {changes.slice(0, 5).map((c) => {
                  let path = c.url;
                  try { path = new URL(c.url).pathname; } catch { /* keep url */ }
                  return (
                    <li key={c.id} className="truncate font-mono text-[11px] text-indigo-700">
                      {path}
                    </li>
                  );
                })}
                {changes.length > 5 && (
                  <li className="text-[11px] text-indigo-600">and {changes.length - 5} more</li>
                )}
              </ul>
              <button
                onClick={() => void resync()}
                disabled={busy}
                className="mt-3 rounded-xl bg-indigo-600 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-50"
              >
                {busy ? 'Starting…' : 'Update these pages'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MonitoringToggle;
