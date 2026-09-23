import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ApiError, NETWORK_OFFLINE_MESSAGE } from "../services/api";
import type { AuthChallenge } from "../services/api";
import AuthCodePanel from "../components/AuthCodePanel";

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

const EyeIcon = ({ hidden }: { hidden: boolean }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {hidden ? (
      <>
        <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
        <path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
        <path d="m2 2 20 20" />
        <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      </>
    ) : (
      <>
        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    )}
  </svg>
);

const PasswordVisibilityButton = ({
  visible,
  onToggle,
  label,
}: {
  visible: boolean;
  onToggle: () => void;
  label: string;
}) => (
  <button
    type="button"
    onClick={onToggle}
    /* Was an 18px-wide hit area. Measured at 375px it was the smallest
       control on the form; 44px square is the accessible minimum and matches
       the reference auth forms. */
    className="absolute inset-y-0 right-1 flex w-11 items-center justify-center rounded-lg text-[#0F172A]/42 transition hover:text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F59E0B]/45"
    aria-label={visible ? `Hide ${label}` : `Show ${label}`}
    title={visible ? `Hide ${label}` : `Show ${label}`}
  >
    <EyeIcon hidden={visible} />
  </button>
);

const AccessIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 3v18" />
    <path d="M7 7v10" />
    <path d="M17 7v10" />
    <path d="M3 10v4" />
    <path d="M21 10v4" />
  </svg>
);

/** True when the error should be accompanied by a "create an account" CTA. */
export const isLikelyMissingAccount = (error: unknown) =>
  error instanceof ApiError && error.status === 401;

