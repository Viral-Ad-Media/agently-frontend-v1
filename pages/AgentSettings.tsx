import React, { useEffect, useRef, useState } from 'react';
import { Organization, AgentConfig, FAQ, AgentVoice, LeadOutreachSchedule } from '../types';
import { api } from '../services/api';
import AppModal from '../components/AppModal';

// Twilio ConversationRelay voices with provider labels
const VOICES: { id: AgentVoice; label: string; provider: string; gender: string }[] = [
  { id: 'Rachel',       label: 'Rachel',         provider: 'ElevenLabs', gender: 'Female' },
  { id: 'Domi',         label: 'Domi',            provider: 'ElevenLabs', gender: 'Female' },
  { id: 'Bella',        label: 'Bella',           provider: 'ElevenLabs', gender: 'Female' },
  { id: 'Josh',         label: 'Josh',            provider: 'ElevenLabs', gender: 'Male'   },
  { id: 'Arnold',       label: 'Arnold',          provider: 'ElevenLabs', gender: 'Male'   },
  { id: 'Wavenet-F',    label: 'Wavenet F',       provider: 'Google',     gender: 'Female' },
  { id: 'Wavenet-D',    label: 'Wavenet D',       provider: 'Google',     gender: 'Male'   },
  { id: 'Polly-Joanna', label: 'Joanna',          provider: 'Amazon',     gender: 'Female' },
  { id: 'Polly-Matthew',label: 'Matthew',         provider: 'Amazon',     gender: 'Male'   },
];
const TONES     = ['Professional','Friendly','Empathetic'] as const;
const LANGUAGES = ['English','Spanish','French','German','Portuguese','Italian'] as const;

interface AgentSettingsProps {
  org: Organization;
  onUpdateAgent:        (updates: Partial<AgentConfig>) => Promise<void>;
  onCreateVoiceAgent:   (payload?: Partial<AgentConfig>) => Promise<void>;
  onActivateVoiceAgent: (id: string) => Promise<void>;
  onDeleteVoiceAgent:   (id: string) => Promise<void>;
  onUpdateRules:        (ruleUpdates: Partial<AgentConfig['rules']>) => Promise<void>;
  onAddFaq:             () => Promise<void>;
  onUpdateFaq:          (id: string, updates: { question?: string; answer?: string }) => Promise<void>;
  onRemoveFaq:          (id: string) => Promise<void>;
  onSyncFaqs:           (website?: string) => Promise<void>;
  onRestartAgent:       () => Promise<void>;
}

type Tab = 'persona' | 'knowledge' | 'rules';

interface Schedule extends LeadOutreachSchedule {
  startDate?: string;
  endDate?: string;
}

/* ── tiny helpers ── */
const Inp = (p: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input {...p} className={`w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white font-medium text-sm outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all ${p.className ?? ''}`} />
);
const Sel = (p: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) => (
  <select {...p} className={`w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white font-medium text-sm outline-none focus:ring-2 focus:ring-amber-400 transition-all ${p.className ?? ''}`}>{p.children}</select>
);
const Label = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">{children}</p>
);

