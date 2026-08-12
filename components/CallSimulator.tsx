import React, { useState, useEffect, useRef } from "react";
import { AgentConfig, Organization } from "../types";
import { createPortal } from "react-dom";
import { resolveApiBaseUrl } from "../utils/runtimeUrls";
import { getSessionToken } from "../services/session";
import { WebcallClient, WebcallStatus } from "../lib/webcallClient";

interface CallSimulatorProps {
  agent: AgentConfig;
  org: Organization;
  onClose: () => void;
}

const CallSimulator: React.FC<CallSimulatorProps> = ({ agent, onClose }) => {
  const [webStatus, setWebStatus] = useState<WebcallStatus>("idle");
  const [webError, setWebError] = useState<{
    code: string;
    message: string;
  } | null>(null);
  const [webDuration, setWebDuration] = useState(0);
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [webMuted, setWebMuted] = useState(false);
  const [captions, setCaptions] = useState<
    { speaker: "You" | "Agent"; text: string; partial?: boolean }[]
  >([]);
  const [maxSessionSeconds, setMaxSessionSeconds] = useState(300);
  const clientRef = useRef<WebcallClient | null>(null);
  const webTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const captionsEndRef = useRef<HTMLDivElement | null>(null);

  const formatTime = (s: number) =>
    `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  const startWebcall = async () => {
    setWebError(null);
    setCaptions([]);
    setWebStatus("connecting");

    try {
      const apiBase = resolveApiBaseUrl();
      const token = getSessionToken() || "";
      const resp = await fetch(`${apiBase}/api/webcall/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ agentId: agent.id }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data?.wsUrl) {
        throw new Error(
          data?.error?.message || "Could not start the call right now.",
        );
      }
      setMaxSessionSeconds(Number(data.maxSessionSeconds || 300));

      const client = new WebcallClient(data.wsUrl, {
        onStatusChange: (s) => setWebStatus(s),
        onReady: () => {
          setWebDuration(0);
          webTimerRef.current = setInterval(
            () => setWebDuration((d) => d + 1),
            1000,
          );
        },
        onTranscriptUser: (text) =>
          setCaptions((prev) => [...prev, { speaker: "You", text }]),
        onTranscriptAgent: (text, partial) =>
          setCaptions((prev) => {
            if (
              partial &&
              prev.length &&
              prev[prev.length - 1].speaker === "Agent" &&
              prev[prev.length - 1].partial
            ) {
              const next = prev.slice(0, -1);
              next.push({ speaker: "Agent", text, partial });
              return next;
            }
            return [...prev, { speaker: "Agent", text, partial }];
          }),
        onAgentSpeakingChange: setAgentSpeaking,
        onUserSpeakingChange: setUserSpeaking,
        onError: (code, message) => {
          setWebError({ code, message });
          if (webTimerRef.current) {
            clearInterval(webTimerRef.current);
            webTimerRef.current = null;
          }
        },
        onEnded: () => {
          if (webTimerRef.current) {
            clearInterval(webTimerRef.current);
            webTimerRef.current = null;
          }
        },
      });
      clientRef.current = client;
      await client.start();
    } catch (e: any) {
      setWebStatus("error");
      setWebError({
        code: "START_FAILED",
        message:
          e?.message === "Permission denied" || e?.name === "NotAllowedError"
            ? "Microphone access was denied. Allow mic access in your browser to test the agent."
            : e?.message || "Could not start the call right now.",
      });
    }
  };

  const endWebcall = () => {
    clientRef.current?.hangup();
    clientRef.current = null;
    if (webTimerRef.current) {
      clearInterval(webTimerRef.current);
      webTimerRef.current = null;
    }
    setWebStatus("ended");
  };

  const toggleWebMute = () => {
    const next = !webMuted;
    setWebMuted(next);
    clientRef.current?.setMuted(next);
  };

  useEffect(() => {
    captionsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [captions]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(
    () => () => {
      if (webTimerRef.current) clearInterval(webTimerRef.current);
      clientRef.current?.stop();
      clientRef.current = null;
    },
    [],
  );

  const isWebActive = webStatus === "connecting" || webStatus === "ready";

  return createPortal(
    <div
      className="fixed inset-0 z-[500] bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !isWebActive) onClose();
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
              {agent.name}
            </h3>
            <p className="text-xs text-white/40 mt-0.5">
              Talk to the exact agent that answers your real calls
            </p>
          </div>
          <button
            onClick={() => {
              if (isWebActive) endWebcall();
              onClose();
            }}
            className="p-2.5 hover:bg-white/10 rounded-2xl transition-all flex-shrink-0"
            aria-label="Close"
          >
            <i className="fa-solid fa-xmark text-lg" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto max-h-[calc(min(700px,92vh)-90px)]">
          <div className="p-6 space-y-5">
            {webStatus === "idle" && (
              <>
                <div className="rounded-3xl bg-slate-50 border border-slate-200 p-5 shadow-card">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-2xl bg-amber-50 flex items-center justify-center">
                      <i className="fa-solid fa-phone text-[#F59E0B] text-base" />
                    </div>
                    <div>
                      <p className="font-black text-[#0F172A] text-sm">
                        Talk to it, right now
                      </p>
                      <p className="text-xs text-[#7a8493]">
                        Connects your microphone straight to this agent's live
                        persona and knowledge base
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={startWebcall}
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

                <div className="rounded-3xl bg-slate-50 border border-slate-100 p-4">
                  <p className="text-[10px] font-black text-[#7a8493] uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <i className="fa-solid fa-circle-info text-xs" /> How it
                    works
                  </p>
                  <p className="text-xs text-[#7a8493] leading-relaxed">
                    This is the exact same persona, voice, and knowledge base
                    your phone agent uses on real calls — it just runs through
                    your browser instead of a phone number. Nothing is saved to
                    your leads or call history.
                  </p>
                </div>
              </>
            )}

            {webStatus === "connecting" && (
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
                  Loading {agent.name}'s persona and knowledge base
                </p>
              </div>
            )}

            {webStatus === "ready" && (
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
                    {formatTime(webDuration)}
                  </p>
                  <p className="text-xs text-[#7a8493] mt-1">
                    {agentSpeaking
                      ? `${agent.name} is speaking…`
                      : userSpeaking
                        ? "Listening…"
                        : `${agent.name} is listening`}
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
                    onClick={toggleWebMute}
                    className={`rounded-2xl border py-3.5 flex flex-col items-center gap-1.5 transition-all ${webMuted ? "border-red-200 bg-red-50 text-red-600" : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300"}`}
                  >
                    <i
                      className={`fa-solid ${webMuted ? "fa-microphone-slash" : "fa-microphone"} text-lg`}
                    />
                    <span className="text-[10px] font-black uppercase tracking-widest">
                      {webMuted ? "Unmute" : "Mute"}
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
                    onClick={endWebcall}
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

            {webStatus === "ended" && (
              <div className="flex flex-col items-center py-10 text-center">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                  <i className="fa-solid fa-check text-2xl text-emerald-500" />
                </div>
                <p className="text-xl font-black text-[#0F172A] mb-1">
                  Call Ended
                </p>
                <p className="text-sm text-[#7a8493] mb-5">
                  Duration: {formatTime(webDuration)} · nothing was saved to
                  your leads or call history
                </p>
                <button
                  onClick={() => {
                    setWebStatus("idle");
                    setCaptions([]);
                  }}
                  className="rounded-xl border border-slate-200 px-5 py-2.5 text-[10px] font-black uppercase tracking-widest text-[#0F172A] hover:border-slate-300 transition-all"
                >
                  Call Again
                </button>
              </div>
            )}

            {webStatus === "error" && (
              <div className="flex flex-col items-center py-10 text-center">
                <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
                  <i className="fa-solid fa-triangle-exclamation text-2xl text-red-500" />
                </div>
                <p className="text-xl font-black text-[#0F172A] mb-1">
                  Couldn't Connect
                </p>
                <p className="text-sm text-[#7a8493] mb-5 max-w-sm">
                  {webError?.message ||
                    "Something went wrong starting the call."}
                </p>
                <button
                  onClick={() => {
                    setWebStatus("idle");
                    setWebError(null);
                  }}
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
