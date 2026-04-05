import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChatMessage, ChatbotConfig, FAQ, Organization } from "../types";

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
}) => {
  const activeChatbot =
    org.chatbots.find((c) => c.id === org.activeChatbotId) ?? org.chatbots[0];
  const linkedAgent =
    org.voiceAgents.find((a) => a.id === activeChatbot?.voiceAgentId) ??
    org.agent;

  const [draft, setDraft] = useState<ChatbotConfig>(activeChatbot);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>(messages);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [copied, setCopied] = useState(false);
  const [scrapeUrl, setScrapeUrl] = useState(org.profile.website || "");
  const [scrapeStatus, setScrapeStatus] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle");
  const [scrapeMsg, setScrapeMsg] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeChatbot) setDraft(activeChatbot);
  }, [activeChatbot?.id]);
  useEffect(() => {
    setLocalMessages(messages);
  }, [messages]);
  useEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [localMessages, isTyping]);

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

  const patch = (updates: Partial<ChatbotConfig>) =>
    setDraft((d) => ({ ...d, ...updates }));

  const saveCustomization = async () => {
    await runAction("save", async () => {
      await onUpdateChatbot(activeChatbot.id, {
        name: draft.name,
        voiceAgentId: draft.voiceAgentId,
        headerTitle: draft.headerTitle,
        welcomeMessage: draft.welcomeMessage,
        placeholder: draft.placeholder,
        launcherLabel: draft.launcherLabel,
        accentColor: draft.accentColor,
        position: draft.position,
        avatarLabel: draft.avatarLabel,
        customPrompt: draft.customPrompt,
        suggestedPrompts: draft.suggestedPrompts,
        faqs: draft.faqs,
      });
      setSaveSuccess("Saved!");
      setTimeout(() => setSaveSuccess(""), 2500);
    });
  };

  const handleImport = async () => {
    if (!scrapeUrl.trim()) return;
    setScrapeStatus("loading");
    setScrapeMsg("");
    setError("");
    try {
      await onImportChatbotFaqs(activeChatbot.id, scrapeUrl);
      setScrapeStatus("done");
      setScrapeMsg(`✓ Scraped successfully. FAQs added. Click Save to apply.`);
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

  const addFaq = () =>
    patch({
      faqs: [
        ...draft.faqs,
        { id: `faq-${Date.now()}`, question: "", answer: "" },
      ],
    });
  const updateFaq = (id: string, field: "question" | "answer", val: string) =>
    patch({
      faqs: draft.faqs.map((f) => (f.id === id ? { ...f, [field]: val } : f)),
    });
  const removeFaq = (id: string) =>
    patch({ faqs: draft.faqs.filter((f) => f.id !== id) });

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(activeChatbot.embedScript);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copy failed — please select and copy manually.");
    }
  };

  if (!activeChatbot)
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <p className="text-slate-400 font-medium mb-4">No chatbot yet.</p>
        <button
          onClick={() => void runAction("create", onCreateChatbot)}
          className="rounded-2xl bg-indigo-600 px-6 py-3 text-xs font-black uppercase tracking-widest text-white"
        >
          + Create Chatbot
        </button>
      </div>
    );

  const previewColor = draft.accentColor || "#4f46e5";

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Chatbot selector */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-black text-slate-900">
              Chatbot Agent Studio
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Design, train and deploy embeddable chat widgets — preview updates
              live.
            </p>
          </div>
          <button
            onClick={() => void runAction("create", onCreateChatbot)}
            disabled={busyAction === "create"}
            className="rounded-2xl bg-indigo-600 px-5 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-indigo-100 hover:bg-indigo-700 disabled:opacity-50"
          >
            {busyAction === "create" ? "Creating…" : "+ New Chatbot"}
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {org.chatbots.map((bot) => {
            const isActive = bot.id === org.activeChatbotId;
            const agent = org.voiceAgents.find(
              (a) => a.id === bot.voiceAgentId,
            );
            return (
              <div
                key={bot.id}
                className={`rounded-3xl border p-5 transition-all ${isActive ? "border-indigo-200 bg-indigo-50/60 shadow-sm" : "border-slate-200 bg-slate-50"}`}
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <p className="font-black text-slate-900 text-sm">
                      {bot.name}
                    </p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-0.5">
                      {agent?.name ?? "Voice Agent"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div
                      className="w-4 h-4 rounded-full border-2 border-white shadow"
                      style={{ background: bot.accentColor }}
                    />
                    {isActive && (
                      <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-indigo-600 border border-indigo-100">
                        Active
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  {!isActive && (
                    <button
                      onClick={() =>
                        void runAction(`activate-${bot.id}`, () =>
                          onActivateChatbot(bot.id),
                        )
                      }
                      className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-indigo-200 hover:text-indigo-600"
                    >
                      Open
                    </button>
                  )}
                  <button
                    onClick={() =>
                      void runAction(`delete-${bot.id}`, () =>
                        onDeleteChatbot(bot.id),
                      )
                    }
                    disabled={org.chatbots.length <= 1}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:border-red-200 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Studio grid */}
      <div className="grid grid-cols-1 xl:grid-cols-[400px_minmax(0,1fr)] gap-8 items-start">
        {/* LEFT: config */}
        <div className="space-y-6">
          {error && (
            <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
              {error}
            </div>
          )}
          {saveSuccess && (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
              {saveSuccess}
            </div>
          )}

          {/* Appearance */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-7 space-y-4">
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

            <div className="grid grid-cols-2 gap-3">
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
                  Avatar Label
                </label>
                <input
                  type="text"
                  value={draft.avatarLabel}
                  maxLength={6}
                  onChange={(e) =>
                    patch({ avatarLabel: e.target.value.toUpperCase() })
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium uppercase outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Accent color with picker + presets */}
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

            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                Widget Position
              </label>
              <div className="grid grid-cols-2 gap-2">
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
          </div>

          {/* Knowledge base */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-7">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-black text-slate-900">
                  Knowledge Base
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Scraped content is stored in Supabase and used by the AI.
                </p>
              </div>
              <button
                type="button"
                onClick={addFaq}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-indigo-200 hover:text-indigo-600"
              >
                + Add Entry
              </button>
            </div>

            {/* Scraper */}
            <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                Import from Website URL
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={scrapeUrl}
                  onChange={(e) => setScrapeUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void handleImport()}
                  placeholder="https://yourwebsite.com"
                  className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => void handleImport()}
                  disabled={!scrapeUrl.trim() || scrapeStatus === "loading"}
                  className="rounded-2xl bg-slate-900 px-3 md:px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
                >
                  {scrapeStatus === "loading" ? (
                    <>
                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Importing…
                    </>
                  ) : (
                    "Import Website"
                  )}
                </button>
              </div>
              {scrapeMsg && (
                <p
                  className={`mt-2 text-xs font-medium ${scrapeStatus === "error" ? "text-red-500" : "text-emerald-600"}`}
                >
                  {scrapeMsg}
                </p>
              )}
            </div>

            {/* FAQ Carousel */}
            <div className="mt-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-black text-slate-900">FAQs</h4>
                <button
                  type="button"
                  onClick={addFaq}
                  className="text-xs font-black text-indigo-600"
                >
                  + Add
                </button>
              </div>
              {draft.faqs.length === 0 ? (
                <p className="text-center text-slate-400 text-sm py-6">
                  No FAQs yet. Import a website or add manually.
                </p>
              ) : (
                <div className="overflow-x-auto pb-2 custom-scrollbar">
                  <div
                    className="flex gap-4"
                    style={{ minWidth: "max-content" }}
                  >
                    {draft.faqs.map((faq) => (
                      <div
                        key={faq.id}
                        className="w-80 flex-shrink-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                            FAQ
                          </span>
                          <button
                            onClick={() => removeFaq(faq.id)}
                            className="text-slate-300 hover:text-red-500"
                          >
                            ✕
                          </button>
                        </div>
                        <input
                          type="text"
                          value={faq.question}
                          onChange={(e) =>
                            updateFaq(faq.id, "question", e.target.value)
                          }
                          placeholder="Question"
                          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium mb-2 focus:ring-2 focus:ring-indigo-500"
                        />
                        <textarea
                          rows={3}
                          value={faq.answer}
                          onChange={(e) =>
                            updateFaq(faq.id, "answer", e.target.value)
                          }
                          placeholder="Answer"
                          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

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
        </div>

        {/* RIGHT: live preview + embed */}
        <div className="space-y-6 sticky top-6">
          {/* Preview */}
          <div className="bg-slate-900 rounded-3xl shadow-2xl overflow-hidden">
            <div className="px-7 py-5 border-b border-white/10 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-300">
                  Live Preview
                </p>
                <p className="text-white font-black text-lg mt-0.5">
                  {draft.headerTitle || "Chat Preview"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => void onResetConversation(activeChatbot.id)}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white/60 hover:text-white hover:bg-white/10"
                >
                  Reset
                </button>
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-widest text-white/50">
                  Live
                </span>
              </div>
            </div>

            <div
              className="m-6 rounded-2xl overflow-hidden border border-white/10 flex flex-col"
              style={{ height: "480px" }}
            >
              <div
                className="flex items-center gap-3 px-5 py-4 flex-shrink-0"
                style={{ background: previewColor }}
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center font-black text-sm flex-shrink-0 text-white"
                  style={{ background: "rgba(255,255,255,0.22)" }}
                >
                  {draft.avatarLabel || "A"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold text-sm truncate">
                    {draft.headerTitle || "Chat with us"}
                  </p>
                  <p className="text-white/75 text-xs flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-green-300 rounded-full inline-block" />
                    Online · Instant replies
                  </p>
                </div>
              </div>

              <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-800/50 custom-scrollbar"
              >
                <div className="flex justify-start">
                  <div className="max-w-[82%] px-4 py-2.5 rounded-2xl rounded-tl-sm bg-white/10 text-white/90 text-sm font-medium">
                    {draft.welcomeMessage || "Hello! How can I help you today?"}
                    <div className="text-[10px] text-white/40 mt-1">
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
                      className={`max-w-[82%] px-4 py-2.5 rounded-2xl text-sm font-medium ${msg.role === "user" ? "text-white rounded-tr-sm" : "bg-white/10 text-white/90 rounded-tl-sm"}`}
                      style={
                        msg.role === "user"
                          ? { background: previewColor }
                          : undefined
                      }
                    >
                      {msg.text}
                      <div
                        className={`text-[10px] mt-1 ${msg.role === "user" ? "text-white/50" : "text-white/40"}`}
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
                    <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-white/10">
                      <div className="flex gap-1">
                        {[0, 200, 400].map((d) => (
                          <div
                            key={d}
                            className="w-1.5 h-1.5 bg-white/50 rounded-full animate-bounce"
                            style={{ animationDelay: `${d}ms` }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <form
                onSubmit={handleSend}
                className="flex gap-2 p-3 bg-slate-800 border-t border-white/10 flex-shrink-0"
              >
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={draft.placeholder || "Type your message…"}
                  className="flex-1 rounded-xl bg-white/10 border border-white/10 text-white placeholder-white/30 px-4 py-2.5 text-sm outline-none focus:border-white/30"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isTyping}
                  className="rounded-xl px-4 py-2.5 text-white disabled:opacity-40 transition-all"
                  style={{ background: previewColor }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </form>
            </div>
          </div>

          {/* Embed script */}
          <div className="bg-slate-900 rounded-3xl shadow-2xl p-7 text-white">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-300">
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
              site. Config changes are live immediately — no redeploy.
            </p>
            <pre className="overflow-x-auto rounded-2xl bg-black/40 p-4 text-xs leading-relaxed text-indigo-100 whitespace-pre-wrap break-all select-all">
              {activeChatbot.embedScript}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Messenger;
