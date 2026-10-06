import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, NETWORK_OFFLINE_MESSAGE } from "../services/api";
import type { AuthChallenge } from "../services/api";
import AuthCodePanel from "../components/AuthCodePanel";
import {
  AuthShell,
  Field,
  PasswordRevealButton,
  PrimaryButton,
  SectionHeading,
  TextButton,
  TextInput,
  ErrorAlert,
} from "../components/AuthShell";

interface LoginProps {
  /** Verifies the password and returns the OTP challenge. Never a session. */
  onLogin: (email: string, password: string) => Promise<AuthChallenge>;
  /** Creates the workspace and returns the email-verification challenge. */
  onRegister: (payload: {
    name: string;
    companyName: string;
    email: string;
    password: string;
  }) => Promise<AuthChallenge>;
  /** Completes signup. Establishes the session and loads the workspace. */
  onVerifyEmail: (pendingToken: string, code: string) => Promise<void>;
  /** Completes sign-in. Establishes the session and loads the workspace. */
  onVerifyLoginOtp: (pendingToken: string, code: string) => Promise<void>;
  /** Sends another code and returns the REFRESHED pending token. */
  onResendCode: (
    pendingToken: string,
  ) => Promise<{ pendingToken: string; expiresInSeconds: number }>;
  resendCooldownSeconds?: number;
}

/** True when the error should be accompanied by a "create an account" CTA. */
export const isLikelyMissingAccount = (error: unknown) =>
  error instanceof ApiError && error.status === 401;

const formatAuthError = (error: unknown) => {
  console.error("[auth] login/register submission failed:", error);

  /*
   * Every message below is written for the person signing in, not for
   * whoever is debugging. The technical detail still goes to console.error
   * above, where it is useful and invisible.
   */
  if (error instanceof ApiError) {
    if (error.status === 0 || error.message === NETWORK_OFFLINE_MESSAGE) {
      return "We can't reach Agently right now. Check your connection and try again in a moment.";
    }
    if (error.status === 401) {
      /*
       * Deliberately NOT distinguishing "no such account" from "wrong
       * password": if sign-in did, anyone could type addresses at the login
       * form and learn which of your customers are registered. That is a
       * real enumeration weakness for a platform holding business phone
       * records. The message instead points at signing up, and the form
       * renders a "Create an account" action underneath it.
       */
      return "We couldn't sign you in with those details. Check your email and password — or if you're new here, create an account to get started.";
    }
    if (error.status === 403) {
      return (
        error.message ||
        "This account doesn't have access right now. Please contact support."
      );
    }
    if (error.status === 429) {
      return "Too many attempts. Please wait a minute and try again.";
    }
    if (error.code === "EMAIL_DELIVERY_FAILED" && error.retryable === false) {
      return "We could not deliver email to this address. Check the address or contact support before trying again.";
    }
    if (error.code === "AUTH_TEMPORARILY_UNAVAILABLE") {
      return "Authentication is temporarily unavailable. Please try again shortly.";
    }
    if (error.status >= 500) {
      return "Something went wrong on our side. Please try again in a moment — if it keeps happening, contact support.";
    }
    return error.message || "We couldn't complete that. Please try again.";
  }

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return NETWORK_OFFLINE_MESSAGE;
  }

  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
};

const scorePassword = (value: string) => {
  let score = 0;
  if (value.length >= 8) score++;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score++;
  if (/\d/.test(value)) score++;
  if (/[^A-Za-z0-9]/.test(value) && value.length >= 10) score++;
  return score;
};

const strengthHint = (value: string, score: number) => {
  if (value.length === 0)
    return "Use 8 or more characters with a mix of letters and numbers.";
  if (score < 2) return "Keep going — add length, numbers or mixed case.";
  if (score < 4)
    return "Good start. A symbol or extra length will make it stronger.";
  return "Strong password.";
};

