import React, { useState, useEffect, useRef } from "react";
import { AgentConfig, CallOutcome, Lead, Organization } from "../types";
import { createPortal } from "react-dom";
import { resolveApiBaseUrl } from "../utils/runtimeUrls";
import { getSessionToken } from "../services/session";
import { WebcallClient, WebcallStatus } from "../lib/webcallClient";

interface CallSimulatorProps {
  agent: AgentConfig;
  org: Organization;
  onClose: () => void;
  onCallFinished?: (payload: {
    transcript: string;
    duration: number;
    outcome?: CallOutcome;
    callerName?: string;
    callerPhone?: string;
    lead?: Partial<Lead>;
  }) => Promise<void>;
}

type SimulatorMessage = { speaker: "Agent" | "You"; text: string };
type CallMode = "web" | "sim";

const noop = async () => {};

const CallSimulator: React.FC<CallSimulatorProps> = ({
  agent,
  org,
  onClose,
  onCallFinished = noop,
}) => {
  const [mode, setMode] = useState<CallMode>("web");
  const [status, setStatus] = useState<
    "idle" | "calling" | "active" | "transferring" | "summarizing"
  >("idle");
  const [messages, setMessages] = useState<SimulatorMessage[]>([]);
  const [duration, setDuration] = useState(0);
  const [intent, setIntent] = useState("Detecting...");
  const [callerName, setCallerName] = useState("Test User");
  const [callerPhone, setCallerPhone] = useState("+15551234567");
  const [scenario, setScenario] = useState(
    "I want to schedule an appointment and need a callback.",
  );
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transferTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Real live webcall state ──
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

  const clearTimers = () => {
    [timerRef, connectTimeoutRef, transferTimeoutRef, closeTimeoutRef].forEach(
      (ref) => {
        if (ref.current) {
          clearInterval(ref.current as any);
          clearTimeout(ref.current as any);
          ref.current = null;
        }
      },
    );
  };

  const formatTime = (s: number) =>
    `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  // ─── LIVE WEBCALL ───
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
          data?.error?.message || "Could not start a live test call right now.",
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
            : e?.message || "Could not start a live test call right now.",
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

  // ─── SIMULATION (unchanged) ───
  const startCall = () => {
    clearTimers();
    setStatus("calling");
    connectTimeoutRef.current = setTimeout(async () => {
      setStatus("active");
      setDuration(0);
      setIntent("Greeting");
      setMessages([{ speaker: "Agent", text: agent.greeting }]);
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);

      try {
        const apiBase = resolveApiBaseUrl();
        const token = getSessionToken() || "";
        const resp = await fetch(`${apiBase}/api/messenger/messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ message: scenario }),
        });
        if (resp.ok) {
          const data = await resp.json();
          const aiText =
            data.assistantMessage?.text || data.assistantMessage?.content || "";
          if (aiText) {
            setMessages([
              { speaker: "Agent", text: agent.greeting },
              { speaker: "You", text: scenario },
              { speaker: "Agent", text: aiText },
            ]);
            setIntent("Responding to inquiry");
          }
        }
      } catch {}
    }, 1500);
  };

  const handleTransfer = () => {
    setStatus("transferring");
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    transferTimeoutRef.current = setTimeout(() => {
      void endCall({ outcome: CallOutcome.ESCALATED });
    }, 3000);
  };

  const endCall = async (options?: { outcome?: CallOutcome }) => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setStatus("summarizing");
    const transcriptMessages =
      messages.length > 0
        ? messages
        : [
            { speaker: "Agent" as const, text: agent.greeting },
            { speaker: "You" as const, text: scenario },
          ];
    const transcriptString = transcriptMessages
      .map((m) => `${m.speaker}: ${m.text}`)
      .join("\n");
    await onCallFinished({
      transcript: transcriptString,
      duration: Math.max(duration, 60),
      outcome: options?.outcome,
      callerName,
      callerPhone,
      lead: { name: callerName, phone: callerPhone, reason: scenario },
    });
    closeTimeoutRef.current = setTimeout(() => onClose(), 1500);
  };

  useEffect(() => {
    if (status === "active" && duration > 5)
      setIntent("Inquiry about Services");
    if (duration > 15) setIntent("Lead Information");
  }, [duration, status]);

  useEffect(() => {
    captionsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [captions]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        clearTimers();
        clientRef.current?.stop();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(
    () => () => {
      clearTimers();
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
        if (e.target === e.currentTarget && !isWebActive) {
          clearTimers();
          onClose();
        }
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
              Agent Test Console
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
              clearTimers();
              onClose();
            }}
            className="p-2.5 hover:bg-white/10 rounded-2xl transition-all flex-shrink-0"
            aria-label="Close"
          >
            <i className="fa-solid fa-xmark text-lg" />
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 flex-shrink-0">
          <button
            onClick={() => !isWebActive && setMode("web")}
            className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${mode === "web" ? "bg-white text-[#0F172A] border-b-2 border-[#F59E0B]" : "text-[#7a8493] hover:text-slate-600"}`}
          >
            <i className="fa-solid fa-phone-volume text-sm" />
            Talk to Your Agent
          </button>
          <button
            onClick={() => !isWebActive && setMode("sim")}
            className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${mode === "sim" ? "bg-white text-[#0F172A] border-b-2 border-[#F59E0B]" : "text-[#7a8493] hover:text-slate-600"}`}
          >
            <i className="fa-solid fa-flask text-sm" />
            Simulate Call
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto max-h-[calc(min(700px,92vh)-140px)]">
          {/* ─── LIVE WEBCALL MODE ─── */}
          {mode === "web" && (
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
                      Start Test Call
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
                      your browser instead of a phone number. Nothing is saved
                      to your leads or call history.
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
                        Live Test Call Active
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
                    Test Call Ended
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
                      "Something went wrong starting the test call."}
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
          )}

          {/* ─── SIMULATION MODE (unchanged) ─── */}
          {mode === "sim" && (
            <div className="p-6">
              {status === "idle" && (
                <div className="space-y-4">
                  <div className="rounded-2xl bg-slate-50 border border-slate-200 p-5">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                      Simulate Caller Info
                    </p>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                          Caller Name
                        </label>
                        <input
                          value={callerName}
                          onChange={(e) => setCallerName(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                          Caller Phone
                        </label>
                        <input
                          value={callerPhone}
                          onChange={(e) => setCallerPhone(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                        Caller Request / Scenario
                      </label>
                      <textarea
                        value={scenario}
                        onChange={(e) => setScenario(e.target.value)}
                        rows={3}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium outline-none resize-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                  <button
                    onClick={startCall}
                    className="w-full rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white py-4 text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-100 flex items-center justify-center gap-2 transition-all"
                  >
                    <div className="w-2 h-2 bg-white rounded-full animate-ping" />
                    {agent.direction === "outbound"
                      ? "Launch Outbound Simulation"
                      : "Initiate Inbound Simulation"}
                  </button>
                </div>
              )}

              {status === "calling" && (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="w-16 h-16 bg-slate-900 text-white rounded-[1.5rem] flex items-center justify-center mb-5 shadow-xl animate-pulse">
                    <i className="fa-solid fa-phone-arrow-down-left text-2xl" />
                  </div>
                  <p className="text-xl font-black text-slate-900">
                    {agent.direction === "outbound" ? "Dialing…" : "Ringing…"}
                  </p>
                  <p className="text-xs text-slate-400 uppercase tracking-widest mt-1">
                    Connecting to {agent.direction} workflow
                  </p>
                </div>
              )}

              {status === "active" && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center bg-slate-50 border border-slate-200 rounded-2xl p-4">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">
                        Detected Intent
                      </p>
                      <p className="font-black text-indigo-600">{intent}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">
                        Duration
                      </p>
                      <p className="font-black text-slate-900 text-xl">
                        {formatTime(duration)}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-slate-800 p-4 space-y-2 max-h-48 overflow-y-auto">
                    {messages.map((msg, i) => (
                      <div
                        key={i}
                        className={`flex ${msg.speaker === "You" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[80%] px-3 py-2 rounded-xl text-sm font-medium ${msg.speaker === "You" ? "bg-indigo-600 text-white" : "bg-white/10 text-white/90"}`}
                        >
                          <p className="text-[10px] font-black uppercase tracking-widest mb-1 opacity-60">
                            {msg.speaker}
                          </p>
                          {msg.text}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={handleTransfer}
                      className="bg-white border-2 border-slate-100 text-slate-900 py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-sm hover:border-indigo-100 flex items-center justify-center gap-2 transition-all"
                    >
                      <i className="fa-solid fa-right-left text-sm" />
                      Transfer to Human
                    </button>
                    <button
                      onClick={() => void endCall()}
                      className="bg-red-500 hover:bg-red-600 text-white py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg flex items-center justify-center gap-2 transition-all"
                    >
                      <i className="fa-solid fa-phone-hangup text-sm" />
                      End Session
                    </button>
                  </div>
                </div>
              )}

              {status === "transferring" && (
                <div className="flex flex-col items-center py-10 text-center">
                  <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mb-5 border-2 border-amber-200 shadow-xl">
                    <i className="fa-solid fa-phone-arrow-up-right text-2xl" />
                  </div>
                  <p className="text-xl font-black text-slate-900">
                    Transferring to Human…
                  </p>
                  <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest">
                    Via {agent.escalationPhone}
                  </p>
                </div>
              )}

              {status === "summarizing" && (
                <div className="flex flex-col items-center py-10 text-center">
                  <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-5" />
                  <p className="text-xl font-black text-slate-900">
                    Processing Outcome…
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Extracting lead data and intent
                  </p>
                </div>
              )}
            </div>
          )}
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
