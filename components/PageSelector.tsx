/**
 * agently/components/PageSelector.tsx   <-- NEW FILE
 * PATCH 25 — P3. The discover -> select -> scrape UI.
 * CURRENT_ISSUES → Settings page → 4, 4(b), 4(c), 4(d), 4(e), 4(f), 4(g).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * THE ONE RULE THAT FIXES THE GLITCHING
 * ══════════════════════════════════════════════════════════════════════════
 * While a job runs, this component polls ONLY knowledgeScrapeApi.getJob().
 * It NEVER calls loadKnowledgeBases(). It NEVER lifts state to the parent
 * during a tick.
 *
 * The old page had two overlapping intervals (KnowledgeBases.tsx:523 at 5s and
 * :591 at 4s) that both replaced the entire knowledgeBases array, remounting
 * every card every few seconds. That is the "glitching / continuous reload".
 *
 * Here, a tick updates a local Map of pageId -> progress. React reconciles only
 * the cards whose numbers changed. Everything else — scroll position, the
 * checkbox list, the rest of the page — is untouched. Issue 4(e), solved by
 * scoping the re-render, not by slowing the poll.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import knowledgeScrapeApi, {
  type DiscoveredPage,
  type ScrapeJob,
} from '../services/knowledgeScrapeApi';
import AppModal from './AppModal';

interface Props {
  knowledgeBaseId: string;
  website: string;
  existingDiscoveryId?: string | null;
  onCompleted?: () => void;
  onToast?: (message: string, ok?: boolean) => void;
}

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-500',
  queued: 'bg-amber-100 text-amber-700',
  scraping: 'bg-indigo-100 text-indigo-700',
  completed: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-rose-100 text-rose-700',
  skipped: 'bg-slate-100 text-slate-400',
};

/** Per-card dial. Issue 4(d). */
const ProgressRing: React.FC<{ percent: number; active: boolean }> = ({ percent, active }) => {
  const r = 14;
  const c = 2 * Math.PI * r;
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" className={active ? 'animate-pulse' : ''}>
      <circle cx="18" cy="18" r={r} fill="none" stroke="#e2e8f0" strokeWidth="4" />
      <circle
        cx="18" cy="18" r={r} fill="none"
        stroke={percent >= 100 ? '#059669' : '#4f46e5'}
        strokeWidth="4" strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c - (Math.max(0, Math.min(100, percent)) / 100) * c}
        transform="rotate(-90 18 18)"
        style={{ transition: 'stroke-dashoffset 400ms ease' }}
      />
      <text x="18" y="22" textAnchor="middle" className="fill-slate-600 text-[9px] font-black">
        {Math.round(percent)}
      </text>
    </svg>
  );
};

