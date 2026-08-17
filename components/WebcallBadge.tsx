import React from "react";
import { createPortal } from "react-dom";
import { useWebcall } from "../contexts/WebcallContext";

const formatTime = (s: number) =>
  `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

/**
 * Persistent "a call is running somewhere" indicator. Renders globally
 * (mounted alongside WebcallProvider, above the router) whenever a call is
 * live and its modal has been minimized/navigated away from. Clicking it
 * reopens the same live modal — the call itself never stopped.
 */
const WebcallBadge: React.FC = () => {
  const { isCallLive, isModalOpen, duration, agentName, agentSpeaking, openModal } =
    useWebcall();

  if (!isCallLive || isModalOpen) return null;

  return createPortal(
    <button
      type="button"
      onClick={openModal}
      className="fixed bottom-5 right-5 z-[600] flex items-center gap-2.5 rounded-full bg-[#0F172A] pl-3 pr-4 py-2.5 text-white shadow-2xl shadow-slate-900/30 transition-transform hover:scale-105 active:scale-95"
      aria-label={`Live call with ${agentName} in progress — click to reopen`}
    >
      <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F59E0B]">
        <i
          className={`fa-solid ${agentSpeaking ? "fa-volume-high" : "fa-phone"} text-xs text-white`}
        />
        <span className="absolute inset-0 rounded-full border-2 border-amber-300 animate-ping opacity-40" />
      </span>
      <span className="flex flex-col items-start leading-tight">
        <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400">
          Live Call
        </span>
        <span className="text-xs font-bold tabular-nums">
          {formatTime(duration)}
        </span>
      </span>
    </button>,
    document.body,
  );
};

export default WebcallBadge;
