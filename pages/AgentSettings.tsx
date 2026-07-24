import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Organization,
  AgentConfig,
  AgentVoicemailSettings,
  AgentCallScreeningSettings,
  FAQ,
  LeadOutreachSchedule,
  KnowledgeBase,
} from "../types";
import { api } from "../services/api";
import {
  voiceCallsApi,
  ElevenLabsVoice,
  OpenAiVoice,
  AgentVoiceConfig,
  VoiceProvider,
  VoiceSettings,
} from "../services/voiceCallsApi";
import AppModal from "../components/AppModal";
import { formatTimezoneOptionLabel } from "@/utils/timezones";

// Voice display must come from saved provider config, not legacy seeded voice names.
const TONES = ["Professional", "Friendly", "Empathetic"] as const;
const LANGUAGES = [
  "English",
  "Spanish",
  "French",
  "German",
  "Portuguese",
  "Italian",
] as const;

const DEFAULT_OPENAI_VOICE = "alloy";
const SELECTED_AGENT_STORAGE_KEY = "agently:selected-agent-id";
const getSelectedAgentStorageKey = (orgId?: string) =>
  `${SELECTED_AGENT_STORAGE_KEY}:${orgId || "global"}`;

const DEFAULT_VOICE_PREVIEW_TEXT =
  "Hello! This is a voice preview from Agently!";

const DEFAULT_ELEVENLABS_SETTINGS: Required<VoiceSettings> = {
  stability: 0.65,
  similarity_boost: 0.8,
  style: 0.15,
  speed: 0.92,
  use_speaker_boost: true,
};

const VOICEMAIL_ACTION_OPTIONS: Array<{
  value: AgentVoicemailSettings["action"];
  label: string;
  description: string;
}> = [
  {
    value: "hangup",
    label: "Hang up",
    description: "Detect voicemail, log it, and end the call quickly.",
  },
  {
    value: "leave_message",
    label: "Leave voicemail message",
    description:
      "Wait for voicemail, speak the configured message, then hang up.",
  },
  {
    value: "callback_later",
    label: "Callback / redial later",
    description:
      "Log voicemail and mark the call for a later callback workflow.",
  },
  {
    value: "manual_followup",
    label: "Manual follow-up",
    description: "Log voicemail and mark the recipient for human review.",
  },
];

const DEFAULT_VOICEMAIL_SETTINGS: AgentVoicemailSettings = {
  action: "hangup",
  message: "",
  callbackDelayMinutes: 60,
  maxRedialAttempts: 1,
};

const readAgentVoicemailSettings = (
  agent: Partial<AgentConfig> | null | undefined,
): AgentVoicemailSettings => ({
  action:
    agent?.voicemailSettings?.action ||
    agent?.voicemailBehavior ||
    DEFAULT_VOICEMAIL_SETTINGS.action,
  message:
    agent?.voicemailSettings?.message ||
    agent?.voicemailMessage ||
    DEFAULT_VOICEMAIL_SETTINGS.message,
  callbackDelayMinutes: Number.isFinite(
    Number(
      agent?.voicemailSettings?.callbackDelayMinutes ??
        agent?.voicemailCallbackDelayMinutes,
    ),
  )
    ? Number(
        agent?.voicemailSettings?.callbackDelayMinutes ??
          agent?.voicemailCallbackDelayMinutes,
      )
    : DEFAULT_VOICEMAIL_SETTINGS.callbackDelayMinutes,
  maxRedialAttempts: Number.isFinite(
    Number(
      agent?.voicemailSettings?.maxRedialAttempts ??
        agent?.voicemailMaxRedialAttempts,
    ),
  )
    ? Number(
        agent?.voicemailSettings?.maxRedialAttempts ??
          agent?.voicemailMaxRedialAttempts,
      )
    : DEFAULT_VOICEMAIL_SETTINGS.maxRedialAttempts,
});

const DEFAULT_CALL_SCREENING_SETTINGS: AgentCallScreeningSettings = {
  enabled: true,
  responseMessage: "",
  allowPurposeDisclosure: true,
};

const readAgentCallScreeningSettings = (
  agent: Partial<AgentConfig> | null | undefined,
): AgentCallScreeningSettings => ({
  enabled:
    agent?.callScreeningSettings?.enabled ??
    agent?.callScreeningEnabled ??
    DEFAULT_CALL_SCREENING_SETTINGS.enabled,
  responseMessage:
    agent?.callScreeningSettings?.responseMessage ||
    agent?.callScreeningMessage ||
    DEFAULT_CALL_SCREENING_SETTINGS.responseMessage,
  allowPurposeDisclosure:
    agent?.callScreeningSettings?.allowPurposeDisclosure ??
    DEFAULT_CALL_SCREENING_SETTINGS.allowPurposeDisclosure,
});

const toSliderValue = (value: number | undefined, fallback: number) =>
  Number.isFinite(value) ? Number(value) : fallback;

const toSliderProgress = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value) || max <= min) return 0;
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
};

const readKnowledgeEnabled = (context: unknown, fallback = true) => {
  const data = context as Record<string, unknown> | null;
  if (!data) return fallback;
  if (typeof data.use_knowledge_base === "boolean")
    return data.use_knowledge_base;
  if (typeof data.enabled === "boolean") return data.enabled;
  if (typeof data.useKnowledgeBase === "boolean") return data.useKnowledgeBase;
  return fallback;
};

const getAgentIdForVoiceEditing = (
  selectedAgent: AgentConfig | null,
  fallbackAgent: AgentConfig,
) => selectedAgent?.id || fallbackAgent.id;

const buildAudioBlob = async (result: {
  blob?: Blob;
  audioUrl?: string;
  audioBase64?: string;
  mimeType?: string;
}) => {
  if (result.blob && result.blob.size > 0) return result.blob;

  if (result.audioBase64) {
    const binary = window.atob(result.audioBase64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new Blob([bytes], { type: result.mimeType || "audio/mpeg" });
  }

  if (result.audioUrl) {
    const response = await fetch(result.audioUrl, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(
        `Voice audio download failed with status ${response.status}.`,
      );
    }
    const blob = await response.blob();
    if (blob.size > 0) return blob;
  }

  return null;
};

interface AgentSettingsProps {
  org: Organization;
  onUpdateAgent: (updates: Partial<AgentConfig>) => Promise<void>;
  onCreateVoiceAgent: (payload?: Partial<AgentConfig>) => Promise<void>;
  onActivateVoiceAgent: (id: string) => Promise<void>;
  onDeleteVoiceAgent: (id: string) => Promise<void>;
  onUpdateRules: (ruleUpdates: Partial<AgentConfig["rules"]>) => Promise<void>;
  onAddFaq: () => Promise<void>;
  onUpdateFaq: (
    id: string,
    updates: { question?: string; answer?: string },
  ) => Promise<void>;
  onRemoveFaq: (id: string) => Promise<void>;
  onSyncFaqs: (website?: string) => Promise<void>;
  onRestartAgent: () => Promise<void>;
  knowledgeBases?: KnowledgeBase[];
  onAssignKnowledgeBase?: (
    knowledgeBaseId: string,
    voiceAgentId: string,
  ) => Promise<void>;
}

type Tab = "persona" | "knowledge" | "rules";

interface Schedule extends LeadOutreachSchedule {
  startDate?: string;
  endDate?: string;
}

/* ── tiny helpers ── */
const Inp = (p: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...p}
    className={`w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white font-medium text-sm outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all ${p.className ?? ""}`}
  />
);
const Sel = (
  p: React.SelectHTMLAttributes<HTMLSelectElement> & {
    children: React.ReactNode;
  },
) => (
  <select
    {...p}
    className={`w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white font-medium text-sm outline-none focus:ring-2 focus:ring-amber-400 transition-all ${p.className ?? ""}`}
  >
    {p.children}
  </select>
);
const BufferedTextarea: React.FC<
  Omit<
    React.TextareaHTMLAttributes<HTMLTextAreaElement>,
    "value" | "onChange"
  > & {
    value?: string;
    onBufferedChange: (value: string, options?: { flush?: boolean }) => void;
  }
> = ({ value = "", onBufferedChange, onBlur, ...props }) => {
  const [localValue, setLocalValue] = useState(value || "");

  useEffect(() => {
    setLocalValue(value || "");
  }, [value]);

  return (
    <textarea
      {...props}
      value={localValue}
      onChange={(event) => {
        const nextValue = event.target.value;
        setLocalValue(nextValue);
        onBufferedChange(nextValue);
      }}
      onBlur={(event) => {
        onBufferedChange(event.currentTarget.value, { flush: true });
        onBlur?.(event);
      }}
    />
  );
};

const Label = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[10px] font-black text-[#7a8493] uppercase tracking-widest mb-1.5">
    {children}
  </p>
);

const MarqueeText: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = "" }) => (
  <span className={`ag-marquee-text ${className}`}>
    <span>{children}</span>
  </span>
);