const PageSelector: React.FC<Props> = ({
  knowledgeBaseId,
  website,
  existingDiscoveryId = null,
  onCompleted,
  onToast,
}) => {
  const [phase, setPhase] = useState<'idle' | 'discovering' | 'selecting' | 'scraping' | 'done'>(
    existingDiscoveryId ? 'selecting' : 'idle',
  );
  const [discoveryId, setDiscoveryId] = useState<string | null>(existingDiscoveryId);
  const [pages, setPages] = useState<DiscoveredPage[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [job, setJob] = useState<ScrapeJob | null>(null);
  const [estimates, setEstimates] = useState({ selected: 0, all: 0 });
  const [creditWarning, setCreditWarning] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [stopModal, setStopModal] = useState<{ open: boolean; warning: string }>({
    open: false,
    warning: '',
  });
  const [filter, setFilter] = useState('');

  // Progress lives in a ref-backed Map so a tick mutates ONLY the cards that
  // changed. Never lifted to the parent — that is what caused the reload loop.
  const pollRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => () => {
    mountedRef.current = false;
    if (pollRef.current) window.clearInterval(pollRef.current);
  }, []);

  const loadPages = useCallback(async (id: string) => {
    const result = await knowledgeScrapeApi.listPages(id);
    if (!mountedRef.current) return;
    setPages(result.pages);
    setSelected(new Set(result.pages.filter((p) => p.isSelected).map((p) => p.id)));
    setEstimates({ selected: result.estimatedSelectedUsd, all: result.estimatedAllUsd });
    setCreditWarning(result.creditWarning);
  }, []);

  useEffect(() => {
    if (existingDiscoveryId) void loadPages(existingDiscoveryId);
  }, [existingDiscoveryId, loadPages]);

  // ── 1. Discover. Counts pages. Scrapes nothing. Issues 1, 2, 4.
  const handleDiscover = async () => {
    setPhase('discovering');
    setBusy('discover');
    try {
      const result = await knowledgeScrapeApi.discover({ website, knowledgeBaseId });
      setDiscoveryId(result.discoveryId);
      await loadPages(result.discoveryId);
      setPhase('selecting');
      onToast?.(
        `We found ${result.totalPagesFound} pages on ${result.domain}. Choose which ones your agent should learn from.`,
      );
    } catch (err: any) {
      setPhase('idle');
      onToast?.(err?.message || 'We could not read that website.', false);
    } finally {
      setBusy(null);
    }
  };

  // ── 2. Selection. Issue 4(b) includes bulk select-all.
  const toggle = (pageId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      next.has(pageId) ? next.delete(pageId) : next.add(pageId);
      return next;
    });
  };

  const visiblePages = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return pages;
    return pages.filter(
      (p) => p.path.toLowerCase().includes(q) || (p.title || '').toLowerCase().includes(q),
    );
  }, [pages, filter]);

  const selectAll = () => setSelected(new Set(pages.map((p) => p.id)));
  const selectNone = () => setSelected(new Set());
  const selectRecommended = () =>
    setSelected(new Set(pages.filter((p) => p.priorityScore >= 60).map((p) => p.id)));

  // ── 3. Start. Persists selection, enqueues, begins scoped polling.
  const handleStart = async () => {
    if (!discoveryId || selected.size === 0) return;
    setBusy('start');
    try {
      await knowledgeScrapeApi.setSelection(discoveryId, { pageIds: [...selected] });
      const result = await knowledgeScrapeApi.startJob({ knowledgeBaseId, discoveryId });
      setPhase('scraping');
      onToast?.(result.message);
      startPolling(result.job.id);
    } catch (err: any) {
      if (err?.code === 'INSUFFICIENT_CREDIT') {
        onToast?.(err.message, false);
      } else if (err?.code === 'JOB_ALREADY_RUNNING') {
        startPolling(err.details?.jobId);
      } else {
        onToast?.(err?.message || 'Could not start the scan.', false);
      }
    } finally {
      setBusy(null);
    }
  };

  /**
   * SCOPED POLL. This is the whole fix. One endpoint, small payload,
   * updates only the page rows whose progress moved.
   */
  const startPolling = (jobId: string) => {
    if (pollRef.current) window.clearInterval(pollRef.current);

    const tick = async () => {
      try {
        const { job: fresh, pages: freshPages } = await knowledgeScrapeApi.getJob(jobId);
        if (!mountedRef.current) return;

        setJob(fresh);

        // Merge by id. Cards whose numbers are unchanged keep referential
        // identity, so React does not re-render or remount them.
        setPages((current) => {
          const byId = new Map(freshPages.map((p) => [p.id, p]));
          let changed = false;
          const next = current.map((p) => {
            const updated = byId.get(p.id);
            if (!updated) return p;
            if (
              updated.scrapeStatus === p.scrapeStatus &&
              updated.scrapeProgress === p.scrapeProgress &&
              updated.lastError === p.lastError
            ) {
              return p;
            }
            changed = true;
            return { ...p, ...updated };
          });
          return changed ? next : current;
        });

        if (['completed', 'failed', 'cancelled'].includes(fresh.status)) {
          if (pollRef.current) window.clearInterval(pollRef.current);
          pollRef.current = null;
          setPhase('done');
          if (fresh.status === 'completed') {
            onToast?.(
              `Knowledge base ready. ${fresh.completedPages} page${fresh.completedPages === 1 ? '' : 's'} added.`,
            );
            // Parent refresh happens ONCE, at the end — never on a tick.
            onCompleted?.();
          } else if (fresh.status === 'failed') {
            onToast?.(fresh.lastError || 'The scan stopped early.', false);
          }
        } else if (fresh.status === 'paused') {
          if (pollRef.current) window.clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch {
        // Transient network errors are ignored; the next tick recovers.
      }
    };

    void tick();
    pollRef.current = window.setInterval(tick, 2000);
  };

  // ── 4. Stop / resume. Issue 4(f), with the warning from 4(g).
  const requestStop = async () => {
    if (!job) return;
    const remaining = Math.max(0, job.totalPages - job.completedPages);
    setStopModal({
      open: true,
      warning: `Stopping now means ${remaining} page${remaining === 1 ? '' : 's'} won't be read. Your agent will answer using only what it has learned so far. You can start again at any time — pages already read are kept.`,
    });
  };

  const confirmStop = async () => {
    if (!job) return;
    setBusy('stop');
    try {
      const result = await knowledgeScrapeApi.control(job.id, 'cancel');
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
      setPhase('selecting');
      setJob(null);
      onToast?.(result.message);
    } catch (err: any) {
      onToast?.(err?.message || 'Could not stop the scan.', false);
    } finally {
      setBusy(null);
      setStopModal({ open: false, warning: '' });
    }
  };

  const handlePauseResume = async (action: 'pause' | 'resume') => {
    if (!job) return;
    setBusy(action);
    try {
      const result = await knowledgeScrapeApi.control(job.id, action);
      onToast?.(result.message);
      if (action === 'resume') { setPhase('scraping'); startPolling(job.id); }
      else { setJob({ ...job, status: 'paused' }); }
    } catch (err: any) {
      onToast?.(err?.message || 'Could not update the scan.', false);
    } finally {
      setBusy(null);
    }
  };

  const money = (n: number) => `$${n.toFixed(n < 0.01 ? 4 : 2)}`;

  // ── Render ────────────────────────────────────────────────────────────────

  if (phase === 'idle' || phase === 'discovering') {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-card">
        <div className="mb-3 text-4xl">🔎</div>
        <h3 className="text-base font-black text-slate-900">Find your pages</h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
          We'll look through <span className="font-bold text-slate-700">{website}</span> and list
          every page we can find. Nothing is read yet — you choose what your agent learns.
        </p>
        <button
          onClick={() => void handleDiscover()}
          disabled={busy === 'discover'}
          className="mt-6 rounded-2xl bg-slate-900 px-8 py-3 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-amber-600 disabled:opacity-50"
        >
          {phase === 'discovering' ? 'Looking through your site…' : 'Find pages'}
        </button>
      </div>
    );
  }

  const isRunning = phase === 'scraping' && job?.status === 'running';
  const isPaused = job?.status === 'paused';

  return (
    <div className="space-y-4">
      {/* Header + counts */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-black text-slate-900">
              {pages.length} pages discovered
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              {selected.size} selected · estimated {money(estimates.selected)}
            </p>
          </div>
          {phase === 'selecting' && (
            <div className="flex flex-wrap gap-2">
              <button onClick={selectRecommended} className="rounded-xl border border-slate-200 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-amber-300">
                Recommended
              </button>
              <button onClick={selectAll} className="rounded-xl border border-slate-200 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-amber-300">
                Select all
              </button>
              <button onClick={selectNone} className="rounded-xl border border-slate-200 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-amber-300">
                Clear
              </button>
            </div>
          )}
        </div>

        {/* Issue 4: the burn-rate warning. */}
        {phase === 'selecting' && (
          <div className="mt-4 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <span className="text-lg">⚡</span>
            <div>
              <p className="text-xs font-bold text-amber-900">{creditWarning}</p>
              <p className="mt-1 text-[11px] text-amber-700">
                All {pages.length} pages would cost about {money(estimates.all)}.
              </p>
            </div>
          </div>
        )}

        {/* Live job bar */}
        {job && phase === 'scraping' && (
          <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-black text-indigo-900">
                {isPaused ? 'Paused' : 'Reading your pages'} — {job.completedPages}/{job.totalPages}
              </p>
              <div className="flex gap-2">
                {isRunning && (
                  <button onClick={() => void handlePauseResume('pause')} disabled={!!busy}
                    className="rounded-lg bg-white px-3 py-1 text-[10px] font-black uppercase tracking-widest text-indigo-700 disabled:opacity-50">
                    Pause
                  </button>
                )}
                {isPaused && (
                  <button onClick={() => void handlePauseResume('resume')} disabled={!!busy}
                    className="rounded-lg bg-indigo-600 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-50">
                    Resume
                  </button>
                )}
                <button onClick={() => void requestStop()} disabled={!!busy}
                  className="rounded-lg bg-white px-3 py-1 text-[10px] font-black uppercase tracking-widest text-rose-600 disabled:opacity-50">
                  Stop
                </button>
              </div>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-indigo-100">
              <div className="h-full rounded-full bg-indigo-600 transition-all duration-500"
                style={{ width: `${job.progressPercent}%` }} />
            </div>
            {job.currentPageUrl && !isPaused && (
              <p className="mt-2 truncate text-[11px] text-indigo-700">
                Currently reading {job.currentPageUrl}
              </p>
            )}
            <p className="mt-2 text-[11px] text-indigo-600">
              You can leave this page — we'll notify you when it's finished.
            </p>
          </div>
        )}
      </div>

      {/* Page list */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter pages…"
          className="mb-4 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:border-amber-300"
        />
        <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
          {visiblePages.map((page) => {
            const isSelected = selected.has(page.id);
            const active = page.scrapeStatus === 'scraping';
            return (
              <div
                key={page.id}
                className={`flex items-center gap-3 rounded-2xl border p-3 transition-all ${
                  active
                    ? 'border-indigo-300 bg-indigo-50/50 shadow-sm'
                    : isSelected
                      ? 'border-amber-200 bg-amber-50/30'
                      : 'border-slate-200 bg-white'
                }`}
              >
                {phase === 'selecting' ? (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(page.id)}
                    className="h-4 w-4 shrink-0 rounded border-slate-300 accent-amber-600"
                  />
                ) : (
                  <ProgressRing percent={page.scrapeProgress} active={active} />
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-900">
                    {page.title || page.path}
                  </p>
                  <p className="truncate font-mono text-[10px] text-slate-400">{page.path}</p>
                  {page.lastError && (
                    <p className="mt-0.5 truncate text-[10px] text-rose-600">{page.lastError}</p>
                  )}
                </div>

                {page.priorityScore >= 80 && phase === 'selecting' && (
                  <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-700">
                    Key page
                  </span>
                )}
                {phase !== 'selecting' && (
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${STATUS_STYLE[page.scrapeStatus] || STATUS_STYLE.pending}`}>
                    {page.scrapeStatus}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Issue 4(c): the button only appears once pages are selected. */}
        {phase === 'selecting' && (
          <button
            onClick={() => void handleStart()}
            disabled={selected.size === 0 || busy === 'start'}
            className="mt-5 w-full rounded-2xl bg-slate-900 py-3 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {selected.size === 0
              ? 'Select pages to continue'
              : busy === 'start'
                ? 'Starting…'
                : `Read ${selected.size} selected page${selected.size === 1 ? '' : 's'} · ${money(estimates.selected)}`}
          </button>
        )}
      </div>

      {/* Issue 4(g): abrupt-stop warning. */}
      <AppModal
        open={stopModal.open}
        onClose={() => setStopModal({ open: false, warning: '' })}
        title="Stop reading your website?"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setStopModal({ open: false, warning: '' })}
              className="rounded-xl border border-slate-200 px-4 py-2 text-[10px] font-black uppercase tracking-widest">
              Keep going
            </button>
            <button onClick={() => void confirmStop()} disabled={busy === 'stop'}
              className="rounded-xl bg-rose-600 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-50">
              {busy === 'stop' ? 'Stopping…' : 'Stop scan'}
            </button>
          </div>
        }
      >
        <p className="text-sm text-slate-600">{stopModal.warning}</p>
      </AppModal>
    </div>
  );
};

export default PageSelector;
