import React, { useEffect, useState, useCallback } from 'react';
import { Organization, AvailablePhoneNumber, OwnedPhoneNumber, PhoneCountry, AgentConfig } from '../types';
import { twilioApi } from '../services/api';

// ── Tiny helpers ─────────────────────────────────────────────
const Inp = (p: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input {...p} className={`w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white font-medium text-sm outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all ${p.className ?? ''}`} />
);
const Sel = (p: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) => (
  <select {...p} className={`w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white font-medium text-sm outline-none focus:ring-2 focus:ring-amber-400 transition-all ${p.className ?? ''}`}>{p.children}</select>
);
const Label = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">{children}</p>
);

interface PhoneNumbersProps {
  org: Organization;
  onAgentUpdated: (updates: Partial<AgentConfig>) => void;
}

type Tab = 'assigned' | 'search' | 'owned';

const FLAG_MAP: Record<string, string> = {
  US: '🇺🇸', GB: '🇬🇧', CA: '🇨🇦', AU: '🇦🇺', DE: '🇩🇪', FR: '🇫🇷',
  ES: '🇪🇸', IT: '🇮🇹', BR: '🇧🇷', MX: '🇲🇽', IN: '🇮🇳', JP: '🇯🇵',
  SG: '🇸🇬', NL: '🇳🇱', SE: '🇸🇪', NO: '🇳🇴', DK: '🇩🇰', PL: '🇵🇱',
  NZ: '🇳🇿', ZA: '🇿🇦', IE: '🇮🇪', CH: '🇨🇭', AT: '🇦🇹', BE: '🇧🇪',
  PT: '🇵🇹', FI: '🇫🇮', NG: '🇳🇬', GH: '🇬🇭', KE: '🇰🇪',
};

