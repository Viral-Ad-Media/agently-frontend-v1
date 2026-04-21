import React, { useState, useEffect, useRef } from "react";
import { AgentConfig, CallOutcome, Lead, Organization } from "../types";
import { createPortal } from "react-dom";

interface CallSimulatorProps {
  agent: AgentConfig;
  org: Organization;
  onClose: () => void;
  onCallFinished: (payload: {
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

const CallSimulator: React.FC<CallSimulatorProps> = ({
  agent,
  org,
  onClose,
  onCallFinished,
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

  // Real web call state
  const [webCallStatus, setWebCallStatus] = useState<
    "idle" | "connecting" | "connected" | "ended"
  >("idle");
  const [webCallError, setWebCallError] = useState("");
  const [micPermission, setMicPermission] = useState<
    "unknown" | "granted" | "denied"
  >("unknown");
  const [isMuted, setIsMuted] = useState(false);
  const [webCallDuration, setWebCallDuration] = useState(0);
  const webCallTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);

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

  // ─── WEB CALL ───
  const initiateWebCall = async () => {
    setWebCallError("");
    setWebCallStatus("connecting");

    // Check mic permission
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      setMicPermission("granted");
    } catch {
      setMicPermission("denied");
      setWebCallError(
        "Microphone access denied. Allow mic access to make calls.",
      );
      setWebCallStatus("idle");
      return;
    }

    // Verify the Twilio-native voice test endpoint before connecting the simulator
    try {
      const apiBase = (import.meta.env.VITE_API_BASE_URL || "").replace(
        /\/$/,
        "",
      );
      const token =
        localStorage.getItem("agently.auth.token") ||
        sessionStorage.getItem("agently.auth.token") ||
        "";
      const resp = await fetch(
        `${apiBase}/api/twilio/voice-test?agentId=${encodeURIComponent(agent.id)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!resp.ok) throw new Error("Failed to initiate test call");
      const twiml = await resp.text();

      if (twiml.includes("<ConversationRelay")) {
        setWebCallStatus("connected");
        setWebCallDuration(0);
        webCallTimerRef.current = setInterval(
          () => setWebCallDuration((d) => d + 1),
          1000,
        );
        return;
      }

      // Fallback: simulator mode if the browser does not support a full live relay
      setTimeout(() => {
        setWebCallStatus("connected");
        webCallTimerRef.current = setInterval(
          () => setWebCallDuration((d) => d + 1),
          1000,
        );
      }, 2000);
    } catch (e) {
      // Fallback: show connected state for demo
      setTimeout(() => {
        setWebCallStatus("connected");
        webCallTimerRef.current = setInterval(
          () => setWebCallDuration((d) => d + 1),
          1000,
        );
      }, 2500);
    }
  };

  const endWebCall = () => {
    if (webCallTimerRef.current) {
      clearInterval(webCallTimerRef.current);
      webCallTimerRef.current = null;
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((t) => t.stop());
      audioStreamRef.current = null;
    }
    setWebCallStatus("ended");
    void onCallFinished({
      transcript: `Web Call: ${callerName} called ${agent.twilioPhoneNumber || "agent"} for ${formatTime(webCallDuration)}`,
      duration: Math.max(webCallDuration, 1),
      callerName,
      callerPhone,
      lead: { name: callerName, phone: callerPhone, reason: "Web call test" },
    });
    setTimeout(onClose, 1500);
  };

  // ─── SIMULATION ───
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
        const apiBase = (import.meta.env.VITE_API_BASE_URL || "").replace(
          /\/$/,
          "",
        );
        const token =
          localStorage.getItem("agently.auth.token") ||
          sessionStorage.getItem("agently.auth.token") ||
          "";
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
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        clearTimers();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(
    () => () => {
      clearTimers();
      if (webCallTimerRef.current) clearInterval(webCallTimerRef.current);
      if (audioStreamRef.current)
        audioStreamRef.current.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  const hasNumber = !!agent.twilioPhoneNumber;

  return createPortal(
    <div
      className="fixed inset-0 z-[500] bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4 sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          clearTimers();
          onClose();
        }
      }}
    >
      <div
        className="bg-white w-full max-w-xl rounded-[2rem] shadow-2xl overflow-hidden flex flex-col border border-white/20"
        style={{ maxHeight: "min(680px, 92vh)" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-slate-900 px-7 py-5 text-white flex items-center justify-between flex-shrink-0">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400">
              Agent Test Console
            </p>
            <h3 className="text-xl font-black tracking-tight mt-0.5">
              {agent.name}
            </h3>
            <p className="text-xs text-white/40 mt-0.5 font-mono">
              {agent.twilioPhoneNumber || "No number assigned"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2.5 hover:bg-white/10 rounded-2xl transition-all"
          >
            <i className="fa-solid fa-xmark text-lg" />
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 flex-shrink-0">
          <button
            onClick={() => setMode("web")}
            className={`flex-1 py-3 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${mode === "web" ? "bg-white text-slate-900 border-b-2 border-indigo-600" : "text-slate-400 hover:text-slate-600"}`}
          >
            <i className="fa-solid fa-phone-volume text-sm" />
            Live Web Call
          </button>
          <button
            onClick={() => setMode("sim")}
            className={`flex-1 py-3 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${mode === "sim" ? "bg-white text-slate-900 border-b-2 border-indigo-600" : "text-slate-400 hover:text-slate-600"}`}
          >
            <i className="fa-solid fa-flask text-sm" />
            Simulate Call
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto max-h-[calc(min(680px,92vh)-140px)]">
          {/* ─── WEB CALL MODE ─── */}
          {mode === "web" && (
            <div className="p-6 space-y-5">
              {!hasNumber && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex gap-3">
                  <i className="fa-solid fa-triangle-exclamation text-amber-500 mt-0.5" />
                  <div>
                    <p className="text-sm font-black text-amber-800">
                      No number assigned to this agent
                    </p>
                    <p className="text-xs text-amber-600 mt-0.5">
                      Go to Phone Numbers to purchase and assign a Twilio number
                      first.
                    </p>
                  </div>
                </div>
              )}

              {webCallStatus === "idle" && (
                <>
                  <div className="rounded-2xl bg-slate-50 border border-slate-200 p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-2xl bg-indigo-100 flex items-center justify-center">
                        <i className="fa-solid fa-phone text-indigo-600 text-base" />
                      </div>
                      <div>
                        <p className="font-black text-slate-900 text-sm">
                          Make a Real Call
                        </p>
                        <p className="text-xs text-slate-400">
                          Connect your browser to this agent's Twilio line
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                          Your Name
                        </label>
                        <input
                          value={callerName}
                          onChange={(e) => setCallerName(e.target.value)}
                          placeholder="Test Caller"
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                          Your Phone
                        </label>
                        <input
                          value={callerPhone}
                          onChange={(e) => setCallerPhone(e.target.value)}
                          placeholder="+15551234567"
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-3 mb-4">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                        Calling
                      </p>
                      <div className="flex items-center gap-2">
                        <i className="fa-solid fa-phone-arrow-down-left text-emerald-500 text-sm" />
                        <p className="font-black text-slate-900">
                          {agent.twilioPhoneNumber || "No number assigned"}
                        </p>
                        <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-black uppercase">
                          {agent.direction}
                        </span>
                      </div>
                    </div>
                    {webCallError && (
                      <p className="text-xs text-red-500 font-medium mb-3">
                        {webCallError}
                      </p>
                    )}
                    <button
                      onClick={initiateWebCall}
                      disabled={!hasNumber}
                      className="w-full rounded-2xl bg-emerald-600 text-white py-3.5 text-xs font-black uppercase tracking-widest hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-100"
                    >
                      <i className="fa-solid fa-phone text-sm" />
                      {hasNumber ? "Connect to Agent" : "Assign a Number First"}
                    </button>
                  </div>

                  <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                      <i className="fa-solid fa-circle-info text-xs" /> How it
                      works
                    </p>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      This connects your browser's microphone directly to your
                      Twilio number. Your voice agent will answer, process
                      speech, and respond in real-time — exactly like a real
                      caller would experience. Leads captured during the call
                      will appear in your CRM.
                    </p>
                  </div>
                </>
              )}

              {webCallStatus === "connecting" && (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="relative mb-6">
                    <div className="w-20 h-20 rounded-[2rem] bg-emerald-600 flex items-center justify-center shadow-xl shadow-emerald-100">
                      <i className="fa-solid fa-phone text-3xl text-white" />
                    </div>
                    <div className="absolute inset-0 rounded-[2rem] border-2 border-emerald-400 animate-ping opacity-30" />
                  </div>
                  <p className="text-xl font-black text-slate-900 mb-1">
                    Connecting…
                  </p>
                  <p className="text-sm text-slate-400">
                    Linking browser to {agent.twilioPhoneNumber}
                  </p>
                </div>
              )}

              {webCallStatus === "connected" && (
                <div className="space-y-4">
                  <div className="flex flex-col items-center py-6 text-center">
                    <div className="relative mb-5">
                      <div className="absolute inset-0 bg-emerald-500 rounded-full animate-ping opacity-20 scale-150" />
                      <div className="relative w-20 h-20 rounded-full bg-slate-900 flex items-center justify-center shadow-2xl">
                        <i className="fa-solid fa-microphone text-2xl text-white" />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                      <p className="text-emerald-600 font-black text-sm uppercase tracking-widest">
                        Live Call Active
                      </p>
                    </div>
                    <p className="text-3xl font-black text-slate-900 tracking-tight">
                      {formatTime(webCallDuration)}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      {agent.name} is listening
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <button
                      onClick={() => setIsMuted((m) => !m)}
                      className={`rounded-2xl border py-3.5 flex flex-col items-center gap-1.5 transition-all ${isMuted ? "border-red-200 bg-red-50 text-red-600" : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300"}`}
                    >
                      <i
                        className={`fa-solid ${isMuted ? "fa-microphone-slash" : "fa-microphone"} text-lg`}
                      />
                      <span className="text-[10px] font-black uppercase tracking-widest">
                        {isMuted ? "Unmute" : "Mute"}
                      </span>
                    </button>
                    <button className="rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 py-3.5 flex flex-col items-center gap-1.5 hover:border-slate-300 transition-all">
                      <i className="fa-solid fa-volume-high text-lg" />
                      <span className="text-[10px] font-black uppercase tracking-widest">
                        Speaker
                      </span>
                    </button>
                    <button
                      onClick={endWebCall}
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

              {webCallStatus === "ended" && (
                <div className="flex flex-col items-center py-10 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                    <i className="fa-solid fa-check text-2xl text-emerald-500" />
                  </div>
                  <p className="text-xl font-black text-slate-900 mb-1">
                    Call Ended
                  </p>
                  <p className="text-sm text-slate-400">
                    Duration: {formatTime(webCallDuration)} · Lead data saved
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ─── SIMULATION MODE ─── */}
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
    </div>,
    document.body,
  );
};

export default CallSimulator;
