import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Shown when the tenant tries to do something that commits us to real cost —
 * buying a number, putting a chatbot live — with no card on file.
 *
 * The rule is enforced on the server (lib/activation-gate.js). This is the
 * explanation, not the enforcement: it listens for the 402 the API layer
 * broadcasts and tells the user what to do about it.
 *
 * The copy has to be exact about one thing: adding the card charges nothing.
 * The free credit is still spent first. Implying otherwise reads as a
 * paywall on a product they were told they could try for free.
 */

interface GateDetail {
  message?: string;
}

const TopUpGateModal: React.FC<{
  signupGrantUsd?: number;
  minimumTopUpUsd?: number;
}> = ({ signupGrantUsd = 5 }) => {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string>("");
  const navigate = useNavigate();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const onGate = (event: Event) => {
      const detail = (event as CustomEvent<GateDetail>).detail || {};
      restoreFocus.current = document.activeElement as HTMLElement | null;
      setMessage(detail.message || "");
      setOpen(true);
    };
    window.addEventListener("agently:card-required", onGate);
    return () => window.removeEventListener("agently:card-required", onGate);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    restoreFocus.current?.focus?.();
  }, []);

  useEffect(() => {
    if (open) cardRef.current?.focus({ preventScroll: true });
  }, [open]);

  if (!open) return null;

  const goToBilling = () => {
    close();
    navigate("/billing");
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") close();
  };

  return (
    <div
      className="fixed inset-0 z-[130] flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="topup-gate-title"
    >
      <div
        className="absolute inset-0 bg-slate-950/55"
        onClick={close}
        aria-hidden
      />
      <div
        ref={cardRef}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.18)] outline-none"
      >
        <h2
          id="topup-gate-title"
          className="text-[17px] font-semibold tracking-[-0.01em] text-[#0F172A]"
        >
          Add a card to continue
        </h2>

        <p className="mt-2 text-[13px] leading-relaxed text-slate-600">
          {message ||
            "Add a card before buying a number or putting a chatbot live."}
        </p>

        <div className="mt-4 rounded-xl border border-[#F59E0B]/30 bg-[#FFFBEB] px-4 py-3">
          <p className="text-[13px] font-medium text-[#0F172A]">
            You will not be charged today.
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-slate-600">
            Your ${signupGrantUsd.toFixed(2)} of free credit is spent first. The
            card is only there so a phone number or live chatbot cannot keep
            running once that credit is gone.
          </p>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={close}
            className="h-9 rounded-[10px] px-3 text-[12px] font-medium text-slate-600 transition hover:text-[#0F172A]"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={goToBilling}
            className="h-9 rounded-[10px] bg-[#0F172A] px-4 text-[12px] font-medium text-white transition hover:bg-[#1E293B] active:scale-[0.97]"
          >
            Add payment method
          </button>
        </div>
      </div>
    </div>
  );
};

export default TopUpGateModal;