const PhoneNumbers: React.FC<PhoneNumbersProps> = ({ org, onAgentUpdated }) => {
  const [tab, setTab] = useState<Tab>('assigned');
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Search state
  const [countries, setCountries] = useState<PhoneCountry[]>([]);
  const [country, setCountry] = useState('US');
  const [numberType, setNumberType] = useState<'Local' | 'TollFree' | 'Mobile'>('Local');
  const [areaCode, setAreaCode] = useState('');
  const [contains, setContains] = useState('');
  const [searchResults, setSearchResults] = useState<AvailablePhoneNumber[]>([]);
  const [searchDone, setSearchDone] = useState(false);

  // Owned numbers
  const [ownedNumbers, setOwnedNumbers] = useState<OwnedPhoneNumber[]>([]);
  const [ownedLoaded, setOwnedLoaded] = useState(false);

  // Agent selector (which agent to assign a number to)
  const [targetAgentId, setTargetAgentId] = useState(org.activeVoiceAgentId || org.agent.id || '');

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  // Load countries on mount
  useEffect(() => {
    twilioApi.listCountries()
      .then(r => setCountries(r.countries || []))
      .catch(() => {});
  }, []);

  // Load owned numbers when that tab opens
  useEffect(() => {
    if (tab === 'owned' && !ownedLoaded) {
      setBusy('owned');
      twilioApi.listOwned()
        .then(r => { setOwnedNumbers(r.numbers || []); setOwnedLoaded(true); })
        .catch(e => showToast(e.message, false))
        .finally(() => setBusy(null));
    }
  }, [tab, ownedLoaded]);

  const handleSearch = useCallback(async () => {
    setBusy('search');
    setSearchDone(false);
    setSearchResults([]);
    try {
      const r = await twilioApi.searchNumbers({ country, type: numberType, areaCode: areaCode || undefined, contains: contains || undefined, limit: 20 });
      setSearchResults(r.numbers || []);
      setSearchDone(true);
    } catch (e: any) {
      showToast(e.message || 'Search failed', false);
    } finally {
      setBusy(null);
    }
  }, [country, numberType, areaCode, contains]);

  const handlePurchase = async (number: AvailablePhoneNumber) => {
    if (!window.confirm(`Purchase ${number.friendlyName}? This will be charged to your Twilio account.`)) return;
    setBusy(`buy-${number.phoneNumber}`);
    try {
      await twilioApi.purchaseNumber(number.phoneNumber, targetAgentId || undefined);
      onAgentUpdated({ twilioPhoneNumber: number.phoneNumber });
      showToast(`✓ ${number.friendlyName} purchased and assigned!`);
      setOwnedLoaded(false); // invalidate cache
    } catch (e: any) {
      showToast(e.message || 'Purchase failed', false);
    } finally {
      setBusy(null);
    }
  };

  const handleAssign = async (owned: OwnedPhoneNumber) => {
    setBusy(`assign-${owned.sid}`);
    try {
      await twilioApi.assignNumber(owned.sid, owned.phoneNumber, targetAgentId || undefined);
      onAgentUpdated({ twilioPhoneNumber: owned.phoneNumber, twilioPhoneSid: owned.sid });
      showToast(`✓ ${owned.phoneNumber} assigned to agent!`);
    } catch (e: any) {
      showToast(e.message || 'Assign failed', false);
    } finally {
      setBusy(null);
    }
  };

  const handleRelease = async (owned: OwnedPhoneNumber) => {
    if (!window.confirm(`Release ${owned.phoneNumber}? This cannot be undone.`)) return;
    setBusy(`release-${owned.sid}`);
    try {
      await twilioApi.releaseNumber(owned.sid);
      setOwnedNumbers(prev => prev.filter(n => n.sid !== owned.sid));
      showToast(`${owned.phoneNumber} released.`);
    } catch (e: any) {
      showToast(e.message || 'Release failed', false);
    } finally {
      setBusy(null);
    }
  };

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'assigned', label: 'Agent Numbers', icon: '📱' },
    { id: 'search',   label: 'Get a Number',  icon: '🔍' },
    { id: 'owned',    label: 'All Owned',      icon: '🗂️' },
  ];

  const activeAgent = org.voiceAgents.find(a => a.id === targetAgentId) || org.agent;

  return (
    <div className="animate-fade-up space-y-6">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-[200] px-5 py-3 rounded-2xl shadow-xl text-sm font-bold flex items-center gap-2.5 ${toast.ok ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.ok
            ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          }
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900">Phone Numbers</h2>
          <p className="text-xs text-slate-400 mt-0.5">Provision Twilio numbers from your master account — tenants don't need their own Twilio credentials</p>
        </div>
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl self-start sm:self-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <span>{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Agent selector (used in search + owned tabs) */}
      {tab !== 'assigned' && org.voiceAgents.length > 1 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-4">
          <div className="w-8 h-8 rounded-xl bg-amber-400 flex items-center justify-center text-white text-sm">📞</div>
          <div className="flex-1">
            <Label>Assign purchased number to</Label>
            <Sel value={targetAgentId} onChange={e => setTargetAgentId(e.target.value)}>
              {org.voiceAgents.map(a => (
                <option key={a.id} value={a.id}>{a.name} ({a.direction})</option>
              ))}
            </Sel>
          </div>
        </div>
      )}

      {/* ═══════ ASSIGNED TAB ═══════ */}
      {tab === 'assigned' && (
        <div className="space-y-4">
          {org.voiceAgents.map(agent => {
            const isActive = agent.id === org.activeVoiceAgentId;
            return (
              <div key={agent.id}
                className={`bg-white rounded-3xl border-2 shadow-card p-6 ${isActive ? 'border-amber-300' : 'border-slate-100'}`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-lg ${isActive ? 'bg-amber-100' : 'bg-slate-100'}`}>
                      {agent.direction === 'inbound' ? '📥' : '📤'}
                    </div>
                    <div>
                      <p className="font-black text-slate-900">{agent.name}</p>
                      <p className="text-xs text-slate-400 uppercase tracking-wide">{agent.direction} · {agent.voice}</p>
                    </div>
                    {isActive && <span className="rounded-full bg-amber-100 text-amber-700 px-3 py-1 text-[10px] font-black uppercase tracking-widest">Active</span>}
                  </div>
                </div>

                {agent.twilioPhoneNumber ? (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4 bg-slate-50 rounded-2xl p-4">
                    <div className="flex-1">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Assigned Number</p>
                      <p className="text-xl font-black text-slate-900 tracking-tight">{agent.twilioPhoneNumber}</p>
                      {agent.twilioPhoneSid && (
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">SID: {agent.twilioPhoneSid}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 text-emerald-600 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl text-xs font-black">
                        <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                        Ready for calls
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-4">
                    <div className="text-2xl">📵</div>
                    <div className="flex-1">
                      <p className="text-sm font-black text-slate-500">No number assigned yet</p>
                      <p className="text-xs text-slate-400 mt-0.5">Go to "Get a Number" tab to search and purchase one</p>
                    </div>
                    <button onClick={() => { setTargetAgentId(agent.id); setTab('search'); }}
                      className="shrink-0 rounded-xl bg-slate-900 text-white px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-amber-600 transition-all">
                      Get Number →
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ═══════ SEARCH TAB ═══════ */}
      {tab === 'search' && (
        <div className="space-y-5">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-card p-6">
            <h3 className="text-base font-black text-slate-900 mb-5">Search Available Numbers</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
              <div>
                <Label>Country</Label>
                <Sel value={country} onChange={e => setCountry(e.target.value)}>
                  {countries.length > 0
                    ? countries.map(c => (
                        <option key={c.country} value={c.country}>
                          {FLAG_MAP[c.country] || '🌍'} {c.countryName} ({c.country})
                        </option>
                      ))
                    : <>
                        <option value="US">🇺🇸 United States (US)</option>
                        <option value="GB">🇬🇧 United Kingdom (GB)</option>
                        <option value="CA">🇨🇦 Canada (CA)</option>
                        <option value="AU">🇦🇺 Australia (AU)</option>
                        <option value="DE">🇩🇪 Germany (DE)</option>
                        <option value="FR">🇫🇷 France (FR)</option>
                        <option value="NG">🇳🇬 Nigeria (NG)</option>
                        <option value="GH">🇬🇭 Ghana (GH)</option>
                        <option value="ZA">🇿🇦 South Africa (ZA)</option>
                      </>
                  }
                </Sel>
              </div>
              <div>
                <Label>Number Type</Label>
                <Sel value={numberType} onChange={e => setNumberType(e.target.value as any)}>
                  <option value="Local">Local</option>
                  <option value="TollFree">Toll Free</option>
                  <option value="Mobile">Mobile</option>
                </Sel>
              </div>
              <div>
                <Label>Area Code (US/CA only)</Label>
                <Inp placeholder="e.g. 212" value={areaCode} onChange={e => setAreaCode(e.target.value)} maxLength={3} />
              </div>
              <div>
                <Label>Contains digits</Label>
                <Inp placeholder="e.g. 555" value={contains} onChange={e => setContains(e.target.value)} />
              </div>
            </div>

            <button onClick={handleSearch} disabled={busy === 'search'}
              className="w-full sm:w-auto rounded-2xl bg-slate-900 text-white px-8 py-3 text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 disabled:opacity-50 flex items-center justify-center gap-2 transition-all active:scale-95">
              {busy === 'search'
                ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Searching…</>
                : <>🔍 Search Numbers</>
              }
            </button>
          </div>

          {/* Results */}
          {searchDone && (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-card p-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-base font-black text-slate-900">
                  {searchResults.length > 0 ? `${searchResults.length} numbers available` : 'No numbers found'}
                </h3>
                {org.voiceAgents.length > 1 && (
                  <p className="text-xs text-slate-400">Assigning to: <strong>{activeAgent.name}</strong></p>
                )}
              </div>

              {searchResults.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-slate-200 py-12 text-center">
                  <div className="text-3xl mb-3">🔭</div>
                  <p className="text-sm font-bold text-slate-400">No numbers found for these filters.</p>
                  <p className="text-xs text-slate-300 mt-1">Try a different country, type, or area code.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {searchResults.map(num => (
                    <div key={num.phoneNumber}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4 hover:border-amber-300 hover:bg-amber-50/20 transition-all group">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-base font-black text-slate-900">{num.friendlyName}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{num.phoneNumber}</p>
                        </div>
                        <span className="text-lg">{FLAG_MAP[num.isoCountry] || '🌍'}</span>
                      </div>
                      {(num.locality || num.region) && (
                        <p className="text-xs text-slate-500 mb-3">{[num.locality, num.region].filter(Boolean).join(', ')}</p>
                      )}
                      <div className="flex gap-1.5 mb-3">
                        {num.capabilities.voice && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">Voice</span>}
                        {num.capabilities.sms   && <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">SMS</span>}
                        {num.capabilities.mms   && <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-bold">MMS</span>}
                      </div>
                      <button
                        onClick={() => handlePurchase(num)}
                        disabled={!!busy}
                        className="w-full rounded-xl bg-slate-900 text-white py-2 text-[10px] font-black uppercase tracking-widest hover:bg-amber-600 disabled:opacity-50 transition-all active:scale-95">
                        {busy === `buy-${num.phoneNumber}` ? 'Purchasing…' : 'Purchase & Assign'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══════ OWNED TAB ═══════ */}
      {tab === 'owned' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-card p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-black text-slate-900">Numbers on Master Account</h3>
            <button onClick={() => { setOwnedLoaded(false); }}
              className="text-[10px] font-black text-slate-400 hover:text-amber-600 uppercase tracking-widest flex items-center gap-1">
              ↻ Refresh
            </button>
          </div>

          {busy === 'owned' ? (
            <div className="py-16 text-center">
              <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-slate-400">Loading your Twilio numbers…</p>
            </div>
          ) : ownedNumbers.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-200 py-12 text-center">
              <div className="text-3xl mb-3">📭</div>
              <p className="text-sm font-bold text-slate-400">No numbers on this Twilio account yet.</p>
              <p className="text-xs text-slate-300 mt-1">Purchase one from the "Get a Number" tab.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {ownedNumbers.map(num => {
                const assignedTo = org.voiceAgents.find(a => a.twilioPhoneNumber === num.phoneNumber);
                return (
                  <div key={num.sid}
                    className="flex flex-col sm:flex-row sm:items-center gap-4 border border-slate-200 rounded-2xl p-4 hover:border-slate-300 transition-all">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-base font-black text-slate-900">{num.phoneNumber}</p>
                        {assignedTo && (
                          <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-black">
                            {assignedTo.name}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 font-mono">{num.sid}</p>
                      <p className="text-[10px] text-slate-300 mt-0.5">
                        Added {new Date(num.dateCreated).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {!assignedTo && (
                        <button
                          onClick={() => handleAssign(num)}
                          disabled={!!busy}
                          className="rounded-xl bg-slate-900 text-white px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-amber-600 disabled:opacity-50 transition-all">
                          {busy === `assign-${num.sid}` ? 'Assigning…' : 'Assign to Agent'}
                        </button>
                      )}
                      <button
                        onClick={() => handleRelease(num)}
                        disabled={!!busy}
                        className="rounded-xl border border-red-200 text-red-400 px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-red-50 hover:border-red-300 disabled:opacity-40 transition-all">
                        {busy === `release-${num.sid}` ? 'Releasing…' : 'Release'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}


    </div>
  );
};

export default PhoneNumbers;
