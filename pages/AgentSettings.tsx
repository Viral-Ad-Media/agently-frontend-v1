import React, { useEffect, useRef, useState } from "react";
import {
  Organization,
  AgentConfig,
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
const AGENT_FLEET_VIEW_STORAGE_KEY = "agently:agentFleetViewMode";
const LEGACY_AGENT_FLEET_VIEW_STORAGE_KEYS = ["agently:agent-fleet-view"];
const SELECTED_AGENT_STORAGE_KEY = "agently:lastSelectedAgentId";
const LEGACY_SELECTED_AGENT_STORAGE_KEYS = [
  "agently:selected-agent-id",
  "agently:selected-voice-agent-id",
];

const readLocalStorageValue = (
  primaryKey: string,
  legacyKeys: string[] = [],
) => {
  if (typeof window === "undefined") return null;
  return (
    window.localStorage.getItem(primaryKey) ||
    legacyKeys
      .map((key) => window.localStorage.getItem(key))
      .find((value) => Boolean(value)) ||
    null
  );
};

const writeLocalStorageValue = (
  primaryKey: string,
  value: string,
  legacyKeys: string[] = [],
) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(primaryKey, value);
  legacyKeys.forEach((key) => window.localStorage.setItem(key, value));
};

const DEFAULT_VOICE_PREVIEW_TEXT =
  "Hello, this is a voice preview from Agently.";
const DEFAULT_ELEVENLABS_SETTINGS: Required<VoiceSettings> = {
  stability: 0.65,
  similarity_boost: 0.8,
  style: 0.15,
  speed: 0.92,
  use_speaker_boost: true,
};

const toSliderValue = (value: number | undefined, fallback: number) =>
  Number.isFinite(value) ? Number(value) : fallback;

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