const AgentSettings: React.FC<AgentSettingsProps> = ({
  org,
  onCreateVoiceAgent,
  onDeleteVoiceAgent,
  onRestartAgent,
  knowledgeBases = [],
  onAssignKnowledgeBase,
}) => {
  const [tab, setTab] = useState<Tab>("persona");
  const [draft, setDraft] = useState(org.agent);
  const [savedAgentBaseline, setSavedAgentBaseline] = useState(org.agent);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [saveModal, setSaveModal] = useState<{
    title: string;
    message: string;
    ok: boolean;
  } | null>(null);
  const [deletedFaqIds, setDeletedFaqIds] = useState<string[]>([]);
  const [agentDraftCache, setAgentDraftCache] = useState<
    Record<string, AgentConfig>
  >({});
  const [deleteConfirmAgent, setDeleteConfirmAgent] =
    useState<AgentConfig | null>(null);
  const draftRef = useRef(draft);
  const savedAgentBaselineRef = useRef(savedAgentBaseline);
  const deletedFaqIdsRef = useRef(deletedFaqIds);
  const agentDraftCacheRef = useRef(agentDraftCache);
  const autoSaveOnLeaveRef = useRef<null | (() => Promise<void>)>(null);
  const bufferedDraftTimersRef = useRef<
    Partial<Record<keyof AgentConfig, number>>
  >({});

  // Agent detail modal
  const [selectedAgent, setSelectedAgent] = useState<AgentConfig | null>(null);
  const [agentSchedules, setAgentSchedules] = useState<Schedule[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);

  /* knowledge-base state */
  const [scrapeUrl, setScrapeUrl] = useState(org.profile.website || "");
  const [scrapeStatus, setScrapeStatus] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle");
  const [scrapeResult, setScrapeResult] = useState("");
  const [chunks, setChunks] = useState(0);
  const activeVoiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeVoiceObjectUrlRef = useRef<string | null>(null);
  const activeVoiceAudioContextRef = useRef<AudioContext | null>(null);
  const activeVoiceBufferSourceRef = useRef<AudioBufferSourceNode | null>(null);

  /* stabilized voice-config integration */
  const [voiceProvider, setVoiceProvider] = useState<VoiceProvider>("openai");
  const [elevenLabsVoices, setElevenLabsVoices] = useState<ElevenLabsVoice[]>(
    [],
  );
  const [openAiVoices, setOpenAiVoices] = useState<OpenAiVoice[]>([]);
  const [agentVoiceConfigById, setAgentVoiceConfigById] = useState<
    Record<string, AgentVoiceConfig>
  >({});
  const [selectedAgentVoiceLoading, setSelectedAgentVoiceLoading] =
    useState(false);
  const [selectedElevenLabsVoiceId, setSelectedElevenLabsVoiceId] =
    useState("");
  const [selectedElevenLabsVoiceName, setSelectedElevenLabsVoiceName] =
    useState("");
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(
    DEFAULT_ELEVENLABS_SETTINGS,
  );
  const [openAiVoiceId, setOpenAiVoiceId] = useState(DEFAULT_OPENAI_VOICE);
  const [voiceConfigLoading, setVoiceConfigLoading] = useState(false);
  const [voiceConfigSaving, setVoiceConfigSaving] = useState(false);
  const [voicePreviewing, setVoicePreviewing] = useState(false);
  const [knowledgeEnabled, setKnowledgeEnabled] = useState(true);
  const [knowledgeSaving, setKnowledgeSaving] = useState(false);
  const [faqLoading, setFaqLoading] = useState(false);
  const [faqLoadError, setFaqLoadError] = useState("");
  const [agentFleetPage, setAgentFleetPage] = useState(0);
  const [isMobileAgentFleet, setIsMobileAgentFleet] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const syncAgentFleetSize = () => setIsMobileAgentFleet(mediaQuery.matches);

    syncAgentFleetSize();
    mediaQuery.addEventListener?.("change", syncAgentFleetSize);

    return () => {
      mediaQuery.removeEventListener?.("change", syncAgentFleetSize);
    };
  }, []);

  useEffect(() => {
    const rememberedAgentId =
      typeof window !== "undefined"
        ? window.localStorage.getItem(getSelectedAgentStorageKey(org.id))
        : null;
    const rememberedAgent = rememberedAgentId
      ? org.voiceAgents.find((agent) => agent.id === rememberedAgentId)
      : null;
    const nextAgent =
      rememberedAgent ||
      org.voiceAgents.find((agent) => agent.id === org.agent.id) ||
      org.agent;
    setDraft(nextAgent);
    setSavedAgentBaseline(nextAgent);
    setDeletedFaqIds([]);
  }, [org.agent.id, org.voiceAgents]);

  useEffect(() => {
    if (typeof window !== "undefined" && draft.id) {
      window.localStorage.setItem(getSelectedAgentStorageKey(org.id), draft.id);
    }
  }, [draft.id, org.id]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    savedAgentBaselineRef.current = savedAgentBaseline;
  }, [savedAgentBaseline]);

  useEffect(() => {
    deletedFaqIdsRef.current = deletedFaqIds;
  }, [deletedFaqIds]);

  useEffect(() => {
    agentDraftCacheRef.current = agentDraftCache;
  }, [agentDraftCache]);

  useEffect(() => {
    return () => {
      Object.values(bufferedDraftTimersRef.current).forEach((timer) => {
        if (timer) window.clearTimeout(timer);
      });
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const agentId = draft.id || org.agent.id;
    if (!agentId) return;

    const loadVoiceSettings = async () => {
      setVoiceConfigLoading(true);
      try {
        const [
          voicesResponse,
          openAiVoicesResponse,
          configResponse,
          knowledgeResponse,
        ] = await Promise.allSettled([
          voiceCallsApi.getElevenLabsVoices(),
          voiceCallsApi.getOpenAiVoices(),
          voiceCallsApi.getAgentVoiceConfig(agentId),
          voiceCallsApi.getAgentKnowledgeContext(agentId),
        ]);

        if (cancelled) return;

        if (voicesResponse.status === "fulfilled") {
          setElevenLabsVoices(voicesResponse.value.voices || []);
        } else {
          setElevenLabsVoices([]);
          showToast("Could not load ElevenLabs voices yet.", false);
        }

        if (openAiVoicesResponse.status === "fulfilled") {
          setOpenAiVoices(openAiVoicesResponse.value.voices || []);
        } else {
          setOpenAiVoices([]);
          showToast("Could not load OpenAI voices yet.", false);
        }

        if (configResponse.status === "fulfilled") {
          const config = configResponse.value;
          const provider =
            config.voice_provider === "elevenlabs" ? "elevenlabs" : "openai";
          setAgentVoiceConfigById((current) => ({
            ...current,
            [agentId]: config,
          }));
          setVoiceProvider(provider);
          setOpenAiVoiceId(
            config.openai_voice_id || config.voice_id || DEFAULT_OPENAI_VOICE,
          );
          setSelectedElevenLabsVoiceId(config.elevenlabs_voice_id || "");
          setSelectedElevenLabsVoiceName(config.elevenlabs_voice_name || "");
          setVoiceSettings({
            ...DEFAULT_ELEVENLABS_SETTINGS,
            ...(config.voice_settings || {}),
          });
        } else {
          setVoiceProvider("openai");
          setOpenAiVoiceId(DEFAULT_OPENAI_VOICE);
          setSelectedElevenLabsVoiceId("");
          setSelectedElevenLabsVoiceName("");
          setVoiceSettings(DEFAULT_ELEVENLABS_SETTINGS);
        }

        if (knowledgeResponse.status === "fulfilled") {
          setKnowledgeEnabled(
            readKnowledgeEnabled(knowledgeResponse.value, true),
          );
        }
      } finally {
        if (!cancelled) setVoiceConfigLoading(false);
      }
    };

    void loadVoiceSettings();

    return () => {
      cancelled = true;
    };
  }, [draft.id, org.agent.id]);

  useEffect(() => {
    if (!selectedElevenLabsVoiceId || selectedElevenLabsVoiceName) return;
    const found = elevenLabsVoices.find(
      (voice) => voice.voice_id === selectedElevenLabsVoiceId,
    );
    if (found) setSelectedElevenLabsVoiceName(found.name);
  }, [
    elevenLabsVoices,
    selectedElevenLabsVoiceId,
    selectedElevenLabsVoiceName,
  ]);

  useEffect(() => {
    return () => {
      if (activeVoiceBufferSourceRef.current) {
        try {
          activeVoiceBufferSourceRef.current.stop();
        } catch {
          // The source may already have finished.
        }
        activeVoiceBufferSourceRef.current.disconnect();
        activeVoiceBufferSourceRef.current = null;
      }
      if (activeVoiceAudioContextRef.current) {
        void activeVoiceAudioContextRef.current.close().catch(() => undefined);
        activeVoiceAudioContextRef.current = null;
      }
      if (activeVoiceAudioRef.current) {
        activeVoiceAudioRef.current.pause();
        activeVoiceAudioRef.current.src = "";
        activeVoiceAudioRef.current = null;
      }
      if (activeVoiceObjectUrlRef.current) {
        URL.revokeObjectURL(activeVoiceObjectUrlRef.current);
        activeVoiceObjectUrlRef.current = null;
      }
    };
  }, []);

  /* ── utils ── */
  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const run = async (
    key: string,
    fn: () => Promise<void>,
    successMsg?: string,
  ) => {
    setBusy(key);
    try {
      await fn();
      if (successMsg) showToast(successMsg);
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : "Something went wrong.",
        false,
      );
    } finally {
      setBusy(null);
    }
  };

  const handleElevenLabsVoiceChange = async (voiceId: string) => {
    const voice = elevenLabsVoices.find((item) => item.voice_id === voiceId);
    setSelectedElevenLabsVoiceId(voiceId);
    setSelectedElevenLabsVoiceName(voice?.name || "");

    if (activeVoiceAudioRef.current) {
      activeVoiceAudioRef.current.pause();
      activeVoiceAudioRef.current.src = "";
      activeVoiceAudioRef.current = null;
    }

    if (!voiceId) {
      setVoiceSettings(DEFAULT_ELEVENLABS_SETTINGS);
      return;
    }

    setVoiceSettings(DEFAULT_ELEVENLABS_SETTINGS);
    try {
      const settings = await voiceCallsApi.getElevenLabsVoiceSettings(voiceId);
      setVoiceSettings({ ...DEFAULT_ELEVENLABS_SETTINGS, ...(settings || {}) });
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : "Could not load voice settings.",
        false,
      );
    }
  };

  const updateVoiceSetting = <K extends keyof VoiceSettings>(
    key: K,
    value: VoiceSettings[K],
  ) => {
    setVoiceSettings((current) => ({ ...current, [key]: value }));
  };

  const selectedElevenLabsVoice = elevenLabsVoices.find(
    (voice) => voice.voice_id === selectedElevenLabsVoiceId,
  );

  const selectedOpenAiVoice = openAiVoices.find(
    (voice) => voice.voice_id === openAiVoiceId,
  );

  const humanizeVoiceId = (id?: string | null) => {
    if (!id) return "-";
    return id
      .split(/[\s_-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  };

  const getRawAgentVoiceConfig = (
    agent?: AgentConfig | null,
  ): AgentVoiceConfig | null => {
    if (!agent) return null;
    const raw = agent as AgentConfig & {
      voice_provider?: VoiceProvider;
      voiceProvider?: VoiceProvider;
      voice_id?: string | null;
      voiceId?: string | null;
      voice?: string | null;
      openai_voice_id?: string | null;
      openaiVoiceId?: string | null;
      elevenlabs_voice_id?: string | null;
      elevenlabsVoiceId?: string | null;
      elevenlabs_voice_name?: string | null;
      elevenlabsVoiceName?: string | null;
      voice_settings?: VoiceSettings | string | null;
      voiceSettings?: VoiceSettings | string | null;
    };

    const provider = raw.voice_provider || raw.voiceProvider;
    if (
      !provider &&
      !raw.elevenlabs_voice_id &&
      !raw.elevenlabsVoiceId &&
      !raw.openai_voice_id &&
      !raw.openaiVoiceId &&
      !raw.voice_id &&
      !raw.voiceId
    ) {
      return null;
    }

    let parsedSettings: VoiceSettings = {};
    const settings = raw.voice_settings ?? raw.voiceSettings;
    if (typeof settings === "string") {
      try {
        parsedSettings = JSON.parse(settings) as VoiceSettings;
      } catch {
        parsedSettings = {};
      }
    } else if (settings && typeof settings === "object") {
      parsedSettings = settings as VoiceSettings;
    }

    const elevenLabsVoiceId =
      raw.elevenlabs_voice_id || raw.elevenlabsVoiceId || "";
    const openAiVoiceId =
      raw.openai_voice_id ||
      raw.openaiVoiceId ||
      (provider === "openai"
        ? raw.voice_id || raw.voiceId || raw.voice || ""
        : "");

    return {
      voice_provider: provider || (elevenLabsVoiceId ? "elevenlabs" : "openai"),
      voice: raw.voice || undefined,
      voice_id:
        raw.voice_id ||
        raw.voiceId ||
        openAiVoiceId ||
        elevenLabsVoiceId ||
        undefined,
      openai_voice_id: openAiVoiceId || undefined,
      elevenlabs_voice_id: elevenLabsVoiceId || undefined,
      elevenlabs_voice_name:
        raw.elevenlabs_voice_name || raw.elevenlabsVoiceName || undefined,
      voice_settings: parsedSettings,
    };
  };

  const formatVoiceConfigDisplay = (config?: AgentVoiceConfig | null) => {
    if (!config) return "Voice not configured";

    if (config.voice_provider === "elevenlabs") {
      const id = config.elevenlabs_voice_id || config.voice_id || "";
      const match = elevenLabsVoices.find(
        (voice) =>
          voice.voice_id === id || voice.voiceId === id || voice.id === id,
      );
      return (
        config.elevenlabs_voice_name ||
        match?.name ||
        match?.displayName ||
        id ||
        "ElevenLabs voice"
      );
    }

    if (config.voice_provider === "openai") {
      const id =
        config.openai_voice_id || config.voice_id || DEFAULT_OPENAI_VOICE;
      const match = openAiVoices.find(
        (voice) =>
          voice.voice_id === id || voice.voiceId === id || voice.id === id,
      );
      return match?.name || match?.displayName || humanizeVoiceId(id);
    }

    return "Voice not configured";
  };

  const getAgentVoiceDisplay = (agent: AgentConfig | null) => {
    if (!agent) return "Voice not configured";
    return formatVoiceConfigDisplay(
      agentVoiceConfigById[agent.id] || getRawAgentVoiceConfig(agent),
    );
  };

  const buildVoiceConfigPayload = () => {
    if (voiceProvider === "elevenlabs") {
      const selectedName =
        selectedElevenLabsVoiceName ||
        selectedElevenLabsVoice?.name ||
        selectedElevenLabsVoiceId;
      return {
        voice_provider: "elevenlabs" as const,
        voice: selectedName,
        voice_id: selectedElevenLabsVoiceId,
        elevenlabs_voice_id: selectedElevenLabsVoiceId,
        elevenlabs_voice_name: selectedName,
        voice_settings: { ...DEFAULT_ELEVENLABS_SETTINGS, ...voiceSettings },
      };
    }

    const selectedVoiceId = openAiVoiceId || DEFAULT_OPENAI_VOICE;
    return {
      voice_provider: "openai" as const,
      voice: selectedVoiceId,
      voice_id: selectedVoiceId,
      openai_voice_id: selectedVoiceId,
      voice_settings: {
        model: selectedOpenAiVoice?.modelId || "gpt-4o-mini-tts",
        response_format: "mp3",
        speed: 1,
      },
    };
  };

  const saveVoiceConfig = async () => {
    if (voiceProvider === "elevenlabs" && !selectedElevenLabsVoiceId) {
      showToast("Choose an ElevenLabs voice before saving.", false);
      return;
    }

    setVoiceConfigSaving(true);
    try {
      const agentId = draftRef.current.id || org.agent.id;
      const payload = buildVoiceConfigPayload();
      const savedConfig = await voiceCallsApi.updateAgentVoiceConfig(
        agentId,
        payload,
      );
      const confirmedConfig = await voiceCallsApi
        .getAgentVoiceConfig(agentId)
        .catch(() => savedConfig);
      setAgentVoiceConfigById((current) => ({
        ...current,
        [agentId]: confirmedConfig,
      }));
      if (confirmedConfig.voice_provider === "elevenlabs") {
        setSelectedElevenLabsVoiceId(
          confirmedConfig.elevenlabs_voice_id ||
            confirmedConfig.voice_id ||
            selectedElevenLabsVoiceId,
        );
        setSelectedElevenLabsVoiceName(
          confirmedConfig.elevenlabs_voice_name || selectedElevenLabsVoiceName,
        );
      } else {
        setOpenAiVoiceId(
          confirmedConfig.openai_voice_id ||
            confirmedConfig.voice_id ||
            openAiVoiceId ||
            DEFAULT_OPENAI_VOICE,
        );
      }
      if (selectedAgent?.id === agentId) {
        setSelectedAgent((current) =>
          current
            ? {
                ...current,
                voice: (confirmedConfig.voice ||
                  confirmedConfig.elevenlabs_voice_name ||
                  confirmedConfig.voice_id ||
                  current.voice) as AgentConfig["voice"],
              }
            : current,
        );
      }
      showToast(
        "Voice settings saved, confirmed from backend, and assigned to the selected agent.",
      );
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : "Could not save voice settings.",
        false,
      );
    } finally {
      setVoiceConfigSaving(false);
    }
  };

  const previewVoice = async () => {
    const currentProvider = voiceProvider;
    const currentElevenLabsVoice = selectedElevenLabsVoice;
    const currentElevenLabsVoiceId = selectedElevenLabsVoiceId;
    const currentElevenLabsVoiceName =
      selectedElevenLabsVoiceName || currentElevenLabsVoice?.name || "";
    const currentOpenAiVoiceId = openAiVoiceId || DEFAULT_OPENAI_VOICE;

    if (currentProvider === "elevenlabs" && !currentElevenLabsVoiceId) {
      showToast("Choose an ElevenLabs voice before listening.", false);
      return;
    }

    if (activeVoiceBufferSourceRef.current) {
      try {
        activeVoiceBufferSourceRef.current.stop();
      } catch {
        // The previous source may already have finished.
      }
      activeVoiceBufferSourceRef.current.disconnect();
      activeVoiceBufferSourceRef.current = null;
    }
    if (activeVoiceAudioRef.current) {
      activeVoiceAudioRef.current.pause();
      activeVoiceAudioRef.current.src = "";
      activeVoiceAudioRef.current = null;
    }
    if (activeVoiceObjectUrlRef.current) {
      URL.revokeObjectURL(activeVoiceObjectUrlRef.current);
      activeVoiceObjectUrlRef.current = null;
    }

    // Resume Web Audio while this function is still running from the user's
    // button click. That keeps playback reliable after the network request
    // finishes, including browsers that otherwise block delayed audio.play().
    let audioContext: AudioContext | null = activeVoiceAudioContextRef.current;
    try {
      const AudioContextConstructor =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (AudioContextConstructor) {
        if (!audioContext || audioContext.state === "closed") {
          audioContext = new AudioContextConstructor();
          activeVoiceAudioContextRef.current = audioContext;
        }
        if (audioContext.state === "suspended") {
          await audioContext.resume();
        }
      }
    } catch {
      audioContext = null;
    }

    const playGeneratedAudio = async (blob: Blob) => {
      if (blob.size === 0) {
        throw new Error("The voice preview returned an empty audio file.");
      }

      if (audioContext && audioContext.state !== "closed") {
        const encodedAudio = await blob.arrayBuffer();
        const decodedAudio = await audioContext.decodeAudioData(
          encodedAudio.slice(0),
        );
        const source = audioContext.createBufferSource();
        source.buffer = decodedAudio;
        source.connect(audioContext.destination);
        source.onended = () => {
          if (activeVoiceBufferSourceRef.current === source) {
            activeVoiceBufferSourceRef.current = null;
          }
          source.disconnect();
        };
        activeVoiceBufferSourceRef.current = source;
        source.start(0);
        return;
      }

      const objectUrl = URL.createObjectURL(blob);
      activeVoiceObjectUrlRef.current = objectUrl;
      const audio = new Audio(objectUrl);
      audio.preload = "auto";
      audio.setAttribute("playsinline", "true");
      activeVoiceAudioRef.current = audio;
      audio.onended = () => {
        if (activeVoiceObjectUrlRef.current === objectUrl) {
          URL.revokeObjectURL(objectUrl);
          activeVoiceObjectUrlRef.current = null;
        }
        if (activeVoiceAudioRef.current === audio) {
          activeVoiceAudioRef.current = null;
        }
      };
      audio.onerror = () => {
        showToast(
          "The generated voice audio could not be decoded by the browser.",
          false,
        );
      };
      await audio.play();
    };

    setVoicePreviewing(true);
    try {
      const result =
        currentProvider === "elevenlabs"
          ? await voiceCallsApi.testElevenLabsVoice({
              text: DEFAULT_VOICE_PREVIEW_TEXT,
              returnJson: true,
              voice_provider: "elevenlabs",
              voice_id: currentElevenLabsVoiceId,
              voiceId: currentElevenLabsVoiceId,
              elevenlabs_voice_id: currentElevenLabsVoiceId,
              elevenlabs_voice_name: currentElevenLabsVoiceName,
              modelId: currentElevenLabsVoice?.modelId || undefined,
              voice_settings: {
                ...DEFAULT_ELEVENLABS_SETTINGS,
                ...voiceSettings,
              },
            })
          : await voiceCallsApi.previewVoice({
              text: DEFAULT_VOICE_PREVIEW_TEXT,
              returnJson: true,
              provider: "openai",
              voice_provider: "openai",
              voice_id: currentOpenAiVoiceId,
              voiceId: currentOpenAiVoiceId,
              model: selectedOpenAiVoice?.modelId || "gpt-4o-mini-tts",
              speed: 1,
            });

      if (
        currentProvider === "elevenlabs" &&
        result.voiceId &&
        result.voiceId !== currentElevenLabsVoiceId
      ) {
        throw new Error(
          "The backend returned audio for a different ElevenLabs voice.",
        );
      }

      const audioBlob = await buildAudioBlob(result);
      if (!audioBlob) {
        throw new Error("The voice preview returned no playable audio.");
      }

      await playGeneratedAudio(audioBlob);
      // showToast('Playing: "Hello! This is a voice preview from Agently!"');
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Listen to voice failed.",
        false,
      );
    } finally {
      setVoicePreviewing(false);
    }
  };

  const toggleKnowledgeBase = async () => {
    const next = !knowledgeEnabled;
    setKnowledgeSaving(true);
    setKnowledgeEnabled(next);
    try {
      const agentId = draftRef.current.id || org.agent.id;
      const response = await voiceCallsApi.updateAgentKnowledgeSettings(
        agentId,
        {
          use_knowledge_base: next,
        },
      );
      setKnowledgeEnabled(readKnowledgeEnabled(response, next));
      showToast(next ? "Knowledge base enabled." : "Knowledge base disabled.");
    } catch (e) {
      setKnowledgeEnabled(!next);
      showToast(
        e instanceof Error ? e.message : "Could not update knowledge setting.",
        false,
      );
    } finally {
      setKnowledgeSaving(false);
    }
  };

  const updateDraftField = <K extends keyof AgentConfig>(
    key: K,
    val: AgentConfig[K],
  ) => {
    setDraft((d) => ({ ...d, [key]: val }));
  };

  const updateDraftFieldBuffered = <K extends keyof AgentConfig>(
    key: K,
    val: AgentConfig[K],
    options: { flush?: boolean } = {},
  ) => {
    draftRef.current = { ...draftRef.current, [key]: val };
    const existingTimer = bufferedDraftTimersRef.current[key];
    if (existingTimer) window.clearTimeout(existingTimer);

    const commit = () => {
      delete bufferedDraftTimersRef.current[key];
      const latest = draftRef.current[key];
      setDraft((current) =>
        Object.is(current[key], latest)
          ? current
          : { ...current, [key]: latest },
      );
    };

    if (options.flush) {
      commit();
      return;
    }

    bufferedDraftTimersRef.current[key] = window.setTimeout(commit, 280);
  };

  const readAgentWorkspaceValue = (
    agent: AgentConfig | null | undefined,
    ruleKey: string,
    directKeys: string[] = [],
  ) => {
    const source = (agent || {}) as AgentConfig & Record<string, unknown>;
    for (const key of directKeys) {
      const value = source[key];
      if (typeof value === "string" && value.trim()) return value;
    }
    const rules = (agent?.rules || {}) as Record<string, unknown>;
    const ruleValue = rules[ruleKey];
    return typeof ruleValue === "string" ? ruleValue : "";
  };

  const updateDraftRuleText = (key: string, value: string) => {
    setDraft((d) => ({
      ...d,
      rules: {
        ...(d.rules || {}),
        [key]: value,
      } as AgentConfig["rules"],
    }));
  };

  const updateDraftVoicemailSettings = (
    updates: Partial<AgentVoicemailSettings>,
  ) => {
    setDraft((current) => {
      const nextSettings: AgentVoicemailSettings = {
        ...readAgentVoicemailSettings(current),
        ...updates,
      };
      return {
        ...current,
        voicemailSettings: nextSettings,
        voicemailBehavior: nextSettings.action,
        voicemailMessage: nextSettings.message,
        voicemailCallbackDelayMinutes: nextSettings.callbackDelayMinutes,
        voicemailMaxRedialAttempts: nextSettings.maxRedialAttempts,
      };
    });
  };

  const updateDraftCallScreeningSettings = (
    updates: Partial<AgentCallScreeningSettings>,
  ) => {
    setDraft((current) => {
      const nextSettings: AgentCallScreeningSettings = {
        ...readAgentCallScreeningSettings(current),
        ...updates,
      };
      return {
        ...current,
        callScreeningSettings: nextSettings,
        callScreeningEnabled: nextSettings.enabled,
        callScreeningMessage: nextSettings.responseMessage,
      };
    });
  };

  const getAgentPrompt = (agent: AgentConfig | null | undefined = draft) =>
    readAgentWorkspaceValue(agent, "agentPrompt", [
      "agentPrompt",
      "customPrompt",
      "custom_prompt",
      "systemPrompt",
      "system_prompt",
    ]);

  const getDefaultCallPurpose = (
    agent: AgentConfig | null | undefined = draft,
  ) =>
    readAgentWorkspaceValue(agent, "defaultCallPurpose", [
      "defaultCallPurpose",
      "default_call_purpose",
      "callPurpose",
      "call_purpose",
    ]);

  const getCallInstructions = (agent: AgentConfig | null | undefined = draft) =>
    readAgentWorkspaceValue(agent, "callInstructions", [
      "callInstructions",
      "customInstructions",
      "custom_instructions",
    ]);

  const normalizeComparable = (value: unknown) =>
    value === undefined || value === null ? "" : value;

  const isLocalFaqId = (id?: string) =>
    String(id || "").startsWith("local-faq-");

  const cleanFaqsForSave = (faqs: FAQ[] = []) =>
    faqs
      .map((faq) => ({
        ...faq,
        question: String(faq.question || "").trim(),
        answer: String(faq.answer || "").trim(),
      }))
      .filter((faq) => faq.question || faq.answer);

  const buildAgentUpdatesFrom = (
    currentDraft: AgentConfig,
    baseline: AgentConfig,
  ) => {
    const updates: Partial<AgentConfig> = {};
    const fields = [
      "name",
      "direction",
      "language",
      "greeting",
      "tone",
      "escalationPhone",
      "businessHours",
      "voicemailBehavior",
      "voicemailMessage",
      "voicemailCallbackDelayMinutes",
      "voicemailMaxRedialAttempts",
      "callScreeningEnabled",
      "callScreeningMessage",
    ] as const;

    fields.forEach((field) => {
      if (
        normalizeComparable(currentDraft[field]) !==
        normalizeComparable(baseline[field])
      ) {
        updates[field] = currentDraft[field] as never;
      }
    });

    const draftVoicemailSettings = readAgentVoicemailSettings(currentDraft);
    const savedVoicemailSettings = readAgentVoicemailSettings(baseline);
    if (
      JSON.stringify(draftVoicemailSettings) !==
      JSON.stringify(savedVoicemailSettings)
    ) {
      updates.voicemailSettings = draftVoicemailSettings;
      updates.voicemailBehavior = draftVoicemailSettings.action;
      updates.voicemailMessage = draftVoicemailSettings.message;
      updates.voicemailCallbackDelayMinutes =
        draftVoicemailSettings.callbackDelayMinutes;
      updates.voicemailMaxRedialAttempts =
        draftVoicemailSettings.maxRedialAttempts;
    }

    const draftCallScreeningSettings =
      readAgentCallScreeningSettings(currentDraft);
    const savedCallScreeningSettings = readAgentCallScreeningSettings(baseline);
    if (
      JSON.stringify(draftCallScreeningSettings) !==
      JSON.stringify(savedCallScreeningSettings)
    ) {
      updates.callScreeningSettings = draftCallScreeningSettings;
      updates.callScreeningEnabled = draftCallScreeningSettings.enabled;
      updates.callScreeningMessage = draftCallScreeningSettings.responseMessage;
    }

    const draftFields = currentDraft.dataCaptureFields || [];
    const savedFields = baseline.dataCaptureFields || [];
    if (JSON.stringify(draftFields) !== JSON.stringify(savedFields)) {
      updates.dataCaptureFields = draftFields;
    }

    return updates;
  };

  const buildRuleUpdatesFrom = (
    currentDraft: AgentConfig,
    baseline: AgentConfig,
  ) => {
    const updates: Partial<AgentConfig["rules"]> = {};
    const draftRules = currentDraft.rules || {};
    const savedRules = baseline.rules || {};
    (Object.keys(draftRules) as (keyof AgentConfig["rules"])[]).forEach(
      (key) => {
        if (draftRules[key] !== savedRules[key]) {
          updates[key] = draftRules[key] as never;
        }
      },
    );
    return updates;
  };

  const getFaqChangesFrom = (
    currentDraft: AgentConfig,
    baseline: AgentConfig,
  ) => {
    const savedFaqs = baseline.faqs || [];
    const currentFaqs = cleanFaqsForSave(currentDraft.faqs || []);
    const newFaqs = currentFaqs.filter((faq) => isLocalFaqId(faq.id));
    const updatedFaqs = currentFaqs.filter((faq) => {
      if (isLocalFaqId(faq.id)) return false;
      const original = savedFaqs.find((item) => item.id === faq.id);
      if (!original) return false;
      return (
        faq.question !== original.question || faq.answer !== original.answer
      );
    });
    return { newFaqs, updatedFaqs };
  };

  const hasObjectKeys = (value: Record<string, unknown>) =>
    Object.keys(value).length > 0;

  const pendingAgentUpdates = buildAgentUpdatesFrom(draft, savedAgentBaseline);
  const pendingRuleUpdates = buildRuleUpdatesFrom(draft, savedAgentBaseline);
  const pendingFaqChanges = getFaqChangesFrom(draft, savedAgentBaseline);
  const hasUnsavedChanges =
    hasObjectKeys(pendingAgentUpdates as Record<string, unknown>) ||
    hasObjectKeys(pendingRuleUpdates as Record<string, unknown>) ||
    pendingFaqChanges.newFaqs.length > 0 ||
    pendingFaqChanges.updatedFaqs.length > 0 ||
    deletedFaqIds.length > 0;

  const getDisplayAgent = (agent: AgentConfig): AgentConfig => {
    if (agent.id === draft.id) return { ...agent, ...draft };
    return agentDraftCache[agent.id] || agent;
  };

  const visibleVoiceAgents = org.voiceAgents.map(getDisplayAgent);
  const agentFleetPageSize = isMobileAgentFleet ? 3 : 5;
  const agentFleetPageCount = Math.max(
    1,
    Math.ceil(visibleVoiceAgents.length / agentFleetPageSize),
  );
  const safeAgentFleetPage = Math.min(agentFleetPage, agentFleetPageCount - 1);
  const pagedVoiceAgents = visibleVoiceAgents.slice(
    safeAgentFleetPage * agentFleetPageSize,
    safeAgentFleetPage * agentFleetPageSize + agentFleetPageSize,
  );
  const agentFleetRangeStart = visibleVoiceAgents.length
    ? safeAgentFleetPage * agentFleetPageSize + 1
    : 0;
  const agentFleetRangeEnd = Math.min(
    visibleVoiceAgents.length,
    safeAgentFleetPage * agentFleetPageSize + pagedVoiceAgents.length,
  );

  useEffect(() => {
    if (agentFleetPage > agentFleetPageCount - 1) {
      setAgentFleetPage(Math.max(0, agentFleetPageCount - 1));
    }
  }, [agentFleetPage, agentFleetPageCount]);

  const selectAgentForEditing = (agent: AgentConfig) => {
    const currentDraft = draftRef.current;
    const targetFromOrg =
      org.voiceAgents.find((item) => item.id === agent.id) || agent;
    const target = agentDraftCacheRef.current[agent.id] || targetFromOrg;
    if (target.id === currentDraft.id) return;

    setAgentDraftCache((current) => ({
      ...current,
      [currentDraft.id]: currentDraft,
    }));
    setDraft(target);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        getSelectedAgentStorageKey(org.id),
        target.id,
      );
    }
    setSavedAgentBaseline(targetFromOrg);
    setDeletedFaqIds([]);
    setSelectedAgent(null);
    setTab("persona");
  };

  useEffect(() => {
    setSelectedAgent((current) =>
      current && current.id === draft.id ? { ...current, ...draft } : current,
    );
  }, [draft]);

  const addLocalFaq = () => {
    const localFaq: FAQ = {
      id: `local-faq-${Date.now()}`,
      question: "",
      answer: "",
    };
    setDraft((d) => ({ ...d, faqs: [...(d.faqs || []), localFaq] }));
    setTab("knowledge");
  };

  const removeLocalFaq = (faqId: string) => {
    setDraft((d) => ({
      ...d,
      faqs: (d.faqs || []).filter((faq) => faq.id !== faqId),
    }));
    if (!isLocalFaqId(faqId)) {
      setDeletedFaqIds((ids) => (ids.includes(faqId) ? ids : [...ids, faqId]));
    }
  };

  const syncFaqsWithoutPageReload = async () => {
    const assignedKbId =
      currentKnowledgeBase?.id || draft.knowledgeBaseId || "";
    if (!assignedKbId) {
      showToast("Assign a Knowledge Base before regenerating FAQs.", false);
      return;
    }
    setBusy("sync");
    try {
      const syncedFaqs = await api.syncFaqs(
        scrapeUrl || org.profile.website,
        draft.id,
        assignedKbId,
      );
      setDraft((d) => ({ ...d, faqs: syncedFaqs }));
      setSavedAgentBaseline((base) => ({ ...base, faqs: syncedFaqs }));
      setDeletedFaqIds([]);
      showToast("FAQs regenerated for the assigned Knowledge Base.");
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : "Could not regenerate FAQs.",
        false,
      );
    } finally {
      setBusy(null);
    }
  };

  const discardUnsavedChanges = () => {
    setDraft(savedAgentBaseline);
    setDeletedFaqIds([]);
    showToast("Unsaved changes discarded.");
  };

  const persistAgentChanges = async (
    options: { showModal?: boolean; silent?: boolean } = {},
  ) => {
    const currentDraft = draftRef.current;
    const baseline = savedAgentBaselineRef.current;
    const removedFaqIds = deletedFaqIdsRef.current;
    const agentUpdates = buildAgentUpdatesFrom(currentDraft, baseline);
    const ruleUpdates = buildRuleUpdatesFrom(currentDraft, baseline);
    const faqChanges = getFaqChangesFrom(currentDraft, baseline);
    const shouldSave =
      hasObjectKeys(agentUpdates as Record<string, unknown>) ||
      hasObjectKeys(ruleUpdates as Record<string, unknown>) ||
      faqChanges.newFaqs.length > 0 ||
      faqChanges.updatedFaqs.length > 0 ||
      removedFaqIds.length > 0;

    if (!shouldSave) {
      if (options.showModal) {
        setSaveModal({
          title: "No changes to save",
          message: "Everything on this agent is already up to date.",
          ok: true,
        });
      }
      return;
    }

    if (!options.silent) setBusy("save-agent-settings");

    try {
      if (hasObjectKeys(agentUpdates as Record<string, unknown>)) {
        await api.updateVoiceAgent(currentDraft.id, agentUpdates);
      }

      if (hasObjectKeys(ruleUpdates as Record<string, unknown>)) {
        await api.updateVoiceAgent(currentDraft.id, {
          rules: {
            autoBook: baseline.rules?.autoBook ?? false,
            autoEscalate: baseline.rules?.autoEscalate ?? false,
            captureAllLeads: baseline.rules?.captureAllLeads ?? true,
            ...ruleUpdates,
          },
        });
      }

      const scopedFaqKnowledgeBaseId =
        currentDraft.knowledgeBaseId || currentKnowledgeBase?.id || "";
      if (
        (faqChanges.newFaqs.length ||
          faqChanges.updatedFaqs.length ||
          removedFaqIds.length) &&
        !scopedFaqKnowledgeBaseId
      ) {
        throw new Error(
          "Assign a Knowledge Base to this agent before saving FAQ changes.",
        );
      }

      for (const faqId of removedFaqIds) {
        await api.removeFaq(faqId, currentDraft.id, scopedFaqKnowledgeBaseId);
      }

      const createdFaqs: FAQ[] = [];
      for (const faq of faqChanges.newFaqs) {
        const created = await api.createFaq(
          faq.question,
          faq.answer,
          currentDraft.id,
          scopedFaqKnowledgeBaseId,
        );
        createdFaqs.push(created);
      }

      const updatedFaqs: FAQ[] = [];
      for (const faq of faqChanges.updatedFaqs) {
        const updated = await api.updateFaq(
          faq.id,
          {
            question: faq.question,
            answer: faq.answer,
          },
          currentDraft.id,
          scopedFaqKnowledgeBaseId,
        );
        updatedFaqs.push(updated);
      }

      const createdByTempIndex = new Map<string, FAQ>();
      faqChanges.newFaqs.forEach((faq, index) => {
        if (createdFaqs[index])
          createdByTempIndex.set(faq.id, createdFaqs[index]);
      });
      const updatedById = new Map(updatedFaqs.map((faq) => [faq.id, faq]));
      const removedSet = new Set(removedFaqIds);
      const nextFaqs = cleanFaqsForSave(currentDraft.faqs || [])
        .filter((faq) => !removedSet.has(faq.id))
        .map(
          (faq) =>
            createdByTempIndex.get(faq.id) || updatedById.get(faq.id) || faq,
        );
      const nextBaseline = { ...currentDraft, faqs: nextFaqs };

      if (!options.silent) {
        setDraft(nextBaseline);
        setSavedAgentBaseline(nextBaseline);
        setAgentDraftCache((current) => ({
          ...current,
          [nextBaseline.id]: nextBaseline,
        }));
        setDeletedFaqIds([]);
        setSelectedAgent((current) =>
          current && current.id === nextBaseline.id
            ? { ...current, ...nextBaseline }
            : current,
        );
      }

      if (options.showModal) {
        setSaveModal({
          title: "Changes saved",
          message: "Your agent settings have been saved successfully.",
          ok: true,
        });
      }
    } catch (e) {
      if (options.showModal) {
        setSaveModal({
          title: "Save failed",
          message:
            e instanceof Error
              ? e.message
              : "Could not save your changes. Please try again.",
          ok: false,
        });
      } else if (!options.silent) {
        showToast(
          e instanceof Error ? e.message : "Could not save your changes.",
          false,
        );
      }
    } finally {
      if (!options.silent) setBusy(null);
    }
  };

  const saveAllAgentChanges = async () => {
    await persistAgentChanges({ showModal: true });
  };

  const openCallCampaignComposer = async (
    mode: "call-now" | "schedule" = "call-now",
  ) => {
    const currentDraft = draftRef.current;
    if (hasUnsavedChanges) {
      await persistAgentChanges({ silent: true });
    }

    const params = new URLSearchParams({
      agentId: currentDraft.id,
      agentName: currentDraft.name || "Voice Agent",
      mode,
    });

    const callPurpose = getDefaultCallPurpose(currentDraft).trim();
    const callInstructions = getCallInstructions(currentDraft).trim();
    if (callPurpose) params.set("callPurpose", callPurpose);
    if (callInstructions) params.set("instructions", callInstructions);

    window.requestAnimationFrame(() => {
      window.location.hash = `#/outreach?${params.toString()}`;
    });
  };

  useEffect(() => {
    autoSaveOnLeaveRef.current = async () => {
      await persistAgentChanges({ silent: true });
    };
  });

  useEffect(() => {
    const handlePageLeave = () => {
      void autoSaveOnLeaveRef.current?.();
    };
    window.addEventListener("pagehide", handlePageLeave);
    return () => {
      window.removeEventListener("pagehide", handlePageLeave);
      void autoSaveOnLeaveRef.current?.();
    };
  }, []);

  // Open agent detail modal and load its schedules
  const openAgentModal = async (agent: AgentConfig) => {
    setSelectedAgent(agent);
    setAgentSchedules([]);
    setLoadingSchedules(true);
    setSelectedAgentVoiceLoading(true);
    try {
      const [scheduleResult, voiceConfigResult] = await Promise.allSettled([
        api.listLeadSchedules(),
        voiceCallsApi.getAgentVoiceConfig(agent.id),
      ]);

      if (scheduleResult.status === "fulfilled") {
        const all = (scheduleResult.value.schedules || []) as Schedule[];
        setAgentSchedules(all.filter((s) => s.voiceAgentId === agent.id));
      } else {
        setAgentSchedules([]);
      }

      if (voiceConfigResult.status === "fulfilled") {
        setAgentVoiceConfigById((current) => ({
          ...current,
          [agent.id]: voiceConfigResult.value,
        }));
      }
    } catch {
      setAgentSchedules([]);
    } finally {
      setLoadingSchedules(false);
      setSelectedAgentVoiceLoading(false);
    }
  };

  /* ── website scraper ── */
  const handleScrape = async () => {
    if (!scrapeUrl.trim()) return;
    setScrapeStatus("loading");
    setScrapeResult("");
    setChunks(0);
    try {
      const res = await api.importChatbotWebsite(
        org.activeChatbotId || "",
        scrapeUrl,
      );
      setScrapeStatus("done");
      setChunks(res.chunksStored ?? 0);
      setScrapeResult(
        res.message || `✓ ${res.chunksStored} chunks saved to knowledge base.`,
      );
      showToast(`Knowledge base updated — ${res.chunksStored} chunks stored.`);
    } catch (e) {
      setScrapeStatus("error");
      setScrapeResult(e instanceof Error ? e.message : "Scrape failed.");
      showToast(e instanceof Error ? e.message : "Scrape failed.", false);
    }
  };

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    {
      id: "persona",
      label: "Persona & Voice",
      icon: (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" x2="12" y1="19" y2="22" />
        </svg>
      ),
    },
    {
      id: "knowledge",
      label: "Assignment & FAQs",
      icon: (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
          <path d="M8 7h6" />
          <path d="M8 11h8" />
        </svg>
      ),
    },
    {
      id: "rules",
      label: "Rules & Routing",
      icon: (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      ),
    },
  ];

  // Campaign progress helper
  const getCampaignProgress = (sch: Schedule) => {
    if (!(sch as any).startDate || !(sch as any).endDate) return null;
    const allDays = sch.windows.flatMap((w) => w.weekdays);
    const DAY_IDX: Record<string, number> = {
      sun: 0,
      mon: 1,
      tue: 2,
      wed: 3,
      thu: 4,
      fri: 5,
      sat: 6,
    };
    let total = 0;
    let completed = 0;
    const cur = new Date((sch as any).startDate);
    const end = new Date((sch as any).endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    while (cur <= end) {
      const code = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][
        cur.getDay()
      ];
      if (allDays.includes(code)) {
        total++;
        if (cur < today) completed++;
      }
      cur.setDate(cur.getDate() + 1);
    }
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return {
      total,
      completed,
      remaining: Math.max(0, total - completed),
      pct,
      isComplete: total > 0 && completed >= total,
    };
  };

  const currentKnowledgeBase =
    knowledgeBases.find((kb) => kb.id === draft.knowledgeBaseId) ||
    knowledgeBases.find((kb) => kb.linkedVoiceAgentIds?.includes(draft.id)) ||
    null;

  const assignedKnowledgeBaseId = currentKnowledgeBase?.id || "";

  useEffect(() => {
    let cancelled = false;
    const agentId = draft.id;
    const knowledgeBaseId = assignedKnowledgeBaseId;

    setFaqLoadError("");
    setDeletedFaqIds([]);

    if (!agentId || !knowledgeBaseId) {
      setFaqLoading(false);
      setDraft((current) =>
        current.id === agentId ? { ...current, faqs: [] } : current,
      );
      setSavedAgentBaseline((current) =>
        current.id === agentId ? { ...current, faqs: [] } : current,
      );
      return () => {
        cancelled = true;
      };
    }

    setFaqLoading(true);
    api
      .listKnowledgeBaseFaqs(knowledgeBaseId)
      .then((response) => {
        if (cancelled) return;
        const nextFaqs = response.faqs || [];
        setDraft((current) =>
          current.id === agentId ? { ...current, faqs: nextFaqs } : current,
        );
        setSavedAgentBaseline((current) =>
          current.id === agentId ? { ...current, faqs: nextFaqs } : current,
        );
        setDeletedFaqIds([]);
      })
      .catch((error) => {
        if (cancelled) return;
        setFaqLoadError(
          error instanceof Error
            ? error.message
            : "Could not load FAQs for the assigned Knowledge Base.",
        );
        setDraft((current) =>
          current.id === agentId ? { ...current, faqs: [] } : current,
        );
      })
      .finally(() => {
        if (!cancelled) setFaqLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [assignedKnowledgeBaseId, draft.id]);

  const assignDraftKnowledgeBase = async (knowledgeBaseId: string) => {
    if (!knowledgeBaseId || !draft.id || !onAssignKnowledgeBase) return;
    const nextBase = knowledgeBases.find((kb) => kb.id === knowledgeBaseId);
    await run(
      "assign-knowledge-base",
      async () => {
        await onAssignKnowledgeBase(knowledgeBaseId, draft.id);
        setDraft((current) => ({ ...current, knowledgeBaseId }));
        setSavedAgentBaseline((current) => ({ ...current, knowledgeBaseId }));
      },
      `${draft.name} now uses ${nextBase?.name || nextBase?.businessName || "the selected knowledge base"}.`,
    );
  };

  return (
    <div className="agently-agent-settings-page animate-fade-up space-y-4">
      {/* ── Toast ── */}
      {toast && (
        <div
          className={`fixed top-5 right-5 z-[200] px-5 py-3 rounded-2xl shadow-xl text-sm font-bold flex items-center gap-2.5 transition-all ${toast.ok ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}
        >
          {toast.ok ? (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          )}
          {toast.msg}
        </div>
      )}

      {(busy === "save-agent-settings" ||
        busy === "create-in" ||
        busy === "create-out") && (
        <AppModal
          open
          onClose={() => undefined}
          title={
            busy === "save-agent-settings" ? "Saving changes" : "Creating agent"
          }
          description={
            busy === "save-agent-settings"
              ? "Please wait while Agently saves this agent."
              : "Please wait while Agently creates your new voice agent."
          }
          size="sm"
        >
          <div className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <div className="h-10 w-10 shrink-0 animate-spin rounded-full border-4 border-slate-200 border-t-amber-500" />
            <div>
              <p className="text-sm font-medium text-[#232f3e]">
                {busy === "save-agent-settings" ? "Saving…" : "Creating…"}
              </p>
              <p className="text-xs font-medium text-[#7a8493]">
                This should only take a moment.
              </p>
            </div>
          </div>
        </AppModal>
      )}

      {/* ── Page route tabs, directly under the main title bar ── */}
      <div className="ag-page-inline-actions ag-voice-toolbar">
        <div
          className="ag-agent-tabs ag-agent-tabs-flat ag-voice-tabs"
          role="tablist"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`ag-voice-tab text-[13px] font-medium transition-all ${tab === t.id ? "ag-voice-tab-active" : ""}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="ag-voice-toolbar-actions">
          <button
            onClick={() =>
              void run(
                "create-in",
                () => onCreateVoiceAgent({ direction: "inbound" }),
                "Agent created",
              )
            }
            className="ag-button-soft"
          >
            + Inbound
          </button>
          <button
            onClick={() =>
              void run(
                "create-out",
                () => onCreateVoiceAgent({ direction: "outbound" }),
                "Agent created",
              )
            }
            className="ag-button-soft"
          >
            + Outbound
          </button>
          <button
            type="button"
            onClick={() => void openCallCampaignComposer("call-now")}
            className="ag-button-orange"
          >
            Start Call
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════ PERSONA TAB */}
      {tab === "persona" && (
        <div className="space-y-6">
          {/* Voice agents fleet — five visible cards per desktop page */}
          <div className="ag-agent-fleet-shell space-y-3">
            <div className="relative">
              {agentFleetPageCount > 1 && (
                <button
                  type="button"
                  aria-label="Previous agents"
                  onClick={() =>
                    setAgentFleetPage((page) => Math.max(0, page - 1))
                  }
                  disabled={safeAgentFleetPage === 0}
                  className="ag-agent-fleet-nav ag-agent-fleet-nav-left"
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
              )}
              <div className="grid grid-cols-3 gap-2 md:grid-cols-5">
                {pagedVoiceAgents.map((agent) => {
                  const isEditing = agent.id === draft.id;
                  const isOutbound = agent.direction === "outbound";
                  return (
                    <div
                      key={agent.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => selectAgentForEditing(agent)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          selectAgentForEditing(agent);
                        }
                      }}
                      className={`ag-agent-fleet-card group min-h-[5.4rem] min-w-0 cursor-pointer rounded-2xl border px-2.5 py-2.5 text-left transition-all ${
                        isEditing
                          ? "border-[#ff9f43] bg-[#fff5eb] text-[#232f3e] shadow-[0_16px_34px_rgba(255,85,39,0.12)] ring-2 ring-[#ffd6af]"
                          : "border-[#eee2d2] bg-[#fbfaf4] text-[#232f3e] hover:border-[#ffb26b] hover:bg-white"
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[9px] font-black uppercase ${
                            isOutbound
                              ? "bg-indigo-100 text-indigo-700"
                              : "bg-slate-200 text-[#566274]"
                          }`}
                        >
                          {agent.direction === "outbound" ? "O" : "I"}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-black leading-tight text-slate-900">
                            <MarqueeText>{agent.name}</MarqueeText>
                          </p>
                          <p className="mt-0.5 truncate text-[8px] font-medium uppercase tracking-[0.18em] text-[#7a8493]">
                            {isEditing ? "Editing" : agent.direction}
                          </p>
                        </div>
                      </div>
                      <div
                        className="mt-1.5 flex items-center justify-between gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            void openAgentModal(getDisplayAgent(agent))
                          }
                          className="text-[9px] font-medium uppercase tracking-[0.18em] text-[#7a8493] transition hover:text-amber-700"
                        >
                          Details
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setDeleteConfirmAgent(getDisplayAgent(agent))
                          }
                          disabled={org.voiceAgents.length <= 1}
                          className="text-[9px] font-medium uppercase tracking-[0.18em] text-red-300 transition hover:text-red-500 disabled:opacity-30"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {agentFleetPageCount > 1 && (
                <button
                  type="button"
                  aria-label="Next agents"
                  onClick={() =>
                    setAgentFleetPage((page) =>
                      Math.min(agentFleetPageCount - 1, page + 1),
                    )
                  }
                  disabled={safeAgentFleetPage >= agentFleetPageCount - 1}
                  className="ag-agent-fleet-nav ag-agent-fleet-nav-right"
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              )}
            </div>

            {agentFleetPageCount > 1 && (
              <div className="ag-agent-page-indicator">
                <span>
                  {agentFleetRangeStart}-{agentFleetRangeEnd} of{" "}
                  {visibleVoiceAgents.length} agents
                </span>
                <span className="ag-agent-page-dots">
                  {Array.from({ length: agentFleetPageCount }).map(
                    (_, index) => (
                      <button
                        key={index}
                        type="button"
                        aria-label={`Agent page ${index + 1}`}
                        onClick={() => setAgentFleetPage(index)}
                        className={`ag-agent-page-dot ${index === safeAgentFleetPage ? "ag-agent-page-dot-active" : ""}`}
                      />
                    ),
                  )}
                </span>
              </div>
            )}
          </div>

          {/* Left: identity fields */}
          <div className="ag-identity-language-card w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-card space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h3 className="text-base font-medium text-[#0F172A] flex items-center gap-2.5">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.35"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-[#F59E0B]"
                  >
                    <path d="M20 21a8 8 0 0 0-16 0" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  Identity & Language
                  {hasUnsavedChanges ? (
                    <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-amber-700 ring-1 ring-amber-100">
                      Unsaved
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-emerald-700 ring-1 ring-emerald-100">
                      Active
                    </span>
                  )}
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={discardUnsavedChanges}
                  disabled={
                    !hasUnsavedChanges || busy === "save-agent-settings"
                  }
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[10px] font-medium uppercase tracking-[0.14em] text-[#475569] transition-all hover:border-slate-300 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={() => void saveAllAgentChanges()}
                  disabled={
                    !hasUnsavedChanges || busy === "save-agent-settings"
                  }
                  className="rounded-xl bg-[#F59E0B] px-4 py-2 text-[10px] font-medium uppercase tracking-[0.14em] text-white transition-all hover:bg-[#d97706] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy === "save-agent-settings" ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <Label>Agent Name</Label>
                <Inp
                  value={draft.name}
                  onChange={(e) => updateDraftField("name", e.target.value)}
                />
              </div>
              <div>
                <Label>Direction</Label>
                <Sel
                  value={draft.direction}
                  onChange={(e) =>
                    updateDraftField(
                      "direction",
                      e.target.value as AgentConfig["direction"],
                    )
                  }
                >
                  <option value="inbound">Inbound</option>
                  <option value="outbound">Outbound</option>
                </Sel>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <Label>Voice Provider</Label>
                <Sel
                  value={voiceProvider}
                  onChange={(e) =>
                    setVoiceProvider(e.target.value as VoiceProvider)
                  }
                  disabled={voiceConfigLoading}
                >
                  <option value="openai">OpenAI</option>
                  <option value="elevenlabs">ElevenLabs</option>
                </Sel>
              </div>

              {voiceProvider === "openai" ? (
                <div className="col-span-2 sm:col-span-1">
                  <Label>OpenAI Voice</Label>
                  <Sel
                    value={openAiVoiceId}
                    onChange={(e) => setOpenAiVoiceId(e.target.value)}
                    disabled={voiceConfigLoading || openAiVoices.length === 0}
                  >
                    {openAiVoices.length === 0 && (
                      <option value="">No OpenAI voices loaded</option>
                    )}
                    {openAiVoices.map((voice) => (
                      <option key={voice.voice_id} value={voice.voice_id}>
                        {voice.name}
                      </option>
                    ))}
                  </Sel>
                  <p className="text-[10px] text-[#7a8493] mt-1">
                    OpenAI remains available as the fallback provider.
                  </p>
                </div>
              ) : (
                <div className="col-span-2 sm:col-span-1">
                  <Label>ElevenLabs Voice</Label>
                  <Sel
                    value={selectedElevenLabsVoiceId}
                    onChange={(e) =>
                      void handleElevenLabsVoiceChange(e.target.value)
                    }
                    disabled={
                      voiceConfigLoading || elevenLabsVoices.length === 0
                    }
                  >
                    <option value="">
                      {elevenLabsVoices.length
                        ? "Select a voice"
                        : "No voices loaded"}
                    </option>
                    {elevenLabsVoices.map((voice) => (
                      <option key={voice.voice_id} value={voice.voice_id}>
                        {voice.name}
                        {voice.category ? ` · ${voice.category}` : ""}
                      </option>
                    ))}
                  </Sel>
                </div>
              )}

              <div>
                <Label>Language</Label>
                <Sel
                  value={draft.language}
                  onChange={(e) =>
                    updateDraftField(
                      "language",
                      e.target.value as AgentConfig["language"],
                    )
                  }
                >
                  {LANGUAGES.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </Sel>
              </div>
              <div>
                <Label>Assigned Number</Label>
                <div className="flex min-w-0 items-center gap-2">
                  <div className="min-w-0 flex-1 px-4 py-2.5 rounded-xl border border-slate-100 bg-slate-50 font-medium text-sm text-[#687386] flex items-center gap-2">
                    <span className="text-base shrink-0">📱</span>
                    <span className="truncate">
                      {draft.twilioPhoneNumber || "Not assigned"}
                    </span>
                  </div>
                  {draft.twilioPhoneNumber && (
                    <button
                      onClick={() => {
                        window.requestAnimationFrame(() => {
                          window.location.hash = "#/phone-numbers";
                        });
                      }}
                      className="shrink-0 whitespace-nowrap rounded-xl border border-amber-200 text-amber-700 px-3 py-2 text-[10px] font-medium uppercase tracking-[0.18em] hover:bg-amber-50 hover:border-amber-300 transition-all"
                    >
                      Manage
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-[#7a8493] mt-1">
                  {draft.twilioPhoneNumber
                    ? "Manage or unassign this number in Phone Numbers."
                    : "Assign a number in the Phone Numbers section."}
                </p>
              </div>
            </div>

            <div className="ag-voice-engine-card space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-[#232f3e]">
                    Voice Engine Settings
                  </p>
                  <p className="text-xs text-[#7a8493] mt-0.5">
                    Tune how the agent sounds on live calls without changing its
                    script or assigned Knowledge Base.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => void previewVoice()}
                    disabled={
                      voicePreviewing ||
                      voiceConfigLoading ||
                      (voiceProvider === "elevenlabs" &&
                        !selectedElevenLabsVoiceId)
                    }
                    className="rounded-xl border border-slate-200 bg-white text-slate-700 px-4 py-2 text-[10px] font-medium uppercase tracking-[0.18em] hover:border-amber-300 hover:text-amber-700 disabled:opacity-40 transition-all"
                  >
                    {voicePreviewing ? "Listening…" : "Listen to Voice"}
                  </button>
                  <button
                    onClick={() => void saveVoiceConfig()}
                    disabled={
                      voiceConfigSaving ||
                      voiceConfigLoading ||
                      (voiceProvider === "elevenlabs" &&
                        !selectedElevenLabsVoiceId)
                    }
                    className="rounded-xl bg-slate-900 text-white px-4 py-2 text-[10px] font-medium uppercase tracking-[0.18em] hover:bg-amber-600 disabled:opacity-40 transition-all"
                  >
                    {voiceConfigSaving ? "Saving…" : "Save Voice"}
                  </button>
                </div>
              </div>

              <div className="ag-definition-row">
                <div className="ag-definition-tile">
                  <span>Voice</span>
                  <p>
                    Choose the provider and voice identity callers will hear.
                  </p>
                </div>
                <div className="ag-definition-tile">
                  <span>Tuning</span>
                  <p>
                    Adjust stability, speed, style, and similarity for natural
                    delivery.
                  </p>
                </div>
                <div className="ag-definition-tile">
                  <span>Guardrail</span>
                  <p>
                    Keep the agent grounded to its assigned Knowledge Base only.
                  </p>
                </div>
              </div>

              {voiceProvider === "elevenlabs" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    {
                      key: "stability",
                      label: "Stability",
                      min: 0,
                      max: 1,
                      step: 0.01,
                      fallback: DEFAULT_ELEVENLABS_SETTINGS.stability,
                    },
                    {
                      key: "similarity_boost",
                      label: "Similarity Boost",
                      min: 0,
                      max: 1,
                      step: 0.01,
                      fallback: DEFAULT_ELEVENLABS_SETTINGS.similarity_boost,
                    },
                    {
                      key: "style",
                      label: "Style",
                      min: 0,
                      max: 1,
                      step: 0.01,
                      fallback: DEFAULT_ELEVENLABS_SETTINGS.style,
                    },
                    {
                      key: "speed",
                      label: "Speed",
                      min: 0.7,
                      max: 1.2,
                      step: 0.01,
                      fallback: DEFAULT_ELEVENLABS_SETTINGS.speed,
                    },
                  ].map((control) => {
                    const key = control.key as keyof VoiceSettings;
                    const value = toSliderValue(
                      voiceSettings[key] as number | undefined,
                      control.fallback,
                    );
                    const progress = toSliderProgress(
                      value,
                      control.min,
                      control.max,
                    );
                    return (
                      <div key={control.key} className="ag-voice-control-row">
                        <div className="flex items-center justify-between mb-2">
                          <Label>{control.label}</Label>
                          <span className="text-[10px] font-black text-[#687386]">
                            {value.toFixed(2)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={control.min}
                          max={control.max}
                          step={control.step}
                          value={value}
                          onChange={(e) =>
                            updateVoiceSetting(
                              key,
                              Number(e.target.value) as never,
                            )
                          }
                          className="ag-range-slider"
                          style={
                            {
                              "--ag-range-progress": `${progress}%`,
                            } as React.CSSProperties
                          }
                        />
                      </div>
                    );
                  })}
                  <div className="md:col-span-2 flex items-center justify-between rounded-2xl bg-[#fffaf1] px-4 py-3 ring-1 ring-[#f2e2cf]">
                    <div>
                      <p className="text-sm font-medium text-[#232f3e]">
                        Speaker Boost
                      </p>
                      <p className="text-xs text-[#7a8493]">
                        Improve similarity and clarity when supported.
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        updateVoiceSetting(
                          "use_speaker_boost",
                          !voiceSettings.use_speaker_boost,
                        )
                      }
                      className={`w-11 h-6 rounded-full relative transition-all flex items-center px-0.5 ${voiceSettings.use_speaker_boost ? "bg-amber-500" : "bg-slate-200"}`}
                    >
                      <div
                        className={`w-5 h-5 bg-white rounded-full shadow-sm transition-all ${voiceSettings.use_speaker_boost ? "translate-x-5" : "translate-x-0"}`}
                      />
                    </button>
                  </div>
                </div>
              )}

              <div className="ag-knowledge-engine-strip">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#ff5527] text-white shadow-[0_12px_26px_rgba(255,85,39,0.18)]">
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
                        <path d="M8 7h8" />
                        <path d="M8 11h6" />
                      </svg>
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-[#232f3e]">
                          Knowledge guardrail
                        </p>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] ${knowledgeEnabled ? "bg-[#ff5527]/10 text-[#b94820]" : "bg-slate-100 text-[#687386]"}`}
                        >
                          {knowledgeEnabled ? "Enabled" : "Disabled"}
                        </span>
                      </div>
                      <p className="mt-1 max-w-xl text-xs leading-5 text-[#7a8493]">
                        Select exactly which Knowledge Base this agent can use.
                        No fallback to other sources.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void toggleKnowledgeBase()}
                    disabled={knowledgeSaving}
                    className={`relative flex h-7 w-12 shrink-0 items-center rounded-full px-0.5 transition-all disabled:opacity-50 ${knowledgeEnabled ? "bg-[#ff5527]" : "bg-slate-200"}`}
                    aria-label="Toggle knowledge base"
                  >
                    <span
                      className={`h-6 w-6 rounded-full bg-white shadow-sm transition-all ${knowledgeEnabled ? "translate-x-5" : "translate-x-0"}`}
                    />
                  </button>
                </div>

                <div className="ag-knowledge-select-wrap mt-4">
                  {knowledgeBases.length > 0 ? (
                    <div className="grid min-w-0 gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                      <select
                        value={currentKnowledgeBase?.id || ""}
                        onChange={(event) =>
                          void assignDraftKnowledgeBase(event.target.value)
                        }
                        disabled={
                          busy === "assign-knowledge-base" ||
                          !onAssignKnowledgeBase
                        }
                        className="min-w-0 rounded-2xl border-0 bg-white px-4 py-3 text-sm font-medium text-[#232f3e] outline-none focus:ring-2 focus:ring-[#ff5527]/15"
                        aria-label="Selected knowledge base"
                      >
                        <option value="">No Knowledge Base assigned</option>
                        {knowledgeBases.map((kb) => (
                          <option key={kb.id} value={kb.id}>
                            {kb.name ||
                              kb.businessName ||
                              kb.domain ||
                              "Untitled knowledge base"}
                          </option>
                        ))}
                      </select>
                      <Link
                        to="/knowledge-bases"
                        className="rounded-2xl bg-[#232f3e] px-4 py-3 text-center text-[10px] font-medium uppercase tracking-[0.18em] text-white transition hover:bg-[#ff5527]"
                      >
                        Manage
                      </Link>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs font-medium text-[#687386]">
                        Create a Knowledge Base first, then assign it here.
                      </p>
                      <Link
                        to="/knowledge-bases"
                        className="rounded-2xl bg-[#232f3e] px-4 py-3 text-center text-[10px] font-medium uppercase tracking-[0.18em] text-white transition hover:bg-[#ff5527]"
                      >
                        Create Knowledge Base
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div>
              <Label>Greeting Message</Label>
              <BufferedTextarea
                rows={2}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white font-medium text-sm outline-none focus:ring-2 focus:ring-amber-400 transition-all resize-none"
                value={draft.greeting}
                onBufferedChange={(value, options) =>
                  updateDraftFieldBuffered("greeting", value, options)
                }
              />
            </div>

            <div className="ag-prompt-purpose-card space-y-5">
              <div>
                <h3 className="text-sm font-medium leading-tight text-[#0F172A]">
                  Prompt & Call Purpose
                </h3>
                <p className="mt-1 text-xs leading-5 text-[#94a3b8]">
                  Set the behavioral framework and objective for every call.
                </p>
              </div>

              <div>
                <Label>
                  Agent Prompt{" "}
                  <span className="normal-case tracking-normal font-normal text-[#94a3b8]">
                    (optional)
                  </span>
                </Label>
                <textarea
                  rows={1}
                  className="ag-textarea-premium ag-prompt-single-line"
                  placeholder="Describe how this agent should behave, what it should prioritize, and what it should avoid."
                  value={getAgentPrompt()}
                  onChange={(e) =>
                    updateDraftRuleText("agentPrompt", e.target.value)
                  }
                />
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div>
                  <Label>Default Call Purpose</Label>
                  <textarea
                    rows={2}
                    className="ag-textarea-premium"
                    placeholder="Example: Confirm interest, answer questions, and book a follow-up appointment."
                    value={getDefaultCallPurpose()}
                    onChange={(e) =>
                      updateDraftRuleText("defaultCallPurpose", e.target.value)
                    }
                  />
                </div>
                <div>
                  <Label>
                    Default Call Instructions{" "}
                    <span className="normal-case tracking-normal font-normal text-[#94a3b8]">
                      (optional)
                    </span>
                  </Label>
                  <textarea
                    rows={2}
                    className="ag-textarea-premium"
                    placeholder="Add any extra calling rules, qualification notes, or handoff instructions."
                    value={getCallInstructions()}
                    onChange={(e) =>
                      updateDraftRuleText("callInstructions", e.target.value)
                    }
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-4">
                {[
                  { mode: "call-now", label: "Call Now" },
                  { mode: "schedule", label: "Schedule" },
                ].map((item) => (
                  <button
                    key={item.mode}
                    type="button"
                    onClick={() =>
                      void openCallCampaignComposer(
                        item.mode as "call-now" | "schedule",
                      )
                    }
                    className="rounded-full border border-slate-200 bg-white px-5 py-2 text-[10px] font-medium uppercase tracking-[0.14em] text-[#475569] transition-all hover:border-amber-300 hover:text-amber-700"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label>Communication Tone</Label>
              <div className="grid grid-cols-3 gap-2">
                {TONES.map((t) => (
                  <button
                    key={t}
                    onClick={() => updateDraftField("tone", t)}
                    className={`py-2.5 rounded-xl border-2 text-xs font-black transition-all ${draft.tone === t ? "border-amber-400 bg-amber-50 text-amber-700" : "border-slate-100 text-[#687386] bg-slate-50 hover:border-slate-200"}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════ KNOWLEDGE TAB */}
      {tab === "knowledge" && (
        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-600">
                  Agent assignment
                </p>
                <h3 className="mt-1 text-lg font-medium text-[#232f3e]">
                  Assign this agent's approved knowledge source
                </h3>
                <p className="mt-1 max-w-2xl text-xs font-semibold leading-relaxed text-[#687386]">
                  Sources, FAQs, products, policies, and scraped content stay
                  isolated inside the selected knowledge base.
                </p>
              </div>
              <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto lg:items-center">
                {knowledgeBases.length > 0 ? (
                  <select
                    value={currentKnowledgeBase?.id || ""}
                    onChange={(event) =>
                      void assignDraftKnowledgeBase(event.target.value)
                    }
                    disabled={
                      busy === "assign-knowledge-base" || !onAssignKnowledgeBase
                    }
                    className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-700 outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100 sm:min-w-72"
                  >
                    <option value="">No Knowledge Base assigned</option>
                    {knowledgeBases.map((kb) => (
                      <option key={kb.id} value={kb.id}>
                        {kb.name ||
                          kb.businessName ||
                          kb.domain ||
                          "Untitled knowledge base"}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-xs font-bold text-[#687386]">
                    Create a knowledge base before assigning this agent.
                  </div>
                )}
                <Link
                  to="/knowledge-bases"
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-center text-[10px] font-medium uppercase tracking-[0.18em] text-[#566274] transition hover:border-amber-200 hover:text-amber-700"
                >
                  Manage
                </Link>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-3xl border border-slate-200 shadow-card p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-base font-medium text-[#232f3e]">
                  FAQ Knowledge Entries
                </h3>
                <p className="text-xs text-[#7a8493] mt-0.5">
                  Q&A pairs the AI uses to answer callers.
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => void saveAllAgentChanges()}
                  disabled={
                    !hasUnsavedChanges || busy === "save-agent-settings"
                  }
                  className="rounded-xl bg-slate-900 px-3 py-2 text-[10px] font-medium uppercase tracking-[0.18em] text-white transition-all hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy === "save-agent-settings" ? "Saving…" : "Save"}
                </button>
                <button
                  onClick={() => void syncFaqsWithoutPageReload()}
                  disabled={busy === "sync" || !currentKnowledgeBase}
                  className="rounded-xl border border-slate-200 text-[#566274] px-3 py-2 text-[10px] font-medium uppercase tracking-[0.18em] hover:border-amber-300 hover:text-amber-700 transition-all flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy === "sync" ? "Syncing…" : "Regenerate"}
                </button>
                <button
                  onClick={addLocalFaq}
                  disabled={!currentKnowledgeBase}
                  className="rounded-xl bg-slate-900 text-white px-3 py-2 text-[10px] font-medium uppercase tracking-[0.18em] hover:bg-slate-800 transition-all disabled:cursor-not-allowed disabled:opacity-40"
                >
                  + Add
                </button>
              </div>
            </div>
            {faqLoadError ? (
              <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-xs font-medium text-red-600">
                {faqLoadError}
              </div>
            ) : null}
            {draft.faqs.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-slate-200 py-8 text-center">
                <p className="text-2xl mb-2">💡</p>
                <p className="text-sm font-bold text-[#7a8493]">
                  {faqLoading
                    ? "Loading assigned FAQs..."
                    : "No FAQ entries yet."}
                </p>
                <p className="text-xs text-slate-300 mt-1">
                  {currentKnowledgeBase
                    ? "Click + Add or regenerate from the assigned Knowledge Base."
                    : "Assign a Knowledge Base to this agent first."}
                </p>
              </div>
            ) : (
              <div className="max-h-[36rem] space-y-3 overflow-y-auto pr-1 custom-scrollbar">
                {draft.faqs.map((faq, i) => (
                  <div
                    key={faq.id}
                    className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition-all hover:border-amber-200 hover:bg-amber-50/20 sm:p-4"
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[10px] font-black text-[#687386]">
                          {i + 1}
                        </span>
                        <p className="truncate text-[10px] font-medium uppercase tracking-[0.18em] text-[#687386]">
                          FAQ knowledge entry
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeLocalFaq(faq.id)}
                        className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[9px] font-medium uppercase tracking-[0.18em] text-[#7a8493] transition-all hover:border-red-200 hover:text-red-500"
                      >
                        Remove
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)]">
                      <label className="block">
                        <span className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-[#7a8493]">
                          <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-amber-50 text-[9px] text-amber-700">
                            Q
                          </span>
                          Question
                        </span>
                        <textarea
                          rows={2}
                          value={faq.question}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              faqs: d.faqs.map((f) =>
                                f.id === faq.id
                                  ? { ...f, question: e.target.value }
                                  : f,
                              ),
                            }))
                          }
                          placeholder="e.g. What are your business hours?"
                          className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold outline-none transition-all focus:border-amber-300 focus:bg-white focus:ring-2 focus:ring-amber-200"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-[#7a8493]">
                          <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-emerald-50 text-[9px] text-emerald-700">
                            A
                          </span>
                          Answer
                        </span>
                        <textarea
                          rows={2}
                          value={faq.answer}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              faqs: d.faqs.map((f) =>
                                f.id === faq.id
                                  ? { ...f, answer: e.target.value }
                                  : f,
                              ),
                            }))
                          }
                          placeholder="Give the exact answer your agent should use."
                          className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium outline-none transition-all focus:border-amber-300 focus:bg-white focus:ring-2 focus:ring-amber-200"
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════ RULES TAB */}
      {tab === "rules" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-card p-5 sm:p-6 space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-medium text-[#232f3e]">
                  Routing & Behaviour
                </h3>
                <p className="mt-1 text-xs text-[#7a8493]">
                  Control lead capture, booking, escalation, voicemail, and
                  screening behavior.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void saveAllAgentChanges()}
                disabled={!hasUnsavedChanges || busy === "save-agent-settings"}
                className="rounded-xl bg-slate-900 px-4 py-2.5 text-[10px] font-medium uppercase tracking-[0.18em] text-white transition-all hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy === "save-agent-settings" ? "Saving…" : "Save"}
              </button>
            </div>
            {(
              [
                {
                  key: "captureAllLeads",
                  label: "Lead Capture",
                  desc: "Always collect caller name, phone & reason",
                },
                {
                  key: "autoBook",
                  label: "Booking Engine",
                  desc: "Allow callers to schedule appointments",
                },
                {
                  key: "autoEscalate",
                  label: "Auto Escalation",
                  desc: "Only suggest an escalation manager for extreme or unresolved matters",
                },
              ] as {
                key: keyof AgentConfig["rules"];
                label: string;
                desc: string;
              }[]
            ).map((r) => (
              <div
                key={r.key}
                className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100 hover:border-slate-200 transition-all"
              >
                <div>
                  <p className="text-sm font-medium text-[#232f3e]">
                    {r.label}
                  </p>
                  <p className="text-[11px] text-[#7a8493] mt-0.5">{r.desc}</p>
                </div>
                <button
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      rules: {
                        ...current.rules,
                        [r.key]: !current.rules[r.key],
                      },
                    }))
                  }
                  className={`w-11 h-6 rounded-full relative transition-all flex items-center px-0.5 ${draft.rules[r.key] ? "bg-amber-500" : "bg-slate-200"}`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full shadow-sm transition-all ${draft.rules[r.key] ? "translate-x-5" : "translate-x-0"}`}
                  />
                </button>
              </div>
            ))}
            <div className="rounded-3xl border border-amber-100 bg-amber-50/40 p-5 space-y-4">
              <div>
                <p className="text-sm font-medium text-[#232f3e]">
                  Voicemail Handling
                </p>
                <p className="text-xs text-[#687386] mt-0.5">
                  Decide what this specific agent should do when voicemail is
                  detected.
                </p>
              </div>
              <div>
                <Label>When voicemail is detected</Label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {VOICEMAIL_ACTION_OPTIONS.map((option) => {
                    const currentVoicemail = readAgentVoicemailSettings(draft);
                    const active = currentVoicemail.action === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          updateDraftVoicemailSettings({ action: option.value })
                        }
                        className={`rounded-2xl border px-4 py-3 text-left transition-all ${active ? "border-amber-300 bg-white shadow-sm" : "border-slate-200 bg-white/70 hover:border-amber-200"}`}
                      >
                        <p className="text-xs font-medium text-[#232f3e]">
                          {active ? "✓ " : ""}
                          {option.label}
                        </p>
                        <p className="mt-1 text-[11px] leading-relaxed text-[#687386]">
                          {option.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {readAgentVoicemailSettings(draft).action === "leave_message" && (
                <div>
                  <Label>Voicemail Message</Label>
                  <textarea
                    rows={3}
                    value={readAgentVoicemailSettings(draft).message}
                    onChange={(e) =>
                      updateDraftVoicemailSettings({ message: e.target.value })
                    }
                    placeholder="Example: Hello, this is {{agent_name}} from {{business_name}}. I am calling about {{call_purpose}}. Please call us back at {{callback_number}}."
                    className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 outline-none transition-all focus:border-amber-300 focus:ring-2 focus:ring-amber-200"
                  />
                  <p className="mt-2 text-[11px] text-[#687386]">
                    Supported tokens: {"{{agent_name}}"}, {"{{business_name}}"},{" "}
                    {"{{call_purpose}}"}, {"{{callback_number}}"}.
                  </p>
                </div>
              )}

              {readAgentVoicemailSettings(draft).action ===
                "callback_later" && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Callback Delay Minutes</Label>
                    <Inp
                      type="number"
                      min={5}
                      max={10080}
                      value={
                        readAgentVoicemailSettings(draft).callbackDelayMinutes
                      }
                      onChange={(e) =>
                        updateDraftVoicemailSettings({
                          callbackDelayMinutes: Number(e.target.value) || 60,
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label>Max Redial Attempts</Label>
                    <Inp
                      type="number"
                      min={0}
                      max={10}
                      value={
                        readAgentVoicemailSettings(draft).maxRedialAttempts
                      }
                      onChange={(e) =>
                        updateDraftVoicemailSettings({
                          maxRedialAttempts: Number(e.target.value) || 1,
                        })
                      }
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-sky-100 bg-sky-50/40 p-5 space-y-4">
              <div
                className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
                data-tour="agent-escalation"
              >
                <div>
                  <p className="text-sm font-medium text-[#232f3e]">
                    Call Screening Assistants
                  </p>
                  <p className="mt-0.5 text-xs text-[#687386]">
                    Let this agent answer carrier or phone-screening prompts
                    before the real recipient joins.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateDraftCallScreeningSettings({
                      enabled: !readAgentCallScreeningSettings(draft).enabled,
                    })
                  }
                  className={`shrink-0 rounded-full px-4 py-2 text-xs font-black transition-all ${readAgentCallScreeningSettings(draft).enabled ? "bg-slate-900 text-white" : "bg-white text-[#687386] border border-slate-200"}`}
                >
                  {readAgentCallScreeningSettings(draft).enabled
                    ? "Enabled"
                    : "Disabled"}
                </button>
              </div>

              {readAgentCallScreeningSettings(draft).enabled && (
                <>
                  <label className="flex items-start gap-3 rounded-2xl border border-white/80 bg-white/80 p-4">
                    <input
                      type="checkbox"
                      checked={
                        readAgentCallScreeningSettings(draft)
                          .allowPurposeDisclosure
                      }
                      onChange={(e) =>
                        updateDraftCallScreeningSettings({
                          allowPurposeDisclosure: e.target.checked,
                        })
                      }
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-amber-500 focus:ring-amber-300"
                    />
                    <span>
                      <span className="block text-xs font-medium text-[#232f3e]">
                        State the call purpose when screened
                      </span>
                      <span className="block text-[11px] leading-relaxed text-[#687386]">
                        The agent will briefly state its name, organization, and
                        reason for calling, then wait to be connected.
                      </span>
                    </span>
                  </label>

                  <div>
                    <Label>Optional custom screening response</Label>
                    <textarea
                      rows={3}
                      value={
                        readAgentCallScreeningSettings(draft).responseMessage
                      }
                      onChange={(e) =>
                        updateDraftCallScreeningSettings({
                          responseMessage: e.target.value,
                        })
                      }
                      placeholder="Leave blank to let Agently generate a short name, organization, and call-purpose response."
                      className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 outline-none transition-all focus:border-amber-300 focus:ring-2 focus:ring-amber-200"
                    />
                  </div>
                </>
              )}
            </div>

            <div>
              <Label>Escalation Phone Number</Label>
              <Inp
                type="tel"
                placeholder="+1 (555) 000-0000"
                value={draft.escalationPhone}
                onChange={(e) =>
                  updateDraftField("escalationPhone", e.target.value)
                }
              />
            </div>
            <div>
              <Label>Escalation Manager Working Hours</Label>
              <Inp
                placeholder="Mon-Fri 9AM-6PM for human escalation only"
                value={draft.businessHours ?? ""}
                onChange={(e) =>
                  updateDraftField("businessHours", e.target.value)
                }
              />
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-card p-5 sm:p-6">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-medium text-[#232f3e]">
                  Data Capture Fields
                </h3>
                <p className="mt-1 text-xs text-[#7a8493]">
                  Select the caller details this agent should collect before
                  finishing the call.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void saveAllAgentChanges()}
                disabled={!hasUnsavedChanges || busy === "save-agent-settings"}
                className="rounded-xl bg-slate-900 px-4 py-2.5 text-[10px] font-medium uppercase tracking-[0.18em] text-white transition-all hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy === "save-agent-settings" ? "Saving…" : "Save"}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {["name", "phone", "email", "reason", "budget", "timeline"].map(
                (field) => {
                  const active = (draft.dataCaptureFields || []).includes(
                    field,
                  );
                  return (
                    <button
                      key={field}
                      onClick={() => {
                        const next = active
                          ? (draft.dataCaptureFields || []).filter(
                              (f) => f !== field,
                            )
                          : [...(draft.dataCaptureFields || []), field];
                        setDraft((d) => ({ ...d, dataCaptureFields: next }));
                      }}
                      className={`rounded-full border-2 px-4 py-1.5 text-[11px] font-medium uppercase tracking-[0.16em] transition-all ${active ? "border-amber-400 bg-amber-50 text-amber-700" : "border-slate-200 text-[#7a8493] hover:border-slate-300"}`}
                    >
                      {active && "✓ "}
                      {field}
                    </button>
                  );
                },
              )}
            </div>
            <p className="text-xs text-[#7a8493] mt-4">
              These fields are requested from callers before ending the call.
            </p>
          </div>
        </div>
      )}

      {deleteConfirmAgent && (
        <AppModal
          open
          onClose={() => setDeleteConfirmAgent(null)}
          title="Delete voice agent?"
          description="This action removes the agent from your workspace. Please confirm before continuing."
          size="sm"
          footer={
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setDeleteConfirmAgent(null)}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-[#566274] transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const agent = deleteConfirmAgent;
                  if (!agent) return;
                  setDeleteConfirmAgent(null);
                  void run(
                    `del-${agent.id}`,
                    () => onDeleteVoiceAgent(agent.id),
                    "Deleted",
                  );
                }}
                className="rounded-2xl bg-red-600 px-4 py-3 text-sm font-black text-white transition hover:bg-red-700"
              >
                Confirm deletion
              </button>
            </div>
          }
        >
          <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-4">
            <p className="text-sm font-bold text-red-700">
              You are about to delete{" "}
              <span className="font-black">{deleteConfirmAgent.name}</span>.
            </p>
            <p className="mt-1 text-xs leading-relaxed text-red-600">
              Connected settings and call setup for this agent may no longer be
              available after deletion.
            </p>
          </div>
        </AppModal>
      )}

      {saveModal && (
        <AppModal
          open
          onClose={() => setSaveModal(null)}
          title={saveModal.title}
          description={
            saveModal.ok
              ? "Your latest action completed successfully."
              : "Please review the message below and try again."
          }
          size="sm"
          footer={
            <button
              type="button"
              onClick={() => setSaveModal(null)}
              className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white hover:bg-amber-600"
            >
              Done
            </button>
          }
        >
          <div
            className={`rounded-2xl border px-4 py-4 text-sm font-bold ${saveModal.ok ? "border-emerald-100 bg-emerald-50 text-emerald-700" : "border-red-100 bg-red-50 text-red-700"}`}
          >
            {saveModal.message}
          </div>
        </AppModal>
      )}

      {/* ═══════════════════════════════════════════════ AGENT DETAIL MODAL */}
      {selectedAgent && (
        <AppModal
          open
          onClose={() => setSelectedAgent(null)}
          title={selectedAgent.name}
          description={`${selectedAgent.direction} agent · ${getAgentVoiceDisplay(selectedAgent)} voice · ${selectedAgent.twilioPhoneNumber || "No number assigned"}`}
          size="lg"
          footer={
            <button
              onClick={() => setSelectedAgent(null)}
              className="w-full rounded-xl border border-slate-200 py-3 text-sm font-black text-[#566274] hover:bg-slate-50"
            >
              Close
            </button>
          }
        >
          <div className="space-y-5">
            {/* Agent info grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#7a8493] mb-1">
                  Direction
                </p>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em]
                    ${selectedAgent.direction === "outbound" ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-[#566274]"}`}
                  >
                    {selectedAgent.direction}
                  </span>
                </div>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#7a8493] mb-1">
                  Phone number
                </p>
                <p className="text-sm font-medium text-[#232f3e]">
                  {selectedAgent.twilioPhoneNumber || "—"}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#7a8493] mb-1">
                  Voice
                </p>
                <p className="text-sm font-medium text-[#232f3e]">
                  {selectedAgentVoiceLoading
                    ? "Loading saved voice..."
                    : getAgentVoiceDisplay(selectedAgent)}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#7a8493] mb-1">
                  Language
                </p>
                <p className="text-sm font-medium text-[#232f3e]">
                  {selectedAgent.language}
                </p>
              </div>
            </div>

            {/* Greeting */}
            {selectedAgent.greeting && (
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#7a8493] mb-1.5">
                  Greeting
                </p>
                <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700 italic">
                  "{selectedAgent.greeting}"
                </p>
              </div>
            )}

            {(getDefaultCallPurpose(selectedAgent) ||
              getAgentPrompt(selectedAgent) ||
              getCallInstructions(selectedAgent)) && (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {getDefaultCallPurpose(selectedAgent) && (
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">
                    <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#7a8493] mb-1.5">
                      Default call purpose
                    </p>
                    <p className="text-sm text-slate-700">
                      {getDefaultCallPurpose(selectedAgent)}
                    </p>
                  </div>
                )}
                {getCallInstructions(selectedAgent) && (
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">
                    <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#7a8493] mb-1.5">
                      Call instructions
                    </p>
                    <p className="text-sm text-slate-700">
                      {getCallInstructions(selectedAgent)}
                    </p>
                  </div>
                )}
                {getAgentPrompt(selectedAgent) && (
                  <div className="rounded-2xl bg-slate-50 px-4 py-3 lg:col-span-2">
                    <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#7a8493] mb-1.5">
                      Agent prompt
                    </p>
                    <p className="text-sm text-slate-700">
                      {getAgentPrompt(selectedAgent)}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Assigned schedules */}
            <div>
              <div
                className="flex items-center justify-between mb-3"
                data-tour="agent-call-now"
              >
                <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#7a8493]">
                  Call Campaigns
                </p>
                {!loadingSchedules && (
                  <span
                    className={`rounded-full px-3 py-1 text-[9px] font-medium uppercase tracking-[0.18em]
                    ${
                      agentSchedules.length > 0
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-[#687386]"
                    }`}
                  >
                    {agentSchedules.length > 0
                      ? `${agentSchedules.length} assigned`
                      : "Not assigned"}
                  </span>
                )}
              </div>

              {loadingSchedules ? (
                <div className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-4">
                  <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                  <p className="text-sm text-[#7a8493]">Loading schedules…</p>
                </div>
              ) : agentSchedules.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-slate-200 px-4 py-6 text-center">
                  <p className="text-2xl mb-2">📅</p>
                  <p className="text-sm font-bold text-[#7a8493]">
                    No call campaigns assigned
                  </p>
                  <p className="text-xs text-slate-300 mt-1">
                    Go to Lead CRM → Tag collections → Create Campaign to assign
                    this agent.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {agentSchedules.map((sch) => {
                    const prog = getCampaignProgress(sch);
                    return (
                      <div
                        key={sch.id}
                        className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4"
                      >
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div>
                            <p className="font-medium text-[#232f3e] text-sm">
                              {sch.name || `Tag · ${sch.tag}`}
                            </p>
                            <p className="text-xs text-[#7a8493]">
                              {sch.targetType === "tag"
                                ? `Tag: #${sch.tag}`
                                : `Lead schedule`}
                              {(sch as any).startDate &&
                                ` · ${(sch as any).startDate} → ${(sch as any).endDate || "?"}`}
                            </p>
                            <p className="text-xs text-[#7a8493]">
                              {formatTimezoneOptionLabel(sch.timezone)}
                            </p>
                            <p className="text-xs text-[#687386] mt-1">
                              {sch.windows
                                .map(
                                  (w) => `${w.weekdays.join(", ")} @ ${w.time}`,
                                )
                                .join(" · ")}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-medium uppercase tracking-[0.18em]
                            ${sch.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-[#7a8493]"}`}
                          >
                            {sch.isActive ? "Active" : "Paused"}
                          </span>
                        </div>
                        {prog && (
                          <div>
                            <div className="flex justify-between text-[10px] font-black mb-1">
                              {prog.isComplete ? (
                                <span className="text-emerald-600">
                                  ✓ Campaign complete
                                </span>
                              ) : (
                                <span className="text-[#687386]">
                                  {prog.completed} of {prog.total} calls reached
                                </span>
                              )}
                              <span className="text-[#7a8493]">
                                {prog.remaining} remaining
                              </span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full bg-amber-500 transition-all"
                                style={{ width: `${prog.pct}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </AppModal>
      )}
    </div>
  );
};

export default AgentSettings;
