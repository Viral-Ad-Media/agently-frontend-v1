import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api } from "../services/api";

const RecoveryIcon = () => (
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
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    <path d="M9 12.5 11 14.5 15.5 10" />
  </svg>
);

const getResetTokenFromCurrentUrl = (locationSearch = "") => {
  const candidates: string[] = [locationSearch];

  if (typeof window !== "undefined") {
    candidates.push(window.location.search || "");
    candidates.push(
      window.location.hash.includes("?")
        ? window.location.hash.slice(window.location.hash.indexOf("?"))
        : "",
    );

    // Email clients and link scanners sometimes encode fragments into the full href.
    // Parse the full URL defensively so the reset form still appears instead of the home page.
    const fullHref = window.location.href || "";
    const resetTokenMatch = fullHref.match(
      /[?&#](?:resetToken|token)=([^&#]+)/i,
    );
    if (resetTokenMatch?.[1]) {
      try {
        return decodeURIComponent(resetTokenMatch[1])
          .trim()
          .replace(/[\s.]+$/g, "");
      } catch {
        return resetTokenMatch[1].trim().replace(/[\s.]+$/g, "");
      }
    }
  }

  for (const candidate of candidates) {
    if (!candidate) continue;
    const params = new URLSearchParams(
      candidate.startsWith("?") ? candidate : `?${candidate}`,
    );
    const token = params.get("resetToken") || params.get("token");
    if (token) return token.trim().replace(/[\s.]+$/g, "");
  }

  return "";
};

const ForgotPassword: React.FC = () => {
  const location = useLocation();
  const resetToken = useMemo(
    () => getResetTokenFromCurrentUrl(location.search),
    [location.search, location.key],
  );

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [devResetUrl, setDevResetUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setError("");
    setCompleted(false);
  }, [resetToken]);

  const requestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setDevResetUrl("");

    try {
      const response = await api.requestPasswordReset(email);
      setSent(true);
      setDevResetUrl(response.resetUrl || "");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to send password reset instructions.",
      );
    } finally {
      setLoading(false);
    }
  };

  const confirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (!resetToken) {
      setError(
        "This reset link is missing its secure token. Please request a new password reset email.",
      );
      setLoading(false);
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }

    try {
      await api.confirmPasswordReset(resetToken, password);
      setCompleted(true);
      setPassword("");
      setConfirmPassword("");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to reset your password.",
      );
    } finally {
      setLoading(false);
    }
  };

  const isResetMode = Boolean(resetToken);

  return (
    <main className="auth-page min-h-svh lg:h-svh lg:overflow-hidden">
      <div className="mx-auto flex min-h-svh w-full max-w-[1080px] flex-col px-3 py-3 sm:px-5 lg:h-svh lg:min-h-0 lg:py-4">
        <div className="mb-3 flex h-12 items-center justify-between rounded-full border border-[#0F172A]/10 bg-white/76 px-4 shadow-[0_12px_36px_rgba(15,23,42,0.06)] backdrop-blur-xl">
          <Link
            to="/"
            className="flex items-center"
            aria-label="Go to Agently home"
          >
            <img
              src="/agently-reception-wordmark-dark.png"
              alt="Agently Reception Ops"
              className="h-8 w-auto object-contain sm:h-9"
            />
          </Link>
          <Link
            to="/login"
            className="rounded-full border border-[#0F172A]/12 px-4 py-2 text-[12px] font-medium text-[#0F172A]/72 transition hover:border-[#F59E0B]/40 hover:text-[#F59E0B]"
          >
            Back to login
          </Link>
        </div>

        <div className="grid flex-1 overflow-hidden rounded-[2rem] border border-white/70 bg-white/74 shadow-[0_26px_78px_rgba(15,23,42,0.11)] backdrop-blur-xl lg:min-h-0 lg:grid-cols-[0.86fr_1.14fr]">
          <section className="relative hidden overflow-hidden bg-[#0F172A] p-7 text-white lg:flex lg:flex-col lg:justify-between">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_0%,rgba(245,158,11,0.43),transparent_30%),radial-gradient(circle_at_92%_16%,rgba(255,255,255,0.12),transparent_26%),linear-gradient(145deg,rgba(255,255,255,0.07),transparent_44%)]" />
            <div className="relative">
              <img
                src="/agently-reception-wordmark-light.png"
                alt="Agently Reception Ops"
                className="h-8 w-auto object-contain"
              />
              <p className="mt-7 text-[10px] font-medium uppercase tracking-[0.24em] text-white/50">
                Account recovery
              </p>
              <h1 className="font-display mt-3 max-w-[420px] text-[clamp(2.05rem,3.1vw,2.9rem)] font-medium leading-[1.02] tracking-[-0.055em] text-white">
                Get back into your workspace securely.
              </h1>
              <p className="mt-3 max-w-[420px] text-[14px] font-normal leading-[20px] text-white/70">
                We send a time-limited recovery link to the email on your
                account. No one can change your password without that link.
              </p>
            </div>

            <div className="relative grid gap-3">
              {[
                [
                  "Time-limited link",
                  "Recovery links expire quickly and can only be used once.",
                ],
                [
                  "No account leaks",
                  "Request responses stay generic to protect registered email addresses.",
                ],
                [
                  "Back to operations",
                  "Reset your password, sign in, and return to your agents.",
                ],
              ].map(([title, copy]) => (
                <div
                  key={title}
                  className="rounded-[1.35rem] border border-white/10 bg-white/[0.065] p-3.5 backdrop-blur"
                >
                  <p className="text-[13px] font-medium tracking-[-0.02em] text-white">
                    {title}
                  </p>
                  <p className="mt-1 text-[12.5px] font-normal leading-[17px] text-white/62">
                    {copy}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="flex min-h-0 items-center justify-center p-4 sm:p-5 lg:p-7">
            <div className="w-full max-w-[450px]">
              <div className="mb-5 text-center lg:text-left">
                <div className="mb-3 flex items-center justify-center gap-2 lg:justify-start">
                  <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#F59E0B] text-white shadow-[0_14px_30px_rgba(245,158,11,0.22)]">
                    <RecoveryIcon />
                  </span>
                  <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#F59E0B]">
                    Secure recovery
                  </p>
                </div>
                <h1 className="font-display text-[clamp(2rem,3.1vw,2.65rem)] font-medium leading-[1.02] tracking-[-0.055em] text-[#0F172A]">
                  {isResetMode
                    ? "Create a new password"
                    : "Reset your password"}
                </h1>
                <p className="mt-2.5 text-[14px] font-normal leading-[20px] text-[#0F172A]/70">
                  {isResetMode
                    ? "Choose a strong password for your Agently workspace."
                    : "Enter your account email and we will send password reset instructions if the account exists."}
                </p>
              </div>

              <div className="rounded-[1.6rem] border border-[#0F172A]/10 bg-[#F8FAFC]/94 p-4 shadow-[0_18px_54px_rgba(15,23,42,0.1)] backdrop-blur-xl sm:p-5">
                {completed ? (
                  <div className="py-6 text-center animate-in fade-in zoom-in">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#F59E0B]/10 text-[#F59E0B]">
                      <RecoveryIcon />
                    </div>
                    <h2 className="text-xl font-medium tracking-[-0.035em] text-[#0F172A]">
                      Password updated
                    </h2>
                    <p className="mx-auto mt-2 max-w-sm text-[15px] font-normal leading-[21px] text-[#0F172A]/68">
                      Your password has been changed. You can now sign in with
                      the new password.
                    </p>
                    <Link
                      to="/login"
                      className="mt-5 inline-flex w-full items-center justify-center rounded-full bg-[#0F172A] px-5 py-3 text-sm font-medium text-white shadow-[0_18px_40px_rgba(15,23,42,0.16)] transition hover:-translate-y-0.5 hover:bg-[#1a2633]"
                    >
                      Return to login
                    </Link>
                  </div>
                ) : sent && !isResetMode ? (
                  <div className="py-6 text-center animate-in fade-in zoom-in">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#F59E0B]/10 text-[#F59E0B]">
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
                    <h2 className="text-xl font-medium tracking-[-0.035em] text-[#0F172A]">
                      Check your email
                    </h2>
                    <p className="mx-auto mt-2 max-w-sm text-[15px] font-normal leading-[21px] text-[#0F172A]/68">
                      If an Agently account exists for that email, a recovery
                      link is on the way.
                    </p>
                    {devResetUrl && (
                      <a
                        href={devResetUrl}
                        className="mt-5 block w-full rounded-full border border-[#0F172A]/12 px-4 py-3 text-sm font-medium text-[#0F172A]/72 transition hover:border-[#F59E0B]/40 hover:text-[#F59E0B]"
                      >
                        Open local reset link
                      </a>
                    )}
                    <button
                      onClick={() => setSent(false)}
                      className="mt-4 text-sm font-medium text-[#F59E0B] hover:underline"
                    >
                      Use a different email
                    </button>
                  </div>
                ) : isResetMode ? (
                  <form onSubmit={confirmReset} className="space-y-3">
                    <div>
                      <label className="mb-1 block text-[12px] font-medium text-[#0F172A]">
                        New password
                      </label>
                      <input
                        type="password"
                        required
                        minLength={8}
                        placeholder="At least 8 characters"
                        className="auth-input"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[12px] font-medium text-[#0F172A]">
                        Confirm password
                      </label>
                      <input
                        type="password"
                        required
                        minLength={8}
                        placeholder="Repeat password"
                        className="auth-input"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                      />
                    </div>
                    {error && (
                      <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                        {error}
                      </div>
                    )}
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex w-full items-center justify-center gap-2 rounded-full bg-[#0F172A] px-5 py-3 text-sm font-medium text-white shadow-[0_18px_40px_rgba(15,23,42,0.16)] transition hover:-translate-y-0.5 hover:bg-[#1a2633] disabled:translate-y-0 disabled:opacity-50"
                    >
                      {loading ? (
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      ) : (
                        "Update password"
                      )}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={requestReset} className="space-y-3">
                    <div>
                      <label className="mb-1 block text-[12px] font-medium text-[#0F172A]">
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
                    {error && (
                      <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                        {error}
                      </div>
                    )}
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex w-full items-center justify-center gap-2 rounded-full bg-[#0F172A] px-5 py-3 text-sm font-medium text-white shadow-[0_18px_40px_rgba(15,23,42,0.16)] transition hover:-translate-y-0.5 hover:bg-[#1a2633] disabled:translate-y-0 disabled:opacity-50"
                    >
                      {loading ? (
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      ) : (
                        "Send recovery link"
                      )}
                    </button>
                  </form>
                )}
              </div>

              <p className="mt-3 text-center text-[13px] font-normal text-[#0F172A]/60">
                Remember your password?{" "}
                <Link
                  to="/login"
                  className="font-medium text-[#F59E0B] hover:underline"
                >
                  Sign in
                </Link>
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
};

export default ForgotPassword;
