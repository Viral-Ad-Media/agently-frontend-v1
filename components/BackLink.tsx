import React from "react";
import { useNavigate } from "react-router-dom";

/**
 * Back control for a page reached from inside another page.
 *
 * Several nested screens — agent settings, the call campaign builder — had no
 * way back except the browser button or the sidebar, which is disorienting
 * when you arrived from a list and expect to return to it.
 *
 * `to` is required rather than relying on history alone: navigate(-1) sends
 * the user wherever they happened to come from, which after a save-and-redirect
 * or a deep link is often not the list they think they are returning to. The
 * explicit destination is predictable; history is only used when the user
 * genuinely arrived from within the app.
 */
const BackLink: React.FC<{
  to: string;
  label: string;
  className?: string;
}> = ({ to, label, className = "" }) => {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => {
        // Prefer real history when it exists, so the scroll position and any
        // filters on the list survive; otherwise go to the canonical parent.
        if (window.history.length > 1) navigate(-1);
        else navigate(to);
      }}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 -ml-2 text-[12px] font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-[#0F172A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F59E0B] ${className}`}
      aria-label={label}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M19 12H5" />
        <path d="m12 19-7-7 7-7" />
      </svg>
      {label}
    </button>
  );
};

export default BackLink;