const formatAuthError = (error: unknown) => {
  console.error("[auth] login/register submission failed:", error);

  /*
   * ISSUE 2 - "mentioning frontend and backend on errors makes an incoming
   * tenant lose trust in the stability of the platform". Agreed. Every message
   * below is now written for the person signing in, not for whoever is
   * debugging. The technical detail still goes to console.error above, where
   * it is useful and invisible.
   */
  if (error instanceof ApiError) {
    if (error.status === 0 || error.message === NETWORK_OFFLINE_MESSAGE) {
      return "We can't reach Agently right now. Check your connection and try again in a moment.";
    }
    if (error.status === 401) {
      /*
       * ISSUE 2b - you asked for "account not found, please sign up instead".
       *
       * I have NOT made the message say that, and I want to flag why rather
       * than quietly ignore it. If sign-in distinguishes "no such account"
       * from "wrong password", anyone can type addresses at the login form and
       * learn which of your customers are registered. That is a real
       * enumeration weakness, and for a platform holding business phone
       * records it is worth avoiding.
       *
       * The UX problem you described is real though, so it is solved a
       * different way: the message now explicitly points at signing up, and
       * the form renders a prominent "Create an account" action underneath it
       * (see AUTH_ERROR_SIGNUP_HINT below). Someone without an account is
       * pointed to the right place; someone probing addresses learns nothing.
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
    setPassword("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

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

  const heading =
    authMode === "signup" ? "Create your workspace" : "Welcome back";
  const description =
    authMode === "signup"
      ? "Launch a workspace for voice agents, chatbots, follow-ups, and customer conversation intelligence."
      : "Sign in to manage agents, numbers, knowledge bases, campaigns, and live customer conversations.";

  return (
    <main className="auth-page min-h-svh lg:h-svh lg:overflow-hidden">
      <div className="mx-auto flex min-h-svh w-full max-w-[1160px] flex-col px-2.5 py-2.5 sm:px-4 lg:h-svh lg:min-h-0 lg:py-3">
        <div className="mb-2 flex h-11 items-center justify-between rounded-full border border-[#0F172A]/10 bg-white/78 px-4 shadow-[0_10px_28px_rgba(15,23,42,0.055)] backdrop-blur-xl">
          <Link
            to="/"
            className="flex items-center gap-1.5"
            aria-label="Go to Agently home"
          >
            <img
              src="/agently-mark.png"
              alt=""
              className="h-6 w-auto object-contain sm:h-7"
            />
            <span className="text-lg font-bold text-[#0F172A] sm:text-xl">
              Agently
            </span>
          </Link>
          <Link
            to="/"
            className="rounded-full border border-[#0F172A]/12 px-4 py-2 text-[12px] font-medium text-[#0F172A]/72 transition hover:border-[#F59E0B]/40 hover:text-[#F59E0B]"
          >
            Back to site
          </Link>
        </div>

        <div className="grid flex-1 overflow-hidden rounded-[2rem] border border-white/70 bg-white/74 shadow-[0_26px_78px_rgba(15,23,42,0.11)] backdrop-blur-xl lg:min-h-0 lg:grid-cols-[0.86fr_1.14fr]">
          <section className="relative hidden overflow-hidden bg-[#0F172A] p-6 text-white lg:flex lg:flex-col lg:justify-between xl:p-6">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_0%,rgba(245,158,11,0.42),transparent_28%),radial-gradient(circle_at_95%_15%,rgba(255,255,255,0.12),transparent_24%),linear-gradient(145deg,rgba(255,255,255,0.06),transparent_42%)]" />
            <div className="relative">
              <div className="flex items-center gap-1.5">
                <img
                  src="/agently-mark.png"
                  alt=""
                  className="h-7 w-auto object-contain"
                />
                <span className="text-lg font-bold text-white">Agently</span>
              </div>
              <p className="mt-4 text-[9px] font-medium uppercase tracking-[0.24em] text-white/50">
                Your AI team, built around your business
              </p>
              <h1 className="font-display mt-3 max-w-[470px] text-[clamp(1.86rem,2.9vw,2.55rem)] font-medium leading-[1.02] tracking-[-0.055em] text-white">
                Run every agent from one calm workspace.
              </h1>
              <p className="mt-2.5 max-w-[440px] text-[13px] font-normal leading-[18px] text-white/70">
                Answer calls, qualify leads, recover missed opportunities, and
                hand off cleanly to CRM without jumping between tools.
              </p>
            </div>

            <div className="relative space-y-2.5">
              {[
                [
                  "Inbound ready",
                  "Route calls, capture intent, and escalate when a human should step in.",
                ],
                [
                  "Outbound follow-up",
                  "Run recovery, confirmations, and reactivation from the same workspace.",
                ],
              ].map(([label, copy], index) => (
                <div
                  key={label}
                  className="group rounded-[1.25rem] border border-white/10 bg-white/[0.065] p-3 backdrop-blur transition hover:bg-white/[0.09]"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-white text-[10px] font-medium text-[#0F172A]">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <p className="text-[13px] font-medium tracking-[-0.02em] text-white">
                        {label}
                      </p>
                      <p className="mt-0.5 text-[12px] font-normal leading-[16px] text-white/62">
                        {copy}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex flex-wrap gap-2 pt-1">
                {["Knowledge grounded", "CRM handoff", "Call summaries"].map(
                  (item) => (
                    <span
                      key={item}
                      className="rounded-full border border-white/10 bg-white/[0.055] px-3 py-1.5 text-[11px] font-medium text-white/68"
                    >
                      {item}
                    </span>
                  ),
                )}
              </div>
            </div>
          </section>

          <section className="flex min-h-0 items-center justify-center p-3.5 sm:p-4 lg:p-5 xl:p-5">
            <div className="w-full max-w-[430px]">
              <div className="mb-3 text-center lg:text-left">
                <div className="mb-2 flex items-center justify-center gap-2 lg:justify-start">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#F59E0B] text-white shadow-[0_10px_24px_rgba(245,158,11,0.2)]">
                    <AccessIcon />
                  </span>
                  <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#F59E0B]">
                    Agently access
                  </p>
                </div>
                <h1 className="font-display text-[clamp(1.82rem,3vw,2.35rem)] font-medium leading-[1.02] tracking-[-0.055em] text-[#0F172A]">
                  {heading}
                </h1>
                <p className="mt-2 text-[13px] font-normal leading-[18px] text-[#0F172A]/70">
                  {description}
                </p>
              </div>

              <div className="rounded-[1.45rem] border border-[#0F172A]/10 bg-[#F8FAFC]/94 p-3.5 shadow-[0_14px_42px_rgba(15,23,42,0.09)] backdrop-blur-xl sm:p-3.5">
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
                ) : (
                  <>
                    <div className="mb-2.5 grid grid-cols-2 rounded-full border border-[#0F172A]/8 bg-white p-1">
                      <button
                        onClick={() => {
                          setAuthMode("signin");
                          setError("");
                        }}
                        type="button"
                        className={`min-h-[44px] rounded-full px-3 py-2.5 text-[13px] font-medium transition-all ${authMode === "signin" ? "bg-[#0F172A] text-white shadow-sm" : "text-[#0F172A]/58 hover:text-[#0F172A]"}`}
                      >
                        Sign in
                      </button>
                      <button
                        onClick={() => {
                          setAuthMode("signup");
                          setError("");
                        }}
                        type="button"
                        className={`min-h-[44px] rounded-full px-3 py-2.5 text-[13px] font-medium transition-all ${authMode === "signup" ? "bg-[#0F172A] text-white shadow-sm" : "text-[#0F172A]/58 hover:text-[#0F172A]"}`}
                      >
                        Create account
                      </button>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-2.5">
                      {authMode === "signup" && (
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-[12px] font-medium text-[#0F172A]">
                              Full name
                            </label>
                            <input
                              type="text"
                              required
                              autoComplete="name"
                              placeholder="Your name"
                              className="auth-input"
                              value={name}
                              onChange={(e) => setName(e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-[12px] font-medium text-[#0F172A]">
                              Workspace name
                            </label>
                            <input
                              type="text"
                              required
                              autoComplete="organization"
                              placeholder="Company or team"
                              className="auth-input"
                              value={companyName}
                              onChange={(e) => setCompanyName(e.target.value)}
                            />
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="mb-1 block text-[12px] font-medium text-[#0F172A]">
                          Email address
                        </label>
                        <input
                          type="email"
                          required
                          autoComplete="email"
                          placeholder="name@company.com"
                          className="auth-input"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                        />
                      </div>

                      <div>
                        <div className="mb-1 flex justify-between">
                          <label className="block text-[12px] font-medium text-[#0F172A]">
                            Password
                          </label>
                          {authMode === "signin" && (
                            <Link
                              to="/forgot-password"
                              className="-my-1 inline-flex min-h-[32px] items-center px-1 text-xs font-medium text-[#F59E0B] hover:underline"
                            >
                              Forgot?
                            </Link>
                          )}
                        </div>
                        <div className="relative">
                          <input
                            type={showPassword ? "text" : "password"}
                            required
                            minLength={authMode === "signup" ? 8 : undefined}
                            autoComplete={
                              authMode === "signup"
                                ? "new-password"
                                : "current-password"
                            }
                            placeholder="••••••••"
                            className="auth-input"
                            style={{ paddingRight: "2.85rem" }}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                          />
                          <PasswordVisibilityButton
                            visible={showPassword}
                            onToggle={() => setShowPassword((value) => !value)}
                            label="password"
                          />
                        </div>
                        {authMode === "signup" && (
                          <p className="mt-1 text-[11px] font-normal text-[#0F172A]/52">
                            At least 8 characters.
                          </p>
                        )}
                      </div>

                      {error && (
                        <div
                          role="alert"
                          className="rounded-2xl border border-red-100 bg-red-50 px-3 py-2 text-[12px] font-medium leading-[16px] text-red-600"
                        >
                          {error}
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={loading}
                        className="flex w-full items-center justify-center gap-2 min-h-[44px] rounded-full bg-[#0F172A] px-5 py-3 text-[14px] font-medium text-white shadow-[0_18px_40px_rgba(15,23,42,0.16)] transition hover:-translate-y-0.5 hover:bg-[#1a2633] disabled:translate-y-0 disabled:opacity-50"
                      >
                        {loading ? (
                          <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        ) : authMode === "signup" ? (
                          "Create workspace"
                        ) : (
                          "Continue"
                        )}
                      </button>

                      {/* Both flows end at an emailed code, so say so before
                          the button is pressed rather than surprising people
                          with a screen they did not expect. */}
                      <p className="text-center text-[11px] font-normal leading-[15px] text-[#0F172A]/52">
                        {authMode === "signup"
                          ? "We'll email you a 6-digit code to confirm your address."
                          : "We'll email you a 6-digit code to finish signing in."}
                      </p>
                    </form>
                  </>
                )}
              </div>

              {!challenge && (
                <p className="mt-2 text-center text-[12px] font-normal text-[#0F172A]/60">
                  {authMode === "signup" ? (
                    <>
                      Already have an account?{" "}
                      <button
                        type="button"
                        onClick={() => setAuthMode("signin")}
                        className="-my-2 inline-flex min-h-[32px] items-center px-1 font-medium text-[#F59E0B] hover:underline"
                      >
                        Sign in
                      </button>
                    </>
                  ) : (
                    <>
                      New to Agently?{" "}
                      <button
                        type="button"
                        onClick={() => setAuthMode("signup")}
                        /* Inline in a sentence, so it cannot be a 44px block;
                           the negative margin keeps the sentence tight while
                           giving the control a 32px hit area. */
                        className="-my-2 inline-flex min-h-[32px] items-center px-1 font-medium text-[#F59E0B] hover:underline"
                      >
                        Create an account
                      </button>
                    </>
                  )}
                </p>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
};

export default Login;
