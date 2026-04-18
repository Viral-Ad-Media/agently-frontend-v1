import React, { useState } from 'react';
import { CallRecord, CallOutcome } from '../types';

const OUTCOME_STYLE: Record<string, string> = {
  'Lead Captured':       'bg-emerald-50 text-emerald-700 border-emerald-100',
  'Appointment Booked':  'bg-indigo-50 text-indigo-700 border-indigo-100',
  'FAQ Answered':        'bg-blue-50 text-blue-600 border-blue-100',
  'Escalated':           'bg-amber-50 text-amber-700 border-amber-100',
  'Voicemail':           'bg-slate-100 text-slate-500 border-slate-200',
};

const OUTCOME_DOT: Record<string, string> = {
  'Lead Captured': 'bg-emerald-500', 'Appointment Booked': 'bg-indigo-500',
  'FAQ Answered': 'bg-blue-400', 'Escalated': 'bg-amber-500', 'Voicemail': 'bg-slate-300',
};

const FILTERS = ['All', ...Object.values(CallOutcome)];

const CallLogs: React.FC<{ calls: CallRecord[]; onDownloadReport: (callId: string) => Promise<void> }> = ({ calls, onDownloadReport }) => {
  const [search, setSearch]         = useState('');
  const [filter, setFilter]         = useState('All');
  const [selected, setSelected]     = useState<CallRecord | null>(null);
  const [error, setError]           = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);

  const filtered = calls.filter(c => {
    const matchSearch = (c.callerName || '').toLowerCase().includes(search.toLowerCase()) ||
                        (c.callerPhone || '').includes(search);
    const matchFilter = filter === 'All' || c.outcome === filter;
    return matchSearch && matchFilter;
  });

  const stats = {
    total:    calls.length,
    leads:    calls.filter(c => c.outcome === CallOutcome.LEAD_CAPTURED || c.outcome === CallOutcome.APPOINTMENT_BOOKED).length,
    missed:   calls.filter(c => c.outcome === CallOutcome.VOICEMAIL || c.outcome === CallOutcome.ESCALATED).length,
    avgDur:   calls.length ? Math.round(calls.reduce((s, c) => s + c.duration, 0) / calls.length) : 0,
  };

  const handleDownload = async (callId: string, e: React.MouseEvent) => {
    e.stopPropagation(); setError(''); setDownloading(callId);
    try { await onDownloadReport(callId); }
    catch (err) { setError(err instanceof Error ? err.message : 'Download failed'); }
    finally { setDownloading(null); }
  };

  return (
    <div className="space-y-5 animate-fade-up">
      {error && <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">{error}</div>}

      {/* Mini stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Calls',  value: stats.total,                      icon: 'fa-phone-volume',  color: 'text-indigo-600 bg-indigo-50' },
          { label: 'Leads',        value: stats.leads,                      icon: 'fa-users',          color: 'text-emerald-600 bg-emerald-50' },
          { label: 'Missed',       value: stats.missed,                     icon: 'fa-phone-slash',    color: 'text-amber-600 bg-amber-50' },
          { label: 'Avg Duration', value: `${Math.floor(stats.avgDur/60)}m ${stats.avgDur%60}s`, icon: 'fa-stopwatch', color: 'text-blue-600 bg-blue-50' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${s.color}`}>
              <i className={`fa-sharp fa-solid ${s.icon} text-sm`} />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{s.label}</p>
              <p className="font-black text-slate-900">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Header + filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-900">Call History</h2>
          <p className="text-xs text-slate-400">{filtered.length} of {calls.length} calls</p>
        </div>
        <div className="flex gap-3 sm:ml-auto flex-wrap">
          <div className="relative">
            <i className="fa-sharp fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
            <input type="text" placeholder="Search caller…" value={search} onChange={e => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium outline-none focus:ring-2 focus:ring-amber-400 w-52" />
          </div>
          <select value={filter} onChange={e => setFilter(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-[10px] font-black uppercase tracking-widest outline-none bg-white focus:ring-2 focus:ring-amber-400">
            {FILTERS.map(f => <option key={f} value={f}>{f === 'All' ? 'All Outcomes' : f}</option>)}
          </select>
        </div>
      </div>

      {/* Outcome filter pills */}
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all border ${filter === f ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
            {f}
          </button>
        ))}
      </div>

      {/* Call cards */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-3xl border-2 border-dashed border-slate-200 py-20 text-center">
          <i className="fa-sharp fa-solid fa-phone-slash text-4xl text-slate-200 mb-4 block" />
          <p className="text-slate-400 font-bold">No calls match your filters</p>
          <p className="text-xs text-slate-300 mt-1">{calls.length === 0 ? 'Calls will appear here once your agent starts receiving them.' : 'Try a different filter or search term.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(call => (
            <div key={call.id}
              className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer group"
              onClick={() => setSelected(call)}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-black text-sm shrink-0">
                    {(call.callerName || 'U')[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-black text-slate-900">{call.callerName || 'Unknown Caller'}</p>
                      <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border uppercase tracking-wider ${OUTCOME_STYLE[call.outcome] || 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                        <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${OUTCOME_DOT[call.outcome] || 'bg-slate-400'}`} />
                        {call.outcome}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <p className="text-xs text-slate-400">{call.callerPhone}</p>
                      <span className="text-slate-200">·</span>
                      <p className="text-xs text-slate-400">{Math.floor(call.duration/60)}m {call.duration%60}s</p>
                      <span className="text-slate-200">·</span>
                      <p className="text-xs text-slate-400">{new Date(call.timestamp).toLocaleDateString()} {new Date(call.timestamp).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</p>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={e => { e.stopPropagation(); setSelected(call); }}
                    className="px-4 py-2 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-amber-600 transition-all">
                    Transcript
                  </button>
                  <button onClick={e => void handleDownload(call.id, e)} disabled={downloading === call.id}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 text-[10px] font-black uppercase tracking-widest hover:border-slate-300 disabled:opacity-50 transition-all">
                    {downloading === call.id ? <i className="fa-sharp fa-solid fa-spinner fa-spin" /> : 'Report'}
                  </button>
                </div>
              </div>
              {call.summary && (
                <p className="mt-3 text-xs text-slate-500 italic bg-slate-50 rounded-xl px-4 py-2.5 line-clamp-2">"{call.summary}"</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Transcript modal */}
      {selected && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
          onClick={e => { if (e.target === e.currentTarget) setSelected(null); }}>
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in fade-in">
            <div className="p-6 border-b border-slate-100 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-900">{selected.callerName}</h3>
                <div className="flex items-center gap-3 mt-1">
                  <p className="text-xs text-slate-400">{selected.callerPhone}</p>
                  <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border ${OUTCOME_STYLE[selected.outcome] || ''}`}>{selected.outcome}</span>
                  <p className="text-xs text-slate-400">{Math.floor(selected.duration/60)}m {selected.duration%60}s</p>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition-all">
                <i className="fa-sharp fa-solid fa-xmark text-sm" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {selected.summary && (
                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
                  <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-1">AI Summary</p>
                  <p className="text-sm text-amber-900 font-medium">{selected.summary}</p>
                </div>
              )}
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Full Transcript</p>
                <div className="space-y-3">
                  {(selected.transcript.length > 0 ? selected.transcript : [
                    { speaker: 'Agent', text: 'Hello! Thank you for calling. How can I help you today?' },
                    { speaker: 'Caller', text: selected.summary || 'Caller inquiry.' },
                  ]).map((m, i) => {
                    const isAgent = m.speaker === 'Agent';
                    return (
                      <div key={i} className={`flex flex-col gap-1 ${isAgent ? 'items-start' : 'items-end'}`}>
                        <span className={`text-[10px] font-black uppercase ${isAgent ? 'text-amber-600' : 'text-slate-400'}`}>{m.speaker}</span>
                        <p className={`px-4 py-2.5 rounded-2xl text-sm font-medium max-w-[82%] ${isAgent ? 'bg-slate-50 text-slate-800 rounded-tl-none' : 'bg-slate-900 text-white rounded-tr-none'}`}>
                          {m.text}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
              {selected.recordingUrl && (
                <div className="bg-slate-50 rounded-2xl p-4">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Recording</p>
                  <audio controls src={selected.recordingUrl} className="w-full" />
                </div>
              )}
            </div>

            <div className="p-5 border-t border-slate-100 flex gap-3">
              <button onClick={e => void handleDownload(selected.id, e)} disabled={downloading === selected.id}
                className="flex-1 bg-slate-900 text-white py-3 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-amber-600 disabled:opacity-50 transition-all">
                {downloading === selected.id ? 'Downloading…' : 'Download Report'}
              </button>
              <button onClick={() => setSelected(null)}
                className="flex-1 border-2 border-slate-200 text-slate-600 py-3 rounded-xl font-black uppercase tracking-widest text-[10px] hover:border-slate-300 transition-all">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CallLogs;
