
import React, { useState, useEffect, useRef } from 'react';
import { AgentConfig, CallOutcome, Lead } from '../types';

interface CallSimulatorProps {
  agent: AgentConfig;
  onClose: () => void;
  onCallFinished: (payload: {
    transcript: string;
    duration: number;
    outcome?: CallOutcome;
    callerName?: string;
    callerPhone?: string;
    lead?: Partial<Lead>;
  }) => Promise<void>;
}

type SimulatorMessage = {
  speaker: 'Agent' | 'You';
  text: string;
};

const CallSimulator: React.FC<CallSimulatorProps> = ({ agent, onClose, onCallFinished }) => {
  const [status, setStatus] = useState<'idle' | 'calling' | 'active' | 'transferring' | 'summarizing'>('idle');
  const [messages, setMessages] = useState<SimulatorMessage[]>([]);
  const [duration, setDuration] = useState(0);
  const [intent, setIntent] = useState('Detecting...');
  const [callerName, setCallerName] = useState('Jamie North');
  const [callerPhone, setCallerPhone] = useState('555-111-2222');
  const [scenario, setScenario] = useState('I want to schedule a cleaning appointment and need a callback tomorrow morning.');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transferTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (connectTimeoutRef.current) {
      clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }

    if (transferTimeoutRef.current) {
      clearTimeout(transferTimeoutRef.current);
      transferTimeoutRef.current = null;
    }

    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const startCall = () => {
    clearTimers();
    setStatus('calling');
    connectTimeoutRef.current = setTimeout(async () => {
      setStatus('active');
      setDuration(0);
      setIntent('Greeting');
      // Show agent greeting immediately
      setMessages([{ speaker: 'Agent', text: agent.greeting }]);
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);

      // Get AI response to the caller's scenario
      try {
        const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
        const token = localStorage.getItem('agently_token') || sessionStorage.getItem('agently_token') || '';
        const resp = await fetch(`${apiBase}/api/messenger/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ message: scenario }),
        });
        if (resp.ok) {
          const data = await resp.json();
          const aiText = data.assistantMessage?.text || data.assistantMessage?.content || '';
          if (aiText) {
            setMessages([
              { speaker: 'Agent', text: agent.greeting },
              { speaker: 'You', text: scenario },
              { speaker: 'Agent', text: aiText },
            ]);
            setIntent('Responding to inquiry');
          }
        }
      } catch { /* fallback: static messages already set */ }
    }, 1500);
  };

  const handleTransfer = () => {
    setStatus('transferring');
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    transferTimeoutRef.current = setTimeout(() => {
      void endCall({
        summary: 'Escalated due to user request for human.',
        outcome: CallOutcome.ESCALATED,
      });
    }, 3000);
  };

  const endCall = async (options?: { summary?: string; outcome?: CallOutcome }) => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setStatus('summarizing');

    const transcriptMessages = messages.length > 0
      ? messages
      : [
          { speaker: 'Agent', text: agent.greeting },
          { speaker: 'You', text: scenario || 'I would like more information about your services and availability.' },
        ];
    const transcriptString = transcriptMessages.map((message) => `${message.speaker}: ${message.text}`).join('\n');
    await onCallFinished({
      transcript: transcriptString,
      duration: Math.max(duration, 60),
      outcome: options?.outcome,
      callerName,
      callerPhone,
      lead: {
        name: callerName,
        phone: callerPhone,
        reason: scenario,
      },
    });
    closeTimeoutRef.current = setTimeout(() => onClose(), 1500);
  };

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    if (status === 'active' && duration > 5) {
      setIntent('Inquiry about Services');
    }
    if (duration > 15) {
      setIntent('Lead Information');
    }
  }, [duration, status]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { clearTimers(); onClose(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  useEffect(() => {
    return () => { clearTimers(); };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-4"
      onClick={e => { if (e.target === e.currentTarget) { clearTimers(); onClose(); } }}>
      <div className="bg-white w-full max-w-lg rounded-[3rem] shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in duration-500 border border-white/20">
        
        {/* Header */}
        <div className="bg-slate-900 p-8 text-white flex justify-between items-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-600/10 rounded-full blur-3xl -mr-16 -mt-16"></div>
          <div className="relative z-10">
            <h3 className="text-2xl font-black tracking-tight">AI Lab Simulator</h3>
            <p className="text-indigo-400 text-[10px] font-black uppercase tracking-widest">Testing Persona: {agent.name} ({agent.tone})</p>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-white/10 rounded-2xl transition-all relative z-10">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>

        {/* Simulator UI */}
        <div className="flex-1 p-10 flex flex-col items-center justify-center min-h-[500px] bg-slate-50/50">
          {status === 'idle' && (
            <div className="text-center animate-in fade-in slide-in-from-bottom-4">
              <div className="w-24 h-24 bg-white text-indigo-600 rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-indigo-100 border border-slate-100">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              </div>
              <h4 className="text-3xl font-black text-slate-900 mb-3 tracking-tight">Stress Test Agent</h4>
              <p className="text-slate-500 mb-3 max-w-xs mx-auto font-medium text-lg leading-relaxed">
                Simulate an {agent.direction} voice workflow to verify logic, intent detection, and tone.
              </p>
              <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500 mb-10">
                Twilio line: {agent.twilioPhoneNumber || 'Not assigned'}
              </p>
              <div className="mx-auto mb-8 grid max-w-md gap-4 text-left">
                <input value={callerName} onChange={event => setCallerName(event.target.value)} placeholder="Caller name" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-medium outline-none focus:ring-2 focus:ring-indigo-500" />
                <input value={callerPhone} onChange={event => setCallerPhone(event.target.value)} placeholder="Caller phone" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-medium outline-none focus:ring-2 focus:ring-indigo-500" />
                <textarea value={scenario} onChange={event => setScenario(event.target.value)} rows={4} placeholder="Describe the caller request" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-medium outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <button 
                onClick={startCall}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-10 py-5 rounded-3xl font-black uppercase tracking-widest text-xs shadow-2xl shadow-indigo-200 transition-all active:scale-95 flex items-center gap-4 mx-auto"
              >
                <div className="w-2 h-2 bg-white rounded-full animate-ping"></div>
                {agent.direction === 'outbound' ? 'Launch Outbound Call' : 'Initiate Inbound Call'}
              </button>
            </div>
          )}

          {status === 'calling' && (
            <div className="text-center animate-pulse">
              <div className="w-24 h-24 bg-slate-900 text-white rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-slate-200">
                <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v8"/><path d="m16 6-4 4-4-4"/><rect width="20" height="8" x="2" y="14" rx="2"/></svg>
              </div>
              <p className="text-2xl font-black text-slate-900 tracking-tight">{agent.direction === 'outbound' ? 'Dialing Contact...' : 'Ringing Phone Line...'}</p>
              <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mt-2">
                {agent.direction === 'outbound' ? 'Launching from the Twilio outbound line' : 'Connecting to the live inbound workflow'}
              </p>
            </div>
          )}

          {status === 'active' && (
            <div className="w-full flex flex-col h-full animate-in fade-in">
              {/* Intent HUD */}
              <div className="flex justify-between items-center bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm mb-10">
                 <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Detected Intent</p>
                    <p className="text-lg font-black text-indigo-600 tracking-tight">{intent}</p>
                 </div>
                 <div className="text-right">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Duration</p>
                    <p className="text-lg font-black text-slate-900 tracking-tight">{formatTime(duration)}</p>
                 </div>
              </div>

              <div className="flex-1 flex flex-col items-center justify-center mb-10">
                 <div className="relative mb-12">
                    <div className="absolute inset-0 bg-indigo-600 rounded-full animate-ping opacity-10 scale-150"></div>
                    <div className="absolute inset-0 bg-indigo-600 rounded-full animate-ping opacity-5 scale-200 delay-300"></div>
                    <div className="relative w-36 h-36 bg-slate-900 text-white rounded-[3rem] flex items-center justify-center shadow-2xl border-4 border-white">
                      <svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
                    </div>
                 </div>
                 <div className="text-center space-y-2">
                   <p className="text-indigo-600 font-black tracking-widest text-sm uppercase">Agent Status: Listening</p>
                   <p className="text-slate-400 font-medium italic text-lg px-6">"{scenario}"</p>
                 </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={handleTransfer}
                  className="bg-white border-2 border-slate-100 text-slate-900 py-5 rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest shadow-lg hover:border-indigo-100 transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M11 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v7"/><path d="M16 20h4"/><path d="m19 17 3 3-3 3"/></svg>
                  Press 0 (Human)
                </button>
                <button 
                  onClick={() => {
                    void endCall();
                  }}
                  className="bg-red-500 hover:bg-red-600 text-white py-5 rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/><line x1="22" x2="2" y1="2" y2="22"/></svg>
                  End Session
                </button>
              </div>
            </div>
          )}

          {status === 'transferring' && (
            <div className="text-center animate-in zoom-in">
              <div className="w-24 h-24 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-8 border-2 border-amber-100 shadow-xl shadow-amber-50">
                <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/><path d="M12 2v4"/><path d="m15 5-3-3-3 3"/></svg>
              </div>
              <p className="text-2xl font-black text-slate-900 tracking-tight">Handing over to Human...</p>
              <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mt-2">Diverting through {agent.escalationPhone}</p>
            </div>
          )}

          {status === 'summarizing' && (
            <div className="text-center animate-in fade-in">
              <div className="w-20 h-20 border-[6px] border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-8 shadow-2xl shadow-indigo-100"></div>
              <p className="text-2xl font-black text-slate-900 tracking-tight">Processing Call Outcome...</p>
              <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mt-2">Agently is extracting lead data and intent</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CallSimulator;