const AgentSettings: React.FC<AgentSettingsProps> = ({
  org,
  onUpdateAgent, onCreateVoiceAgent, onActivateVoiceAgent, onDeleteVoiceAgent,
  onUpdateRules, onAddFaq, onUpdateFaq, onRemoveFaq, onSyncFaqs, onRestartAgent,
}) => {
  const [tab, setTab]             = useState<Tab>('persona');
  const [draft, setDraft]         = useState(org.agent);
  const [busy, setBusy]           = useState<string | null>(null);
  const [toast, setToast]         = useState<{ msg: string; ok: boolean } | null>(null);

  // Agent detail modal
  const [selectedAgent, setSelectedAgent] = useState<AgentConfig | null>(null);
  const [agentSchedules, setAgentSchedules] = useState<Schedule[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);

  /* knowledge-base state */
  const [scrapeUrl, setScrapeUrl]     = useState(org.profile.website || '');
  const [scrapeStatus, setScrapeStatus] = useState<'idle'|'loading'|'done'|'error'>('idle');
  const [scrapeResult, setScrapeResult] = useState('');
  const [chunks, setChunks]           = useState(0);
  const faqScrollRef                  = useRef<HTMLDivElement>(null);

  useEffect(() => { setDraft(org.agent); }, [org.agent.id]);

  /* ── utils ── */
  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const run = async (key: string, fn: () => Promise<void>, successMsg?: string) => {
    setBusy(key);
    try {
      await fn();
      if (successMsg) showToast(successMsg);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Something went wrong.', false);
    } finally {
      setBusy(null);
    }
  };

  const saveDraftField = <K extends keyof AgentConfig>(key: K, val: AgentConfig[K]) => {
    setDraft(d => ({ ...d, [key]: val }));
    void run(key as string, () => onUpdateAgent({ [key]: val }));
  };

  // Open agent detail modal and load its schedules
  const openAgentModal = async (agent: AgentConfig) => {
    setSelectedAgent(agent);
    setAgentSchedules([]);
    setLoadingSchedules(true);
    try {
      const res = await api.listLeadSchedules();
      const all = (res.schedules || []) as Schedule[];
      // Filter schedules assigned to this agent
      setAgentSchedules(all.filter(s => s.voiceAgentId === agent.id));
    } catch {
      setAgentSchedules([]);
    } finally {
      setLoadingSchedules(false);
    }
  };

  /* ── website scraper ── */
  const handleScrape = async () => {
    if (!scrapeUrl.trim()) return;
    setScrapeStatus('loading');
    setScrapeResult('');
    setChunks(0);
    try {
      const res = await api.importChatbotWebsite(org.activeChatbotId || '', scrapeUrl);
      setScrapeStatus('done');
      setChunks(res.chunksStored ?? 0);
      setScrapeResult(res.message || `✓ ${res.chunksStored} chunks saved to knowledge base.`);
      showToast(`Knowledge base updated — ${res.chunksStored} chunks stored.`);
    } catch (e) {
      setScrapeStatus('error');
      setScrapeResult(e instanceof Error ? e.message : 'Scrape failed.');
      showToast(e instanceof Error ? e.message : 'Scrape failed.', false);
    }
  };

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    {
      id: 'persona', label: 'Persona & Voice',
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>,
    },
    {
      id: 'knowledge', label: 'Knowledge',
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M8 7h6"/><path d="M8 11h8"/></svg>,
    },
    {
      id: 'rules', label: 'Rules & Routing',
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
    },
  ];

  // Campaign progress helper
  const getCampaignProgress = (sch: Schedule) => {
    if (!(sch as any).startDate || !(sch as any).endDate) return null;
    const allDays = sch.windows.flatMap(w => w.weekdays);
    const DAY_IDX: Record<string,number> = {sun:0,mon:1,tue:2,wed:3,thu:4,fri:5,sat:6};
    let total = 0; let completed = 0;
    const cur = new Date((sch as any).startDate);
    const end = new Date((sch as any).endDate);
    const today = new Date(); today.setHours(0,0,0,0);
    while (cur <= end) {
      const code = ['sun','mon','tue','wed','thu','fri','sat'][cur.getDay()];
      if (allDays.includes(code)) { total++; if (cur < today) completed++; }
      cur.setDate(cur.getDate() + 1);
    }
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, remaining: Math.max(0, total - completed), pct, isComplete: total > 0 && completed >= total };
  };

  return (
    <div className="animate-fade-up space-y-6">

      {/* ── Toast ── */}
      {toast && (
        <div className={`fixed top-5 right-5 z-[200] px-5 py-3 rounded-2xl shadow-xl text-sm font-bold flex items-center gap-2.5 transition-all ${toast.ok ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.ok
            ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          }
          {toast.msg}
        </div>
      )}

      {/* ── Header + tab switcher ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900">Agent Settings</h2>
          <p className="text-xs text-slate-400 mt-0.5">Configure how your AI receptionist behaves</p>
        </div>
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl self-start sm:self-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════ PERSONA TAB */}
      {tab === 'persona' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Voice agents fleet — clickable cards */}
          <div className="lg:col-span-3 bg-white rounded-3xl border border-slate-200 shadow-card p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
              <div>
                <h3 className="text-base font-black text-slate-900">Voice Agent Fleet</h3>
                <p className="text-xs text-slate-400 mt-0.5">Click any agent to view details and assigned schedules.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => void run('create-in', () => onCreateVoiceAgent({ direction:'inbound' }), 'Agent created')}
                  className="rounded-xl bg-slate-900 text-white px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all">
                  + Inbound
                </button>
                <button onClick={() => void run('create-out', () => onCreateVoiceAgent({ direction:'outbound' }), 'Agent created')}
                  className="rounded-xl border border-slate-200 text-slate-600 px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:border-amber-300 hover:text-amber-700 transition-all">
                  + Outbound
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {org.voiceAgents.map(agent => {
                const isActive = agent.id === org.activeVoiceAgentId;
                const isOutbound = agent.direction === 'outbound';
                // We don't know schedule count without fetching, so show direction badge
                return (
                  <div key={agent.id}
                    onClick={() => void openAgentModal(agent)}
                    className={`rounded-2xl p-4 border-2 transition-all cursor-pointer group
                      ${isActive
                        ? 'border-amber-400 bg-amber-50/40 hover:border-amber-500'
                        : 'border-slate-100 bg-slate-50 hover:border-amber-200 hover:bg-amber-50/20'}`}>
                    {/* Header row */}
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-slate-900 truncate">{agent.name}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mt-0.5">{agent.voice}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 ml-2 shrink-0">
                        {isActive && (
                          <span className="rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest">Live</span>
                        )}
                        {/* Direction badge — outbound shows as "Outbound / Assigned" indicator */}
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-widest
                          ${isOutbound
                            ? 'bg-indigo-100 text-indigo-700'
                            : 'bg-slate-100 text-slate-500'}`}>
                          {agent.direction}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-500 line-clamp-2 mb-3">{agent.greeting}</p>

                    {/* Click hint */}
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] text-slate-400 group-hover:text-amber-600 transition-colors flex items-center gap-1">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
                        View details
                      </p>
                      <div className="flex gap-1.5" onClick={e => e.stopPropagation()}>
                        {!isActive && (
                          <button onClick={e => { e.stopPropagation(); void run(`act-${agent.id}`, () => onActivateVoiceAgent(agent.id), 'Agent activated'); }}
                            className="rounded-lg bg-slate-900 text-white px-2.5 py-1 text-[9px] font-black uppercase tracking-widest hover:bg-slate-700 transition-all">
                            Activate
                          </button>
                        )}
                        <button onClick={e => { e.stopPropagation(); void run(`del-${agent.id}`, () => onDeleteVoiceAgent(agent.id), 'Deleted'); }}
                          disabled={org.voiceAgents.length <= 1}
                          className="rounded-lg border border-slate-200 text-slate-400 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest hover:border-red-200 hover:text-red-500 disabled:opacity-30 transition-all">
                          Del
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Left: identity fields */}
          <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 shadow-card p-6 space-y-5">
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
              Identity & Language
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <Label>Agent Name</Label>
                <Inp value={draft.name} onChange={e => setDraft(d => ({...d, name: e.target.value}))}
                  onBlur={() => { if (draft.name !== org.agent.name) saveDraftField('name', draft.name); }} />
              </div>
              <div>
                <Label>Direction</Label>
                <Sel value={draft.direction} onChange={e => saveDraftField('direction', e.target.value as AgentConfig['direction'])}>
                  <option value="inbound">Inbound</option>
                  <option value="outbound">Outbound</option>
                </Sel>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <Label>Voice Profile</Label>
                <Sel value={draft.voice} onChange={e => saveDraftField('voice', e.target.value as AgentConfig['voice'])}>
                  {['ElevenLabs','Google','Amazon'].map(provider => (
                    <optgroup key={provider} label={`${provider}`}>
                      {VOICES.filter(v => v.provider === provider).map(v => (
                        <option key={v.id} value={v.id}>{v.label} ({v.gender})</option>
                      ))}
                    </optgroup>
                  ))}
                </Sel>
                <p className="text-[10px] text-slate-400 mt-1">
                  {(() => { const v = VOICES.find(x => x.id === draft.voice); return v ? `${v.provider} · ${v.gender} voice` : ''; })()}
                </p>
              </div>
              <div>
                <Label>Language</Label>
                <Sel value={draft.language} onChange={e => saveDraftField('language', e.target.value as AgentConfig['language'])}>
                  {LANGUAGES.map(l => <option key={l}>{l}</option>)}
                </Sel>
              </div>
              <div>
                <Label>Assigned Number</Label>
                <div className="w-full px-4 py-2.5 rounded-xl border border-slate-100 bg-slate-50 font-medium text-sm text-slate-500 flex items-center gap-2">
                  <span className="text-base">📱</span>
                  {draft.twilioPhoneNumber || 'Not assigned'}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Manage in <strong>Phone Numbers</strong> section</p>
              </div>
            </div>

            <div>
              <Label>Greeting Message</Label>
              <textarea rows={2}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white font-medium text-sm outline-none focus:ring-2 focus:ring-amber-400 transition-all resize-none"
                value={draft.greeting}
                onChange={e => setDraft(d => ({...d, greeting: e.target.value}))}
                onBlur={() => { if (draft.greeting !== org.agent.greeting) saveDraftField('greeting', draft.greeting); }} />
              <p className="text-xs text-slate-400 mt-1 italic">Tip: Mention your company name in the first sentence.</p>
            </div>

            <div>
              <Label>Communication Tone</Label>
              <div className="grid grid-cols-3 gap-2">
                {TONES.map(t => (
                  <button key={t} onClick={() => saveDraftField('tone', t)}
                    className={`py-2.5 rounded-xl border-2 text-xs font-black transition-all ${draft.tone === t ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-slate-100 text-slate-500 bg-slate-50 hover:border-slate-200'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right: live status card */}
          <div className="space-y-4">
            <div className="bg-slate-900 rounded-3xl p-6 text-white relative overflow-hidden">
              <div className="absolute -bottom-6 -right-6 w-28 h-28 bg-amber-500/15 rounded-full blur-2xl pointer-events-none" />
              <div className="relative z-10">
                <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-3">Live Status</p>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                  <span className="text-xs font-bold text-emerald-300">Online</span>
                </div>
                <p className="text-sm font-bold text-white/70 mb-5">
                  {org.agent.direction === 'outbound' ? 'Outbound from' : 'Inbound on'}{' '}
                  <span className="text-white">{org.agent.twilioPhoneNumber || org.phoneNumber || 'no number'}</span>
                </p>
                <button onClick={() => void run('restart', onRestartAgent, 'Agent restarted')}
                  disabled={busy === 'restart'}
                  className="w-full rounded-xl bg-white text-slate-900 py-2.5 text-[10px] font-black uppercase tracking-widest hover:bg-amber-50 active:scale-95 disabled:opacity-50 transition-all">
                  {busy === 'restart' ? 'Restarting…' : 'Restart Shift'}
                </button>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5">
              <div className="flex gap-2.5 items-start">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                <p className="text-xs text-amber-800 font-medium leading-relaxed">
                  Callers can press <strong>0</strong> or say "transfer me" to reach a human at any time.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════ KNOWLEDGE TAB */}
      {tab === 'knowledge' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-card p-6">
            <div className="flex items-start justify-between mb-5">
              <div>
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  Website Scraper
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Fetch your site's content and save it to the knowledge base.</p>
              </div>
              {scrapeStatus === 'done' && (
                <span className="shrink-0 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 text-[10px] font-black uppercase tracking-widest">
                  {chunks} chunks saved
                </span>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="flex-1 relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">https://</span>
                <input type="text" value={scrapeUrl} onChange={e => setScrapeUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && void handleScrape()}
                  placeholder="yourwebsite.com"
                  className="w-full pl-[4.5rem] pr-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-medium outline-none focus:ring-2 focus:ring-amber-400 focus:bg-white transition-all" />
              </div>
              <button onClick={handleScrape}
                disabled={!scrapeUrl.trim() || scrapeStatus === 'loading'}
                className="shrink-0 rounded-2xl bg-slate-900 text-white px-5 py-3 text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 disabled:opacity-40 flex items-center gap-2 transition-all active:scale-95">
                {scrapeStatus === 'loading'
                  ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />Scraping…</>
                  : 'Import Website'}
              </button>
            </div>
            {scrapeResult && (
              <div className={`rounded-2xl px-4 py-3 text-xs font-medium ${scrapeStatus === 'error' ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'}`}>
                {scrapeResult}
              </div>
            )}
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-card p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-base font-black text-slate-900">FAQ Knowledge Entries</h3>
                <p className="text-xs text-slate-400 mt-0.5">Q&A pairs the AI uses to answer callers.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => void run('sync', () => onSyncFaqs(scrapeUrl || org.profile.website), 'FAQs regenerated')}
                  disabled={busy === 'sync'}
                  className="rounded-xl border border-slate-200 text-slate-600 px-3 py-2 text-[10px] font-black uppercase tracking-widest hover:border-amber-300 hover:text-amber-700 transition-all flex items-center gap-1.5">
                  {busy === 'sync' ? 'Syncing…' : 'Regenerate'}
                </button>
                <button onClick={() => void run('add-faq', onAddFaq, 'FAQ added')}
                  className="rounded-xl bg-slate-900 text-white px-3 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all">
                  + Add
                </button>
              </div>
            </div>
            {draft.faqs.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-slate-200 py-12 text-center">
                <p className="text-3xl mb-3">💡</p>
                <p className="text-sm font-bold text-slate-400">No FAQ entries yet.</p>
                <p className="text-xs text-slate-300 mt-1">Import a website or click + Add.</p>
              </div>
            ) : (
              <>
                <div ref={faqScrollRef} className="overflow-x-auto pb-2 -mx-1 px-1">
                  <div className="flex gap-3" style={{ minWidth: 'max-content' }}>
                    {draft.faqs.map((faq, i) => {
                      const orig = org.agent.faqs.find(f => f.id === faq.id);
                      return (
                        <div key={faq.id}
                          className="w-72 shrink-0 rounded-2xl border border-slate-200 bg-slate-50 p-4 flex flex-col gap-2.5 group hover:border-amber-200 hover:bg-amber-50/20 transition-all">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">#{i+1}</span>
                            <button onClick={() => void run(`del-faq-${faq.id}`, () => onRemoveFaq(faq.id), 'Removed')}
                              className="w-6 h-6 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-300 hover:text-red-500 hover:border-red-200 opacity-0 group-hover:opacity-100 transition-all">
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                          </div>
                          <input type="text" value={faq.question}
                            onChange={e => setDraft(d => ({ ...d, faqs: d.faqs.map(f => f.id === faq.id ? {...f, question: e.target.value} : f) }))}
                            onBlur={() => { if (faq.question !== (orig?.question || '')) void run(`q-${faq.id}`, () => onUpdateFaq(faq.id, { question: faq.question })); }}
                            placeholder="Question"
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-amber-400 transition-all" />
                          <textarea rows={3} value={faq.answer}
                            onChange={e => setDraft(d => ({ ...d, faqs: d.faqs.map(f => f.id === faq.id ? {...f, answer: e.target.value} : f) }))}
                            onBlur={() => { if (faq.answer !== (orig?.answer || '')) void run(`a-${faq.id}`, () => onUpdateFaq(faq.id, { answer: faq.answer })); }}
                            placeholder="Answer"
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs resize-none outline-none focus:ring-2 focus:ring-amber-400 transition-all" />
                        </div>
                      );
                    })}
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 text-center mt-3">← scroll to see all {draft.faqs.length} entries →</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════ RULES TAB */}
      {tab === 'rules' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-card p-6 space-y-5">
            <h3 className="text-base font-black text-slate-900">Routing & Behaviour</h3>
            {([
              { key: 'captureAllLeads', label: 'Lead Capture', desc: 'Always collect caller name, phone & reason' },
              { key: 'autoBook',        label: 'Booking Engine', desc: 'Allow callers to schedule appointments' },
              { key: 'autoEscalate',    label: 'Auto Escalation', desc: 'Forward to human on complex queries' },
            ] as { key: keyof AgentConfig['rules']; label: string; desc: string }[]).map(r => (
              <div key={r.key} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100 hover:border-slate-200 transition-all">
                <div>
                  <p className="text-sm font-black text-slate-900">{r.label}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{r.desc}</p>
                </div>
                <button onClick={() => void run(r.key, () => onUpdateRules({ [r.key]: !org.agent.rules[r.key] }))}
                  className={`w-11 h-6 rounded-full relative transition-all flex items-center px-0.5 ${org.agent.rules[r.key] ? 'bg-amber-500' : 'bg-slate-200'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full shadow-sm transition-all ${org.agent.rules[r.key] ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
            ))}
            <div>
              <Label>Escalation Phone Number</Label>
              <Inp type="tel" placeholder="+1 (555) 000-0000" value={draft.escalationPhone}
                onChange={e => setDraft(d => ({...d, escalationPhone: e.target.value}))}
                onBlur={() => { if (draft.escalationPhone !== org.agent.escalationPhone) saveDraftField('escalationPhone', draft.escalationPhone); }} />
            </div>
            <div>
              <Label>Business Hours</Label>
              <Inp placeholder="Mon-Fri 9AM-6PM" value={draft.businessHours ?? ''}
                onChange={e => setDraft(d => ({...d, businessHours: e.target.value}))}
                onBlur={() => saveDraftField('businessHours', draft.businessHours ?? '')} />
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-card p-6">
            <h3 className="text-base font-black text-slate-900 mb-5">Data Capture Fields</h3>
            <div className="flex flex-wrap gap-2">
              {['name','phone','email','reason','budget','timeline'].map(field => {
                const active = (draft.dataCaptureFields || []).includes(field);
                return (
                  <button key={field} onClick={() => {
                    const next = active
                      ? (draft.dataCaptureFields || []).filter(f => f !== field)
                      : [...(draft.dataCaptureFields || []), field];
                    setDraft(d => ({...d, dataCaptureFields: next}));
                    void run(`dcf-${field}`, () => onUpdateAgent({ dataCaptureFields: next }));
                  }}
                  className={`rounded-full border-2 px-4 py-1.5 text-[11px] font-black uppercase tracking-wider transition-all ${active ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-400 hover:border-slate-300'}`}>
                    {active && '✓ '}{field}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-slate-400 mt-4">These fields are requested from callers before ending the call.</p>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════ AGENT DETAIL MODAL */}
      {selectedAgent && (
        <AppModal
          open
          onClose={() => setSelectedAgent(null)}
          title={selectedAgent.name}
          description={`${selectedAgent.direction} agent · ${selectedAgent.voice} voice · ${selectedAgent.twilioPhoneNumber || 'No number assigned'}`}
          size="lg"
          footer={
            <div className="flex gap-3">
              <button onClick={() => setSelectedAgent(null)}
                className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-black text-slate-600 hover:bg-slate-50">
                Close
              </button>
              {selectedAgent.id !== org.activeVoiceAgentId && (
                <button onClick={() => void run(`act-${selectedAgent.id}`, async () => {
                  await onActivateVoiceAgent(selectedAgent.id);
                  setSelectedAgent(null);
                }, 'Agent activated')}
                  className="flex-1 rounded-xl bg-amber-500 py-3 text-sm font-black text-white hover:bg-amber-600">
                  Activate This Agent
                </button>
              )}
            </div>
          }
        >
          <div className="space-y-5">
            {/* Agent info grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Direction</p>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest
                    ${selectedAgent.direction === 'outbound' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                    {selectedAgent.direction}
                  </span>
                  {selectedAgent.id === org.activeVoiceAgentId && (
                    <span className="rounded-full bg-amber-100 text-amber-700 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest">Live</span>
                  )}
                </div>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Phone number</p>
                <p className="text-sm font-black text-slate-900">{selectedAgent.twilioPhoneNumber || '—'}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Voice</p>
                <p className="text-sm font-black text-slate-900">{selectedAgent.voice}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Language</p>
                <p className="text-sm font-black text-slate-900">{selectedAgent.language}</p>
              </div>
            </div>

            {/* Greeting */}
            {selectedAgent.greeting && (
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Greeting</p>
                <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700 italic">"{selectedAgent.greeting}"</p>
              </div>
            )}

            {/* Assigned schedules */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Outreach Schedules</p>
                {!loadingSchedules && (
                  <span className={`rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-widest
                    ${agentSchedules.length > 0
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-100 text-slate-500'}`}>
                    {agentSchedules.length > 0 ? `${agentSchedules.length} assigned` : 'Not assigned'}
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
                  <p className="text-sm font-bold text-slate-400">No outreach schedules assigned</p>
                  <p className="text-xs text-slate-300 mt-1">Go to Lead CRM → Tag collections → Schedule to assign this agent.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {agentSchedules.map(sch => {
                    const prog = getCampaignProgress(sch);
                    return (
                      <div key={sch.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div>
                            <p className="font-black text-slate-900 text-sm">{sch.name || `Tag · ${sch.tag}`}</p>
                            <p className="text-xs text-slate-400">
                              {sch.targetType === 'tag' ? `Tag: #${sch.tag}` : `Lead schedule`}
                              {(sch as any).startDate && ` · ${(sch as any).startDate} → ${(sch as any).endDate || '?'}`}
                            </p>
                            <p className="text-xs text-slate-400">{sch.timezone}</p>
                            <p className="text-xs text-slate-500 mt-1">
                              {sch.windows.map(w => `${w.weekdays.join(', ')} @ ${w.time}`).join(' · ')}
                            </p>
                          </div>
                          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-widest
                            ${sch.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                            {sch.isActive ? 'Active' : 'Paused'}
                          </span>
                        </div>
                        {prog && (
                          <div>
                            <div className="flex justify-between text-[10px] font-black mb-1">
                              {prog.isComplete
                                ? <span className="text-emerald-600">✓ Campaign complete</span>
                                : <span className="text-slate-500">{prog.completed} of {prog.total} calls reached</span>}
                              <span className="text-slate-400">{prog.remaining} remaining</span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${prog.pct}%` }} />
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
