import React, { useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "../services/api";
import {
  BackButton,
  ErrorAlert,
  MailIcon,
  PrimaryButton,
  SectionHeading,
} from "./AuthShell";

/**
 * The one-time-code step, shared by both flows.
 *
 * Signup verification and login OTP look identical to a user — six boxes and a
 * resend link — and differ only in copy and in which endpoint verifies them. So
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
 *
 * v1.8: markup re-skinned to the approved auth preview (single centered
 * panel, Archivo headings, orange accents). No behaviour changed.
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

const formatClock = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

const maskEmail = (email: string) => {
  const parts = email.split("@");
  if (parts.length !== 2) return email;
  return `${parts[0].slice(0, 2)}•••@${parts[1]}`;
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
            heading: "Confirm your email.",
            action: "Verify email",
          }
        : {
            heading: "Check your inbox.",
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
    <div>
      <BackButton onClick={onCancel}>
        {purpose === "email_verify" ? "Back to account creation" : "Use another email"}
      </BackButton>

      <SectionHeading
        title={copy.heading}
        sub={
          <>
            Enter the six-digit code for{" "}
            <strong className="font-semibold text-[var(--text)]">
              {maskEmail(email)}
            </strong>
            .
          </>
        }
      />

      <div
        className="grid gap-[10px] max-[390px]:gap-[6px]"
        style={{ gridTemplateColumns: `repeat(${codeLength}, minmax(0, 1fr))` }}
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
            style={{ fontFamily: '"Archivo", sans-serif' }}
            className={`h-[58px] w-full min-w-0 rounded-[10px] border bg-[var(--field)] p-0 text-center text-[24px] font-semibold tabular-nums text-[var(--text)] outline-none transition max-[390px]:h-[52px] max-[390px]:text-[21px] disabled:opacity-60 ${
              error
                ? "border-red-300 focus:border-red-400 focus:shadow-[0_0_0_4px_rgba(220,60,40,0.12)]"
                : "border-[var(--line)] focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--focus)]"
            }`}
          />
        ))}
      </div>

      <div className="mt-[18px] flex items-start gap-[11px] rounded-[10px] bg-[var(--accent-soft)] p-[13px_14px] text-[13px] text-[var(--text)]">
        <span className="mt-[1px] flex-none text-[var(--accent)]">
          <MailIcon />
        </span>
        <span>
          {expired ? (
            <span className="font-medium text-[#b63d28]">
              This code has expired — request a new one below.
            </span>
          ) : (
            <>
              Codes are delivered by the account service and expire after{" "}
              {formatClock(secondsLeft)}. Check spam if it hasn&apos;t arrived.
            </>
          )}
        </span>
      </div>

      <div className="mt-[18px] grid gap-[10px]">
        <PrimaryButton
          type="button"
          onClick={() => complete && void submit(code)}
          disabled={!complete || busy}
        >
          {busy ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            copy.action
          )}
        </PrimaryButton>
        <button
          type="button"
          onClick={() => void handleResend()}
          disabled={cooldown > 0 || busy}
          className="min-h-[42px] w-full rounded-[12px] border border-[var(--line)] bg-[var(--surface-raised)] px-4 text-[14px] font-semibold text-[var(--text)] transition hover:border-[var(--line-strong)] hover:bg-[var(--surface-soft)] disabled:opacity-50"
        >
          {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
        </button>
      </div>

      <div className="mt-[10px] grid gap-[10px]">
        <ErrorAlert>{error}</ErrorAlert>
        {notice && !error && (
          <div
            role="status"
            className="rounded-[10px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] font-medium leading-[1.45] text-emerald-700"
          >
            {notice}
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthCodePanel;
