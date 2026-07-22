import React from "react";
import AppModal from "./AppModal";

/**
 * components/ui/ConfirmDialog.tsx   <-- NEW FILE
 *
 * PATCH 07 — implements CURRENT_ISSUES → General Settings → 2(f) and 2(g).
 *
 * REPLACES
 *   2(f)  window.confirm("Purchase +1...? This may charge the connected
 *         Twilio account.")   — PhoneNumbers.tsx:327
 *         A native browser dialog that (a) looks nothing like the product,
 *         (b) names the provider, (c) is unstyleable, (d) is blocked entirely
 *         by some mobile browsers, which is why purchases sometimes appeared
 *         to do nothing at all.
 *
 *   2(g)  showToast("Your usage wallet balance is $... Add credit before
 *         using this service")  — rendered as a toast pinned to the top of the
 *         page, so on a long scrolled page or on mobile the user never saw
 *         why the action failed.
 *
 * The 402 payload from the API already carries everything this modal needs:
 *   error.details = { title, ctaLabel, topUpPath, balanceUsd,
 *                     minimumRequiredUsd, ... }
 * (see lib/billing-credit-enforcement.js -> insufficientCreditPayload)
 * Nothing new is required server side.
 *
 * Styling follows the existing slate/amber system used across PhoneNumbers,
 * KnowledgeBases and Messenger. No new dependencies.
 */

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  /** Rendered under the description — bullets, cost lines, warnings. */
  children?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" for destructive/irreversible actions. */
  tone?: "default" | "danger";
  busy?: boolean;
  /** When set, the confirm button stays disabled until this exact text is typed. */
  requireTypedConfirmation?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  busy = false,
  requireTypedConfirmation,
  onConfirm,
  onCancel,
}) => {
  const [typed, setTyped] = React.useState("");

  React.useEffect(() => {
    if (!open) setTyped("");
  }, [open]);

  const gated = Boolean(requireTypedConfirmation);
  const unlocked = !gated || typed.trim() === requireTypedConfirmation;

  const confirmClass =
    tone === "danger"
      ? "bg-rose-600 hover:bg-rose-700"
      : "bg-slate-900 hover:bg-amber-600";

  return (
    <AppModal
      open={open}
      onClose={busy ? () => undefined : onCancel}
      title={title}
      description={description}
      size="sm"
      closeOnBackdrop={!busy}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl border border-slate-200 px-5 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-all hover:border-slate-300 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || !unlocked}
            className={`rounded-xl px-5 py-2.5 text-[10px] font-black uppercase tracking-widest text-white transition-all disabled:opacity-40 ${confirmClass}`}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      }
    >
      {children}

      {gated && (
        <div className="mt-4">
          <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500">
            Type{" "}
            <span className="font-mono text-rose-600">
              {requireTypedConfirmation}
            </span>{" "}
            to continue
          </label>
          <input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 font-mono text-sm outline-none focus:border-rose-400"
          />
        </div>
      )}
    </AppModal>
  );
};

/* ────────────────────────────────────────────────────────────────────────── */

export interface CreditRequiredDialogProps {
  open: boolean;
  /** ApiError.details from a 402 INSUFFICIENT_CREDIT response. */
  details?: {
    title?: string;
    ctaLabel?: string;
    topUpPath?: string;
    balanceUsd?: number;
    minimumRequiredUsd?: number;
    action?: string;
  } | null;
  /** Plain message fallback if details is absent. */
  message?: string;
  onClose: () => void;
  onTopUp: () => void;
}

const money = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : "—";
};

export const CreditRequiredDialog: React.FC<CreditRequiredDialogProps> = ({
  open,
  details,
  message,
  onClose,
  onTopUp,
}) => (
  <AppModal
    open={open}
    onClose={onClose}
    title={details?.title || "Usage credit required"}
    description="This action needs available credit on your workspace wallet."
    size="sm"
    footer={
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-slate-200 px-5 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-slate-300"
        >
          Not now
        </button>
        <button
          type="button"
          onClick={onTopUp}
          className="rounded-xl bg-amber-500 px-5 py-2.5 text-[10px] font-black uppercase tracking-widest text-white hover:bg-amber-600"
        >
          {details?.ctaLabel || "Add credit"}
        </button>
      </div>
    }
  >
    <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
      <div className="flex items-center justify-between border-b border-amber-200/70 pb-2.5">
        <span className="text-[10px] font-black uppercase tracking-widest text-amber-700">
          Current balance
        </span>
        <span className="font-mono text-lg font-black text-slate-900">
          {money(details?.balanceUsd)}
        </span>
      </div>
      <div className="flex items-center justify-between pt-2.5">
        <span className="text-[10px] font-black uppercase tracking-widest text-amber-700">
          Needed for this action
        </span>
        <span className="font-mono text-lg font-black text-slate-900">
          {money(details?.minimumRequiredUsd)}
        </span>
      </div>
    </div>

    <p className="mt-4 text-sm leading-relaxed text-slate-600">
      {message ||
        "Add credit to your wallet to continue. Credit is used for calls, messages, number rental and knowledge syncing."}
    </p>
  </AppModal>
);

export default ConfirmDialog;
