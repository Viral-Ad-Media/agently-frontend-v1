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
 * with mustSetPassword.
 */

interface AcceptInviteProps {
  onAccept: (token: string) => Promise<{ mustSetPassword?: boolean }>;
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

const AcceptInvite: React.FC<AcceptInviteProps> = ({ onAccept }) => {
  const location = useLocation();
  const [status, setStatus] = useState<
    "working" | "missing" | "error" | "done"
  >("working");
  const [message, setMessage] = useState("");
  const [mustSetPassword, setMustSetPassword] = useState(false);
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
              <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-[#0F172A]/15 border-t-[#F59E0B]" />
              <h1 className="text-[19px] font-medium tracking-[-0.035em] text-[#0F172A]">
                Accepting your invitation
              </h1>
              <p className="mt-1.5 text-[13px] font-normal leading-[18px] text-[#0F172A]/68">
                One moment while we add you to the workspace.
              </p>
            </>
          )}

          {status === "done" && (
            <>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <CheckIcon />
              </div>
              <h1 className="text-[19px] font-medium tracking-[-0.035em] text-[#0F172A]">
                You're in
              </h1>
              <p className="mt-1.5 text-[13px] font-normal leading-[18px] text-[#0F172A]/68">
                {mustSetPassword
                  ? "Set a password in Settings so you can sign in again later."
                  : "Your invitation has been accepted."}
              </p>
              <Link
                to={mustSetPassword ? "/settings" : "/dashboard"}
                className="mt-4 flex w-full items-center justify-center min-h-[44px] rounded-full bg-[#0F172A] px-5 py-3 text-[14px] font-medium text-white shadow-[0_18px_40px_rgba(15,23,42,0.16)] transition hover:-translate-y-0.5 hover:bg-[#1a2633]"
              >
                {mustSetPassword ? "Choose a password" : "Go to dashboard"}
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
                className="mt-4 flex w-full items-center justify-center min-h-[44px] rounded-full border border-[#0F172A]/12 px-5 py-3 text-[14px] font-medium text-[#0F172A]/72 transition hover:border-[#F59E0B]/40 hover:text-[#F59E0B]"
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
