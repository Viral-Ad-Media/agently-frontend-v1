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
    voiceNotice,
    isModalOpen,
    isCallLive,
    endCall,
    toggleMute,
    closeModal,
    resetToIdle,
    restartCall,
  } = useWebcall();

  const transcriptRef = useRef<HTMLDivElement | null>(null);

  const formatTime = (s: number) =>
    `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  // Scroll the transcript pane itself rather than calling scrollIntoView on a
  // sentinel — the latter walks up to the nearest scrollable ancestor, which
  // used to drag the whole modal around now that the transcript owns its own
  // scroll region.
  useEffect(() => {
    const el = transcriptRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
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
        style={{
          maxHeight: "min(760px, 92vh)",
          // A live call claims the full allowance so the transcript gets a
          // stable, generous pane instead of collapsing to its content height.
          height: status === "ready" ? "min(760px, 92vh)" : undefined,
        }}
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

        {/* ── Live call ──────────────────────────────────────────────
            Dedicated full-height layout. Previously this shared the generic
            padded/scrollable body, which gave the status block ~200px and
            capped the transcript at max-h-44 (~176px) inside a nested scroll
            container — roughly a quarter of the modal. Now: a compact status
            strip, a transcript that takes every remaining pixel, and docked
            controls. Only the transcript scrolls. */}
        {status === "ready" && (
          <div className="flex-1 min-h-0 flex flex-col">
            {/* Status strip */}
            <div className="px-6 py-4 flex items-center gap-4 border-b border-slate-100 flex-shrink-0">
              <div className="relative flex items-center justify-center w-14 h-14 flex-shrink-0">
                {(agentSpeaking || userSpeaking) && (
                  <>
                    <span
                      className={`absolute inset-0 rounded-full ${agentSpeaking ? "bg-[#F59E0B]" : "bg-emerald-500"}`}
                      style={{ animation: "webcall-ring 1.6s ease-out infinite" }}
                    />
                    <span
                      className={`absolute inset-0 rounded-full ${agentSpeaking ? "bg-[#F59E0B]" : "bg-emerald-500"}`}
                      style={{ animation: "webcall-ring 1.6s ease-out 0.55s infinite" }}
                    />
                  </>
                )}
                <div
                  className={`relative w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-colors duration-300 ${agentSpeaking ? "bg-[#F59E0B]" : userSpeaking ? "bg-emerald-500" : "bg-[#0F172A]"}`}
                  style={{
                    animation:
                      !agentSpeaking && !userSpeaking
                        ? "webcall-breathe 3.2s ease-in-out infinite"
                        : undefined,
                  }}
                >
                  <div className="flex items-end gap-[3px] h-5">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <span
                        key={i}
                        className="w-[3px] rounded-full bg-white"
                        style={{
                          height:
                            agentSpeaking || userSpeaking ? undefined : 5,
                          animation:
                            agentSpeaking || userSpeaking
                              ? `webcall-eq 0.85s ease-in-out ${i * 0.12}s infinite`
                              : "none",
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">
                    Live · Connected
                  </p>
                </div>
                <p className="text-sm font-bold text-[#0F172A] mt-0.5 truncate">
                  {agentSpeaking
                    ? `${agentName} is speaking…`
                    : userSpeaking
                      ? "Listening to you…"
                      : `${agentName} is listening`}
                </p>
                <p className="text-[11px] text-[#7a8493] truncate">
                  Interrupt any time — just start talking
                </p>
              </div>

              <p className="text-2xl font-black text-[#0F172A] tabular-nums flex-shrink-0">
                {formatTime(duration)}
              </p>
            </div>

            {/* The configured voice could not be used — say so rather than
                letting it sound subtly wrong for no visible reason. */}
            {voiceNotice && (
              <div className="px-6 py-2.5 bg-amber-50 border-b border-amber-100 flex items-start gap-2 flex-shrink-0">
                <i className="fa-solid fa-triangle-exclamation text-[#F59E0B] text-xs mt-0.5 flex-shrink-0" />
                <p className="text-[11px] text-[#92400e] leading-snug">
                  Voice <strong>{voiceNotice.configured}</strong> isn't
                  available for this agent's provider — speaking as{" "}
                  <strong>{voiceNotice.used}</strong>. Update the agent's voice
                  to fix this.
                </p>
              </div>
            )}

            {/* Transcript — the dominant region */}
            <div
              ref={transcriptRef}
              className="flex-1 min-h-0 overflow-y-auto bg-[#0F172A] px-5 py-4 space-y-3"
            >
              {captions.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-6">
                  <div className="flex items-end gap-1 h-6 mb-4 opacity-40">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <span
                        key={i}
                        className="w-1 rounded-full bg-white/50"
                        style={{
                          animation: `webcall-eq 1.4s ease-in-out ${i * 0.18}s infinite`,
                        }}
                      />
                    ))}
                  </div>
                  <p className="text-white/40 text-sm">
                    Say hello — the live transcript appears here
                  </p>
                </div>
              ) : (
                captions.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.speaker === "You" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-[15px] leading-relaxed ${msg.speaker === "You" ? "bg-[#F59E0B] text-white" : "bg-white/10 text-white/90"} ${msg.partial ? "opacity-60" : ""}`}
                    >
                      <p className="text-[9px] font-black uppercase tracking-widest mb-1 opacity-60">
                        {msg.speaker}
                      </p>
                      {msg.text}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Docked controls */}
            <div className="p-4 border-t border-slate-100 grid grid-cols-2 gap-3 flex-shrink-0 bg-white">
              <button
                onClick={toggleMute}
                className={`rounded-2xl border py-3.5 flex items-center justify-center gap-2 transition-all ${muted ? "border-red-200 bg-red-50 text-red-600" : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300"}`}
              >
                <i
                  className={`fa-solid ${muted ? "fa-microphone-slash" : "fa-microphone"} text-lg`}
                />
                <span className="text-[10px] font-black uppercase tracking-widest">
                  {muted ? "Unmute" : "Mute"}
                </span>
              </button>
              <button
                onClick={endCall}
                className="rounded-2xl bg-red-500 hover:bg-red-600 text-white py-3.5 flex items-center justify-center gap-2 transition-all shadow-lg shadow-red-100"
              >
                <i className="fa-solid fa-phone-hangup text-lg" />
                <span className="text-[10px] font-black uppercase tracking-widest">
                  End Call
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Every other state keeps the simple padded, scrollable card. */}
        {status !== "ready" && (
        <div className="flex-1 overflow-y-auto">
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
        )}
      </div>
      <style>{`
        @keyframes webcall-eq {
          0%, 100% { height: 5px; }
          50% { height: 20px; }
        }
        /* Outward "humming" ring pulse behind the voice orb. */
        @keyframes webcall-ring {
          0%   { transform: scale(1);   opacity: 0.35; }
          100% { transform: scale(1.9); opacity: 0; }
        }
        /* Idle breathing so the orb never looks frozen while listening. */
        @keyframes webcall-breathe {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.06); }
        }
      `}</style>
    </div>,
    document.body,
  );
};

export default CallSimulator;
