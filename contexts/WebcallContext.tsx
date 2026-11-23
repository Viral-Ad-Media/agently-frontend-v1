import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AgentConfig, Organization } from "../types";
import { resolveApiBaseUrl } from "../utils/runtimeUrls";
import { getSessionToken } from "../services/session";
import { WebcallClient, WebcallStatus, VoiceAction, VoiceDiagnostics } from "../lib/webcallClient";

/**
 * Owns the "Talk to Your Agent" webcall's entire lifecycle above the router.
 *
 * Every route in App.tsx independently wraps its page in
 * <ProtectedRoute><MainLayout>, rather than sharing one layout route via
 * <Outlet/> — so MainLayout (and anything mounted inside it) fully unmounts
 * and remounts on every navigation. A WebcallClient owned there would die
 * the moment the tenant switched pages, same as it does today. This context
 * is mounted in App.tsx, above <StableRouter>, specifically so the call
 * survives navigation. The modal is a VIEW of this state, not its owner —
 * closing the modal only hides it; only endCall() actually hangs up.
 */

export type CaptionEntry = {
  speaker: "You" | "Agent";
  text: string;
  partial?: boolean;
};

export type WebcallMode = "caller" | "owner";

interface WebcallState {
  status: WebcallStatus | "idle";
  error: { code: string; message: string } | null;
  duration: number;
  captions: CaptionEntry[];
  agentSpeaking: boolean;
  userSpeaking: boolean;
  muted: boolean;
  maxSessionSeconds: number;
  agentName: string;
  isModalOpen: boolean;
  /** Set when the agent's configured voice could not be used, so the modal can
   * say so instead of the operator wondering why it sounds wrong. */
  voiceNotice: { configured: string; used: string } | null;
  mode: WebcallMode;
  actions: VoiceAction[];
  diagnostics: VoiceDiagnostics;
  agentId: string;
}

interface WebcallContextValue extends WebcallState {
  isCallLive: boolean;
  voiceSettings: {deviceId:string};
  setVoiceSettings: (settings:{deviceId:string})=>void;
  decideAction: (id:string,decision:"approve"|"cancel")=>void;
  startCall: (agent: AgentConfig, org: Organization, mode?: WebcallMode) => Promise<void>;
  /** Re-runs startCall against whichever agent/org was last used — powers
   * "Call Again" in the modal, which only knows the call state, not the
   * agent, since it's now a global singleton rather than page-scoped. */
  restartCall: () => Promise<void>;
  endCall: () => void;
  toggleMute: () => void;
  openModal: () => void;
  closeModal: () => void;
  resetToIdle: () => void;
}

const initialState: WebcallState = {
  status: "idle",
  error: null,
  duration: 0,
  captions: [],
  agentSpeaking: false,
  userSpeaking: false,
  muted: false,
  maxSessionSeconds: 300,
  agentName: "Your Agent",
  isModalOpen: false,
  voiceNotice: null,
  mode: "caller",
  agentId:"",
  actions:[],
  diagnostics:{inputLevel:0,latencyMs:null,interruptions:0,droppedFrames:0,playbackGaps:0},
};

const WebcallContext = createContext<WebcallContextValue | null>(null);

