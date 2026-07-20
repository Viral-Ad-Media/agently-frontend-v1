import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChatMessage,
  ChatbotConfig,
  KnowledgeBase,
  Organization,
} from "../types";
import { api } from "../services/api";
import AppModal from "../components/AppModal";

interface MessengerProps {
  org: Organization;
  messages: ChatMessage[];
  onSendMessage: (message: string, chatbotId?: string) => Promise<ChatMessage>;
  onResetConversation: (chatbotId?: string) => Promise<void>;
  onCreateChatbot: () => Promise<void>;
  onUpdateChatbot: (
    chatbotId: string,
    updates: Partial<ChatbotConfig>,
  ) => Promise<void>;
  onImportChatbotFaqs: (chatbotId: string, website: string) => Promise<void>;
  onActivateChatbot: (chatbotId: string) => Promise<void>;
  onDeleteChatbot: (chatbotId: string) => Promise<void>;
  knowledgeBases?: KnowledgeBase[];
  onAssignKnowledgeBase?: (
    knowledgeBaseId: string,
    chatbotId: string,
  ) => Promise<void>;
}

const COLOR_PRESETS = [
  "#4f46e5",
  "#7c3aed",
  "#db2777",
  "#dc2626",
  "#ea580c",
  "#d97706",
  "#16a34a",
  "#0891b2",
  "#0284c7",
  "#1e293b",
  "#374151",
  "#065f46",
];

// OpenAI TTS voices (no provider badge)
const OPENAI_VOICES = [
  { id: "alloy", name: "Alloy", desc: "Neutral, balanced" },
  { id: "echo", name: "Echo", desc: "Male, clear" },
  { id: "fable", name: "Fable", desc: "Warm, expressive" },
  { id: "onyx", name: "Onyx", desc: "Deep, authoritative" },
  { id: "nova", name: "Nova", desc: "Female, energetic" },
  { id: "shimmer", name: "Shimmer", desc: "Female, gentle" },
];

const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English", flag: "🇺🇸" },
  { code: "es", name: "Spanish", flag: "🇪🇸" },
  { code: "fr", name: "French", flag: "🇫🇷" },
  { code: "de", name: "German", flag: "🇩🇪" },
  { code: "it", name: "Italian", flag: "🇮🇹" },
  { code: "pt", name: "Portuguese", flag: "🇧🇷" },
  { code: "ar", name: "Arabic", flag: "🇸🇦" },
  { code: "zh", name: "Chinese", flag: "🇨🇳" },
  { code: "ja", name: "Japanese", flag: "🇯🇵" },
  { code: "ko", name: "Korean", flag: "🇰🇷" },
  { code: "hi", name: "Hindi", flag: "🇮🇳" },
  { code: "nl", name: "Dutch", flag: "🇳🇱" },
];

const CHATBOT_AVATAR_PREFIX = "agently-avatar:";
const CHATBOT_AVATAR_UPLOAD_PREFIX = "agently-upload:";

const CHATBOT_PROFILE_AVATARS = [
  { id: "ava-garden", label: "Ava", image: "/chatbot-avatars/ava-garden.jpg" },
  {
    id: "mina-studio",
    label: "Mina",
    image: "/chatbot-avatars/mina-studio.jpg",
  },
  { id: "hao", label: "Hao", image: "/chatbot-avatars/hao.jpg" },
  { id: "jurica", label: "Jurica", image: "/chatbot-avatars/jurica.jpg" },
  { id: "joseph", label: "Joseph", image: "/chatbot-avatars/joseph.jpg" },
  { id: "jake", label: "Jake", image: "/chatbot-avatars/jake.jpg" },
  { id: "diego", label: "Diego", image: "/chatbot-avatars/diego.jpg" },
  { id: "albert", label: "Albert", image: "/chatbot-avatars/albert.jpg" },
  { id: "amara", label: "Amara", image: "/chatbot-avatars/amara.jpg" },
];

const getChatbotAvatarOption = (avatarLabel?: string) => {
  if (!avatarLabel?.startsWith(CHATBOT_AVATAR_PREFIX)) return null;
  const id = avatarLabel.slice(CHATBOT_AVATAR_PREFIX.length);
  return CHATBOT_PROFILE_AVATARS.find((avatar) => avatar.id === id) || null;
};

const getUploadedChatbotAvatarImage = (avatarLabel?: string) => {
  if (!avatarLabel?.startsWith(CHATBOT_AVATAR_UPLOAD_PREFIX)) return "";
  return avatarLabel.slice(CHATBOT_AVATAR_UPLOAD_PREFIX.length);
};

const getChatbotAvatarImage = (avatarLabel?: string) => {
  const uploadedImage = getUploadedChatbotAvatarImage(avatarLabel);
  if (uploadedImage) return uploadedImage;
  return getChatbotAvatarOption(avatarLabel)?.image || "";
};

const hasChatbotAvatarImage = (avatarLabel?: string) =>
  Boolean(getChatbotAvatarImage(avatarLabel));

const compressChatbotAvatarImage = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Unable to read image file."));
    reader.onload = () => {
      const raw = typeof reader.result === "string" ? reader.result : "";
      if (!raw) return reject(new Error("Unable to read image file."));
      const image = new Image();
      image.onerror = () => reject(new Error("Unable to load image."));
      image.onload = () => {
        const maxSide = 256;
        const scale = Math.min(
          1,
          maxSide / Math.max(image.width, image.height),
        );
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx)
          return reject(new Error("Image compression is not available."));
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(image, 0, 0, width, height);
        let output = canvas.toDataURL("image/webp", 0.82);
        if (!output || output.length > 350_000) {
          output = canvas.toDataURL("image/jpeg", 0.78);
        }
        resolve(output);
      };
      image.src = raw;
    };
    reader.readAsDataURL(file);
  });

const getAvatarInitial = (_label?: string, fallbackName?: string) => {
  const source = fallbackName?.trim() || "A";
  return source.slice(0, 1).toUpperCase() || "A";
};

const getAvatarSelectorLabel = (avatarLabel?: string) => {
  if (getUploadedChatbotAvatarImage(avatarLabel)) return "Uploaded image";
  const option = getChatbotAvatarOption(avatarLabel);
  return option ? option.label : "Add image";
};

