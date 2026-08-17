import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useWebcall } from "../contexts/WebcallContext";

/**
 * Presentation layer only. All call state lives in WebcallContext, mounted
 * above the router, so the call survives navigation — this modal is just a
 * view onto it. Closing this modal (X, or navigating away) never hangs up;
 * only the explicit "End Call" button does. See WebcallBadge for the
 * floating indicator that reopens this same live state.
 */
const CallSimulator: React.FC = () => {
  const {
    status,
    error,
    duration,
    captions,
    agentSpeaking,
    userSpeaking,
    muted,
    maxSessionSeconds,
    agentName,
    isModalOpen,
    isCallLive,
    endCall,
    toggleMute,
    closeModal,
    resetToIdle,
    restartCall,
  } = useWebcall();

  const captionsEndRef = useRef<HTMLDivElement | null>(null);

  const formatTime = (s: number) =>
    `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  useEffect(() => {
    captionsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [captions]);

  useEffect(() => {
    if (!isModalOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isModalOpen, closeModal]);

  if (!isModalOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[500] bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 sm:p-6"
      onMouseDown={(e) => {
        // A live call minimizes on backdrop click, same as the X button —
        // it never hangs up implicitly.
        if (e.target === e.currentTarget) closeModal();
      }}
    >
      <div
        className="bg-white w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-slate-200"
        style={{ maxHeight: "min(700px, 92vh)" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#0F172A] px-7 py-5 text-white flex items-center justify-between flex-shrink-0">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-[#F59E0B]">
              Live Call
            </p>
            <h3 className="text-xl font-black tracking-tight mt-0.5 truncate">
              {agentName}
            </h3>
            <p className="text-xs text-white/40 mt-0.5">
              Talk to the exact agent that answers your real calls
            </p>
          </div>
          <button
            onClick={closeModal}
            className="p-2.5 hover:bg-white/10 rounded-2xl transition-all flex-shrink-0"
            aria-label={isCallLive ? "Minimize (call keeps running)" : "Close"}
            title={isCallLive ? "Minimize — the call keeps running" : "Close"}
          >
            <i
              className={`fa-solid ${isCallLive ? "fa-minus" : "fa-xmark"} text-lg`}
            />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto max-h-[calc(min(700px,92vh)-90px)]">
          <div className="p-6 space-y-5">
            {status === "idle" && (
              <>
                <div className="rounded-3xl bg-slate-50 border border-slate-200 p-5 shadow-card">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-2xl bg-amber-50 flex items-center justify-center">
                      <i className="fa-solid fa-phone text-[#F59E0B] text-base" />
                    </div>
                    <div>
                      <p className="font-black text-[#0F172A] text-sm">
                        Call your AI workforce now
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => void restartCall()}
                    className="w-full rounded-xl bg-[#F59E0B] hover:bg-[#d97706] text-white py-3.5 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-lg shadow-amber-100"
                  >
                    <i className="fa-solid fa-phone text-sm" />
                    Start Live Call
                  </button>
                  <p className="text-[11px] text-[#7a8493] text-center mt-3">
                    Up to {Math.round(maxSessionSeconds / 60)} minutes · uses
                    your account's usage credit, same as a real call
                  </p>
                </div>

                <p className="text-[11px] text-[#7a8493] text-center px-2">
                  Same voice and knowledge base as your real calls — nothing
                  here is saved to leads or call history.
                </p>
              </>
            )}

            {status === "connecting" && (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="relative mb-6">
                  <div className="w-20 h-20 rounded-3xl bg-[#F59E0B] flex items-center justify-center shadow-xl shadow-amber-100">
                    <i className="fa-solid fa-phone text-3xl text-white" />
                  </div>
                  <div className="absolute inset-0 rounded-3xl border-2 border-amber-300 animate-ping opacity-40" />
                </div>
                <p className="text-xl font-black text-[#0F172A] mb-1">
                  Connecting…
                </p>
                <p className="text-sm text-[#7a8493]">
                  Loading {agentName}'s persona and knowledge base
                </p>
              </div>
            )}

            {status === "ready" && (
              <div className="space-y-4">
                <div className="flex flex-col items-center py-4 text-center">
                  <div className="relative mb-4 flex items-center justify-center h-20">
                    <div
                      className={`absolute inset-0 rounded-full bg-[#F59E0B] transition-opacity duration-200 ${agentSpeaking ? "opacity-20 animate-ping" : "opacity-0"}`}
                      style={{ margin: "auto", width: 80, height: 80 }}
                    />
                    <div className="relative w-20 h-20 rounded-full bg-[#0F172A] flex items-center justify-center shadow-2xl">
                      <i
                        className={`fa-solid ${agentSpeaking ? "fa-volume-high" : "fa-microphone"} text-2xl text-white`}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                    <p className="text-emerald-600 font-black text-[10px] uppercase tracking-widest">
                      Live Call · Connected
                    </p>
                  </div>
                  <p className="text-3xl font-black text-[#0F172A] tracking-tight">
                    {formatTime(duration)}
                  </p>
                  <p className="text-xs text-[#7a8493] mt-1">
                    {agentSpeaking
                      ? `${agentName} is speaking…`
                      : userSpeaking
                        ? "Listening…"
                        : `${agentName} is listening`}
                  </p>
                </div>

                {/* Live captions */}
                <div className="rounded-2xl bg-[#0F172A] p-4 space-y-2 max-h-44 overflow-y-auto">
                  {captions.length === 0 && (
                    <p className="text-white/30 text-xs text-center py-4">
                      Live captions will appear here as you talk
                    </p>
                  )}
                  {captions.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex ${msg.speaker === "You" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[80%] px-3 py-2 rounded-xl text-sm font-medium ${msg.speaker === "You" ? "bg-[#F59E0B] text-white" : "bg-white/10 text-white/90"} ${msg.partial ? "opacity-60" : ""}`}
                      >
                        <p className="text-[9px] font-black uppercase tracking-widest mb-1 opacity-60">
                          {msg.speaker}
                        </p>
                        {msg.text}
                      </div>
                    </div>
                  ))}
                  <div ref={captionsEndRef} />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <button
                    onClick={toggleMute}
                    className={`rounded-2xl border py-3.5 flex flex-col items-center gap-1.5 transition-all ${muted ? "border-red-200 bg-red-50 text-red-600" : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300"}`}
                  >
                    <i
                      className={`fa-solid ${muted ? "fa-microphone-slash" : "fa-microphone"} text-lg`}
                    />
                    <span className="text-[10px] font-black uppercase tracking-widest">
                      {muted ? "Unmute" : "Mute"}
                    </span>
                  </button>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 text-slate-400 py-3.5 flex flex-col items-center justify-center gap-1.5">
                    <div className="flex items-end gap-0.5 h-4">
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className="w-1 bg-[#F59E0B] rounded-full"
                          style={{
                            height:
                              agentSpeaking || userSpeaking ? undefined : 4,
                            animation:
                              agentSpeaking || userSpeaking
                                ? `webcall-eq 0.9s ease-in-out ${i * 0.15}s infinite`
                                : "none",
                          }}
                        />
                      ))}
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest">
                      Live
                    </span>
                  </div>
                  <button
                    onClick={endCall}
                    className="rounded-2xl bg-red-500 hover:bg-red-600 text-white py-3.5 flex flex-col items-center gap-1.5 transition-all shadow-lg shadow-red-100"
                  >
                    <i className="fa-solid fa-phone-hangup text-lg" />
                    <span className="text-[10px] font-black uppercase tracking-widest">
                      End Call
                    </span>
                  </button>
                </div>
              </div>
            )}

            {status === "ended" && (
              <div className="flex flex-col items-center py-10 text-center">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                  <i className="fa-solid fa-check text-2xl text-emerald-500" />
                </div>
                <p className="text-xl font-black text-[#0F172A] mb-1">
                  Call Ended
                </p>
                <p className="text-sm text-[#7a8493] mb-5">
                  Duration: {formatTime(duration)} · nothing was saved to
                  your leads or call history
                </p>
                <button
                  onClick={resetToIdle}
                  className="rounded-xl border border-slate-200 px-5 py-2.5 text-[10px] font-black uppercase tracking-widest text-[#0F172A] hover:border-slate-300 transition-all"
                >
                  Call Again
                </button>
              </div>
            )}

            {status === "error" && (
              <div className="flex flex-col items-center py-10 text-center">
                <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
                  <i className="fa-solid fa-triangle-exclamation text-2xl text-red-500" />
                </div>
                <p className="text-xl font-black text-[#0F172A] mb-1">
                  Couldn't Connect
                </p>
                <p className="text-sm text-[#7a8493] mb-5 max-w-sm">
                  {error?.message || "Something went wrong starting the call."}
                </p>
                <button
                  onClick={resetToIdle}
                  className="rounded-xl bg-[#F59E0B] hover:bg-[#d97706] text-white px-5 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all"
                >
                  Try Again
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <style>{`
        @keyframes webcall-eq {
          0%, 100% { height: 4px; }
          50% { height: 16px; }
        }
      `}</style>
    </div>,
    document.body,
  );
};

export default CallSimulator;