export const WebcallProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [state, setState] = useState<WebcallState>(initialState);
  const [voiceSettings,setVoiceSettings] = useState({deviceId:""});
  const settingsRef = useRef(voiceSettings);
  settingsRef.current=voiceSettings;
  const clientRef = useRef<WebcallClient | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastAgentRef = useRef<AgentConfig | null>(null);
  const lastOrgRef = useRef<Organization | null>(null);
  const lastModeRef = useRef<WebcallMode>("caller");

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const openModal = useCallback(() => {
    setState((s) => ({ ...s, isModalOpen: true }));
  }, []);

  const closeModal = useCallback(() => {
    // Hides the modal only. The call (if any) keeps running — that's the
    // entire point of the floating indicator below.
    setState((s) => ({ ...s, isModalOpen: false }));
  }, []);

  const resetToIdle = useCallback(() => {
    setState((s) => ({ ...s, status: "idle", error: null, captions: [] }));
  }, []);

  const startCall = useCallback(
    async (agent: AgentConfig, org: Organization, mode: WebcallMode = "caller") => {
      lastAgentRef.current = agent;
      lastOrgRef.current = org;
      lastModeRef.current = mode;
      setState({
        ...initialState,
        status: "connecting",
        agentName: agent.name || "Your Agent",
        mode,
        agentId:agent.id,
        muted:false,
        isModalOpen: true,
      });

      try {
        const apiBase = resolveApiBaseUrl();
        const token = getSessionToken() || "";
        const resp = await fetch(`${apiBase}/api/webcall/token`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ agentId: agent.id, mode }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !data?.wsUrl) {
          throw new Error(
            data?.error?.message || "Could not start the call right now.",
          );
        }
        setState((s) => ({
          ...s,
          maxSessionSeconds: Number(data.maxSessionSeconds || 300),
        }));

        const client = new WebcallClient(data.wsUrl, {
          onAction: action=>setState(s=>({...s,actions:[...s.actions.filter(a=>a.id!==action.id),action]})),
          onDiagnostics: diagnostics=>setState(s=>({...s,diagnostics})),
          onStatusChange: (status) => setState((s) => ({ ...s, status })),
          onReady: (info) => {
            setState((s) => ({
              ...s,
              duration: 0,
              voiceNotice:
                info.voiceHonoured || !info.voiceConfigured
                  ? null
                  : {
                      configured: info.voiceConfigured,
                      used: info.voiceUsed || "the default voice",
                    },
            }));
            clearTimer();
            timerRef.current = setInterval(
              () => setState((s) => ({ ...s, duration: s.duration + 1 })),
              1000,
            );
          },
          onTranscriptUser: (text) =>
            setState((s) => ({
              ...s,
              captions: [...s.captions, { speaker: "You", text }],
            })),
          onTranscriptAgent: (text, partial) =>
            setState((s) => {
              const prev = s.captions;
              if (
                prev.length &&
                prev[prev.length - 1].speaker === "Agent" &&
                prev[prev.length - 1].partial
              ) {
                const next = prev.slice(0, -1);
                next.push({ speaker: "Agent", text, partial });
                return { ...s, captions: next };
              }
              return {
                ...s,
                captions: [...prev, { speaker: "Agent", text, partial }],
              };
            }),
          onAgentSpeakingChange: (speaking) =>
            setState((s) => ({ ...s, agentSpeaking: speaking })),
          onUserSpeakingChange: (speaking) =>
            setState((s) => ({ ...s, userSpeaking: speaking })),
          // Release the microphone on EVERY terminal outcome, not just when
          // the user presses End Call. These fire when the server ends or
          // rejects the session, and previously only cleared the timer — the
          // MediaStream tracks stayed open, so the browser kept showing the
          // recording indicator in the tab long after the call was over.
          onError: (code, message) => {
            clearTimer();
            clientRef.current?.stop();
            clientRef.current = null;
            setState((s) => ({ ...s, error: { code, message } }));
          },
          onEnded: () => {
            clearTimer();
            clientRef.current?.stop();
            clientRef.current = null;
          },
        },settingsRef.current);
        clientRef.current = client;
        await client.start();
      } catch (e: any) {
        clearTimer();
        setState((s) => ({
          ...s,
          status: "error",
          error: {
            code: "START_FAILED",
            message:
              e?.message === "Permission denied" ||
              e?.name === "NotAllowedError"
                ? "Microphone access was denied. Allow mic access in your browser to test the agent."
                : e?.message || "Could not start the call right now.",
          },
        }));
      }
    },
    [],
  );

  const restartCall = useCallback(async () => {
    if (!lastAgentRef.current || !lastOrgRef.current) return;
    await startCall(lastAgentRef.current, lastOrgRef.current, lastModeRef.current);
  }, [startCall]);

  const endCall = useCallback(() => {
    clientRef.current?.hangup();
    clientRef.current = null;
    clearTimer();
    setState((s) => ({ ...s, status: "ended" }));
  }, []);

  const toggleMute = useCallback(() => {
    setState((s) => {
      const next = !s.muted;
      clientRef.current?.setMuted(next);
      return { ...s, muted: next };
    });
  }, []);

  // Provider itself never unmounts (it's above the router), but clean up
  // defensively in case the app is torn down entirely (e.g. full logout).
  useEffect(
    () => () => {
      clearTimer();
      clientRef.current?.stop();
      clientRef.current = null;
    },
    [],
  );

  const isCallLive = state.status === "connecting" || state.status === "ready";

  const value: WebcallContextValue = {
    ...state,
    voiceSettings,setVoiceSettings,
    decideAction:(id,decision)=>clientRef.current?.decideAction(id,decision),
    isCallLive,
    startCall,
    restartCall,
    endCall,
    toggleMute,
    openModal,
    closeModal,
    resetToIdle,
  };

  return (
    <WebcallContext.Provider value={value}>{children}</WebcallContext.Provider>
  );
};

export function useWebcall(): WebcallContextValue {
  const ctx = useContext(WebcallContext);
  if (!ctx) {
    throw new Error("useWebcall must be used within a WebcallProvider");
  }
  return ctx;
}
