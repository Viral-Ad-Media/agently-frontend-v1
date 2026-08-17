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

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import knowledgeScrapeApi from "../services/knowledgeScrapeApi";
import type {
  DiscoveredPage,
  ScrapeJob,
  ListPagesResponse,
  JobStatusResponse,
} from "../services/knowledgeScrapeApi";
import AppModal from "./AppModal";
import { CreditModal, useCreditGuard } from "./CreditModal";

interface Props {
  knowledgeBaseId: string;
  website: string;
  existingDiscoveryId?: string | null;
  onCompleted?: () => void;
  onToast?: (message: string, ok?: boolean) => void;
}

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-slate-100 text-slate-500",
  queued: "bg-amber-100 text-amber-700",
  scraping: "bg-indigo-100 text-indigo-700",
  completed: "bg-emerald-100 text-emerald-700",
  failed: "bg-rose-100 text-rose-700",
  skipped: "bg-slate-100 text-slate-400",
};

/** Compact numeric progress — no per-row SVG dial. */
const ProgressPercent: React.FC<{ percent: number; active: boolean }> = ({
  percent,
  active,
}) => (
  <span
    className={`w-8 shrink-0 text-right text-[11px] font-bold tabular-nums ${
      percent >= 100 ? "text-emerald-600" : active ? "text-indigo-600" : "text-slate-400"
    }`}
  >
    {Math.round(percent)}%
  </span>
);