const buildAudioSource = (result: {
  blob?: Blob;
  audioUrl?: string;
  audioBase64?: string;
  mimeType?: string;
}) => {
  if (result.blob)
    return { url: URL.createObjectURL(result.blob), isObjectUrl: true };
  if (result.audioBase64) {
    const mimeType = result.mimeType || "audio/mpeg";
    return {
      url: `data:${mimeType};base64,${result.audioBase64}`,
      isObjectUrl: false,
    };
  }
  if (result.audioUrl) return { url: result.audioUrl, isObjectUrl: false };
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
const Label = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
    {children}
  </p>
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
  const [agentFleetView, setAgentFleetView] = useState<"grid" | "list">(() => {
    if (typeof window === "undefined") return "grid";
    const savedView = readLocalStorageValue(
      AGENT_FLEET_VIEW_STORAGE_KEY,
      LEGACY_AGENT_FLEET_VIEW_STORAGE_KEYS,
    );
    return savedView === "list" ? "list" : "grid";
  });
  const [agentFleetPage, setAgentFleetPage] = useState(0);

  useEffect(() => {
    const rememberedAgentId = readLocalStorageValue(
      SELECTED_AGENT_STORAGE_KEY,
      LEGACY_SELECTED_AGENT_STORAGE_KEYS,
    );
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
    writeLocalStorageValue(
      AGENT_FLEET_VIEW_STORAGE_KEY,
      agentFleetView,
      LEGACY_AGENT_FLEET_VIEW_STORAGE_KEYS,
    );
  }, [agentFleetView]);

  useEffect(() => {
    if (draft.id) {
      writeLocalStorageValue(
        SELECTED_AGENT_STORAGE_KEY,
        draft.id,
        LEGACY_SELECTED_AGENT_STORAGE_KEYS,
      );
    }
  }, [draft.id]);

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
  }, [org.agent.id]);

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
      if (activeVoiceAudioRef.current) {
        activeVoiceAudioRef.current.pause();
        activeVoiceAudioRef.current.src = "";
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

    if (activeVoiceAudioRef.current) {
      activeVoiceAudioRef.current.pause();
      activeVoiceAudioRef.current.src = "";
      activeVoiceAudioRef.current = null;
    }
    if (activeVoiceObjectUrlRef.current) {
      URL.revokeObjectURL(activeVoiceObjectUrlRef.current);
      activeVoiceObjectUrlRef.current = null;
    }

    setVoicePreviewing(true);
    try {
      const result =
        currentProvider === "elevenlabs"
          ? await voiceCallsApi.previewVoice({
              text: DEFAULT_VOICE_PREVIEW_TEXT,
              returnJson: true,
              provider: "elevenlabs",
              voice_provider: "elevenlabs",
              voice_id: currentElevenLabsVoiceId,
              voiceId: currentElevenLabsVoiceId,
              elevenlabs_voice_id: currentElevenLabsVoiceId,
              elevenlabs_voice_name: currentElevenLabsVoiceName,
              model: currentElevenLabsVoice?.modelId || undefined,
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
        showToast(
          "The backend returned audio for a different ElevenLabs voice. Please try again.",
          false,
        );
        return;
      }

      const audioSource = buildAudioSource(result);
      if (!audioSource) {
        showToast(
          "Listen to voice returned no playable audio. Expected audioBase64, audio URL, or audio file.",
          false,
        );
        return;
      }

      if (audioSource.isObjectUrl)
        activeVoiceObjectUrlRef.current = audioSource.url;
      const audio = new Audio(audioSource.url);
      activeVoiceAudioRef.current = audio;
      audio.onended = () => {
        if (activeVoiceObjectUrlRef.current) {
          URL.revokeObjectURL(activeVoiceObjectUrlRef.current);
          activeVoiceObjectUrlRef.current = null;
        }
        activeVoiceAudioRef.current = null;
      };
      audio.onerror = () => {
        showToast(
          "The selected voice audio could not be played by the browser.",
          false,
        );
      };
      await audio.play();
      showToast("Playing selected voice.");
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : "Listen to voice failed.",
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
    ] as const;

    fields.forEach((field) => {
      if (
        normalizeComparable(currentDraft[field]) !==
        normalizeComparable(baseline[field])
      ) {
        updates[field] = currentDraft[field] as never;
      }
    });

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

  const normalizeRules = (
    rules: Partial<AgentConfig["rules"]> | undefined,
  ): AgentConfig["rules"] => ({
    autoBook: rules?.autoBook ?? false,
    autoEscalate: rules?.autoEscalate ?? true,
    captureAllLeads: rules?.captureAllLeads ?? true,
  });

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
  const AGENT_FLEET_PAGE_SIZE = 6;
  const agentFleetPageCount = Math.max(
    1,
    Math.ceil(visibleVoiceAgents.length / AGENT_FLEET_PAGE_SIZE),
  );
  const safeAgentFleetPage = Math.min(agentFleetPage, agentFleetPageCount - 1);
  const pagedVoiceAgents =
    agentFleetView === "grid"
      ? visibleVoiceAgents.slice(
          safeAgentFleetPage * AGENT_FLEET_PAGE_SIZE,
          safeAgentFleetPage * AGENT_FLEET_PAGE_SIZE + AGENT_FLEET_PAGE_SIZE,
        )
      : visibleVoiceAgents;

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
    writeLocalStorageValue(
      SELECTED_AGENT_STORAGE_KEY,
      target.id,
      LEGACY_SELECTED_AGENT_STORAGE_KEYS,
    );
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
    setBusy("sync");
    try {
      const syncedFaqs = await api.syncFaqs(
        scrapeUrl || org.profile.website,
        draftRef.current.id,
      );
      setDraft((d) => ({ ...d, faqs: syncedFaqs }));
      setSavedAgentBaseline((base) => ({ ...base, faqs: syncedFaqs }));
      setDeletedFaqIds([]);
      showToast("FAQs regenerated");
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
      return true;
    }

    if (!options.silent) setBusy("save-agent-settings");

    try {
      if (hasObjectKeys(agentUpdates as Record<string, unknown>)) {
        await api.updateVoiceAgent(currentDraft.id, agentUpdates);
      }

      if (hasObjectKeys(ruleUpdates as Record<string, unknown>)) {
        await api.updateVoiceAgent(currentDraft.id, {
          rules: {
            ...normalizeRules(baseline.rules),
            ...ruleUpdates,
          },
        });
      }

      for (const faqId of removedFaqIds) {
        await api.removeFaq(faqId, currentDraft.id);
      }

      const createdFaqs: FAQ[] = [];
      for (const faq of faqChanges.newFaqs) {
        const created = await api.createFaq(
          faq.question,
          faq.answer,
          currentDraft.id,
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

      if (options.showModal) {
        setSaveModal({
          title: "Changes saved",
          message: "Your agent settings have been saved successfully.",
          ok: true,
        });
      }
      return true;
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
      return false;
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
      const saved = await persistAgentChanges({ silent: true });
      if (!saved) {
        setSaveModal({
          title: "Save failed",
          message:
            "Agently could not save this agent yet, so the call campaign was not opened. Please save the agent changes and try again.",
          ok: false,
        });
        return;
      }
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
      label: "Knowledge",
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
    knowledgeBases.find((kb) => kb.isPrimary) ||
    knowledgeBases[0] ||
    null;

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
      `${draft.name} now uses ${nextBase?.businessName || nextBase?.name || "the selected business knowledge base"}.`,
    );
  };

  return (
    <div className="animate-fade-up space-y-6">
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
              <p className="text-sm font-black text-slate-900">
                {busy === "save-agent-settings" ? "Saving…" : "Creating…"}
              </p>
              <p className="text-xs font-medium text-slate-400">
                This should only take a moment.
              </p>
            </div>
          </div>
        </AppModal>
      )}

      {/* ── Header + tab switcher ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900">Agent Settings</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure how your AI receptionist behaves
          </p>
        </div>
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl self-start sm:self-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${tab === t.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════ PERSONA TAB */}
      {tab === "persona" && (
        <div className="space-y-6">
          {/* Voice agents fleet — clickable cards */}
          <div className="w-full bg-white rounded-3xl border border-slate-200 shadow-card p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  Voice Agent Fleet
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Every agent is active. Click an agent to edit its
                  customization.
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1">
                  <button
                    type="button"
                    aria-label="Grid view"
                    title="Grid view"
                    onClick={() => {
                      setAgentFleetView("grid");
                      setAgentFleetPage(0);
                    }}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all ${agentFleetView === "grid" ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-700"}`}
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
                    >
                      <rect x="3" y="3" width="7" height="7" rx="1.5" />
                      <rect x="14" y="3" width="7" height="7" rx="1.5" />
                      <rect x="3" y="14" width="7" height="7" rx="1.5" />
                      <rect x="14" y="14" width="7" height="7" rx="1.5" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    aria-label="List view"
                    title="List view"
                    onClick={() => setAgentFleetView("list")}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all ${agentFleetView === "list" ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-700"}`}
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
                    >
                      <line x1="8" y1="6" x2="21" y2="6" />
                      <line x1="8" y1="12" x2="21" y2="12" />
                      <line x1="8" y1="18" x2="21" y2="18" />
                      <circle cx="4" cy="6" r="1" />
                      <circle cx="4" cy="12" r="1" />
                      <circle cx="4" cy="18" r="1" />
                    </svg>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => void openCallCampaignComposer("call-now")}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 text-white px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-amber-600 transition-all"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.32 1.77.59 2.61a2 2 0 0 1-.45 2.11L8 9.69a16 16 0 0 0 6.31 6.31l1.25-1.25a2 2 0 0 1 2.11-.45c.84.27 1.71.47 2.61.59A2 2 0 0 1 22 16.92z" />
                  </svg>
                  Start Call
                </button>
                <button
                  onClick={() =>
                    void run(
                      "create-in",
                      () => onCreateVoiceAgent({ direction: "inbound" }),
                      "Agent created",
                    )
                  }
                  className="rounded-xl bg-slate-900 text-white px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all"
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
                  className="rounded-xl border border-slate-200 text-slate-600 px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:border-amber-300 hover:text-amber-700 transition-all"
                >
                  + Outbound
                </button>
              </div>
            </div>
            <div className="relative">
              {agentFleetView === "grid" ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
                          className={`group flex h-20 min-w-0 cursor-pointer items-center gap-3 rounded-2xl border px-3 text-left transition-all ${
                            isEditing
                              ? "border-amber-300 bg-amber-50 text-slate-900 shadow-sm ring-2 ring-amber-100"
                              : "border-slate-200 bg-slate-50 text-slate-700 hover:border-amber-200 hover:bg-white"
                          }`}
                        >
                          <span
                            className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-xs font-black uppercase ${
                              isOutbound
                                ? "bg-indigo-100 text-indigo-700"
                                : "bg-slate-200 text-slate-600"
                            }`}
                          >
                            {agent.direction === "outbound" ? "O" : "I"}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-black leading-tight">
                              {agent.name}
                            </span>
                            <span className="mt-1 block text-[9px] font-black uppercase tracking-widest text-slate-400">
                              {isEditing ? "Editing" : agent.direction}
                            </span>
                          </span>
                          <div
                            className="flex shrink-0 items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                void openAgentModal(getDisplayAgent(agent))
                              }
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-amber-200 hover:text-amber-700"
                              aria-label={`View ${agent.name} details`}
                              title="Details"
                            >
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.4"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="16" x2="12" y2="12" />
                                <line x1="12" y1="8" x2="12.01" y2="8" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setDeleteConfirmAgent(getDisplayAgent(agent))
                              }
                              disabled={org.voiceAgents.length <= 1}
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 transition hover:border-red-200 hover:text-red-500 disabled:opacity-30"
                              aria-label={`Delete ${agent.name}`}
                              title="Delete"
                            >
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.4"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                <path d="M10 11v6" />
                                <path d="M14 11v6" />
                                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {agentFleetPageCount > 1 && (
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2">
                      <button
                        type="button"
                        aria-label="Previous agents"
                        onClick={() =>
                          setAgentFleetPage((page) => Math.max(0, page - 1))
                        }
                        disabled={safeAgentFleetPage === 0}
                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-amber-200 hover:text-amber-700 disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        <svg
                          width="16"
                          height="16"
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
                      <div className="flex items-center gap-1.5">
                        {Array.from({ length: agentFleetPageCount }).map(
                          (_, index) => (
                            <button
                              key={index}
                              type="button"
                              aria-label={`Agent page ${index + 1}`}
                              onClick={() => setAgentFleetPage(index)}
                              className={`h-2 rounded-full transition-all ${index === safeAgentFleetPage ? "w-6 bg-amber-500" : "w-2 bg-slate-300 hover:bg-slate-400"}`}
                            />
                          ),
                        )}
                      </div>
                      <button
                        type="button"
                        aria-label="Next agents"
                        onClick={() =>
                          setAgentFleetPage((page) =>
                            Math.min(agentFleetPageCount - 1, page + 1),
                          )
                        }
                        disabled={safeAgentFleetPage >= agentFleetPageCount - 1}
                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-amber-200 hover:text-amber-700 disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        <svg
                          width="16"
                          height="16"
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
                    </div>
                  )}
                </div>
              ) : (
                <div className="max-h-[19rem] space-y-2 overflow-y-auto pr-1 custom-scrollbar">
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
                        className={`group flex h-16 min-w-0 cursor-pointer items-center gap-3 rounded-2xl border px-3 text-left transition-all ${
                          isEditing
                            ? "border-amber-300 bg-amber-50 text-slate-900 shadow-sm ring-2 ring-amber-100"
                            : "border-slate-200 bg-slate-50 text-slate-700 hover:border-amber-200 hover:bg-white"
                        }`}
                      >
                        <span
                          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-black uppercase ${
                            isOutbound
                              ? "bg-indigo-100 text-indigo-700"
                              : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {agent.direction === "outbound" ? "O" : "I"}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-black leading-tight">
                            {agent.name}
                          </span>
                          <span className="block text-[9px] font-black uppercase tracking-widest text-slate-400">
                            {isEditing ? "Editing" : agent.direction}
                          </span>
                        </span>
                        <div
                          className="flex shrink-0 items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              void openAgentModal(getDisplayAgent(agent))
                            }
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-amber-200 hover:text-amber-700"
                            aria-label={`View ${agent.name} details`}
                            title="Details"
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.4"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <circle cx="12" cy="12" r="10" />
                              <line x1="12" y1="16" x2="12" y2="12" />
                              <line x1="12" y1="8" x2="12.01" y2="8" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setDeleteConfirmAgent(getDisplayAgent(agent))
                            }
                            disabled={org.voiceAgents.length <= 1}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 transition hover:border-red-200 hover:text-red-500 disabled:opacity-30"
                            aria-label={`Delete ${agent.name}`}
                            title="Delete"
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.4"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                              <path d="M10 11v6" />
                              <path d="M14 11v6" />
                              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Left: identity fields */}
          <div className="w-full bg-white rounded-3xl border border-slate-200 shadow-card p-6 space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-amber-500"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 8v4l3 3" />
                  </svg>
                  Identity & Language
                </h3>
                <div className="mt-2">
                  {hasUnsavedChanges ? (
                    <span className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-amber-700 ring-1 ring-amber-100">
                      Unsaved changes
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-700 ring-1 ring-emerald-100">
                      Saved
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={discardUnsavedChanges}
                  disabled={
                    !hasUnsavedChanges || busy === "save-agent-settings"
                  }
                  className="rounded-xl border border-slate-200 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 transition-all hover:border-slate-300 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={() => void saveAllAgentChanges()}
                  disabled={
                    !hasUnsavedChanges || busy === "save-agent-settings"
                  }
                  className="rounded-xl bg-slate-900 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-40"
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
                  <p className="text-[10px] text-slate-400 mt-1">
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
                  <div className="min-w-0 flex-1 px-4 py-2.5 rounded-xl border border-slate-100 bg-slate-50 font-medium text-sm text-slate-500 flex items-center gap-2">
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
                      className="shrink-0 whitespace-nowrap rounded-xl border border-amber-200 text-amber-700 px-3 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-amber-50 hover:border-amber-300 transition-all"
                    >
                      Manage
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  {draft.twilioPhoneNumber
                    ? "Manage or unassign this number in Phone Numbers."
                    : "Assign a number in the Phone Numbers section."}
                </p>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-amber-50/40 p-5 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-slate-900">
                    Voice Engine Settings
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Save the provider and listen to the selected voice before
                    using this agent in calls.
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
                    className="rounded-xl border border-slate-200 bg-white text-slate-700 px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:border-amber-300 hover:text-amber-700 disabled:opacity-40 transition-all"
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
                    className="rounded-xl bg-slate-900 text-white px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-amber-600 disabled:opacity-40 transition-all"
                  >
                    {voiceConfigSaving ? "Saving…" : "Save Voice"}
                  </button>
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
                    return (
                      <div
                        key={control.key}
                        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <Label>{control.label}</Label>
                          <span className="text-[10px] font-black text-slate-500">
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
                          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-gradient-to-r from-slate-200 via-amber-200 to-amber-500 accent-amber-500 outline-none"
                        />
                      </div>
                    );
                  })}
                  <div className="md:col-span-2 flex items-center justify-between rounded-xl bg-white border border-slate-200 px-4 py-3">
                    <div>
                      <p className="text-sm font-black text-slate-900">
                        Speaker Boost
                      </p>
                      <p className="text-xs text-slate-400">
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

              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-sm font-black text-slate-900">
                      Business Knowledge Base
                    </p>
                    <p className="text-xs text-slate-400">
                      This agent only answers from the selected business source.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <select
                      value={currentKnowledgeBase?.id || ""}
                      onChange={(event) =>
                        void assignDraftKnowledgeBase(event.target.value)
                      }
                      disabled={
                        !knowledgeBases.length ||
                        busy === "assign-knowledge-base" ||
                        !onAssignKnowledgeBase
                      }
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-700 outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100 sm:w-72"
                    >
                      {knowledgeBases.length === 0 ? (
                        <option value="">
                          No business knowledge bases yet
                        </option>
                      ) : (
                        knowledgeBases.map((kb) => (
                          <option key={kb.id} value={kb.id}>
                            {kb.businessName || kb.name}
                          </option>
                        ))
                      )}
                    </select>
                    <a
                      href="#/knowledge-bases"
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-center text-[10px] font-black uppercase tracking-widest text-slate-600 transition hover:border-amber-200 hover:text-amber-700"
                    >
                      Manage
                    </a>
                  </div>
                </div>
                {currentKnowledgeBase && (
                  <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500">
                    Current business:{" "}
                    <span className="font-black text-slate-800">
                      {currentKnowledgeBase.businessName ||
                        currentKnowledgeBase.name}
                    </span>
                    {currentKnowledgeBase.domain
                      ? ` • ${currentKnowledgeBase.domain}`
                      : ""}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between rounded-xl bg-white border border-slate-200 px-4 py-3">
                <div>
                  <p className="text-sm font-black text-slate-900">
                    Use Knowledge Base
                  </p>
                  <p className="text-xs text-slate-400">
                    Let this voice agent answer from connected FAQs and
                    knowledge chunks.
                  </p>
                </div>
                <button
                  onClick={() => void toggleKnowledgeBase()}
                  disabled={knowledgeSaving}
                  className={`w-11 h-6 rounded-full relative transition-all flex items-center px-0.5 disabled:opacity-50 ${knowledgeEnabled ? "bg-amber-500" : "bg-slate-200"}`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full shadow-sm transition-all ${knowledgeEnabled ? "translate-x-5" : "translate-x-0"}`}
                  />
                </button>
              </div>
            </div>

            <div>
              <Label>Greeting Message</Label>
              <textarea
                rows={2}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white font-medium text-sm outline-none focus:ring-2 focus:ring-amber-400 transition-all resize-none"
                value={draft.greeting}
                onChange={(e) => updateDraftField("greeting", e.target.value)}
              />
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-5 space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-black text-slate-900">
                    Prompt & Call Purpose
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Keep the agent instructions and default call goal in the
                    same workspace.
                  </p>
                </div>
              </div>

              <div>
                <Label>Agent Prompt</Label>
                <textarea
                  rows={4}
                  className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 outline-none transition-all focus:ring-2 focus:ring-amber-400"
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
                    rows={3}
                    className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 outline-none transition-all focus:ring-2 focus:ring-amber-400"
                    placeholder="Example: Confirm interest, answer questions, and book a follow-up appointment."
                    value={getDefaultCallPurpose()}
                    onChange={(e) =>
                      updateDraftRuleText("defaultCallPurpose", e.target.value)
                    }
                  />
                </div>
                <div>
                  <Label>Default Call Instructions</Label>
                  <textarea
                    rows={3}
                    className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 outline-none transition-all focus:ring-2 focus:ring-amber-400"
                    placeholder="Add any extra calling rules, qualification notes, or handoff instructions."
                    value={getCallInstructions()}
                    onChange={(e) =>
                      updateDraftRuleText("callInstructions", e.target.value)
                    }
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
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
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 transition-all hover:border-amber-300 hover:text-amber-700"
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
                    className={`py-2.5 rounded-xl border-2 text-xs font-black transition-all ${draft.tone === t ? "border-amber-400 bg-amber-50 text-amber-700" : "border-slate-100 text-slate-500 bg-slate-50 hover:border-slate-200"}`}
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
          <div className="bg-white rounded-3xl border border-slate-200 shadow-card p-6">
            <div className="flex items-start justify-between mb-5">
              <div>
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-amber-500"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.35-4.35" />
                  </svg>
                  Website Scraper
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Fetch your site's content and save it to the knowledge base.
                </p>
              </div>
              {scrapeStatus === "done" && (
                <span className="shrink-0 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 text-[10px] font-black uppercase tracking-widest">
                  {chunks} chunks saved
                </span>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="flex-1 relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">
                  https://
                </span>
                <input
                  type="text"
                  value={scrapeUrl}
                  onChange={(e) => setScrapeUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void handleScrape()}
                  placeholder="yourwebsite.com"
                  className="w-full pl-[4.5rem] pr-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-medium outline-none focus:ring-2 focus:ring-amber-400 focus:bg-white transition-all"
                />
              </div>
              <button
                onClick={handleScrape}
                disabled={!scrapeUrl.trim() || scrapeStatus === "loading"}
                className="shrink-0 rounded-2xl bg-slate-900 text-white px-5 py-3 text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 disabled:opacity-40 flex items-center gap-2 transition-all active:scale-95"
              >
                {scrapeStatus === "loading" ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Scraping…
                  </>
                ) : (
                  "Import Website"
                )}
              </button>
            </div>
            {scrapeResult && (
              <div
                className={`rounded-2xl px-4 py-3 text-xs font-medium ${scrapeStatus === "error" ? "bg-red-50 text-red-600 border border-red-100" : "bg-emerald-50 text-emerald-700 border border-emerald-100"}`}
              >
                {scrapeResult}
              </div>
            )}
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-card p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  FAQ Knowledge Entries
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
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
                  className="rounded-xl bg-slate-900 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy === "save-agent-settings" ? "Saving…" : "Save Changes"}
                </button>
                <button
                  onClick={() => void syncFaqsWithoutPageReload()}
                  disabled={busy === "sync"}
                  className="rounded-xl border border-slate-200 text-slate-600 px-3 py-2 text-[10px] font-black uppercase tracking-widest hover:border-amber-300 hover:text-amber-700 transition-all flex items-center gap-1.5"
                >
                  {busy === "sync" ? "Syncing…" : "Regenerate"}
                </button>
                <button
                  onClick={addLocalFaq}
                  className="rounded-xl bg-slate-900 text-white px-3 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all"
                >
                  + Add
                </button>
              </div>
            </div>
            {draft.faqs.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-slate-200 py-8 text-center">
                <p className="text-2xl mb-2">💡</p>
                <p className="text-sm font-bold text-slate-400">
                  No FAQ entries yet.
                </p>
                <p className="text-xs text-slate-300 mt-1">
                  Import a website or click + Add.
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
                        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[10px] font-black text-slate-500">
                          {i + 1}
                        </span>
                        <p className="truncate text-[10px] font-black uppercase tracking-widest text-slate-500">
                          FAQ knowledge entry
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeLocalFaq(faq.id)}
                        className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400 transition-all hover:border-red-200 hover:text-red-500"
                      >
                        Remove
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)]">
                      <label className="block">
                        <span className="mb-1.5 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400">
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
                        <span className="mb-1.5 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400">
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
          <div className="bg-white rounded-3xl border border-slate-200 shadow-card p-6 space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  Routing & Behaviour
                </h3>
                <p className="mt-0.5 text-xs text-slate-400">
                  Control booking, escalation, and lead-capture behavior.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void saveAllAgentChanges()}
                disabled={!hasUnsavedChanges || busy === "save-agent-settings"}
                className="shrink-0 rounded-xl bg-slate-900 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy === "save-agent-settings" ? "Saving…" : "Save Changes"}
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
                  desc: "Forward to human on complex queries",
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
                  <p className="text-sm font-black text-slate-900">{r.label}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{r.desc}</p>
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
              <Label>Business Hours</Label>
              <Inp
                placeholder="Mon-Fri 9AM-6PM"
                value={draft.businessHours ?? ""}
                onChange={(e) =>
                  updateDraftField("businessHours", e.target.value)
                }
              />
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-card p-6">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  Data Capture Fields
                </h3>
                <p className="mt-0.5 text-xs text-slate-400">
                  Choose the details this agent should collect from callers.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void saveAllAgentChanges()}
                disabled={!hasUnsavedChanges || busy === "save-agent-settings"}
                className="shrink-0 rounded-xl bg-slate-900 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy === "save-agent-settings" ? "Saving…" : "Save Changes"}
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
                      className={`rounded-full border-2 px-4 py-1.5 text-[11px] font-black uppercase tracking-wider transition-all ${active ? "border-amber-400 bg-amber-50 text-amber-700" : "border-slate-200 text-slate-400 hover:border-slate-300"}`}
                    >
                      {active && "✓ "}
                      {field}
                    </button>
                  );
                },
              )}
            </div>
            <p className="text-xs text-slate-400 mt-4">
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
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-600 transition hover:bg-slate-50"
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
              className="w-full rounded-xl border border-slate-200 py-3 text-sm font-black text-slate-600 hover:bg-slate-50"
            >
              Close
            </button>
          }
        >
          <div className="space-y-5">
            {/* Agent info grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                  Direction
                </p>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest
                    ${selectedAgent.direction === "outbound" ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-600"}`}
                  >
                    {selectedAgent.direction}
                  </span>
                </div>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                  Phone number
                </p>
                <p className="text-sm font-black text-slate-900">
                  {selectedAgent.twilioPhoneNumber || "—"}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                  Voice
                </p>
                <p className="text-sm font-black text-slate-900">
                  {selectedAgentVoiceLoading
                    ? "Loading saved voice..."
                    : getAgentVoiceDisplay(selectedAgent)}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                  Language
                </p>
                <p className="text-sm font-black text-slate-900">
                  {selectedAgent.language}
                </p>
              </div>
            </div>

            {/* Greeting */}
            {selectedAgent.greeting && (
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
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
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                      Default call purpose
                    </p>
                    <p className="text-sm text-slate-700">
                      {getDefaultCallPurpose(selectedAgent)}
                    </p>
                  </div>
                )}
                {getCallInstructions(selectedAgent) && (
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                      Call instructions
                    </p>
                    <p className="text-sm text-slate-700">
                      {getCallInstructions(selectedAgent)}
                    </p>
                  </div>
                )}
                {getAgentPrompt(selectedAgent) && (
                  <div className="rounded-2xl bg-slate-50 px-4 py-3 lg:col-span-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
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
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Call Campaigns
                </p>
                {!loadingSchedules && (
                  <span
                    className={`rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-widest
                    ${
                      agentSchedules.length > 0
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
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
                  <p className="text-sm text-slate-400">Loading schedules…</p>
                </div>
              ) : agentSchedules.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-slate-200 px-4 py-6 text-center">
                  <p className="text-2xl mb-2">📅</p>
                  <p className="text-sm font-bold text-slate-400">
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
                            <p className="font-black text-slate-900 text-sm">
                              {sch.name || `Tag · ${sch.tag}`}
                            </p>
                            <p className="text-xs text-slate-400">
                              {sch.targetType === "tag"
                                ? `Tag: #${sch.tag}`
                                : `Lead schedule`}
                              {(sch as any).startDate &&
                                ` · ${(sch as any).startDate} → ${(sch as any).endDate || "?"}`}
                            </p>
                            <p className="text-xs text-slate-400">
                              {formatTimezoneOptionLabel(sch.timezone)}
                            </p>
                            <p className="text-xs text-slate-500 mt-1">
                              {sch.windows
                                .map(
                                  (w) => `${w.weekdays.join(", ")} @ ${w.time}`,
                                )
                                .join(" · ")}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-widest
                            ${sch.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}`}
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
                                <span className="text-slate-500">
                                  {prog.completed} of {prog.total} calls reached
                                </span>
                              )}
                              <span className="text-slate-400">
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
