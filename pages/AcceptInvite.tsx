import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ApiError, NETWORK_OFFLINE_MESSAGE } from "../services/api";

/**
 * Accepting a team invitation.
 *
 * This route exists because the general magic-link verifier it replaces was an
 * authentication bypass: it accepted any token, and created an organization for
 * any address it did not already know. Invitations never needed any of that —
 * an invited person always corresponds to a user row an admin already created —
 * so the replacement endpoint (POST /api/auth/accept-invitation) can only ever
 * resolve an existing user, and this page is its only caller.
 *
 * The invitation link proves mailbox control on its own, so there is no second
 * code to enter here. Invited members are created without a password, so the
 * common outcome is "signed in, now choose a password", which the API flags
 * with mustSetPassword. The password is chosen right here: sending the member
 * to Settings did not work, because Settings is owner-only for a Viewer and
 * its password form demanded a current password the member never had.
 */

interface AcceptInviteProps {
  onAccept: (token: string) => Promise<{ mustSetPassword?: boolean }>;
  /** Sets the first password for an invited member (no current password). */
  onSetPassword: (newPassword: string) => Promise<unknown>;
}

const CheckIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="26"
    height="26"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const AcceptInvite: React.FC<AcceptInviteProps> = ({
  onAccept,
  onSetPassword,
}) => {
  const location = useLocation();
  const [status, setStatus] = useState<
    "working" | "missing" | "error" | "done"
  >("working");
  const [message, setMessage] = useState("");
  const [mustSetPassword, setMustSetPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  const submitPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 8) {
      setPasswordError("Use at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setPasswordError("The two passwords don't match.");
      return;
    }
    setPasswordSaving(true);
    setPasswordError("");
    try {
      await onSetPassword(password);
      setMustSetPassword(false);
      setPassword("");
      setConfirmPassword("");
    } catch (error) {
      setPasswordError(
        error instanceof Error
          ? error.message
          : "We couldn't save that password. Please try again.",
      );
    } finally {
      setPasswordSaving(false);
    }
  };
  // An invitation is single-use and the effect can run twice in StrictMode.
  // Without this guard the second run consumes nothing and reports the
  // invitation as already used, on a perfectly good link.
  const attemptedRef = useRef<string | null>(null);

  useEffect(() => {
    const token = new URLSearchParams(location.search).get("token");
    if (!token) {
      setStatus("missing");
      return;
    }
    if (attemptedRef.current === token) return;
    attemptedRef.current = token;

    void (async () => {
      try {
        const result = await onAccept(token);
        setMustSetPassword(Boolean(result?.mustSetPassword));
        setStatus("done");
      } catch (error) {
        if (error instanceof ApiError && error.status === 0) {
          setMessage(NETWORK_OFFLINE_MESSAGE);
        } else {
          setMessage(
            error instanceof Error
              ? error.message
              : "We could not accept this invitation.",
          );
        }
        setStatus("error");
      }
    })();
  }, [location.search, onAccept]);

  return (
    <main className="auth-page flex min-h-svh items-center justify-center px-4 py-10">
      <div className="w-full max-w-[430px]">
        <div className="mb-4 flex items-center justify-center gap-1.5">
          <img
            src="/agently-mark.png"
            alt=""
            className="h-7 w-auto object-contain"
          />
          <span className="text-xl font-bold text-[#0F172A]">Agently</span>
        </div>

        <div className="rounded-[1.45rem] border border-[#0F172A]/10 bg-[#F8FAFC]/94 p-5 text-center shadow-[0_14px_42px_rgba(15,23,42,0.09)] backdrop-blur-xl">
          {status === "working" && (
            <>
              <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-[#0F172A]/15 border-t-[#f15a24]" />
              <h1 className="text-[19px] font-medium tracking-[-0.035em] text-[#0F172A]">
                Accepting your invitation
              </h1>
              <p className="mt-1.5 text-[13px] font-normal leading-[18px] text-[#0F172A]/68">
                One moment while we add you to the workspace.
              </p>
            </>
          )}

          {status === "done" && mustSetPassword && (
            <form onSubmit={submitPassword} className="text-left">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <CheckIcon />
              </div>
              <h1 className="text-center text-[19px] font-medium tracking-[-0.035em] text-[#0F172A]">
                Invitation accepted — choose your password
              </h1>
              <p className="mt-1.5 text-center text-[13px] font-normal leading-[18px] text-[#0F172A]/68">
                You'll use your email and this password to sign in next time.
              </p>
              <label className="mt-4 block text-[12px] font-medium text-[#0F172A]/72">
                New password
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-1.5 h-11 w-full rounded-xl border border-[#0F172A]/12 bg-white px-3.5 text-[14px] text-[#0F172A] outline-none focus:border-[#f15a24]/60"
                />
              </label>
              <label className="mt-3 block text-[12px] font-medium text-[#0F172A]/72">
                Confirm password
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="mt-1.5 h-11 w-full rounded-xl border border-[#0F172A]/12 bg-white px-3.5 text-[14px] text-[#0F172A] outline-none focus:border-[#f15a24]/60"
                />
              </label>
              <p className="mt-2 text-[12px] text-[#0F172A]/52">
                At least 8 characters. Avoid common passwords.
              </p>
              {passwordError && (
                <p role="alert" className="mt-2 text-[13px] text-red-700">
                  {passwordError}
                </p>
              )}
              <button
                type="submit"
                disabled={passwordSaving}
                className="mt-4 flex w-full items-center justify-center min-h-[44px] rounded-full bg-[#0F172A] px-5 py-3 text-[14px] font-medium text-white shadow-[0_18px_40px_rgba(15,23,42,0.16)] transition hover:-translate-y-0.5 hover:bg-[#1a2633] disabled:opacity-50"
              >
                {passwordSaving ? "Saving…" : "Save password and continue"}
              </button>
            </form>
          )}

          {status === "done" && !mustSetPassword && (
            <>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <CheckIcon />
              </div>
              <h1 className="text-[19px] font-medium tracking-[-0.035em] text-[#0F172A]">
                You're in
              </h1>
              <p className="mt-1.5 text-[13px] font-normal leading-[18px] text-[#0F172A]/68">
                You now have access to this workspace. Account settings, billing
                and team management stay with the account owner.
              </p>
              <Link
                to="/dashboard"
                className="mt-4 flex w-full items-center justify-center min-h-[44px] rounded-full bg-[#0F172A] px-5 py-3 text-[14px] font-medium text-white shadow-[0_18px_40px_rgba(15,23,42,0.16)] transition hover:-translate-y-0.5 hover:bg-[#1a2633]"
              >
                Go to dashboard
              </Link>
            </>
          )}

          {(status === "error" || status === "missing") && (
            <>
              <h1 className="text-[19px] font-medium tracking-[-0.035em] text-[#0F172A]">
                This invitation can't be used
              </h1>
              <p className="mt-1.5 text-[13px] font-normal leading-[18px] text-[#0F172A]/68">
                {status === "missing"
                  ? "This link is missing its invitation token. Open the link from your email exactly as it was sent."
                  : message}
              </p>
              <p className="mt-2 text-[12px] font-normal text-[#0F172A]/52">
                Ask whoever invited you to send a new invitation.
              </p>
              <Link
                to="/login"
                className="mt-4 flex w-full items-center justify-center min-h-[44px] rounded-full border border-[#0F172A]/12 px-5 py-3 text-[14px] font-medium text-[#0F172A]/72 transition hover:border-[#f15a24]/40 hover:text-[#f15a24]"
              >
                Back to sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </main>
  );
};

export default AcceptInvite;