const Login: React.FC<LoginProps> = ({
  onLogin,
  onRegister,
  onVerifyEmail,
  onVerifyLoginOtp,
  onResendCode,
  resendCooldownSeconds = 60,
}) => {
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showSignupHint, setShowSignupHint] = useState(false);

  /*
   * The pending challenge, or null when we are showing the form.
   *
   * Holding the whole AuthChallenge (rather than a boolean plus loose fields)
   * means the panel below cannot be rendered without the pendingToken it needs,
   * and a resend that returns a REFRESHED token replaces the whole object —
   * which is what keeps the client from verifying against a token the server
   * has already superseded.
   */
  const [challenge, setChallenge] = useState<AuthChallenge | null>(null);

  const challengePurpose =
    challenge?.verificationRequired === true ? "email_verify" : "login_otp";

  const resetToForm = () => {
    setChallenge(null);
    setError("");
    setShowSignupHint(false);
    setPassword("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setShowSignupHint(false);

    try {
      /*
       * Both paths end at a challenge, never at a session. /register and
       * /login return { pendingToken, ... } and nothing else; the token only
       * arrives once the emailed code is verified.
       */
      const next =
        authMode === "signup"
          ? await onRegister({ name, companyName, email, password })
          : await onLogin(email, password);
      setChallenge(next);
      // Do not keep the password in component state while the user reads their
      // email. It has done its job.
      setPassword("");
    } catch (submitError) {
      setError(formatAuthError(submitError));
      setShowSignupHint(isLikelyMissingAccount(submitError));
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (code: string) => {
    if (!challenge) return;
    if (challengePurpose === "email_verify") {
      await onVerifyEmail(challenge.pendingToken, code);
    } else {
      await onVerifyLoginOtp(challenge.pendingToken, code);
    }
  };

  const handleResend = async () => {
    if (!challenge) return;
    const refreshed = await onResendCode(challenge.pendingToken);
    setChallenge((current) =>
      current
        ? {
            ...current,
            pendingToken: refreshed.pendingToken,
            expiresInSeconds: refreshed.expiresInSeconds,
          }
        : current,
    );
  };

  const passwordScore = scorePassword(password);

  const switchMode = (mode: "signin" | "signup") => {
    setAuthMode(mode);
    setError("");
  };

  return (
    <AuthShell>
      {!challenge && (
        <div
          role="tablist"
          aria-label="Choose account action"
          className="mb-[42px] grid grid-cols-2 gap-1 rounded-[12px] border border-[var(--line)] bg-[var(--surface-soft)] p-1 max-[760px]:mb-[34px]"
        >
          {(
            [
              ["signin", "Sign in"],
              ["signup", "Create account"],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={authMode === mode}
              onClick={() => switchMode(mode)}
              className={`min-h-[36px] rounded-lg border-0 text-[14px] font-medium transition ${
                authMode === mode
                  ? "bg-[var(--surface-raised)] text-[var(--text)] shadow-[0_1px_5px_rgba(12,16,27,0.08)]"
                  : "bg-transparent text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {challenge ? (
        <AuthCodePanel
          purpose={challengePurpose}
          email={challenge.email}
          expiresInSeconds={challenge.expiresInSeconds}
          resendCooldownSeconds={resendCooldownSeconds}
          onSubmit={handleVerify}
          onResend={handleResend}
          onCancel={resetToForm}
        />
      ) : authMode === "signup" ? (
        <div>
          <SectionHeading
            title="Build your workspace."
            sub="Create your account and start with the tools your business needs."
          />
          <form onSubmit={handleSubmit} className="grid gap-[18px]">
            <div className="grid grid-cols-2 gap-[14px] max-[760px]:grid-cols-1">
              <Field label="Full name" htmlFor="auth-name">
                <TextInput
                  id="auth-name"
                  type="text"
                  required
                  autoComplete="name"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Field label="Business name" htmlFor="auth-company">
                <TextInput
                  id="auth-company"
                  type="text"
                  required
                  autoComplete="organization"
                  placeholder="Company name"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              </Field>
            </div>

            <Field label="Email address" htmlFor="auth-email">
              <TextInput
                id="auth-email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>

            <Field
              label="Password"
              htmlFor="auth-password"
              hint={
                <>
                  <div
                    className="mt-[2px] grid grid-cols-4 gap-[5px]"
                    aria-hidden="true"
                  >
                    {[0, 1, 2, 3].map((i) => (
                      <span
                        key={i}
                        className="h-[3px] rounded-full transition-colors"
                        style={{
                          background:
                            i <
                            (passwordScore <= 2
                              ? passwordScore
                              : passwordScore >= 4
                                ? 4
                                : 3)
                              ? passwordScore >= 3
                                ? "var(--success)"
                                : "#d97932"
                              : "var(--line)",
                        }}
                      />
                    ))}
                  </div>
                  <p className="m-0 text-[12px] leading-[1.45] text-[var(--muted)]">
                    {strengthHint(password, passwordScore)}
                  </p>
                </>
              }
            >
              <div className="relative">
                <TextInput
                  id="auth-password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="Create a secure password"
                  className="pr-[46px]"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <PasswordRevealButton
                  visible={showPassword}
                  onToggle={() => setShowPassword((v) => !v)}
                  label="password"
                />
              </div>
            </Field>

            <ErrorAlert>{error}</ErrorAlert>

            <PrimaryButton type="submit" disabled={loading}>
              {loading ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                "Create account"
              )}
            </PrimaryButton>
            <p className="m-0 text-[13px] leading-[1.55] text-[var(--muted)]">
              By creating an account, you agree to Agently&apos;s{" "}
              <Link
                to="/terms"
                className="font-medium text-[var(--accent)] no-underline hover:underline hover:underline-offset-[3px]"
              >
                Terms &amp; Privacy
              </Link>
              .
            </p>
          </form>
          <p className="m-0 mt-[22px] text-center text-[14px] text-[var(--muted)]">
            Already have an account?{" "}
            <TextButton type="button" onClick={() => switchMode("signin")}>
              Sign in
            </TextButton>
          </p>
        </div>
      ) : (
        <div>
          <SectionHeading
            title="Welcome back."
            sub="Sign in to continue to your workspace."
          />
          <form onSubmit={handleSubmit} className="grid gap-[18px]">
            <Field label="Email address" htmlFor="auth-email">
              <TextInput
                id="auth-email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>

            <Field label="Password" htmlFor="auth-password">
              <div className="relative">
                <TextInput
                  id="auth-password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  className="pr-[46px]"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <PasswordRevealButton
                  visible={showPassword}
                  onToggle={() => setShowPassword((v) => !v)}
                  label="password"
                />
              </div>
            </Field>

            <div className="my-[1px] flex items-center justify-between gap-4">
              <span />
              <Link
                to="/forgot-password"
                className="text-[14px] font-medium text-[var(--accent)] no-underline hover:underline hover:underline-offset-[3px]"
              >
                Forgot password?
              </Link>
            </div>

            <ErrorAlert>{error}</ErrorAlert>
            {showSignupHint && (
              <p
                data-testid="signup-hint"
                className="m-0 text-center text-[13px] text-[var(--muted)]"
              >
                <TextButton type="button" onClick={() => switchMode("signup")}>
                  Create an account
                </TextButton>
              </p>
            )}

            <PrimaryButton type="submit" disabled={loading}>
              {loading ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                "Sign in"
              )}
            </PrimaryButton>
            <p className="m-0 text-center text-[13px] text-[var(--muted)]">
              We&apos;ll email you a 6-digit code to finish signing in.
            </p>
          </form>
          <p className="m-0 mt-[22px] text-center text-[14px] text-[var(--muted)]">
            New to Agently?{" "}
            <TextButton type="button" onClick={() => switchMode("signup")}>
              Create an account
            </TextButton>
          </p>
        </div>
      )}
    </AuthShell>
  );
};

export default Login;
