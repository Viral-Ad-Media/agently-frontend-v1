import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "../services/api";
import {
  AuthShell,
  BackButton,
  ErrorAlert,
  Field,
  MailIcon,
  PasswordRevealButton,
  PrimaryButton,
  SectionHeading,
  TextInput,
} from "../components/AuthShell";

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
  const navigate = useNavigate();
  const resetToken = useMemo(
    () => getResetTokenFromCurrentUrl(location.search),
    [location.search, location.key],
  );

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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
    <AuthShell>
      <BackButton onClick={() => navigate("/login")}>Back to sign in</BackButton>

      {completed ? (
        <div className="py-6 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
            <MailIcon />
          </div>
          <h2
            style={{ fontFamily: '"Archivo", sans-serif' }}
            className="text-xl font-semibold tracking-[-0.025em] text-[var(--text)]"
          >
            Password updated
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-[15px] leading-[21px] text-[var(--muted)]">
            Your password has been changed. You can now sign in with the new
            password.
          </p>
          <Link
            to="/login"
            className="mt-5 flex min-h-[42px] w-full items-center justify-center rounded-[12px] bg-[var(--accent)] px-4 text-[14px] font-semibold text-white shadow-[0_5px_14px_rgba(242,87,43,0.2)] transition hover:bg-[var(--accent-hover)]"
          >
            Return to sign in
          </Link>
        </div>
      ) : sent && !isResetMode ? (
        <div className="py-6 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
            <MailIcon />
          </div>
          <h2
            style={{ fontFamily: '"Archivo", sans-serif' }}
            className="text-xl font-semibold tracking-[-0.025em] text-[var(--text)]"
          >
            Check your email
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-[15px] leading-[21px] text-[var(--muted)]">
            If an Agently account exists for that email, a recovery link is on
            the way.
          </p>
          {devResetUrl && (
            <a
              href={devResetUrl}
              className="mt-5 block w-full rounded-[12px] border border-[var(--line)] px-4 py-3 text-sm font-medium text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              Open local reset link
            </a>
          )}
          <button
            type="button"
            onClick={() => setSent(false)}
            className="mt-4 cursor-pointer border-0 bg-transparent p-0 text-sm font-medium text-[var(--accent)] hover:underline hover:underline-offset-[3px]"
          >
            Use a different email
          </button>
        </div>
      ) : isResetMode ? (
        <div>
          <SectionHeading
            title="Choose a new password."
            sub="Use a password you haven't used for this account before."
          />
          <form onSubmit={confirmReset} className="grid gap-[18px]">
            <Field label="New password" htmlFor="fp-new-password">
              <div className="relative">
                <TextInput
                  id="fp-new-password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  className="pr-[46px]"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <PasswordRevealButton
                  visible={showPassword}
                  onToggle={() => setShowPassword((v) => !v)}
                  label="new password"
                />
              </div>
            </Field>
            <Field label="Confirm new password" htmlFor="fp-confirm-password">
              <div className="relative">
                <TextInput
                  id="fp-confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="Repeat your password"
                  className="pr-[46px]"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
                <PasswordRevealButton
                  visible={showConfirmPassword}
                  onToggle={() => setShowConfirmPassword((v) => !v)}
                  label="confirmation password"
                />
              </div>
            </Field>
            <ErrorAlert>{error}</ErrorAlert>
            <PrimaryButton type="submit" disabled={loading}>
              {loading ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                "Update password"
              )}
            </PrimaryButton>
          </form>
        </div>
      ) : (
        <div>
          <SectionHeading
            title="Reset your password."
            sub="Enter the email linked to your account. We'll send a recovery link if the address is registered."
          />
          <form onSubmit={requestReset} className="grid gap-[18px]">
            <Field label="Email address" htmlFor="fp-email">
              <TextInput
                id="fp-email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <ErrorAlert>{error}</ErrorAlert>
            <PrimaryButton type="submit" disabled={loading}>
              {loading ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                "Send recovery link"
              )}
            </PrimaryButton>
          </form>
          <p className="m-0 mt-[22px] text-center text-[14px] text-[var(--muted)]">
            Remember your password?{" "}
            <Link
              to="/login"
              className="font-medium text-[var(--accent)] no-underline hover:underline hover:underline-offset-[3px]"
            >
              Sign in
            </Link>
          </p>
        </div>
      )}
    </AuthShell>
  );
};

export default ForgotPassword;
