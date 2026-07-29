import React, { useCallback, useEffect, useState } from 'react';
import { adminApi, type TourPageRow } from '../../services/adminApi';

/**
 * agently/components/admin/TourAdmin.tsx   <-- NEW FILE
 *
 * Requirement 11: a finished tour stays finished. The only thing that brings
 * one back is you deciding it should — after redesigning a page or adding a
 * feature to it.
 *
 * Re-triggering bumps that page's version. Completion records are left intact
 * but become stale, so the tour runs once more for everyone and then settles
 * again. Nothing is deleted, and no other page is affected.
 */

const card =
  'rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]';

const TourAdmin: React.FC = () => {
  const [pages, setPages] = useState<TourPageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await adminApi.tourPages();
      setPages(result.pages);
    } catch (err) {
      setError(
        (err as Error).message ||
          'Could not load tour pages. Has migration 20260729_product_tour.sql been run?',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 5000);
  };

  const retrigger = async (pageKey: string, label: string) => {
    setBusy(true);
    try {
      const result = await adminApi.retriggerTourPage(pageKey);
      flash(
        `${label} is now on version ${result.version}. Everyone sees that tour once more, then it settles again.`,
      );
      setConfirming(null);
      await load();
    } catch (err) {
      setError((err as Error).message || 'Could not re-trigger that page.');
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (pageKey: string, isEnabled: boolean) => {
    setBusy(true);
    try {
      await adminApi.updateTourPage(pageKey, { isEnabled: !isEnabled });
      await load();
    } catch (err) {
      setError((err as Error).message || 'Could not update that page.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className={card}>
        <p className="text-sm text-slate-500">Loading tour pages…</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className={card}>
        <p className="text-sm font-semibold">How this works</p>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
          Each page introduces itself once, the first time a user opens it, then
          never again — not on reload, not on a different device. Re-triggering
          bumps that page's version so it runs one more time for everyone. Use
          it after you redesign a page or add a feature to it.
        </p>
      </div>

      {notice ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className={card}>
        <p className="text-sm font-semibold">Pages ({pages.length})</p>
        <ul className="mt-3 divide-y divide-slate-100">
          {pages.map((page) => (
            <li
              key={page.pageKey}
              className="flex flex-wrap items-center justify-between gap-3 py-3.5"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {page.label}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-500">
                    v{page.version}
                  </span>
                  {!page.isEnabled ? (
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                      off
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-slate-400">
                  {page.pageKey} · {page.completedCount} completed ·{' '}
                  {page.skippedCount} skipped
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void toggle(page.pageKey, page.isEnabled)}
                  className="text-[11px] font-bold text-slate-500 underline disabled:opacity-40"
                >
                  {page.isEnabled ? 'Disable' : 'Enable'}
                </button>

                {confirming === page.pageKey ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirming(null)}
                      className="text-[11px] font-bold text-slate-500"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void retrigger(page.pageKey, page.label)
                      }
                      className="h-9 rounded-xl bg-[#F59E0B] px-3.5 text-[11px] font-bold text-white disabled:opacity-40"
                    >
                      Yes, show it again
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={busy || !page.isEnabled}
                    onClick={() => setConfirming(page.pageKey)}
                    className="h-9 rounded-xl border border-slate-200 px-3.5 text-[11px] font-bold text-slate-600 transition hover:border-slate-300 disabled:opacity-40"
                  >
                    Re-trigger
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default TourAdmin;