const ChatbotAvatar: React.FC<{
  avatarLabel?: string;
  fallbackName?: string;
  className?: string;
  textClassName?: string;
}> = ({
  avatarLabel,
  fallbackName,
  className = "h-8 w-8",
  textClassName = "text-[11px]",
}) => {
  const image = getChatbotAvatarImage(avatarLabel);
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-slate-700 ring-1 ring-slate-200 ${className}`}
      aria-hidden="true"
    >
      {image ? (
        <img src={image} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className={`font-semibold leading-none ${textClassName}`}>
          {getAvatarInitial(avatarLabel, fallbackName)}
        </span>
      )}
    </span>
  );
};

const DEFAULT_BOT: ChatbotConfig & {
  chatVoice: string;
  chatLanguages: string[];
} = {
  id: "",
  name: "My Chatbot",
  voiceAgentId: "",
  headerTitle: "Chat with us",
  welcomeMessage: "Hello! How can I help you today?",
  placeholder: "Type your message...",
  launcherLabel: "Chat",
  accentColor: "#4f46e5",
  position: "right",
  avatarLabel: "",
  customPrompt: "",
  suggestedPrompts: [],
  faqs: [],
  embedScript: "",
  widgetScriptUrl: "",
  chatVoice: "alloy",
  chatLanguages: ["en"],
};

const Messenger: React.FC<MessengerProps> = ({
  org,
  messages,
  onSendMessage,
  onResetConversation,
  onCreateChatbot,
  onUpdateChatbot,
  onImportChatbotFaqs,
  onActivateChatbot,
  onDeleteChatbot,
  knowledgeBases = [],
  onAssignKnowledgeBase,
}) => {
  const activeChatbot =
    org.chatbots.find((c) => c.id === org.activeChatbotId) ?? org.chatbots[0];

  // Safe initialization – if activeChatbot is undefined, use DEFAULT_BOT
  const [draft, setDraft] = useState<
    ChatbotConfig & { chatVoice?: string; chatLanguages?: string[] }
  >(() => {
    if (!activeChatbot) return DEFAULT_BOT;
    return {
      ...activeChatbot,
      chatVoice: (activeChatbot as any).chatVoice || "alloy",
      chatLanguages: (activeChatbot as any).chatLanguages || ["en"],
    };
  });

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>(messages);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [copied, setCopied] = useState(false);
  const [scrapeUrl, setScrapeUrl] = useState(org.profile.website || "");
  const [scrapeStatus, setScrapeStatus] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle");
  const [scrapeMsg, setScrapeMsg] = useState("");
  const [chatbotFleetPage, setChatbotFleetPage] = useState(0);
  const [isMobileChatbotFleet, setIsMobileChatbotFleet] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);

  // Voice recording state
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [audioWave, setAudioWave] = useState<number[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const waveAnimRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Voice preview state
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const avatarUploadInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeChatbot) {
      setDraft({
        ...activeChatbot,
        chatVoice: (activeChatbot as any).chatVoice || "alloy",
        chatLanguages: (activeChatbot as any).chatLanguages || ["en"],
      });
    }
  }, [activeChatbot?.id]);

  useEffect(() => {
    setLocalMessages(messages);
  }, [messages]);

  useEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [localMessages, isTyping]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1279px)");
    const update = () => setIsMobileChatbotFleet(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const pageSize = isMobileChatbotFleet ? 3 : 5;
    const pageCount = Math.max(1, Math.ceil(org.chatbots.length / pageSize));
    if (chatbotFleetPage > pageCount - 1) {
      setChatbotFleetPage(Math.max(0, pageCount - 1));
    }
  }, [chatbotFleetPage, isMobileChatbotFleet, org.chatbots.length]);

  useEffect(() => {
    const activeIndex = org.chatbots.findIndex(
      (bot) => bot.id === org.activeChatbotId,
    );
    if (activeIndex < 0) return;
    const pageSize = isMobileChatbotFleet ? 3 : 5;
    setChatbotFleetPage(Math.floor(activeIndex / pageSize));
  }, [isMobileChatbotFleet, org.activeChatbotId, org.chatbots.length]);

  const runAction = useCallback(
    async (key: string, fn: () => Promise<void>) => {
      setBusyAction(key);
      setError("");
      setSaveSuccess("");
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      } finally {
        setBusyAction(null);
      }
    },
    [],
  );

  const patch = (
    updates: Partial<
      ChatbotConfig & { chatVoice?: string; chatLanguages?: string[] }
    >,
  ) => setDraft((d) => ({ ...d, ...updates }));

  const resetDraftAvatarToInitials = useCallback(() => {
    patch({ avatarLabel: "" });
    setAvatarMenuOpen(false);
  }, []);

  const handleChatbotAvatarUpload = useCallback((file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please upload a valid image file.");
      return;
    }
    setError("");
    void compressChatbotAvatarImage(file)
      .then((result) => {
        patch({ avatarLabel: `${CHATBOT_AVATAR_UPLOAD_PREFIX}${result}` });
        setAvatarMenuOpen(false);
      })
      .catch((err) => {
        setError(err?.message || "Unable to prepare this image.");
      });
  }, []);

  const linkedAgentName =
    org.voiceAgents.find((a) => a.id === draft.voiceAgentId)?.name ||
    "AI assistant";

  const buildEmbedScript = (
    chatbot: ChatbotConfig & { chatVoice?: string; chatLanguages?: string[] },
  ) => {
    const backendUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(
      /\/$/,
      "",
    );
    const positionStyle =
      chatbot.position === "left" ? "left:20px" : "right:20px";
    // FIX: embed langs and voice as query params so widget persists language selection
    const langs = (chatbot.chatLanguages || ["en"]).join(",");
    const voice = chatbot.chatVoice || "alloy";
    const widgetSrc = `${backendUrl}/chatbot-widget/${chatbot.id}?langs=${langs}&voice=${encodeURIComponent(voice)}`;
    return `<!-- Agently Chat Widget -->\n<iframe\n  id="agently-widget-${chatbot.id}"\n  src="${widgetSrc}"\n  style="position:fixed;bottom:20px;${positionStyle};width:420px;height:800px;max-width:90vw;max-height:90vh;border:none;background:transparent;z-index:2147483646;overflow:hidden;outline:none;display:block;visibility:visible;pointer-events:auto;"\n  scrolling="no"\n  frameborder="0"\n  allow="microphone"\n  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads allow-storage-access-by-user-activation"\n  referrerpolicy="no-referrer-when-downgrade"\n  loading="eager"\n  onload="console.info('Agently widget iframe loaded')"\n  onerror="this.style.display='none'; console.error('Agently widget iframe failed to load')"\n  title="Chat widget"\n></iframe>`;
  };

  const saveCustomization = async () => {
    await runAction("save", async () => {
      const freshEmbedScript = buildEmbedScript(draft);
      const knowledgeBaseId =
        currentKnowledgeBase?.id || draft.knowledgeBaseId || "";
      if (knowledgeBaseId) {
        const savedFaqs = await api.replaceKnowledgeBaseFaqs(
          knowledgeBaseId,
          draft.faqs || [],
          { chatbotId: activeChatbot.id },
        );
        patch({ faqs: savedFaqs.manualFaqs || [] });
      }
      await api.updateChatbot(activeChatbot.id, {
        name: draft.name,
        voiceAgentId: draft.voiceAgentId,
        knowledgeBaseId,
        headerTitle: draft.headerTitle,
        welcomeMessage: draft.welcomeMessage,
        placeholder: draft.placeholder,
        launcherLabel: draft.launcherLabel,
        accentColor: draft.accentColor,
        position: draft.position,
        avatarLabel: hasChatbotAvatarImage(draft.avatarLabel)
          ? draft.avatarLabel
          : "",
        customPrompt: draft.customPrompt,
        suggestedPrompts: draft.suggestedPrompts,
        // Legacy chatbot.faqs is intentionally cleared when a Knowledge Base is selected.
        // Runtime answers must come from knowledge_base_id-scoped DB FAQs/chunks only.
        faqs: knowledgeBaseId ? [] : draft.faqs,
        embedScript: freshEmbedScript,
        chatVoice: draft.chatVoice,
        chatLanguages: draft.chatLanguages,
      } as any);
      if (knowledgeBaseId && onAssignKnowledgeBase) {
        await onAssignKnowledgeBase(knowledgeBaseId, activeChatbot.id);
      }
      setSaveSuccess("Saved! Knowledge base assignment and FAQs are synced.");
      setSaveModalOpen(true);
    });
  };

  const currentKnowledgeBase =
    knowledgeBases.find((kb) => kb.id === draft.knowledgeBaseId) ||
    knowledgeBases.find((kb) =>
      kb.linkedChatbotIds?.includes(activeChatbot?.id || ""),
    ) ||
    knowledgeBases.find((kb) => kb.isPrimary) ||
    knowledgeBases[0] ||
    null;

  const assignDraftKnowledgeBase = async (knowledgeBaseId: string) => {
    if (!knowledgeBaseId || !activeChatbot?.id) return;
    patch({ knowledgeBaseId, faqs: [] });
    setSaveSuccess(
      "Knowledge Base selected locally. Click Save Changes to apply it.",
    );
  };

  useEffect(() => {
    const knowledgeBaseId = currentKnowledgeBase?.id;
    if (!knowledgeBaseId) return;
    let cancelled = false;
    api
      .listKnowledgeBaseFaqs(knowledgeBaseId)
      .then((result) => {
        if (cancelled) return;
        const kbFaqs = (result.manualFaqs || [])
          .map((faq, index) => ({
            id: String((faq as any).id || `kb-${knowledgeBaseId}-faq-${index}`),
            question: String((faq as any).question || "").trim(),
            answer: String((faq as any).answer || "").trim(),
          }))
          .filter((faq) => faq.question && faq.answer);
        setDraft((current) => ({ ...current, knowledgeBaseId, faqs: kbFaqs }));
      })
      .catch(() => {
        // Keep the current draft editable when the search endpoint is unavailable.
      });
    return () => {
      cancelled = true;
    };
  }, [currentKnowledgeBase?.id]);

  const handleImport = async () => {
    if (!scrapeUrl.trim()) return;
    setScrapeStatus("loading");
    setScrapeMsg("");
    setError("");
    try {
      const result = await api.importChatbotWebsite(
        activeChatbot.id,
        scrapeUrl,
      );
      setScrapeStatus("done");
      setScrapeMsg(
        `✓ Scraped successfully. ${result.chunksStored || 0} chunks stored in knowledge base.`,
      );
    } catch (e) {
      setScrapeStatus("error");
      setScrapeMsg(e instanceof Error ? e.message : "Scrape failed.");
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isTyping) return;
    const text = input;
    const optimistic: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      text,
      timestamp: new Date().toISOString(),
    };
    setLocalMessages((m) => [...m, optimistic]);
    setInput("");
    setIsTyping(true);
    setError("");
    try {
      const reply = await onSendMessage(text, activeChatbot.id);
      setLocalMessages((m) => [...m, reply]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed.");
      setLocalMessages((m) => m.filter((msg) => msg.id !== optimistic.id));
    } finally {
      setIsTyping(false);
    }
  };

  // Voice recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (waveAnimRef.current) {
          clearInterval(waveAnimRef.current);
          waveAnimRef.current = null;
        }
        setAudioWave([]);
        setIsRecording(false);
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const transcribed = await transcribeAudio(blob);
        if (transcribed) {
          setIsVoiceMode(false);
          setInput(transcribed);
        }
      };
      recorder.start(100);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      waveAnimRef.current = setInterval(() => {
        setAudioWave(Array.from({ length: 20 }, () => Math.random() * 32 + 4));
      }, 80);
    } catch {
      setError("Microphone access denied. Please allow microphone access.");
    }
  };

  const stopRecording = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
  };

  const transcribeAudio = async (blob: Blob): Promise<string> => {
    try {
      const formData = new FormData();
      formData.append("audio", blob, "recording.webm");
      const apiBase = (import.meta.env.VITE_API_BASE_URL || "").replace(
        /\/$/,
        "",
      );
      const token =
        localStorage.getItem("agently.auth.token") ||
        sessionStorage.getItem("agently.auth.token") ||
        "";
      const resp = await fetch(`${apiBase}/api/messenger/transcribe`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (resp.ok) {
        const data = await resp.json();
        return data.text || "";
      }
    } catch {}
    return "";
  };

  const previewVoice = async (voiceId: string) => {
    if (previewingVoice === voiceId) {
      previewAudioRef.current?.pause();
      setPreviewingVoice(null);
      return;
    }
    setPreviewingVoice(voiceId);
    try {
      const apiBase = (import.meta.env.VITE_API_BASE_URL || "").replace(
        /\/$/,
        "",
      );
      const token =
        localStorage.getItem("agently.auth.token") ||
        sessionStorage.getItem("agently.auth.token") ||
        "";
      const previewText = `Hello, I'm ${linkedAgentName}. How can I assist you today?`;
      const resp = await fetch(`${apiBase}/api/messenger/voice-preview`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ voice: voiceId, text: previewText }),
      });
      if (resp.ok) {
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        if (previewAudioRef.current) previewAudioRef.current.pause();
        previewAudioRef.current = new Audio(url);
        previewAudioRef.current.onended = () => setPreviewingVoice(null);
        await previewAudioRef.current.play();
      } else {
        setPreviewingVoice(null);
      }
    } catch {
      setPreviewingVoice(null);
    }
  };

  const toggleLanguage = (code: string) => {
    const langs = draft.chatLanguages || ["en"];
    if (langs.includes(code)) {
      if (langs.length === 1) return;
      patch({ chatLanguages: langs.filter((l) => l !== code) });
    } else {
      patch({ chatLanguages: [...langs, code] });
    }
  };

  const addFaq = () =>
    patch({
      faqs: [
        ...draft.faqs,
        {
          id:
            typeof crypto !== "undefined" && crypto.randomUUID
              ? `faq-${crypto.randomUUID()}`
              : `faq-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          question: "",
          answer: "",
        },
      ],
    });
  const updateFaq = (id: string, field: "question" | "answer", val: string) =>
    patch({
      faqs: draft.faqs.map((f) => (f.id === id ? { ...f, [field]: val } : f)),
    });
  const removeFaq = (id: string) => {
    const idx = draft.faqs.findIndex((f) => f.id === id);
    if (idx === -1) return;
    const next = [...draft.faqs.slice(0, idx), ...draft.faqs.slice(idx + 1)];
    patch({ faqs: next });
  };

  const handleCopy = async () => {
    try {
      const scriptToCopy =
        activeChatbot?.embedScript || buildEmbedScript(draft as any);
      await navigator.clipboard.writeText(scriptToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copy failed — please select and copy manually.");
    }
  };

  if (!activeChatbot) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <p className="text-slate-400 font-medium mb-4">No chatbot yet.</p>
        <button
          onClick={() => void runAction("create", onCreateChatbot)}
          className="rounded-2xl bg-[#F59E0B] px-6 py-3 text-xs font-medium text-white transition hover:bg-[#d88a05]"
        >
          + Create Chatbot
        </button>
      </div>
    );
  }

  const previewColor = draft.accentColor || "#4f46e5";
  const chatbotFleetPageSize = isMobileChatbotFleet ? 3 : 5;
  const chatbotFleetPageCount = Math.max(
    1,
    Math.ceil(org.chatbots.length / chatbotFleetPageSize),
  );
  const safeChatbotFleetPage = Math.min(
    chatbotFleetPage,
    chatbotFleetPageCount - 1,
  );
  const pagedChatbots = org.chatbots.slice(
    safeChatbotFleetPage * chatbotFleetPageSize,
    safeChatbotFleetPage * chatbotFleetPageSize + chatbotFleetPageSize,
  );
  const chatbotFleetRangeStart = org.chatbots.length
    ? safeChatbotFleetPage * chatbotFleetPageSize + 1
    : 0;
  const chatbotFleetRangeEnd = Math.min(
    org.chatbots.length,
    safeChatbotFleetPage * chatbotFleetPageSize + pagedChatbots.length,
  );

  return (
    <div className="min-w-0 space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500 sm:space-y-8">
      {/* Chatbot selector */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              void saveCustomization();
            }}
            disabled={busyAction === "save"}
            className="inline-flex min-h-[2.75rem] items-center justify-center rounded-full border border-slate-200 bg-white px-5 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-600 transition hover:border-[#F59E0B] hover:text-[#92400e] disabled:cursor-not-allowed disabled:opacity-50 sm:px-6"
          >
            {busyAction === "save" ? "Saving…" : "Save Changes"}
          </button>
          <button
            onClick={() => void runAction("create", onCreateChatbot)}
            disabled={busyAction === "create"}
            className="inline-flex min-h-[2.75rem] items-center justify-center rounded-full bg-[#F59E0B] px-5 text-[10px] font-medium uppercase tracking-[0.16em] text-white transition hover:bg-[#d88a05] disabled:cursor-not-allowed disabled:opacity-50 sm:px-6"
          >
            {busyAction === "create" ? "Creating…" : "+ New Chatbot"}
          </button>
        </div>

        <div className="relative">
          {chatbotFleetPageCount > 1 && (
            <button
              type="button"
              aria-label="Previous chatbots"
              onClick={() =>
                setChatbotFleetPage((page) => Math.max(0, page - 1))
              }
              disabled={safeChatbotFleetPage === 0}
              className="absolute left-0 top-1/2 z-10 flex h-7 w-7 -translate-x-2 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:text-[#0F172A] disabled:pointer-events-none disabled:opacity-0"
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
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          )}

          <div className="grid grid-cols-3 gap-2 xl:grid-cols-5">
            {pagedChatbots.map((bot) => {
              const isActive = bot.id === org.activeChatbotId;
              const displayBot = isActive ? { ...bot, ...draft } : bot;
              const agent = org.voiceAgents.find(
                (a) => a.id === displayBot.voiceAgentId,
              );
              return (
                <div
                  key={bot.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (!isActive) {
                      void runAction(`activate-${bot.id}`, () =>
                        onActivateChatbot(bot.id),
                      );
                    }
                  }}
                  onKeyDown={(e) => {
                    if ((e.key === "Enter" || e.key === " ") && !isActive) {
                      e.preventDefault();
                      void runAction(`activate-${bot.id}`, () =>
                        onActivateChatbot(bot.id),
                      );
                    }
                  }}
                  className={`group min-h-[5.9rem] min-w-0 cursor-pointer rounded-2xl border px-2 py-2 text-left transition-all sm:min-h-[6.2rem] sm:px-3 ${
                    isActive
                      ? "border-[#D97706] bg-[#FFF7ED] text-[#111827] shadow-[0_18px_38px_rgba(217,119,6,0.18)] ring-2 ring-[#F59E0B]/35"
                      : "border-slate-200 bg-white/75 text-[#232f3e] hover:border-[#fbbf24] hover:bg-[#fffbeb]"
                  }`}
                >
                  <div className="flex h-full min-w-0 items-center gap-1.5 sm:gap-3">
                    <ChatbotAvatar
                      avatarLabel={displayBot.avatarLabel}
                      fallbackName={displayBot.name}
                      className="h-9 w-9 rounded-2xl sm:h-12 sm:w-12"
                      textClassName="text-[10px] sm:text-[11px]"
                    />
                    <div className="flex min-w-0 flex-1 flex-col justify-center">
                      <div className="flex min-w-0 items-start justify-between gap-1.5">
                        <p className="min-w-0 truncate text-[10px] font-semibold leading-tight text-slate-900 sm:text-[12px]">
                          {displayBot.name}
                        </p>
                        <span
                          className="mt-0.5 hidden h-2 w-2 shrink-0 rounded-full ring-2 ring-white sm:block"
                          style={{
                            background: displayBot.accentColor || "#F59E0B",
                          }}
                        />
                      </div>
                      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1">
                        <span
                          className={`max-w-full truncate rounded-full border px-1.5 py-0.5 text-[8px] font-medium uppercase leading-none tracking-[0.08em] ${
                            isActive
                              ? "border-amber-300 bg-amber-100 text-amber-800"
                              : "border-slate-200 bg-slate-50 text-slate-500"
                          }`}
                        >
                          {isActive ? "Editing" : agent?.name || "Chatbot"}
                        </span>
                      </div>
                      <div
                        className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 sm:mt-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            void runAction(`activate-${bot.id}`, () =>
                              onActivateChatbot(bot.id),
                            )
                          }
                          disabled={isActive}
                          className="text-[9px] font-medium uppercase tracking-[0.14em] text-[#7a8493] transition hover:text-amber-700 disabled:text-amber-700"
                        >
                          {isActive ? "Active" : "Open"}
                        </button>
                        <span className="h-3 w-px bg-slate-200" />
                        <button
                          type="button"
                          onClick={() =>
                            void runAction(`delete-${bot.id}`, () =>
                              onDeleteChatbot(bot.id),
                            )
                          }
                          disabled={org.chatbots.length <= 1}
                          className="text-[9px] font-medium uppercase tracking-[0.14em] text-red-300 transition hover:text-red-500 disabled:opacity-30"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {chatbotFleetPageCount > 1 && (
            <button
              type="button"
              aria-label="Next chatbots"
              onClick={() =>
                setChatbotFleetPage((page) =>
                  Math.min(chatbotFleetPageCount - 1, page + 1),
                )
              }
              disabled={safeChatbotFleetPage >= chatbotFleetPageCount - 1}
              className="absolute right-0 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 translate-x-2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:text-[#0F172A] disabled:pointer-events-none disabled:opacity-0"
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
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          )}
        </div>

        {chatbotFleetPageCount > 1 && (
          <div className="mt-5 flex items-center justify-center gap-3 text-[13px] font-medium text-[#7a8493]">
            <span>
              {chatbotFleetRangeStart}-{chatbotFleetRangeEnd} of{" "}
              {org.chatbots.length} chatbots
            </span>
            <span className="flex items-center gap-1.5">
              {Array.from({ length: chatbotFleetPageCount }).map((_, index) => (
                <button
                  key={index}
                  type="button"
                  aria-label={`Chatbot page ${index + 1}`}
                  onClick={() => setChatbotFleetPage(index)}
                  className={`h-1.5 rounded-full transition-all ${
                    index === safeChatbotFleetPage
                      ? "w-5 bg-[#F59E0B]"
                      : "w-1.5 bg-slate-300 hover:bg-slate-400"
                  }`}
                />
              ))}
            </span>
          </div>
        )}
      </div>

      {/* Studio grid */}
      <div className="grid min-w-0 grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,400px)_minmax(0,1fr)] xl:gap-8">
        {/* LEFT: config */}
        <div className="flex h-full min-w-0 flex-col space-y-5 sm:space-y-6">
          {error && (
            <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
              {error}
            </div>
          )}

          {/* Appearance */}
          <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <h3 className="text-lg font-black text-slate-900">Appearance</h3>

            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                Chatbot Name
              </label>
              <input
                type="text"
                value={draft.name}
                onChange={(e) => patch({ name: e.target.value })}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                Linked Voice Agent
              </label>
              <select
                value={draft.voiceAgentId}
                onChange={(e) => patch({ voiceAgentId: e.target.value })}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {org.voiceAgents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                  Header Title
                </label>
                <input
                  type="text"
                  value={draft.headerTitle}
                  onChange={(e) => patch({ headerTitle: e.target.value })}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                  Profile Image
                </label>
                <div>
                  <div className="relative w-full">
                    <button
                      type="button"
                      onClick={() => setAvatarMenuOpen((open) => !open)}
                      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-left text-sm font-medium text-slate-700 outline-none transition hover:border-[#F59E0B] focus:ring-2 focus:ring-indigo-500"
                    >
                      <span className="min-w-0 truncate">
                        {getAvatarSelectorLabel(draft.avatarLabel)}
                      </span>
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={`shrink-0 text-slate-400 transition ${avatarMenuOpen ? "rotate-180" : ""}`}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                    {avatarMenuOpen && (
                      <div className="absolute left-0 right-0 top-[calc(100%+0.45rem)] z-30 max-h-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_18px_45px_rgba(15,23,42,0.14)]">
                        <button
                          type="button"
                          onClick={() => avatarUploadInputRef.current?.click()}
                          className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-xs font-medium text-slate-700 transition hover:bg-amber-50 hover:text-[#92400e]"
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-slate-500">
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M12 5v14" />
                              <path d="M5 12h14" />
                            </svg>
                          </span>
                          <span>Add from device</span>
                        </button>
                        <div className="my-1 h-px bg-slate-100" />
                        {CHATBOT_PROFILE_AVATARS.map((avatar) => (
                          <button
                            key={avatar.id}
                            type="button"
                            onClick={() => {
                              patch({
                                avatarLabel: `${CHATBOT_AVATAR_PREFIX}${avatar.id}`,
                              });
                              setAvatarMenuOpen(false);
                            }}
                            className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                          >
                            <img
                              src={avatar.image}
                              alt=""
                              className="h-9 w-9 shrink-0 rounded-xl object-cover ring-1 ring-slate-200"
                            />
                            <span className="min-w-0 truncate">
                              {avatar.label}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    <input
                      ref={avatarUploadInputRef}
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => {
                        handleChatbotAvatarUpload(e.target.files?.[0] || null);
                        e.currentTarget.value = "";
                      }}
                    />
                  </div>
                </div>
                {hasChatbotAvatarImage(draft.avatarLabel) && (
                  <button
                    type="button"
                    onClick={resetDraftAvatarToInitials}
                    className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500 transition hover:text-red-500"
                  >
                    Remove image
                  </button>
                )}
              </div>
            </div>

            {/* Accent color */}
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                Accent Color
              </label>
              <div className="space-y-3">
                <div className="flex gap-2 items-center">
                  <div className="relative flex-1">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-sm">
                      #
                    </span>
                    <input
                      type="text"
                      value={draft.accentColor.replace("#", "")}
                      onChange={(e) => {
                        const v = e.target.value
                          .replace(/[^0-9a-fA-F]/g, "")
                          .slice(0, 6);
                        if (v.length === 6) patch({ accentColor: "#" + v });
                      }}
                      maxLength={6}
                      placeholder="4f46e5"
                      className="w-full rounded-2xl border border-slate-200 pl-8 pr-4 py-3 text-sm font-mono outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <label className="cursor-pointer relative" title="Pick color">
                    <input
                      type="color"
                      value={draft.accentColor}
                      onChange={(e) => patch({ accentColor: e.target.value })}
                      className="sr-only"
                    />
                    <div
                      className="w-11 h-11 rounded-2xl border-2 border-white shadow-lg ring-1 ring-slate-200 hover:scale-105 transition-transform"
                      style={{ background: previewColor }}
                    />
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  {COLOR_PRESETS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => patch({ accentColor: c })}
                      title={c}
                      className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${draft.accentColor === c ? "border-slate-900 scale-110 shadow-lg" : "border-white shadow"}`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Widget position */}
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                Widget Position
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(["right", "left"] as const).map((pos) => (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => patch({ position: pos })}
                    className={`rounded-2xl border py-3 text-xs font-black uppercase tracking-widest transition-all ${draft.position === pos ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-500 hover:border-indigo-200"}`}
                  >
                    {pos === "right" ? "→ Right" : "← Left"}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                Welcome Message
              </label>
              <textarea
                rows={3}
                value={draft.welcomeMessage}
                onChange={(e) => patch({ welcomeMessage: e.target.value })}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium outline-none resize-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                Input Placeholder
              </label>
              <input
                type="text"
                value={draft.placeholder}
                onChange={(e) => patch({ placeholder: e.target.value })}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                Custom AI Prompt (optional)
              </label>
              <textarea
                rows={3}
                value={draft.customPrompt}
                onChange={(e) => patch({ customPrompt: e.target.value })}
                placeholder="Shape the AI's personality and instructions…"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium outline-none resize-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Widget Voice */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-4">
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Widget Voice
                </label>
                <p className="mt-1 text-xs text-slate-400">
                  Voice used when the widget responds aloud.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {OPENAI_VOICES.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => patch({ chatVoice: v.id } as any)}
                    className={`relative flex items-center justify-between rounded-2xl border px-3 py-2.5 text-left transition-all group ${(draft as any).chatVoice === v.id ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:border-indigo-200 bg-white"}`}
                  >
                    <div className="min-w-0">
                      <p
                        className={`text-xs font-black ${(draft as any).chatVoice === v.id ? "text-indigo-700" : "text-slate-800"}`}
                      >
                        {v.name}
                      </p>
                      <p className="text-[10px] text-slate-400">{v.desc}</p>
                    </div>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        void previewVoice(v.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          void previewVoice(v.id);
                        }
                      }}
                      title="Preview voice"
                      className={`ml-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-all ${previewingVoice === v.id ? "bg-indigo-600 text-white" : "bg-white text-slate-500 hover:bg-indigo-100 hover:text-indigo-600"}`}
                    >
                      {previewingVoice === v.id ? (
                        <i className="fa-sharp fa-solid fa-stop text-[10px]" />
                      ) : (
                        <i className="fa-sharp fa-solid fa-play text-[10px]" />
                      )}
                    </span>
                  </button>
                ))}
              </div>
              {previewingVoice && (
                <p className="mt-3 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-indigo-500">
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-indigo-500" />
                  Playing preview…
                </p>
              )}
            </div>

            {/* Knowledge Base */}
            <section className="pt-1 sm:pt-2">
              <div className="mb-4 min-w-0">
                <h3 className="text-base font-black text-slate-900 sm:text-lg">
                  Knowledge Base
                </h3>
                <p className="mt-0.5 max-w-xl text-xs leading-relaxed text-slate-400">
                  Choose the knowledge this chatbot should use for answers,
                  FAQs, products, policies, and website content.
                </p>
              </div>

              <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <select
                  value={currentKnowledgeBase?.id || ""}
                  onChange={(event) =>
                    void assignDraftKnowledgeBase(event.target.value)
                  }
                  disabled={!knowledgeBases.length}
                  className="w-full min-w-0 rounded-xl border-0 bg-slate-100 px-4 py-3 text-sm font-black text-slate-700 outline-none transition focus:bg-white focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {knowledgeBases.length === 0 ? (
                    <option value="">Create a knowledge base first</option>
                  ) : (
                    knowledgeBases.map((kb) => (
                      <option key={kb.id} value={kb.id}>
                        {kb.name ||
                          kb.businessName ||
                          kb.domain ||
                          "Untitled knowledge base"}
                      </option>
                    ))
                  )}
                </select>
                <Link
                  to="/knowledge-bases"
                  className="inline-flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-[10px] font-black uppercase tracking-widest text-indigo-600 transition hover:bg-indigo-50 hover:text-indigo-700"
                >
                  Manage
                  <i className="fa-sharp fa-solid fa-arrow-up-right-from-square text-[9px]" />
                </Link>
              </div>

              {!currentKnowledgeBase && (
                <p className="mt-3 text-xs font-semibold text-amber-600">
                  Create and sync a knowledge base before deploying this
                  chatbot.
                </p>
              )}
            </section>
          </div>
        </div>

        {/* RIGHT: live preview + embed */}
        <div className="min-w-0 space-y-5 sm:space-y-6 xl:sticky xl:top-6">
          {/* Preview */}
          <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-[0_18px_45px_rgba(15,23,42,0.12)]">
            <div className="flex flex-col gap-3 border-b border-white/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7 sm:py-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-[#F59E0B]">
                  Live Preview
                </p>
                <p className="text-white font-black text-lg mt-0.5">
                  {draft.headerTitle || "Chat Preview"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void onResetConversation(activeChatbot.id)}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white/60 hover:bg-white/10 hover:text-white"
                >
                  Reset
                </button>
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-widest text-white/50">
                  Live
                </span>
              </div>
            </div>

            <div className="m-3 flex h-[420px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white sm:m-6 sm:h-[480px]">
              {/* Header */}
              <div
                className="flex flex-shrink-0 items-center gap-3 px-4 py-4 sm:px-5"
                style={{ background: previewColor }}
              >
                <ChatbotAvatar
                  avatarLabel={draft.avatarLabel}
                  fallbackName={draft.name}
                  className="h-9 w-9 rounded-full bg-white/20 ring-white/25"
                  textClassName="text-sm text-white"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold text-sm truncate">
                    {draft.headerTitle || "Chat with us"}
                  </p>
                  <p className="text-white/75 text-xs flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-green-300 rounded-full inline-block" />
                    Online · Instant replies
                  </p>
                </div>
                {/* Language flags preview */}
                {(draft.chatLanguages || []).length > 1 && (
                  <div className="flex gap-1">
                    {(draft.chatLanguages || []).slice(0, 3).map((code) => {
                      const lang = SUPPORTED_LANGUAGES.find(
                        (l) => l.code === code,
                      );
                      return (
                        <span key={code} className="text-sm" title={lang?.name}>
                          {lang?.flag}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Messages */}
              <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-4 space-y-3 bg-white custom-scrollbar"
              >
                <div className="flex justify-start">
                  <div className="max-w-[82%] px-4 py-2.5 rounded-2xl rounded-tl-sm bg-slate-100 text-slate-700 text-sm font-medium">
                    {draft.welcomeMessage || "Hello! How can I help you today?"}
                    <div className="text-[10px] text-slate-400 mt-1">
                      Just now
                    </div>
                  </div>
                </div>
                {localMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[82%] px-4 py-2.5 rounded-2xl text-sm font-medium ${msg.role === "user" ? "text-white rounded-tr-sm" : "bg-slate-100 text-slate-700 rounded-tl-sm"}`}
                      style={
                        msg.role === "user"
                          ? { background: previewColor }
                          : undefined
                      }
                    >
                      {msg.text}
                      <div
                        className={`text-[10px] mt-1 ${msg.role === "user" ? "text-white/50" : "text-slate-400"}`}
                      >
                        {new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                  </div>
                ))}
                {isTyping && (
                  <div className="flex justify-start">
                    <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-slate-100">
                      <div className="flex gap-1">
                        {[0, 200, 400].map((d) => (
                          <div
                            key={d}
                            className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"
                            style={{ animationDelay: `${d}ms` }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Input area with voice toggle */}
              <form
                onSubmit={handleSend}
                className="flex flex-shrink-0 items-center gap-2 border-t border-slate-200 bg-white p-2.5 sm:p-3"
              >
                {/* Voice toggle button */}
                <button
                  type="button"
                  onClick={() => {
                    if (isVoiceMode) {
                      if (isRecording) stopRecording();
                      setIsVoiceMode(false);
                    } else {
                      setIsVoiceMode(true);
                    }
                  }}
                  title={isVoiceMode ? "Switch to text" : "Switch to voice"}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all flex-shrink-0 ${isVoiceMode ? "bg-rose-500 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700"}`}
                >
                  <i
                    className={`fa-sharp fa-solid ${isVoiceMode ? "fa-keyboard" : "fa-microphone"} text-sm`}
                  />
                </button>

                {/* Input area (text or voice waveform) */}
                {isVoiceMode ? (
                  <div className="flex-1 h-9 flex items-center px-3 rounded-xl bg-slate-50 border border-slate-200 gap-1 overflow-hidden">
                    {isRecording ? (
                      <>
                        {audioWave.map((h, i) => (
                          <div
                            key={i}
                            className="w-0.5 rounded-full bg-rose-400 transition-all duration-75"
                            style={{ height: `${h}px` }}
                          />
                        ))}
                        <span className="text-[10px] text-rose-300 font-black uppercase tracking-widest ml-auto">
                          Recording…
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-slate-400">
                        Press mic to record
                      </span>
                    )}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={draft.placeholder || "Type your message…"}
                    className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-[#F59E0B] sm:px-4"
                  />
                )}

                {/* Send / record button */}
                {isVoiceMode ? (
                  <button
                    type="button"
                    onMouseDown={startRecording}
                    onMouseUp={stopRecording}
                    onTouchStart={startRecording}
                    onTouchEnd={stopRecording}
                    className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all flex-shrink-0 ${isRecording ? "bg-rose-500 animate-pulse" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                  >
                    <i className="fa-sharp fa-solid fa-microphone text-sm" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!input.trim() || isTyping}
                    className="w-9 h-9 rounded-xl flex items-center justify-center disabled:opacity-40 transition-all flex-shrink-0"
                    style={{ background: previewColor }}
                  >
                    <i className="fa-sharp fa-solid fa-paper-plane text-sm text-white" />
                  </button>
                )}
              </form>
            </div>
          </div>

          {/* Embed script */}
          <div className="rounded-3xl bg-slate-900 p-5 text-white shadow-2xl sm:p-7">
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-[#F59E0B]">
                  Embed Script
                </p>
                <h3 className="text-lg font-black mt-1">Deploy anywhere</h3>
              </div>
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="rounded-2xl bg-white/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white hover:bg-white/20 transition-all"
              >
                {copied ? "✓ Copied!" : "Copy Script"}
              </button>
            </div>
            <p className="text-sm text-indigo-100/70 mb-4">
              Paste before{" "}
              <code className="text-indigo-300">&lt;/body&gt;</code> on any
              site. Voice & language settings are embedded automatically.
            </p>
            <pre className="overflow-x-auto rounded-2xl bg-black/40 p-4 text-xs leading-relaxed text-indigo-100 whitespace-pre-wrap break-all select-all">
              {activeChatbot.embedScript || buildEmbedScript(draft as any)}
            </pre>
            {/* Widget Languages */}
            <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="mb-4">
                <label className="block text-[10px] font-black uppercase tracking-widest text-indigo-200">
                  Widget Languages
                </label>
                <p className="mt-1 text-xs text-indigo-100/60">
                  Let visitors switch between selected languages in the widget.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {SUPPORTED_LANGUAGES.map((lang) => {
                  const selected = (draft.chatLanguages || ["en"]).includes(
                    lang.code,
                  );
                  return (
                    <button
                      key={lang.code}
                      type="button"
                      onClick={() => toggleLanguage(lang.code)}
                      className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-black transition-all ${selected ? "border-indigo-300 bg-white text-indigo-700" : "border-white/10 text-indigo-100/70 hover:border-indigo-200 hover:text-white"}`}
                    >
                      <span>{lang.flag}</span>
                      {lang.name}
                      {selected && (
                        <i className="fa-sharp fa-solid fa-check text-[10px] text-indigo-500" />
                      )}
                    </button>
                  );
                })}
              </div>
              {(draft.chatLanguages || []).length > 0 && (
                <p className="mt-3 text-xs text-indigo-100/60">
                  {(draft.chatLanguages || ["en"]).length} language
                  {(draft.chatLanguages || ["en"]).length > 1 ? "s" : ""}{" "}
                  selected · embedded automatically in the widget script.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* FAQ section - full width */}
      <section className="rounded-3xl bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-3xl">
            <h3 className="text-base font-black text-slate-900">FAQs</h3>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-400">
              Add common questions and clear answers for this Knowledge Base.
              Each Knowledge Base keeps its own FAQ list, while your synced
              website content, products, and policies remain available to the
              chatbot automatically.
            </p>
          </div>
          <button
            type="button"
            onClick={addFaq}
            className="inline-flex min-h-[2.75rem] shrink-0 items-center justify-center rounded-full bg-[#F59E0B] px-5 text-[10px] font-medium uppercase tracking-[0.16em] text-white transition hover:bg-[#d88a05] focus:outline-none focus:ring-2 focus:ring-amber-200 focus:ring-offset-2 sm:px-6"
          >
            + Add FAQ
          </button>
        </div>

        {draft.faqs.length === 0 ? (
          <div className="rounded-2xl bg-slate-50 px-4 py-7 text-center">
            <p className="text-sm font-bold text-slate-400">
              No FAQs yet. Add a question and answer to get started.
            </p>
          </div>
        ) : (
          <div className="max-h-[36rem] space-y-3 overflow-y-auto pr-1 custom-scrollbar sm:space-y-4">
            {draft.faqs.map((faq, index) => (
              <div
                key={faq.id}
                className="grid grid-cols-[1.5rem_minmax(0,1fr)_1.75rem] items-start gap-2.5 sm:grid-cols-[1.75rem_minmax(0,1fr)_2rem] sm:gap-3"
              >
                <span className="mt-[1.55rem] inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-black text-slate-500 sm:h-7 sm:w-7">
                  {index + 1}
                </span>

                <div className="grid min-w-0 grid-cols-1 gap-2.5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)] lg:gap-3">
                  <label className="block min-w-0">
                    <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Question
                    </span>
                    <textarea
                      rows={2}
                      value={faq.question}
                      onChange={(e) =>
                        updateFaq(faq.id, "question", e.target.value)
                      }
                      placeholder="e.g. What are your hours?"
                      className="w-full resize-none rounded-xl border-0 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none transition focus:bg-white focus:ring-2 focus:ring-indigo-200"
                    />
                  </label>
                  <label className="block min-w-0">
                    <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Answer
                    </span>
                    <textarea
                      rows={2}
                      value={faq.answer}
                      onChange={(e) =>
                        updateFaq(faq.id, "answer", e.target.value)
                      }
                      placeholder="e.g. We are open Mon–Fri, 9am–6pm."
                      className="w-full resize-none rounded-xl border-0 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-700 outline-none transition focus:bg-white focus:ring-2 focus:ring-indigo-200"
                    />
                  </label>
                </div>

                <button
                  type="button"
                  onClick={() => removeFaq(faq.id)}
                  aria-label={`Remove FAQ ${index + 1}`}
                  title="Remove FAQ"
                  className="mt-[1.35rem] inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-rose-50 hover:text-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-100 sm:h-8 sm:w-8"
                >
                  <i className="fa-sharp fa-solid fa-xmark text-sm" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
      <button
        type="button"
        onClick={() => void saveCustomization()}
        disabled={busyAction === "save"}
        className="w-full rounded-2xl bg-indigo-600 px-5 py-4 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-indigo-100 hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-3"
      >
        {busyAction === "save" ? (
          <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Saving…
          </>
        ) : (
          "Save All Changes"
        )}
      </button>

      <AppModal
        open={saveModalOpen}
        onClose={() => setSaveModalOpen(false)}
        title="Changes saved"
        description="Your chatbot settings and embed script have been updated."
        size="sm"
        footer={
          <button
            type="button"
            onClick={() => setSaveModalOpen(false)}
            className="w-full rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-black text-white hover:bg-indigo-700"
          >
            Done
          </button>
        }
      >
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-4 text-sm font-bold text-emerald-700">
          {saveSuccess || "Saved successfully."}
        </div>
      </AppModal>
    </div>
  );
};

export default Messenger;
