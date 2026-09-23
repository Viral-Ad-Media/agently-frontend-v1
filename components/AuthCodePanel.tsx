import React, { useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "../services/api";

/**
 * The one-time-code step, shared by both flows.
 *
 * Signup verification and login OTP look identical to a user — six boxes and a
 * Resend link — and differ only in copy and in which endpoint verifies them. So
 * this component owns the interaction and the caller owns the meaning: it is
 * handed a `purpose` for the wording and an `onSubmit` for the endpoint. There
 * is no branching on purpose anywhere below except the strings, which is the
 * shape that keeps the two flows from quietly merging.
 *
 * Deliberate behaviours, all of which come from watching people fail at code
 * entry rather than from the spec:
 *
 *   - Pasting a code from an email fills every box. People paste; a paste
 *     handler that only fills the first box is the single most common way these
 *     screens waste someone's time.
 *   - Backspace in an empty box steps back and clears the previous one.
 *   - Submission fires automatically on the sixth digit. There is still a
 *     button, because auto-submit that fails silently on a screen reader is
 *     worse than a redundant button.
 *   - The boxes are `inputMode="numeric"` with `autoComplete="one-time-code"`,
 *     which is what lets iOS and Android offer the code from the notification.
 *   - On an incorrect code the boxes clear and refocus. Making someone delete
 *     six wrong digits by hand is a small, avoidable insult.
 */

type CodePurpose = "email_verify" | "login_otp";

interface AuthCodePanelProps {
  purpose: CodePurpose;
  email: string;
  /** Seconds the current code is valid for, from the API. */
  expiresInSeconds: number;
  resendCooldownSeconds: number;
  codeLength?: number;
  onSubmit: (code: string) => Promise<void>;
  onResend: () => Promise<void>;
  /** Abandon the challenge and go back to the form. */
  onCancel: () => void;
}

const MailIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="26"
    height="26"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect width="20" height="16" x="2" y="4" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);

const formatClock = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

