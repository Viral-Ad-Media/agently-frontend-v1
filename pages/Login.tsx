import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ApiError, NETWORK_OFFLINE_MESSAGE } from "../services/api";

interface LoginProps {
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (payload: {
    name: string;
    companyName: string;
    email: string;
    password: string;
  }) => Promise<void>;
  onSendMagicLink: (
    email: string,
  ) => Promise<{ magicLinkToken: string; magicLinkUrl?: string | null }>;
  onVerifyMagicLink: (token: string) => Promise<void>;
}

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

const formatAuthError = (error: unknown) => {
  console.error("[auth] login/register submission failed:", error);

  if (error instanceof ApiError) {
    if (error.status === 0 || error.message === NETWORK_OFFLINE_MESSAGE) {
      return "Agently cannot reach the backend right now. Check your internet connection, confirm the backend is running, and try again.";
    }
    if (error.status === 401) {
      return "Sign-in failed. Check the email/password, or confirm this frontend is connected to the correct backend database.";
    }
    if (error.status >= 500) {
      return "The backend had trouble signing you in. Please check the server terminal logs and try again.";
    }
    return error.message || "Unable to complete authentication.";
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
  onSendMagicLink,
  onVerifyMagicLink,
}) => {
  const location = useLocation();
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [method, setMethod] = useState<"password" | "magic">("password");
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [magicLinkToken, setMagicLinkToken] = useState("");
  const [magicLinkUrl, setMagicLinkUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const attemptedMagicTokenRef = useRef<string | null>(null);

  const verifyMagicLink = async (token: string) => {
    setLoading(true);
    setError("");

    try {
      await onVerifyMagicLink(token);
    } catch (submitError) {
      setError(formatAuthError(submitError));
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get("magic") || params.get("magicToken");

    if (!token || attemptedMagicTokenRef.current === token) {
      return;
    }

    attemptedMagicTokenRef.current = token;
    void verifyMagicLink(token);
  }, [location.search]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (authMode === "signup") {
        await onRegister({
          name,
          companyName,
          email,
          password,
        });
        return;
      }

      if (method === "password") {
        await onLogin(email, password);
      } else {
        const response = await onSendMagicLink(email);
        setMagicLinkToken(response.magicLinkToken);
        setMagicLinkUrl(response.magicLinkUrl || "");
        setSent(true);
      }
    } catch (submitError) {
      setError(formatAuthError(submitError));
    } finally {
      setLoading(false);
    }
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
        <div className="mb-2 flex h-11 items-center justify-between rounded-full border border-[#232f3e]/10 bg-white/78 px-4 shadow-[0_10px_28px_rgba(35,47,62,0.055)] backdrop-blur-xl">
          <Link
            to="/"
            className="flex items-center"
            aria-label="Go to Agently home"
          >
            <img
              src="/agently-wordmark-dark.png"
              alt="Agently"
              className="h-7 w-auto object-contain sm:h-8"
            />
          </Link>
          <Link
            to="/"
            className="rounded-full border border-[#232f3e]/12 px-4 py-2 text-[12px] font-medium text-[#232f3e]/72 transition hover:border-[#ff5527]/40 hover:text-[#ff5527]"
          >
            Back to site
          </Link>
        </div>

        <div className="grid flex-1 overflow-hidden rounded-[2rem] border border-white/70 bg-white/74 shadow-[0_26px_78px_rgba(35,47,62,0.11)] backdrop-blur-xl lg:min-h-0 lg:grid-cols-[0.86fr_1.14fr]">
          <section className="relative hidden overflow-hidden bg-[#232f3e] p-6 text-white lg:flex lg:flex-col lg:justify-between xl:p-6">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_0%,rgba(255,85,39,0.42),transparent_28%),radial-gradient(circle_at_95%_15%,rgba(255,255,255,0.12),transparent_24%),linear-gradient(145deg,rgba(255,255,255,0.06),transparent_42%)]" />
            <div className="relative">
              <img
                src="/agently-wordmark-light.png"
                alt="Agently"
                className="h-7 w-auto object-contain"
              />
              <p className="mt-4 text-[9px] font-medium uppercase tracking-[0.24em] text-white/50">
                Reception ops control room
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
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-white text-[10px] font-medium text-[#232f3e]">
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
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#ff5527] text-white shadow-[0_10px_24px_rgba(255,85,39,0.2)]">
                    <AccessIcon />
                  </span>
                  <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#ff5527]">
                    Agently access
                  </p>
                </div>
                <h1 className="font-display text-[clamp(1.82rem,3vw,2.35rem)] font-medium leading-[1.02] tracking-[-0.055em] text-[#232f3e]">
                  {heading}
                </h1>
                <p className="mt-2 text-[13px] font-normal leading-[18px] text-[#232f3e]/70">
                  {description}
                </p>
              </div>

              <div className="rounded-[1.45rem] border border-[#232f3e]/10 bg-[#fbfaf4]/94 p-3.5 shadow-[0_14px_42px_rgba(35,47,62,0.09)] backdrop-blur-xl sm:p-3.5">
                {sent ? (
                  <div className="py-5 text-center animate-in fade-in zoom-in">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#ff5527]/10 text-[#ff5527]">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="28"
                        height="28"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <rect width="20" height="16" x="2" y="4" rx="2" />
                        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                      </svg>
                    </div>
                    <h2 className="text-xl font-medium tracking-[-0.035em] text-[#232f3e]">
                      Secure link ready
                    </h2>
                    <p className="mx-auto mt-2 max-w-sm text-[15px] font-normal leading-[21px] text-[#232f3e]/68">
                      Continue to your workspace with the secure link generated
                      for this session.
                    </p>
                    {error && (
                      <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                        {error}
                      </div>
                    )}
                    <div className="mt-5 space-y-3">
                      <button
                        onClick={() => {
                          if (magicLinkToken) {
                            void verifyMagicLink(magicLinkToken);
                          }
                        }}
                        disabled={loading || !magicLinkToken}
                        className="flex w-full items-center justify-center gap-2 rounded-full bg-[#232f3e] px-5 py-2.5 text-[13px] font-medium text-white shadow-[0_18px_40px_rgba(35,47,62,0.16)] transition hover:-translate-y-0.5 hover:bg-[#1a2633] disabled:translate-y-0 disabled:opacity-50"
                      >
                        {loading ? (
                          <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        ) : (
                          "Continue to workspace"
                        )}
                      </button>
                      {magicLinkUrl && (
                        <a
                          href={magicLinkUrl}
                          className="block w-full rounded-full border border-[#232f3e]/12 px-4 py-3 text-sm font-medium text-[#232f3e]/72 transition hover:border-[#ff5527]/40 hover:text-[#ff5527]"
                        >
                          Open secure link
                        </a>
                      )}
                      <button
                        onClick={() => {
                          setSent(false);
                          setMethod("password");
                          setMagicLinkToken("");
                          setMagicLinkUrl("");
                          setError("");
                        }}
                        className="text-sm font-medium text-[#ff5527] hover:underline"
                      >
                        Try another method
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mb-2.5 grid grid-cols-2 rounded-full border border-[#232f3e]/8 bg-white p-1">
                      <button
                        onClick={() => {
                          setAuthMode("signin");
                          setError("");
                        }}
                        type="button"
                        className={`rounded-full py-1.5 text-[13px] font-medium transition-all ${authMode === "signin" ? "bg-[#232f3e] text-white shadow-sm" : "text-[#232f3e]/58 hover:text-[#232f3e]"}`}
                      >
                        Sign in
                      </button>
                      <button
                        onClick={() => {
                          setAuthMode("signup");
                          setMethod("password");
                          setError("");
                        }}
                        type="button"
                        className={`rounded-full py-1.5 text-[13px] font-medium transition-all ${authMode === "signup" ? "bg-[#232f3e] text-white shadow-sm" : "text-[#232f3e]/58 hover:text-[#232f3e]"}`}
                      >
                        Create account
                      </button>
                    </div>

                    {authMode === "signin" && (
                      <div className="mb-2.5 grid grid-cols-2 rounded-full border border-[#232f3e]/8 bg-white p-1">
                        <button
                          onClick={() => setMethod("password")}
                          type="button"
                          className={`rounded-full py-1.5 text-[13px] font-medium transition-all ${method === "password" ? "bg-[#ff5527] text-white shadow-sm" : "text-[#232f3e]/58 hover:text-[#232f3e]"}`}
                        >
                          Password
                        </button>
                        <button
                          onClick={() => setMethod("magic")}
                          type="button"
                          className={`rounded-full py-1.5 text-[13px] font-medium transition-all ${method === "magic" ? "bg-[#ff5527] text-white shadow-sm" : "text-[#232f3e]/58 hover:text-[#232f3e]"}`}
                        >
                          Secure link
                        </button>
                      </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-2.5">
                      {authMode === "signup" && (
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-[12px] font-medium text-[#232f3e]">
                              Full name
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="Your name"
                              className="auth-input"
                              value={name}
                              onChange={(e) => setName(e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-[12px] font-medium text-[#232f3e]">
                              Workspace name
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="Company or team"
                              className="auth-input"
                              value={companyName}
                              onChange={(e) => setCompanyName(e.target.value)}
                            />
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="mb-1 block text-[12px] font-medium text-[#232f3e]">
                          Email address
                        </label>
                        <input
                          type="email"
                          required
                          placeholder="name@company.com"
                          className="auth-input"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                        />
                      </div>

                      {(authMode === "signup" || method === "password") && (
                        <div>
                          <div className="mb-1 flex justify-between">
                            <label className="block text-[12px] font-medium text-[#232f3e]">
                              Password
                            </label>
                            {authMode === "signin" && (
                              <Link
                                to="/forgot-password"
                                className="text-xs font-medium text-[#ff5527] hover:underline"
                              >
                                Forgot?
                              </Link>
                            )}
                          </div>
                          <input
                            type="password"
                            required={
                              authMode === "signup" || method === "password"
                            }
                            placeholder="••••••••"
                            className="auth-input"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                          />
                        </div>
                      )}

                      {error && (
                        <div className="rounded-2xl border border-red-100 bg-red-50 px-3 py-2 text-[12px] font-medium leading-[16px] text-red-600">
                          {error}
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={loading}
                        className="flex w-full items-center justify-center gap-2 rounded-full bg-[#232f3e] px-5 py-2.5 text-[13px] font-medium text-white shadow-[0_18px_40px_rgba(35,47,62,0.16)] transition hover:-translate-y-0.5 hover:bg-[#1a2633] disabled:translate-y-0 disabled:opacity-50"
                      >
                        {loading ? (
                          <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        ) : authMode === "signup" ? (
                          "Create workspace"
                        ) : method === "password" ? (
                          "Sign in"
                        ) : (
                          "Send secure link"
                        )}
                      </button>
                    </form>
                  </>
                )}
              </div>

              {!sent && (
                <p className="mt-2 text-center text-[12px] font-normal text-[#232f3e]/60">
                  {authMode === "signup" ? (
                    <>
                      Already have an account?{" "}
                      <button
                        type="button"
                        onClick={() => setAuthMode("signin")}
                        className="font-medium text-[#ff5527] hover:underline"
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
                        className="font-medium text-[#ff5527] hover:underline"
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