const PageSelector: React.FC<Props> = ({
  knowledgeBaseId,
  website,
  existingDiscoveryId = null,
  onCompleted,
  onToast,
}) => {
  const [phase, setPhase] = useState<
    "idle" | "discovering" | "selecting" | "scraping" | "done"
  >(existingDiscoveryId ? "selecting" : "idle");
  const [discoveryId, setDiscoveryId] = useState<string | null>(
    existingDiscoveryId,
  );
  const [pages, setPages] = useState<DiscoveredPage[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [job, setJob] = useState<ScrapeJob | null>(null);
  const [estimates, setEstimates] = useState({ selected: 0, all: 0 });
  const [creditWarning, setCreditWarning] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [stopModal, setStopModal] = useState<{
    open: boolean;
    warning: string;
  }>({
    open: false,
    warning: "",
  });
  const [filter, setFilter] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [listCollapsed, setListCollapsed] = useState(false);
  // Every insufficient-credit response on this page renders as a modal.
  const credit = useCreditGuard();

  // Progress lives in a ref-backed Map so a tick mutates ONLY the cards that
  // changed. Never lifted to the parent — that is what caused the reload loop.
  const pollRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  const loadPages = useCallback(async (id: string) => {
    const result: ListPagesResponse = await knowledgeScrapeApi.listPages(id);
    if (!mountedRef.current) return;
    setPages(Array.isArray(result?.pages) ? result.pages : []);
    setSelected(
      new Set(
        result.pages
          .filter((page: DiscoveredPage) => page.isSelected)
          .map((page: DiscoveredPage) => page.id),
      ),
    );
    setEstimates({
      selected: result.estimatedSelectedUsd,
      all: result.estimatedAllUsd,
    });
    setCreditWarning(result.creditWarning);
  }, []);

  useEffect(() => {
    if (!existingDiscoveryId) return;
    setDiscoveryId(existingDiscoveryId);
    setPhase((current) => (current === "idle" ? "selecting" : current));
    void loadPages(existingDiscoveryId);
  }, [existingDiscoveryId, loadPages]);

  // ── 1. Discover. Counts pages. Scrapes nothing. Issues 1, 2, 4.
  const handleDiscover = async () => {
    setPhase("discovering");
    setBusy("discover");
    try {
      const result = await knowledgeScrapeApi.discover({
        website,
        knowledgeBaseId,
      });
      setDiscoveryId(result.discoveryId);
      await loadPages(result.discoveryId);
      setPhase("selecting");
      onToast?.(
        result.truncated
          ? `We listed ${result.totalPagesFound} pages on ${result.domain}. The site is larger than the current discovery safety limit; narrow the list with search or raise DISCOVERY_MAX_PAGES.`
          : `We found ${result.totalPagesFound} pages on ${result.domain}. Choose which ones your agent should learn from.`,
      );
    } catch (err: any) {
      setPhase("idle");
      // alwaysModal: an insufficient-credit warning in a top-of-page alert is
      // easy to miss on a long page. Everything from this path is a modal now.
      credit.handle(err, { alwaysModal: true });
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
      (p) =>
        p.path.toLowerCase().includes(q) ||
        (p.title || "").toLowerCase().includes(q),
    );
  }, [pages, filter]);

  const pageSize = 100;
  const pageCount = Math.max(1, Math.ceil(visiblePages.length / pageSize));
  const pagedPages = useMemo(
    () => visiblePages.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize),
    [visiblePages, pageIndex],
  );
  const estimatedPerPage = pages.length > 0 ? estimates.all / pages.length : 0;
  const selectedEstimate = estimatedPerPage * selected.size;

  useEffect(() => {
    setPageIndex(0);
  }, [filter, pages.length]);

  useEffect(() => {
    if (pageIndex >= pageCount) setPageIndex(Math.max(0, pageCount - 1));
  }, [pageIndex, pageCount]);

  const selectAll = () => setSelected(new Set(pages.map((p) => p.id)));
  const selectNone = () => setSelected(new Set());
  const selectRecommended = () =>
    setSelected(
      new Set(pages.filter((p) => p.priorityScore >= 60).map((p) => p.id)),
    );

  // ── 3. Start. Persists selection, enqueues, begins scoped polling.
  const handleStart = async () => {
    if (!discoveryId || selected.size === 0) return;
    setBusy("start");
    try {
      await knowledgeScrapeApi.setSelection(discoveryId, {
        pageIds: [...selected],
      });
      const result = await knowledgeScrapeApi.startJob({
        knowledgeBaseId,
        discoveryId,
      });
      setPhase("scraping");
      onToast?.(result.message);
      startPolling(result.job.id);
    } catch (err: any) {
      if (err?.code === "JOB_ALREADY_RUNNING" && err?.details?.jobId) {
        startPolling(err.details.jobId);
      } else {
        credit.handle(err, { alwaysModal: true });
      }
    } finally {
      setBusy(null);
    }
  };

  /**
   * SCOPED POLL. This is the whole fix. One endpoint, small payload,
   * updates only the page rows whose progress moved.
   */
  function startPolling(jobId: string) {
    if (pollRef.current) window.clearInterval(pollRef.current);

    const tick = async () => {
      try {
        const status: JobStatusResponse =
          await knowledgeScrapeApi.getJob(jobId);
        const fresh: ScrapeJob = status.job;
        const freshPages: DiscoveredPage[] = Array.isArray(status?.pages)
          ? status.pages
          : [];
        if (!mountedRef.current) return;

        setJob(fresh);

        // Merge by id. Cards whose numbers are unchanged keep referential
        // identity, so React does not re-render or remount them.
        setPages((current) => {
          const byId = new Map<string, DiscoveredPage>(
            freshPages.map((page: DiscoveredPage) => [page.id, page]),
          );
          let changed = false;
          const next = current.map((p: DiscoveredPage) => {
            const updated: DiscoveredPage | undefined = byId.get(p.id);
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

        if (["completed", "failed", "cancelled"].includes(fresh.status)) {
          if (pollRef.current) window.clearInterval(pollRef.current);
          pollRef.current = null;
          setPhase("done");
          if (fresh.status === "completed") {
            onToast?.(
              `Knowledge base ready. ${fresh.completedPages} page${fresh.completedPages === 1 ? "" : "s"} added.`,
            );
            // Parent refresh happens ONCE, at the end — never on a tick.
            onCompleted?.();
          } else if (fresh.status === "failed") {
            onToast?.(fresh.lastError || "The scan stopped early.", false);
          }
        } else if (fresh.status === "paused") {
          if (pollRef.current) window.clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch {
        // Transient network errors are ignored; the next tick recovers.
      }
    };

    void tick();
    pollRef.current = window.setInterval(tick, 2000);
  }

  // Restore a running background scan after the tenant navigates away and
  // returns. This reads one tiny job record and resumes the scoped poll without
  // reloading the whole Knowledge Bases page.
  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      try {
        const active = await knowledgeScrapeApi.getActiveJob(knowledgeBaseId);
        if (cancelled || !active.job) return;
        if (active.job.discoveryId) {
          setDiscoveryId(active.job.discoveryId);
          await loadPages(active.job.discoveryId);
        }
        if (cancelled) return;
        setPhase("scraping");
        startPolling(active.job.id);
      } catch {
        // No active job, an older backend, or a transient request failure. The
        // normal page-selection state remains available.
      }
    };
    void restore();
    return () => {
      cancelled = true;
    };
    // knowledgeBaseId identifies the lifecycle. loadPages is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [knowledgeBaseId, loadPages]);

  // ── 4. Stop / resume. Issue 4(f), with the warning from 4(g).
  const requestStop = async () => {
    if (!job) return;
    const remaining = Math.max(0, job.totalPages - job.completedPages);
    setStopModal({
      open: true,
      warning: `Stopping now means ${remaining} page${remaining === 1 ? "" : "s"} won't be read. Your agent will answer using only what it has learned so far. You can start again at any time — pages already read are kept.`,
    });
  };

  const confirmStop = async () => {
    if (!job) return;
    setBusy("stop");
    try {
      const result = await knowledgeScrapeApi.control(job.id, "cancel");
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
      setPhase("selecting");
      setJob(null);
      onToast?.(result.message);
    } catch (err: any) {
      credit.handle(err, { alwaysModal: true });
    } finally {
      setBusy(null);
      setStopModal({ open: false, warning: "" });
    }
  };

  const handlePauseResume = async (action: "pause" | "resume") => {
    if (!job) return;
    setBusy(action);
    try {
      const result = await knowledgeScrapeApi.control(job.id, action);
      onToast?.(result.message);
      if (action === "resume") {
        setPhase("scraping");
        startPolling(job.id);
      } else {
        setJob({ ...job, status: "paused" });
      }
    } catch (err: any) {
      credit.handle(err, { alwaysModal: true });
    } finally {
      setBusy(null);
    }
  };

  const money = (n: number) => `$${n.toFixed(n < 0.01 ? 4 : 2)}`;

  // ── Render ────────────────────────────────────────────────────────────────

  if (phase === "idle" || phase === "discovering") {
    return (
      <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 text-center sm:p-5">
        <h3 className="text-sm font-bold text-slate-900">Find your pages</h3>
        <p className="mx-auto mt-1.5 max-w-md text-xs text-slate-500">
          We'll list every page on{" "}
          <span className="font-semibold text-slate-700">{website}</span>.
          Nothing is read yet — you choose what your agent learns.
        </p>
        <button
          onClick={() => void handleDiscover()}
          disabled={busy === "discover"}
          className="mt-4 rounded-xl bg-slate-900 px-6 py-2 text-[10px] font-bold uppercase tracking-widest text-white transition-all hover:bg-amber-600 disabled:opacity-50"
        >
          {phase === "discovering"
            ? "Looking through your site…"
            : "Find pages"}
        </button>
      </div>
    );
  }

  const isRunning = phase === "scraping" && job?.status === "running";
  const isPaused = job?.status === "paused";

  return (
    // One card instead of two stacked ones — merged per feedback that the
    // separate containers/charts were more visual weight than the content
    // needed. Logic below (polling, handlers) is untouched.
    <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => setListCollapsed((c) => !c)}
          className="flex min-w-0 items-center gap-2 text-left"
          aria-expanded={!listCollapsed}
        >
          <i
            className={`fa-solid fa-chevron-down shrink-0 text-[10px] text-slate-400 transition-transform ${listCollapsed ? "-rotate-90" : ""}`}
          />
          <span className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900">
              {pages.length} pages discovered
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {selected.size} selected · estimated {money(selectedEstimate)}
            </p>
          </span>
        </button>
        {!listCollapsed && phase === "selecting" && (
          <div className="grid w-full min-w-0 grid-cols-2 gap-1.5 sm:w-auto sm:flex sm:flex-wrap sm:gap-1.5">
            <button
              onClick={() => void handleDiscover()}
              disabled={busy === "discover"}
              className="min-w-0 rounded-lg border border-slate-200 px-2 py-1 text-[9px] font-bold uppercase tracking-tight text-slate-600 hover:border-amber-300 disabled:opacity-50"
            >
              Refresh list
            </button>
            <button
              onClick={selectRecommended}
              className="min-w-0 rounded-lg border border-slate-200 px-2 py-1 text-[9px] font-bold uppercase tracking-tight text-slate-600 hover:border-amber-300"
            >
              Recommended
            </button>
            <button
              onClick={selectAll}
              className="min-w-0 rounded-lg border border-slate-200 px-2 py-1 text-[9px] font-bold uppercase tracking-tight text-slate-600 hover:border-amber-300"
            >
              Select all
            </button>
            <button
              onClick={selectNone}
              className="min-w-0 rounded-lg border border-slate-200 px-2 py-1 text-[9px] font-bold uppercase tracking-tight text-slate-600 hover:border-amber-300"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Burn-rate warning — a text line, not a colored callout box. */}
      {!listCollapsed && phase === "selecting" && (
        <p className="mt-2 text-xs text-amber-700">
          {creditWarning} All {pages.length} pages would cost about{" "}
          {money(estimates.all)}.
        </p>
      )}

      {/* Live job bar */}
      {!listCollapsed && job && phase === "scraping" && (
        <div className="mt-3 min-w-0 rounded-xl bg-slate-50 p-2.5 sm:p-3">
          <div className="mb-1.5 flex min-w-0 flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold text-slate-700">
              {isPaused ? "Paused" : "Reading your pages"} —{" "}
              {job.completedPages}/{job.totalPages}
            </p>
            <div className="flex min-w-0 flex-wrap gap-1.5">
              {isRunning && (
                <button
                  onClick={() => void handlePauseResume("pause")}
                  disabled={!!busy}
                  className="rounded-lg bg-white px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest text-slate-600 shadow-sm disabled:opacity-50"
                >
                  Pause
                </button>
              )}
              {isPaused && (
                <button
                  onClick={() => void handlePauseResume("resume")}
                  disabled={!!busy}
                  className="rounded-lg bg-slate-900 px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest text-white disabled:opacity-50"
                >
                  Resume
                </button>
              )}
              <button
                onClick={() => void requestStop()}
                disabled={!!busy}
                className="rounded-lg bg-white px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest text-rose-600 shadow-sm disabled:opacity-50"
              >
                Stop
              </button>
            </div>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-slate-900 transition-all duration-500"
              style={{ width: `${job.progressPercent}%` }}
            />
          </div>
          {job.currentPageUrl && !isPaused && (
            <p className="mt-1.5 truncate text-[10px] text-slate-500">
              Currently reading {job.currentPageUrl}
            </p>
          )}
        </div>
      )}

      {!listCollapsed && (
      <div className="mt-4 border-t border-slate-100 pt-4">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter pages…"
          className="mb-3 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-amber-300"
        />
        {/* Table-style compact rows instead of individually padded cards —
            each row is one thin line, so the same list occupies a fraction
            of the vertical space on both desktop and mobile. */}
        <div className="max-h-[28rem] divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-100">
          {pagedPages.map((page) => {
            const isSelected = selected.has(page.id);
            const active = page.scrapeStatus === "scraping";
            return (
              <div
                key={page.id}
                className={`flex min-w-0 items-center gap-2 px-2 py-1.5 transition-colors ${
                  active
                    ? "bg-indigo-50/50"
                    : isSelected
                      ? "bg-amber-50/40"
                      : "bg-white"
                }`}
              >
                {phase === "selecting" ? (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(page.id)}
                    className="h-3.5 w-3.5 shrink-0 rounded border-slate-300 accent-amber-600"
                  />
                ) : (
                  <ProgressPercent percent={page.scrapeProgress} active={active} />
                )}

                <div className="min-w-0 flex-1 truncate">
                  <span className="truncate text-xs font-bold text-slate-900">
                    {page.title || page.path}
                  </span>
                  <span className="ml-1.5 truncate font-mono text-[10px] text-slate-400">
                    {page.path}
                  </span>
                  {page.lastError && (
                    <span className="ml-1.5 truncate text-[10px] text-rose-600">
                      {page.lastError}
                    </span>
                  )}
                </div>

                {page.priorityScore >= 80 && phase === "selecting" && (
                  <span className="hidden shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-emerald-700 sm:inline-flex">
                    Key
                  </span>
                )}
                {phase !== "selecting" && (
                  <span
                    className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider ${STATUS_STYLE[page.scrapeStatus] || STATUS_STYLE.pending}`}
                  >
                    {page.scrapeStatus}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {visiblePages.length > pageSize && (
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() =>
                setPageIndex((current) => Math.max(0, current - 1))
              }
              disabled={pageIndex === 0}
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-600 disabled:opacity-40"
            >
              Previous
            </button>
            <p className="text-center text-[11px] text-slate-500">
              {pageIndex * pageSize + 1}–
              {Math.min((pageIndex + 1) * pageSize, visiblePages.length)} of{" "}
              {visiblePages.length}
            </p>
            <button
              type="button"
              onClick={() =>
                setPageIndex((current) => Math.min(pageCount - 1, current + 1))
              }
              disabled={pageIndex >= pageCount - 1}
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-600 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}

        {/* Issue 4(c): the button only appears once pages are selected. */}
        {phase === "selecting" && (
          <button
            onClick={() => void handleStart()}
            disabled={selected.size === 0 || busy === "start"}
            className="mt-5 w-full rounded-2xl bg-slate-900 py-3 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {selected.size === 0
              ? "Select pages to continue"
              : busy === "start"
                ? "Starting…"
                : `Read ${selected.size} selected page${selected.size === 1 ? "" : "s"} · ${money(selectedEstimate)}`}
          </button>
        )}
      </div>
      )}

      {/* Issue 4(g): abrupt-stop warning. */}
      <CreditModal {...credit.modalProps} />

      <AppModal
        open={stopModal.open}
        onClose={() => setStopModal({ open: false, warning: "" })}
        title="Stop reading your website?"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setStopModal({ open: false, warning: "" })}
              className="rounded-xl border border-slate-200 px-4 py-2 text-[10px] font-black uppercase tracking-widest"
            >
              Keep going
            </button>
            <button
              onClick={() => void confirmStop()}
              disabled={busy === "stop"}
              className="rounded-xl bg-rose-600 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-50"
            >
              {busy === "stop" ? "Stopping…" : "Stop scan"}
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
