/**
 * agently/components/CreditModal.tsx   — NEW
 *
 * "infact all insufficient credit warning anywhere on the platform should be a
 *  modal."
 *
 * One component, one global helper. Any 402 anywhere in the app routes here
 * instead of a toast the user has to notice at the top of a scrolled page.
 *
 * Usage in a page:
 *     const credit = useCreditGuard();
 *     ...
 *     try { await something(); }
 *     catch (err) { if (!credit.handle(err)) showToast(err.message, false); }
 *     ...
 *     <CreditModal {...credit.modalProps} />
 *
 * `handle` returns true if it consumed the error, so callers keep their normal
 * error path for everything that is not a credit block.
 */

import React, { useCallback, useState } from "react";

export interface CreditBlock {
  title: string;
  message: string;
  ctaLabel: string;
  topUpPath: string;
  requiredUsd?: number | null;
  balanceUsd?: number | null;
}

const money = (v: number) => `${v < 0 ? "-" : ""}$${Math.abs(v).toFixed(2)}`;

export const CreditModal: React.FC<{
  block: CreditBlock | null;
  onClose: () => void;
}> = ({ block, onClose }) => {
  if (!block) return null;

  const negative = typeof block.balanceUsd === "number" && block.balanceUsd < 0;

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-[#0F172A]/60 p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100">
          <span className="text-xl">&#128176;</span>
        </div>

        <h3 className="text-base font-black text-slate-900">{block.title}</h3>
        <p className="mt-2 text-sm leading-5 text-slate-600">{block.message}</p>

        {(typeof block.balanceUsd === "number" ||
          typeof block.requiredUsd === "number") && (
          <div className="mt-4 space-y-1.5 rounded-2xl bg-slate-50 p-3.5">
            {typeof block.balanceUsd === "number" && (
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Current balance</span>
                <span
                  className={`font-black ${negative ? "text-rose-600" : "text-slate-900"}`}
                >
                  {money(block.balanceUsd)}
                </span>
              </div>
            )}
            {typeof block.requiredUsd === "number" && (
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Needed for this</span>
                <span className="font-black text-slate-900">
                  {money(block.requiredUsd)}
                </span>
              </div>
            )}
            {negative && (
              <p className="pt-1 text-[11px] leading-4 text-rose-600">
                This balance is negative, so your next top-up settles what's
                owed first.
              </p>
            )}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600"
          >
            Not now
          </button>
          <a
            href={block.topUpPath || "#/billing"}
            className="rounded-xl bg-slate-900 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-amber-600"
          >
            {block.ctaLabel || "Add credit"}
          </a>
        </div>
      </div>
    </div>
  );
};

/** Recognises a credit block from any error shape the API can produce. */
export function isCreditError(err: any): boolean {
  if (!err) return false;
  if (err.status === 402 || err.statusCode === 402) return true;
  const code = String(err.code || err?.error?.code || "");
  if (/INSUFFICIENT_CREDIT|CREDIT_REQUIRED|WALLET_/i.test(code)) return true;
  const msg = String(err.message || err?.error?.message || "");
  return /usage wallet balance|add credit before/i.test(msg);
}

export function useCreditGuard() {
  const [block, setBlock] = useState<CreditBlock | null>(null);

  const handle = useCallback((err: any): boolean => {
    if (!isCreditError(err)) return false;
    const d = err?.details || err?.error?.details || {};
    setBlock({
      title: d.title || "Add credit to continue",
      message:
        err?.message ||
        err?.error?.message ||
        "You need usage credit before running this.",
      ctaLabel: d.ctaLabel || "Add credit",
      topUpPath: d.topUpPath || "#/billing",
      requiredUsd:
        typeof d.minimumUsd === "number"
          ? d.minimumUsd
          : typeof d.requiredUsd === "number"
            ? d.requiredUsd
            : null,
      balanceUsd: typeof d.balanceUsd === "number" ? d.balanceUsd : null,
    });
    return true;
  }, []);

  const close = useCallback(() => setBlock(null), []);

  return { block, handle, close, modalProps: { block, onClose: close } };
}

export default CreditModal;
