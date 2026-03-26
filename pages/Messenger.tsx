import React, { useEffect, useRef, useState } from 'react';
import { ChatMessage, ChatbotConfig, Organization } from '../types';

interface MessengerProps {
  org: Organization;
  messages: ChatMessage[];
  onSendMessage: (message: string, chatbotId?: string) => Promise<ChatMessage>;
  onResetConversation: (chatbotId?: string) => Promise<void>;
  onCreateChatbot: () => Promise<void>;
  onUpdateChatbot: (chatbotId: string, updates: Partial<ChatbotConfig>) => Promise<void>;
  onImportChatbotFaqs: (chatbotId: string, website: string) => Promise<void>;
  onActivateChatbot: (chatbotId: string) => Promise<void>;
  onDeleteChatbot: (chatbotId: string) => Promise<void>;
}

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
  const activeChatbot = org.chatbots.find((chatbot) => chatbot.id === org.activeChatbotId) || org.chatbots[0];
  const linkedVoiceAgent = org.voiceAgents.find((agent) => agent.id === activeChatbot.voiceAgentId) || org.agent;

  const [draftChatbot, setDraftChatbot] = useState(activeChatbot);
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>(messages);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [knowledgeWebsite, setKnowledgeWebsite] = useState(org.profile.website);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraftChatbot(activeChatbot);
  }, [activeChatbot]);

  useEffect(() => {
    setKnowledgeWebsite(org.profile.website);
  }, [org.profile.website, activeChatbot.id]);

  useEffect(() => {
    setLocalMessages(messages);
  }, [messages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [localMessages]);

  const runAction = async (actionKey: string, action: () => Promise<void>) => {
    setBusyAction(actionKey);
    setError('');

    try {
      await action();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Unable to complete that action.');
    } finally {
      setBusyAction(null);
    }
  };

  const saveCustomization = async () => {
    await runAction('save-chatbot', async () => {
      await onUpdateChatbot(activeChatbot.id, {
        name: draftChatbot.name,
        voiceAgentId: draftChatbot.voiceAgentId,
        faqs: draftChatbot.faqs,
        headerTitle: draftChatbot.headerTitle,
        welcomeMessage: draftChatbot.welcomeMessage,
        placeholder: draftChatbot.placeholder,
        launcherLabel: draftChatbot.launcherLabel,
        accentColor: draftChatbot.accentColor,
        position: draftChatbot.position,
        avatarLabel: draftChatbot.avatarLabel,
        customPrompt: draftChatbot.customPrompt,
      });
    });
  };

  const saveKnowledgeBase = async () => {
    await runAction('save-chatbot-knowledge', async () => {
      await onUpdateChatbot(activeChatbot.id, {
        faqs: draftChatbot.faqs,
      });
    });
  };

  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(activeChatbot.embedScript);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Unable to copy the embed script automatically.');
    }
  };

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!input.trim() || isTyping) {
      return;
    }

    const nextMessage = input;
    const optimisticUserMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: nextMessage,
      timestamp: new Date().toISOString(),
    };

    setLocalMessages((currentMessages) => [...currentMessages, optimisticUserMessage]);
    setInput('');
    setIsTyping(true);
    setError('');

    try {
      const assistantMessage = await onSendMessage(nextMessage, activeChatbot.id);
      setLocalMessages((currentMessages) => [...currentMessages, assistantMessage]);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Unable to send that message right now.');
      setLocalMessages((currentMessages) => currentMessages.filter((message) => message.id !== optimisticUserMessage.id));
    } finally {
      setIsTyping(false);
    }
  };

  const updateFaq = (faqId: string, field: 'question' | 'answer', value: string) => {
    setDraftChatbot((current) => ({
      ...current,
      faqs: current.faqs.map((faq) => (faq.id === faqId ? { ...faq, [field]: value } : faq)),
    }));
  };

  const addFaq = () => {
    setDraftChatbot((current) => ({
      ...current,
      faqs: [
        ...current.faqs,
        {
          id: `chatbot_faq_${Date.now()}`,
          question: 'New chatbot knowledge topic',
          answer: 'Add the detailed response this chatbot should use.',
        },
      ],
    }));
  };

  const removeFaq = (faqId: string) => {
    setDraftChatbot((current) => ({
      ...current,
      faqs: current.faqs.filter((faq) => faq.id !== faqId),
    }));
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-black text-slate-900">Chatbot Agent Studio</h2>
            <p className="text-sm text-slate-500 mt-2">Create multiple embedded chatbots, link each one to a voice agent, and tailor the widget to match each site or campaign.</p>
          </div>
          <button
            type="button"
            onClick={() => void runAction('create-chatbot', onCreateChatbot)}
            className="rounded-2xl bg-indigo-600 px-5 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-indigo-100 transition-all hover:bg-indigo-700"
          >
            + New Chatbot
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {org.chatbots.map((chatbot) => {
            const isActive = chatbot.id === org.activeChatbotId;
            const chatbotVoiceAgent = org.voiceAgents.find((agent) => agent.id === chatbot.voiceAgentId);

            return (
              <div
                key={chatbot.id}
                className={`rounded-3xl border p-5 transition-all ${isActive ? 'border-indigo-200 bg-indigo-50/70 shadow-sm' : 'border-slate-200 bg-slate-50'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-900">{chatbot.name}</p>
                    <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Powered by {chatbotVoiceAgent?.name || 'Voice Agent'}
                    </p>
                  </div>
                  {isActive && (
                    <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-widest text-indigo-600 border border-indigo-100">
                      Active
                    </span>
                  )}
                </div>

                <div className="mt-4 flex items-center gap-2">
                  {!isActive && (
                    <button
                      type="button"
                      onClick={() => void runAction(`activate-${chatbot.id}`, () => onActivateChatbot(chatbot.id))}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-all hover:border-indigo-200 hover:text-indigo-600"
                    >
                      Open
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void runAction(`delete-${chatbot.id}`, () => onDeleteChatbot(chatbot.id))}
                    disabled={org.chatbots.length <= 1}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 transition-all hover:border-red-200 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[420px_minmax(0,1fr)] gap-8">
        <div className="space-y-8">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8">
            <h3 className="text-xl font-black text-slate-900 mb-6">Customization</h3>
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Chatbot Name</label>
                <input
                  type="text"
                  value={draftChatbot.name}
                  onChange={(event) => setDraftChatbot((current) => ({ ...current, name: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Linked Voice Agent</label>
                <select
                  value={draftChatbot.voiceAgentId}
                  onChange={(event) => setDraftChatbot((current) => ({ ...current, voiceAgentId: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {org.voiceAgents.map((agent) => (
                    <option key={agent.id} value={agent.id}>{agent.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Header Title</label>
                  <input
                    type="text"
                    value={draftChatbot.headerTitle}
                    onChange={(event) => setDraftChatbot((current) => ({ ...current, headerTitle: event.target.value }))}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Launcher Label</label>
                  <input
                    type="text"
                    value={draftChatbot.launcherLabel}
                    onChange={(event) => setDraftChatbot((current) => ({ ...current, launcherLabel: event.target.value }))}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Accent Color</label>
                  <input
                    type="text"
                    value={draftChatbot.accentColor}
                    onChange={(event) => setDraftChatbot((current) => ({ ...current, accentColor: event.target.value }))}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Widget Side</label>
                  <select
                    value={draftChatbot.position}
                    onChange={(event) => setDraftChatbot((current) => ({ ...current, position: event.target.value as ChatbotConfig['position'] }))}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="right">Right</option>
                    <option value="left">Left</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Welcome Message</label>
                <textarea
                  rows={3}
                  value={draftChatbot.welcomeMessage}
                  onChange={(event) => setDraftChatbot((current) => ({ ...current, welcomeMessage: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 font-medium outline-none resize-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Input Placeholder</label>
                <input
                  type="text"
                  value={draftChatbot.placeholder}
                  onChange={(event) => setDraftChatbot((current) => ({ ...current, placeholder: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Avatar Label</label>
                <input
                  type="text"
                  value={draftChatbot.avatarLabel}
                  onChange={(event) => setDraftChatbot((current) => ({ ...current, avatarLabel: event.target.value.toUpperCase().slice(0, 6) }))}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 font-medium uppercase outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Custom Prompt</label>
                <textarea
                  rows={4}
                  value={draftChatbot.customPrompt}
                  onChange={(event) => setDraftChatbot((current) => ({ ...current, customPrompt: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 font-medium outline-none resize-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="mt-2 text-xs text-slate-400">This shapes the chatbot's fallback personality when no FAQ is a direct match.</p>
              </div>

              <div>
                <div className="flex items-center justify-between gap-4 mb-3">
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest">Training & Knowledge</label>
                    <p className="mt-1 text-xs text-slate-400">These entries belong to this chatbot only and are checked before the linked voice agent knowledge base.</p>
                  </div>
                  <button
                    type="button"
                    onClick={addFaq}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-all hover:border-indigo-200 hover:text-indigo-600"
                  >
                    + Add Entry
                  </button>
                </div>

                <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Import from Website URL</label>
                  <div className="flex flex-col md:flex-row gap-3">
                    <input
                      type="text"
                      value={knowledgeWebsite}
                      onChange={(event) => setKnowledgeWebsite(event.target.value)}
                      placeholder="www.example.com"
                      className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => void runAction(`import-chatbot-faqs-${activeChatbot.id}`, () => onImportChatbotFaqs(activeChatbot.id, knowledgeWebsite))}
                      disabled={!knowledgeWebsite.trim()}
                      className="rounded-2xl bg-slate-900 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Import Website Data
                    </button>
                  </div>
                  <p className="mt-3 text-xs text-slate-400">We pull visible website content into chatbot knowledge when possible, and fall back to starter content if the site blocks parsing.</p>
                </div>

                <div className="space-y-3">
                  {draftChatbot.faqs.map((faq) => (
                    <div key={faq.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Knowledge Entry</p>
                        <button
                          type="button"
                          onClick={() => removeFaq(faq.id)}
                          className="text-[10px] font-black uppercase tracking-widest text-slate-400 transition-colors hover:text-red-600"
                        >
                          Remove
                        </button>
                      </div>
                      <input
                        type="text"
                        value={faq.question}
                        onChange={(event) => updateFaq(faq.id, 'question', event.target.value)}
                        className="mb-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="Question or topic"
                      />
                      <textarea
                        rows={3}
                        value={faq.answer}
                        onChange={(event) => updateFaq(faq.id, 'answer', event.target.value)}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-medium outline-none resize-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="Detailed answer"
                      />
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => void saveKnowledgeBase()}
                    className="rounded-2xl bg-indigo-600 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-indigo-100 transition-all hover:bg-indigo-700"
                  >
                    Save Knowledge Base
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => void saveCustomization()}
                className="w-full rounded-2xl bg-slate-900 px-5 py-4 text-xs font-black uppercase tracking-widest text-white transition-all hover:bg-slate-800"
              >
                Save Chatbot Customization
              </button>
            </div>
          </div>

          <div className="bg-slate-900 rounded-3xl shadow-2xl p-8 text-white">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.25em] text-indigo-300">Embed Script</p>
                <h3 className="text-xl font-black mt-2">Deploy this chatbot anywhere</h3>
              </div>
              <button
                type="button"
                onClick={() => void handleCopyScript()}
                className="rounded-2xl bg-white/10 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-white/20"
              >
                {copied ? 'Copied' : 'Copy Script'}
              </button>
            </div>
            <p className="text-sm text-indigo-100/80 mb-4">Paste this script tag into any site, CMS, or landing-page builder where you want the chatbot widget to appear.</p>
            <pre className="overflow-x-auto rounded-2xl bg-black/30 p-4 text-xs leading-relaxed text-indigo-100 whitespace-pre-wrap break-all">{activeChatbot.embedScript}</pre>
          </div>
        </div>

        <div className="flex flex-col h-[calc(100vh-220px)] bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-4">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg"
                style={{ backgroundColor: activeChatbot.accentColor }}
              >
                <span className="text-sm font-black text-white">{activeChatbot.avatarLabel}</span>
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900">{activeChatbot.headerTitle}</h2>
                <p className="text-xs font-bold uppercase tracking-widest" style={{ color: activeChatbot.accentColor }}>
                  Linked to {linkedVoiceAgent.name}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void onResetConversation(activeChatbot.id)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 transition-all hover:border-indigo-200 hover:text-indigo-600"
              >
                Reset Thread
              </button>
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Live Preview</span>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth bg-slate-50/30">
            {localMessages.map((message) => (
              <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] p-4 rounded-2xl shadow-sm ${
                    message.role === 'user'
                      ? 'text-white rounded-tr-none'
                      : 'bg-white border border-slate-100 text-slate-800 rounded-tl-none'
                  }`}
                  style={message.role === 'user' ? { backgroundColor: activeChatbot.accentColor } : undefined}
                >
                  <p className="text-sm font-medium leading-relaxed">{message.text}</p>
                  <p className={`text-[10px] mt-2 font-bold uppercase tracking-widest ${message.role === 'user' ? 'text-white/70' : 'text-slate-400'}`}>
                    {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-white border border-slate-100 p-4 rounded-2xl rounded-tl-none shadow-sm">
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce"></div>
                    <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                    <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <form onSubmit={handleSend} className="p-6 bg-white border-t border-slate-100">
            {error && (
              <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                {error}
              </div>
            )}
            {!error && busyAction && (
              <div className="mb-4 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-600">
                Saving workspace changes...
              </div>
            )}

            <div className="flex flex-wrap gap-2 mb-4">
              {activeChatbot.suggestedPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => setInput(prompt)}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 transition-all hover:border-indigo-200 hover:text-indigo-600"
                >
                  {prompt}
                </button>
              ))}
            </div>

            <div className="relative flex items-center">
              <input
                type="text"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={activeChatbot.placeholder}
                className="w-full pl-6 pr-16 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium"
              />
              <button
                type="submit"
                disabled={!input.trim() || isTyping}
                className="absolute right-2 p-3 text-white rounded-xl transition-all disabled:opacity-50 shadow-lg"
                style={{ backgroundColor: activeChatbot.accentColor }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polyline points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            </div>
            <p className="text-[10px] text-center mt-4 font-black text-slate-400 uppercase tracking-widest">
              Website chatbot powered by {linkedVoiceAgent.name}
            </p>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Messenger;