const AuthCodePanel: React.FC<AuthCodePanelProps> = ({
  purpose,
  email,
  expiresInSeconds,
  resendCooldownSeconds,
  codeLength = 6,
  onSubmit,
  onResend,
  onCancel,
}) => {
  const [digits, setDigits] = useState<string[]>(() =>
    Array(codeLength).fill(""),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(expiresInSeconds);
  const [cooldown, setCooldown] = useState(resendCooldownSeconds);
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const submittingRef = useRef(false);

  const copy = useMemo(
    () =>
      purpose === "email_verify"
        ? {
            heading: "Confirm your email",
            body: "We sent a 6-digit code to",
            tail: "Enter it to finish creating your workspace.",
            action: "Verify email",
          }
        : {
            heading: "Check your email",
            body: "We sent a 6-digit sign-in code to",
            tail: "Enter it to finish signing in.",
            action: "Verify and sign in",
          },
    [purpose],
  );

  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  // Two independent clocks: how long this code lives, and how long until the
  // user may ask for another. They are not the same and showing one as the
  // other is how people end up staring at a disabled button.
  useEffect(() => {
    setSecondsLeft(expiresInSeconds);
  }, [expiresInSeconds]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = window.setInterval(
      () => setSecondsLeft((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => window.clearInterval(id);
  }, [secondsLeft > 0]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setInterval(
      () => setCooldown((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => window.clearInterval(id);
  }, [cooldown > 0]);

  const submit = async (code: string) => {
    // A ref, not the `busy` state: auto-submit fires from inside an onChange
    // and would read a stale `busy` on the same tick.
    if (submittingRef.current) return;
    submittingRef.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await onSubmit(code);
    } catch (submitError) {
      const apiError = submitError instanceof ApiError ? submitError : null;
      setError(
        apiError?.message ||
          (submitError instanceof Error
            ? submitError.message
            : "That code could not be verified. Please try again."),
      );
      clearBoxes();
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  };

  const clearBoxes = () => {
    setDigits(Array(codeLength).fill(""));
    inputsRef.current[0]?.focus();
  };

  /*
   * Auto-submit when the last box is filled.
   *
   * Driven from the committed state rather than from the change handler,
   * because the handler sees `next` before React has rendered it and the
   * earlier version of this guarded on `joined.includes("")` — which is always
   * true for a string, so it never fired at all. Reading the array here makes
   * the condition mean what it says.
   */
  useEffect(() => {
    if (digits.length !== codeLength) return;
    if (!digits.every((digit) => digit !== "")) return;
    if (submittingRef.current) return;
    void submit(digits.join(""));
    // `submit` is stable for the life of the panel; including it would retrigger
    // on every render without changing behaviour.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits, codeLength]);

  const handleChange = (index: number, raw: string) => {
    const value = raw.replace(/\D/g, "");
    if (!value) {
      setDigits((prev) => {
        const next = [...prev];
        next[index] = "";
        return next;
      });
      return;
    }

    setDigits((prev) => {
      const next = [...prev];
      // A paste (or an autofilled OTP) arrives as one long value in whichever
      // box had focus. Spread it across the remaining boxes instead of
      // truncating it to a single character.
      for (let i = 0; i < value.length && index + i < codeLength; i += 1) {
        next[index + i] = value[i];
      }
      const filledTo = Math.min(index + value.length, codeLength - 1);
      window.requestAnimationFrame(() => inputsRef.current[filledTo]?.focus());
      return next;
    });
    // Submission is driven by the effect below, not from inside the updater.
    // A state updater must stay pure — React may run it more than once, and a
    // network call fired from in there can double-submit a single-use code.
  };

  const handleKeyDown = (
    index: number,
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      event.preventDefault();
      setDigits((prev) => {
        const next = [...prev];
        next[index - 1] = "";
        return next;
      });
      inputsRef.current[index - 1]?.focus();
      return;
    }
    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      inputsRef.current[index - 1]?.focus();
    }
    if (event.key === "ArrowRight" && index < codeLength - 1) {
      event.preventDefault();
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await onResend();
      setNotice(`A new code is on its way to ${email}.`);
      setCooldown(resendCooldownSeconds);
      clearBoxes();
    } catch (resendError) {
      const apiError = resendError instanceof ApiError ? resendError : null;
      // The server knows exactly how long is left on the cooldown; trust it
      // over the local counter, which drifts if the tab was backgrounded.
      const retryAfter = Number(
        (apiError?.details as { retryAfterSeconds?: number } | null)
          ?.retryAfterSeconds,
      );
      if (Number.isFinite(retryAfter) && retryAfter > 0) setCooldown(retryAfter);
      setError(
        apiError?.message ||
          "We could not send another code right now. Please try again shortly.",
      );
    } finally {
      setBusy(false);
    }
  };

  const code = digits.join("");
  const complete = code.length === codeLength && !digits.includes("");
  const expired = secondsLeft <= 0;

  return (
    <div className="py-1 animate-in fade-in">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#F59E0B]/10 text-[#F59E0B]">
        <MailIcon />
      </div>

      <h2 className="text-center text-[19px] font-medium tracking-[-0.035em] text-[#0F172A]">
        {copy.heading}
      </h2>
      <p className="mx-auto mt-1.5 max-w-sm text-center text-[13px] font-normal leading-[18px] text-[#0F172A]/68">
        {copy.body}{" "}
        <span className="font-medium text-[#0F172A]">{email}</span>.{" "}
        {copy.tail}
      </p>

      <div
        className="mt-4 flex justify-center gap-1.5 sm:gap-2"
        role="group"
        aria-label={`${codeLength}-digit verification code`}
      >
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(el) => {
              inputsRef.current[index] = el;
            }}
            type="text"
            inputMode="numeric"
            // Lets iOS/Android surface the code straight from the notification.
            autoComplete={index === 0 ? "one-time-code" : "off"}
            maxLength={codeLength}
            value={digit}
            disabled={busy}
            aria-label={`Digit ${index + 1}`}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onFocus={(e) => e.target.select()}
            className={`h-12 w-10 rounded-xl border bg-white text-center text-[19px] font-medium tabular-nums text-[#0F172A] shadow-sm outline-none transition sm:h-[52px] sm:w-11 ${
              error
                ? "border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-100"
                : "border-[#0F172A]/12 focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/20"
            } disabled:opacity-60`}
          />
        ))}
      </div>

      <p className="mt-2.5 text-center text-[11px] font-medium text-[#0F172A]/50">
        {expired ? (
          <span className="text-red-600">
            This code has expired — request a new one.
          </span>
        ) : (
          <>Code expires in {formatClock(secondsLeft)}</>
        )}
      </p>

      {error && (
        <div
          role="alert"
          className="mt-3 rounded-2xl border border-red-100 bg-red-50 px-3 py-2 text-[12px] font-medium leading-[16px] text-red-600"
        >
          {error}
        </div>
      )}
      {notice && !error && (
        <div
          role="status"
          className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-[12px] font-medium leading-[16px] text-emerald-700"
        >
          {notice}
        </div>
      )}

      <button
        type="button"
        onClick={() => complete && void submit(code)}
        disabled={!complete || busy}
        className="mt-3.5 flex w-full items-center justify-center gap-2 min-h-[44px] rounded-full bg-[#0F172A] px-5 py-3 text-[14px] font-medium text-white shadow-[0_18px_40px_rgba(15,23,42,0.16)] transition hover:-translate-y-0.5 hover:bg-[#1a2633] disabled:translate-y-0 disabled:opacity-50"
      >
        {busy ? (
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
        ) : (
          copy.action
        )}
      </button>

      <div className="mt-2.5 flex items-center justify-center gap-3 text-[12px]">
        <button
          type="button"
          onClick={() => void handleResend()}
          disabled={cooldown > 0 || busy}
          className="-my-1 inline-flex min-h-[32px] items-center px-1 font-medium text-[#F59E0B] transition hover:underline disabled:text-[#0F172A]/38 disabled:no-underline"
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
        </button>
        <span className="text-[#0F172A]/20" aria-hidden="true">
          •
        </span>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="-my-1 inline-flex min-h-[32px] items-center px-1 font-medium text-[#0F172A]/60 transition hover:text-[#0F172A] disabled:opacity-50"
        >
          Use a different email
        </button>
      </div>
    </div>
  );
};

export default AuthCodePanel;
