
import React, { useEffect, useState } from 'react';
import { Organization, AgentConfig } from '../types';

const VOICES = ['Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir'] as const;
const TONES = ['Professional', 'Friendly', 'Empathetic'] as const;
const LANGUAGES = ['English', 'Spanish', 'French', 'German'] as const;

interface AgentSettingsProps {
  org: Organization;
  onUpdateAgent: (updates: Partial<AgentConfig>) => Promise<void>;
  onCreateVoiceAgent: (payload?: Partial<AgentConfig>) => Promise<void>;
  onActivateVoiceAgent: (id: string) => Promise<void>;
  onDeleteVoiceAgent: (id: string) => Promise<void>;
  onUpdateRules: (ruleUpdates: Partial<AgentConfig['rules']>) => Promise<void>;
  onAddFaq: () => Promise<void>;
  onUpdateFaq: (id: string, updates: { question?: string; answer?: string }) => Promise<void>;
  onRemoveFaq: (id: string) => Promise<void>;
  onSyncFaqs: (website?: string) => Promise<void>;
  onRestartAgent: () => Promise<void>;
}

const AgentSettings: React.FC<AgentSettingsProps> = ({
  org,
  onUpdateAgent,
  onCreateVoiceAgent,
  onActivateVoiceAgent,
  onDeleteVoiceAgent,
  onUpdateRules,
  onAddFaq,
  onUpdateFaq,
  onRemoveFaq,
  onSyncFaqs,
  onRestartAgent,
}) => {
  const [draftAgent, setDraftAgent] = useState(org.agent);
  const [knowledgeWebsite, setKnowledgeWebsite] = useState(org.profile.website);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setDraftAgent(org.agent);
  }, [org.agent]);

  useEffect(() => {
    setKnowledgeWebsite(org.profile.website);
  }, [org.profile.website, org.activeVoiceAgentId]);

  const saveAgent = async (updates: Partial<AgentConfig>, actionKey = 'agent') => {
    setError('');
    setBusyAction(actionKey);

    try {
      await onUpdateAgent(updates);
    } catch (saveError) {
      setDraftAgent(org.agent);
      setError(saveError instanceof Error ? saveError.message : 'Unable to save agent settings.');
    } finally {
      setBusyAction(null);
    }
  };

  const saveRules = async (ruleUpdates: Partial<AgentConfig['rules']>) => {
    setError('');
    setBusyAction('rules');

    try {
      await onUpdateRules(ruleUpdates);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save business rules.');
    } finally {
      setBusyAction(null);
    }
  };

  const runAction = async (actionKey: string, action: () => Promise<void>) => {
    setError('');
    setBusyAction(actionKey);

    try {
      await action();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Unable to complete that action.');
    } finally {
      setBusyAction(null);
    }
  };

  const updateDraftFaq = (faqId: string, field: 'question' | 'answer', value: string) => {
    setDraftAgent((current) => ({
      ...current,
      faqs: current.faqs.map((faq) => (faq.id === faqId ? { ...faq, [field]: value } : faq)),
    }));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Left Column: Core Identity */}
      <div className="lg:col-span-2 space-y-8">
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div>
              <h3 className="text-xl font-bold text-slate-900">Voice Agent Fleet</h3>
              <p className="text-sm text-slate-500">Create multiple voice agents and switch which one is active across calls, onboarding, and the simulator.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => void runAction('create-inbound-voice-agent', () => onCreateVoiceAgent({ direction: 'inbound' }))}
                className="rounded-2xl bg-indigo-600 px-5 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-indigo-100 transition-all hover:bg-indigo-700"
              >
                + New Inbound
              </button>
              <button
                onClick={() => void runAction('create-outbound-voice-agent', () => onCreateVoiceAgent({ direction: 'outbound' }))}
                className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-xs font-black uppercase tracking-widest text-slate-700 transition-all hover:border-indigo-200 hover:text-indigo-600"
              >
                + New Outbound
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {org.voiceAgents.map((agent) => {
              const isActive = agent.id === org.activeVoiceAgentId;
              return (
                <div
                  key={agent.id}
                  className={`rounded-3xl border p-5 transition-all ${isActive ? 'border-indigo-200 bg-indigo-50/70 shadow-sm' : 'border-slate-200 bg-slate-50'}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-black text-slate-900">{agent.name}</p>
                      <p className="mt-1 text-[11px] font-black uppercase tracking-widest text-slate-400">{agent.direction} • {agent.voice} • {agent.language}</p>
                      <p className="mt-2 text-xs font-semibold text-indigo-600">{agent.twilioPhoneNumber || 'No Twilio number assigned yet'}</p>
                      <p className="mt-3 text-xs text-slate-500 line-clamp-2">{agent.greeting}</p>
                    </div>
                    {isActive && (
                      <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-widest text-indigo-600 border border-indigo-100">
                        Active
                      </span>
                    )}
                  </div>

                  <div className="mt-5 flex items-center gap-2">
                    {!isActive && (
                      <button
                        onClick={() => void runAction(`activate-${agent.id}`, () => onActivateVoiceAgent(agent.id))}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-all hover:border-indigo-200 hover:text-indigo-600"
                      >
                        Make Active
                      </button>
                    )}
                    <button
                      onClick={() => void runAction(`delete-${agent.id}`, () => onDeleteVoiceAgent(agent.id))}
                      disabled={org.voiceAgents.length <= 1}
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

        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
          <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-600"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            Agent Persona & Language
          </h3>
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Agent Name</label>
                <input 
                  type="text" 
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none font-medium"
                  value={draftAgent.name}
                  onChange={e => setDraftAgent(prev => ({ ...prev, name: e.target.value }))}
                  onBlur={() => {
                    if (draftAgent.name !== org.agent.name) {
                      void saveAgent({ name: draftAgent.name }, 'name');
                    }
                  }}
                />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Call Direction</label>
                <select
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none font-medium"
                  value={draftAgent.direction}
                  onChange={e => {
                    const direction = e.target.value as AgentConfig['direction'];
                    setDraftAgent(prev => ({ ...prev, direction }));
                    void saveAgent({ direction }, 'direction');
                  }}
                >
                  <option value="inbound">Inbound</option>
                  <option value="outbound">Outbound</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Voice Profile</label>
                <select 
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none font-medium"
                  value={draftAgent.voice}
                  onChange={e => {
                    const voice = e.target.value as AgentConfig['voice'];
                    setDraftAgent(prev => ({ ...prev, voice }));
                    void saveAgent({ voice }, 'voice');
                  }}
                >
                  {VOICES.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Twilio Phone Number</label>
                  <input
                    type="tel"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none font-medium"
                    placeholder="+1 (555) 000-0000"
                    value={draftAgent.twilioPhoneNumber}
                    onChange={e => setDraftAgent(prev => ({ ...prev, twilioPhoneNumber: e.target.value }))}
                    onBlur={() => {
                      if (draftAgent.twilioPhoneNumber !== org.agent.twilioPhoneNumber) {
                        void saveAgent({ twilioPhoneNumber: draftAgent.twilioPhoneNumber }, 'twilioPhoneNumber');
                      }
                    }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Twilio Phone SID</label>
                  <input
                    type="text"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none font-medium"
                    placeholder="PNxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    value={draftAgent.twilioPhoneSid}
                    onChange={e => setDraftAgent(prev => ({ ...prev, twilioPhoneSid: e.target.value }))}
                    onBlur={() => {
                      if (draftAgent.twilioPhoneSid !== org.agent.twilioPhoneSid) {
                        void saveAgent({ twilioPhoneSid: draftAgent.twilioPhoneSid }, 'twilioPhoneSid');
                      }
                    }}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Primary Language</label>
                <select 
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none font-medium"
                  value={draftAgent.language}
                  onChange={e => {
                    const language = e.target.value as AgentConfig['language'];
                    setDraftAgent(prev => ({ ...prev, language }));
                    void saveAgent({ language }, 'language');
                  }}
                >
                  {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>
            
            <div>
              <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Greeting Message</label>
              <textarea 
                rows={3}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none font-medium resize-none"
                value={draftAgent.greeting}
                onChange={e => setDraftAgent(prev => ({ ...prev, greeting: e.target.value }))}
                onBlur={() => {
                  if (draftAgent.greeting !== org.agent.greeting) {
                    void saveAgent({ greeting: draftAgent.greeting }, 'greeting');
                  }
                }}
              />
              <p className="text-xs text-slate-400 mt-2 italic">Tip: Mention your company name for immediate trust.</p>
            </div>

            <div>
              <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Communication Style</label>
              <div className="grid grid-cols-3 gap-3">
                {TONES.map(t => (
                  <button 
                    key={t}
                    onClick={() => {
                      setDraftAgent(prev => ({ ...prev, tone: t }));
                      void saveAgent({ tone: t }, 'tone');
                    }}
                    className={`py-3 rounded-2xl border-2 font-bold text-sm transition-all ${
                      draftAgent.tone === t 
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-600 shadow-sm' 
                        : 'border-slate-100 text-slate-500 hover:border-slate-200 bg-slate-50'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div>
              <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-600"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M8 7h6"/><path d="M8 11h8"/></svg>
                Training & Knowledge
              </h3>
              <p className="mt-2 text-sm text-slate-500">Edit, remove, and import knowledge for this voice agent. Changes apply to the active agent only.</p>
            </div>
            <button
              onClick={() => void runAction('add-faq', onAddFaq)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-all hover:border-indigo-200 hover:text-indigo-600"
            >
              + New Entry
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 mb-6">
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Import from Website URL</label>
            <div className="flex flex-col md:flex-row gap-3">
              <input
                type="text"
                value={knowledgeWebsite}
                onChange={(event) => setKnowledgeWebsite(event.target.value)}
                placeholder="www.example.com"
                className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 font-medium outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={() => void runAction('sync-faqs', () => onSyncFaqs(knowledgeWebsite))}
                disabled={!knowledgeWebsite.trim()}
                className="rounded-2xl bg-slate-900 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Import Knowledge
              </button>
            </div>
            <p className="mt-3 text-xs text-slate-400">This replaces the current knowledge base with entries pulled from the website when available, with fallback starter content if the site cannot be parsed.</p>
          </div>

          <div className="space-y-4">
            {draftAgent.faqs.map((faq) => {
              const originalFaq = org.agent.faqs.find((entry) => entry.id === faq.id);

              return (
                <div key={faq.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Knowledge Entry</p>
                    <button
                      onClick={() => void runAction(`faq-${faq.id}-delete`, () => onRemoveFaq(faq.id))}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 transition-all hover:border-red-200 hover:text-red-600"
                    >
                      Delete
                    </button>
                  </div>
                  <input
                    type="text"
                    value={faq.question}
                    onChange={(event) => updateDraftFaq(faq.id, 'question', event.target.value)}
                    onBlur={() => {
                      if (faq.question !== (originalFaq?.question || '')) {
                        void runAction(`faq-${faq.id}-question`, () => onUpdateFaq(faq.id, { question: faq.question }));
                      }
                    }}
                    className="mb-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Question or topic"
                  />
                  <textarea
                    rows={4}
                    value={faq.answer}
                    onChange={(event) => updateDraftFaq(faq.id, 'answer', event.target.value)}
                    onBlur={() => {
                      if (faq.answer !== (originalFaq?.answer || '')) {
                        void runAction(`faq-${faq.id}-answer`, () => onUpdateFaq(faq.id, { answer: faq.answer }));
                      }
                    }}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-medium outline-none resize-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Detailed answer"
                  />
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* Right Column: Behavior & Routing */}
      <div className="space-y-8">
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
          <h3 className="text-xl font-bold text-slate-900 mb-6">Business Rules</h3>
          <div className="space-y-4">
            
            <div className="p-5 rounded-2xl bg-slate-50 border-2 border-slate-100 space-y-4">
              <div className="flex items-center justify-between">
                 <div>
                   <p className="text-sm font-black text-slate-900">Lead Capture</p>
                   <p className="text-[10px] text-slate-400 uppercase font-black">Always ask for contact</p>
                 </div>
                 <button 
                  onClick={() => void saveRules({ captureAllLeads: !org.agent.rules.captureAllLeads })}
                  className={`w-12 h-6 rounded-full transition-all relative px-1 flex items-center ${org.agent.rules.captureAllLeads ? 'bg-indigo-600' : 'bg-slate-300'}`}
                 >
                   <div className={`w-4 h-4 bg-white rounded-full transition-all shadow-sm ${org.agent.rules.captureAllLeads ? 'translate-x-6' : 'translate-x-0'}`}></div>
                 </button>
              </div>
              <div className="flex items-center justify-between">
                 <div>
                   <p className="text-sm font-black text-slate-900">Booking Engine</p>
                   <p className="text-[10px] text-slate-400 uppercase font-black">Allow appointment scheduling</p>
                 </div>
                 <button 
                  onClick={() => void saveRules({ autoBook: !org.agent.rules.autoBook })}
                  className={`w-12 h-6 rounded-full transition-all relative px-1 flex items-center ${org.agent.rules.autoBook ? 'bg-indigo-600' : 'bg-slate-300'}`}
                 >
                   <div className={`w-4 h-4 bg-white rounded-full transition-all shadow-sm ${org.agent.rules.autoBook ? 'translate-x-6' : 'translate-x-0'}`}></div>
                 </button>
              </div>
              <div className="flex items-center justify-between">
                 <div>
                   <p className="text-sm font-black text-slate-900">Auto Escalation</p>
                   <p className="text-[10px] text-slate-400 uppercase font-black">Handover on complexity</p>
                 </div>
                 <button 
                  onClick={() => void saveRules({ autoEscalate: !org.agent.rules.autoEscalate })}
                  className={`w-12 h-6 rounded-full transition-all relative px-1 flex items-center ${org.agent.rules.autoEscalate ? 'bg-indigo-600' : 'bg-slate-300'}`}
                 >
                   <div className={`w-4 h-4 bg-white rounded-full transition-all shadow-sm ${org.agent.rules.autoEscalate ? 'translate-x-6' : 'translate-x-0'}`}></div>
                 </button>
              </div>
            </div>

            <div className="pt-4">
              <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Escalation Mobile</label>
              <input 
                type="tel" 
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none font-medium"
                placeholder="+1 (555) 000-0000"
                value={draftAgent.escalationPhone}
                onChange={e => setDraftAgent(prev => ({ ...prev, escalationPhone: e.target.value }))}
                onBlur={() => {
                  if (draftAgent.escalationPhone !== org.agent.escalationPhone) {
                    void saveAgent({ escalationPhone: draftAgent.escalationPhone }, 'escalationPhone');
                  }
                }}
              />
              <div className="mt-4 flex items-center gap-2 p-3 bg-amber-50 rounded-xl border border-amber-100">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                <p className="text-[10px] text-amber-700 font-bold leading-tight">Callers can reach you instantly by saying "transfer me" or pressing 0.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 p-8 rounded-[2rem] text-white shadow-2xl relative overflow-hidden group">
          <div className="absolute -bottom-8 -right-8 w-32 h-32 bg-indigo-600/20 rounded-full blur-2xl group-hover:scale-150 transition-all duration-700"></div>
          <div className="relative z-10">
            <h4 className="text-xl font-black mb-3">Live Status</h4>
            <div className="flex items-center gap-2 mb-6">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              <p className="text-indigo-200 text-xs font-black uppercase tracking-widest">
                {org.agent.direction === 'outbound' ? 'Outbound from' : 'Inbound on'} {org.agent.twilioPhoneNumber || org.phoneNumber}
              </p>
            </div>
            <button
              onClick={() => void runAction('restart', onRestartAgent)}
              className="w-full bg-white text-slate-900 py-4 rounded-2xl font-black shadow-lg hover:shadow-indigo-500/20 transition-all active:scale-95 text-xs uppercase tracking-widest"
            >
              Restart Agent Shift
            </button>
          </div>
        </div>
        {(error || busyAction) && (
          <div className={`rounded-2xl border px-4 py-3 text-sm font-medium ${error ? 'border-red-100 bg-red-50 text-red-600' : 'border-indigo-100 bg-indigo-50 text-indigo-600'}`}>
            {error || 'Saving changes...'}
          </div>
        )}
      </div>
    </div>
  );
};

export default AgentSettings;
