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
import { WebcallClient, WebcallStatus } from "../lib/webcallClient";

/**
 * Owns the "Talk to Your Agent" webcall's entire lifecycle above the router.
 *
 * Every route in App.tsx independently wraps its page in
 * <ProtectedRoute><MainLayout>, rather than sharing one layout route via
 * <Outlet/> — so MainLayout (and anything mounted inside it) fully unmounts
 * and remounts on every navigation. A WebcallClient owned there would die
 * the moment the tenant switched pages, same as it does today. This context
 * is mounted in App.tsx, above <StableHashRouter>, specifically so the call
 * survives navigation. The modal is a VIEW of this state, not its owner —
 * closing the modal only hides it; only endCall() actually hangs up.
 */

export type CaptionEntry = {
  speaker: "You" | "Agent";
  text: string;
  partial?: boolean;
};

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
}

interface WebcallContextValue extends WebcallState {
  isCallLive: boolean;
  startCall: (agent: AgentConfig, org: Organization) => Promise<void>;
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
};

const WebcallContext = createContext<WebcallContextValue | null>(null);

export const WebcallProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [state, setState] = useState<WebcallState>(initialState);
  const clientRef = useRef<WebcallClient | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastAgentRef = useRef<AgentConfig | null>(null);
  const lastOrgRef = useRef<Organization | null>(null);

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
    async (agent: AgentConfig, org: Organization) => {
      lastAgentRef.current = agent;
      lastOrgRef.current = org;
      setState({
        ...initialState,
        status: "connecting",
        agentName: agent.name || "Your Agent",
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
          body: JSON.stringify({ agentId: agent.id }),
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
          onStatusChange: (status) => setState((s) => ({ ...s, status })),
          onReady: () => {
            setState((s) => ({ ...s, duration: 0 }));
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
                partial &&
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
          onError: (code, message) => {
            clearTimer();
            setState((s) => ({ ...s, error: { code, message } }));
          },
          onEnded: () => {
            clearTimer();
          },
        });
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
    await startCall(lastAgentRef.current, lastOrgRef.current);
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
