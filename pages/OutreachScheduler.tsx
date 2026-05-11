import React, { useState, useEffect, useCallback } from 'react';
import {
  OutreachSchedule, OutreachSchedulePreview,
  CreateOutreachSchedulePayload, DirectRecipient,
  OutreachScheduleType, OutreachBatchMode,
  Organization, AgentConfig
} from '../types';
import { voiceCallsApi } from '../services/voiceCallsApi';
import AppModal from '../components/AppModal';

const STATUS_STYLE: Record<string, string> = {
  active:    'bg-emerald-100 text-emerald-700',
  paused:    'bg-amber-100 text-amber-700',
  completed: 'bg-slate-100 text-slate-500',
  cancelled: 'bg-red-100 text-red-500',
  failed:    'bg-red-100 text-red-600',
};
const TYPE_LABEL: Record<OutreachScheduleType, string> = {
  one_time:          'One-Time',
  one_time_batch:    'Batch',
  recurring_monthly: 'Monthly Recurring',
  custom_rule:       'Custom Rule',
};

const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Phoenix', 'America/Anchorage', 'Pacific/Honolulu',
  'Europe/London', 'Europe/Paris', 'Asia/Tokyo', 'Asia/Dubai',
  'Africa/Lagos', 'Australia/Sydney', 'UTC',
];

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—';

interface Props {
  org: Organization;
}

const emptyPayload = (org: Organization): Partial<CreateOutreachSchedulePayload> => ({
  name: '',
  voiceAgentId: org.activeVoiceAgentId || org.agent?.id || '',
  fromNumber: org.agent?.twilioPhoneNumber || '',
  scheduleType: 'one_time',
  timezone: org.profile.timezone || 'America/New_York',
  directRecipients: [{ name: '', phone: '' }],
  callPurpose: '',
  customInstructions: '',
  startLocalDate: new Date().toISOString().split('T')[0],
  startTime: '10:00',
  maxAttemptsPerLead: 1,
  retryDelayMinutes: 60,
  voicemailBehavior: 'hangup',
  status: 'active',
});

const OutreachScheduler: React.FC<Props> = ({ org }) => {
  const [schedules, setSchedules] = useState<OutreachSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<Partial<CreateOutreachSchedulePayload>>(emptyPayload(org));
  const [preview, setPreview] = useState<OutreachSchedulePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [creating, setCreating] = useState(false);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    window.setTimeout(() => setToast(null), 4000);
  };

  const agents: AgentConfig[] = org.voiceAgents || [];

  const loadSchedules = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await voiceCallsApi.outreach.getOutreachSchedules() as any;
      setSchedules(res?.schedules || res?.data || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load schedules.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadSchedules(); }, [loadSchedules]);

  // Form helpers
  const setField = (k: keyof CreateOutreachSchedulePayload, v: any) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const setRecipient = (i: number, field: keyof DirectRecipient, val: string) =>
    setForm(prev => {
      const arr = [...(prev.directRecipients || [])];
      arr[i] = { ...arr[i], [field]: val };
      return { ...prev, directRecipients: arr };
    });

  const addRecipient = () =>
    setForm(prev => ({ ...prev, directRecipients: [...(prev.directRecipients || []), { name: '', phone: '' }] }));

  const removeRecipient = (i: number) =>
    setForm(prev => ({ ...prev, directRecipients: (prev.directRecipients || []).filter((_, idx) => idx !== i) }));

  const handlePreview = async () => {
    setPreviewLoading(true); setPreviewError('');
    try {
      const res = await voiceCallsApi.outreach.previewOutreachSchedule(buildPayload()) as any;
      setPreview(res);
    } catch (err: any) {
      setPreviewError(err?.message || 'Preview failed.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const buildPayload = (): CreateOutreachSchedulePayload => {
    const recipients = (form.directRecipients || []).filter(r => r.name && r.phone);
    const p: CreateOutreachSchedulePayload = {
      name: form.name || 'Untitled Schedule',
      voiceAgentId: form.voiceAgentId || '',
      fromNumber: form.fromNumber || '',
      scheduleType: form.scheduleType || 'one_time',
      timezone: form.timezone || 'America/New_York',
      callPurpose: form.callPurpose,
      customInstructions: form.customInstructions,
      maxAttemptsPerLead: form.maxAttemptsPerLead ?? 1,
      retryDelayMinutes: form.retryDelayMinutes ?? 60,
      voicemailBehavior: form.voicemailBehavior ?? 'hangup',
      status: 'active',
    };
    if (recipients.length) p.directRecipients = recipients;

    if (form.scheduleType === 'one_time') {
      p.startLocalDate = form.startLocalDate;
      p.startTime = form.startTime;
    } else if (form.scheduleType === 'one_time_batch') {
      p.startLocalDate = form.startLocalDate;
      p.startTimes = (form.startTime || '').split(',').map(t => t.trim()).filter(Boolean);
      p.batchMode = (form as any).batchMode || 'spread_recipients_across_times';
    } else if (form.scheduleType === 'recurring_monthly') {
      p.startLocalDate = form.startLocalDate;
      p.startTime = form.startTime;
      p.repeat = { frequency: 'monthly', interval: 1, count: (form as any).repeatCount || 3 };
    }
    return p;
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      await voiceCallsApi.outreach.createOutreachSchedule(buildPayload());
      showToast('Schedule created successfully.');
      setShowCreate(false);
      setForm(emptyPayload(org));
      setPreview(null);
      await loadSchedules();
    } catch (err: any) {
      showToast(err?.message || 'Failed to create schedule.', false);
    } finally {
      setCreating(false);
    }
  };

  const handleCancel = async (id: string) => {
    setBusy(`cancel-${id}`);
    try {
      await voiceCallsApi.outreach.cancelOutreachSchedule(id, { reason: 'Cancelled from dashboard.' });
      showToast('Schedule cancelled.');
      await loadSchedules();
    } catch (err: any) {
      showToast(err?.message || 'Cancel failed.', false);
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this schedule permanently?')) return;
    setBusy(`del-${id}`);
    try {
      await voiceCallsApi.outreach.deleteOutreachSchedule(id);
      showToast('Schedule deleted.');
      await loadSchedules();
    } catch (err: any) {
      showToast(err?.message || 'Delete failed.', false);
    } finally {
      setBusy(null);
    }
  };

  const selectedAgent = agents.find(a => a.id === form.voiceAgentId);

  return (
    <div className="animate-fade-up space-y-5">
      {toast && (
        <div className={`fixed top-5 right-5 z-[200] px-5 py-3 rounded-2xl shadow-xl text-sm font-bold ${toast.ok ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900">Outreach Schedules</h2>
          <p className="text-xs text-slate-400 mt-0.5">Schedule outbound calls with direct recipients or leads</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void loadSchedules()} disabled={loading}
            className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 disabled:opacity-50 transition-all">
            {loading ? <i className="fa-sharp fa-solid fa-spinner fa-spin" /> : 'Refresh'}
          </button>
          <button onClick={() => { setShowCreate(true); setPreview(null); setForm(emptyPayload(org)); }}
            className="px-4 py-2.5 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-amber-600 transition-all">
            + New Schedule
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">{error}</div>
      )}

      {loading && schedules.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-16 text-center">
          <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400">Loading schedules…</p>
        </div>
      ) : schedules.length === 0 ? (
        <div className="bg-white rounded-3xl border-2 border-dashed border-slate-200 py-20 text-center">
          <i className="fa-sharp fa-solid fa-calendar-plus text-4xl text-slate-200 mb-4 block" />
          <p className="text-slate-400 font-bold">No schedules yet</p>
          <p className="text-xs text-slate-300 mt-1">Create your first outbound call schedule above.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {schedules.map(s => {
            const agent = agents.find(a => a.id === s.voice_agent_id);
            return (
              <div key={s.id} className="bg-white rounded-2xl border border-slate-200 p-5">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="font-black text-slate-900">{s.name}</p>
                      <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider ${STATUS_STYLE[s.status] || 'bg-slate-100 text-slate-500'}`}>
                        {s.status}
                      </span>
                      <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-slate-500 uppercase">
                        {TYPE_LABEL[s.schedule_type] || s.schedule_type}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-slate-400 mt-1">
                      {agent && <span><i className="fa-sharp fa-solid fa-robot mr-1" />{agent.name}</span>}
                      {s.from_number && <span><i className="fa-sharp fa-solid fa-phone mr-1" />{s.from_number}</span>}
                      {s.timezone && <span><i className="fa-sharp fa-solid fa-clock mr-1" />{s.timezone}</span>}
                      {s.call_purpose && <span className="line-clamp-1 max-w-xs">{s.call_purpose}</span>}
                    </div>
                    {s.direct_recipients && s.direct_recipients.length > 0 && (
                      <p className="text-xs text-slate-400 mt-1">
                        {s.direct_recipients.length} recipient{s.direct_recipients.length !== 1 ? 's' : ''}:&nbsp;
                        {s.direct_recipients.slice(0, 3).map(r => r.name).join(', ')}
                        {s.direct_recipients.length > 3 && ` +${s.direct_recipients.length - 3} more`}
                      </p>
                    )}
                    {s.stats && (
                      <div className="flex gap-4 mt-2">
                        {s.stats.totalRuns != null && <span className="text-[10px] text-slate-400">Total: {s.stats.totalRuns}</span>}
                        {s.stats.completed != null && <span className="text-[10px] text-emerald-600">Done: {s.stats.completed}</span>}
                        {s.stats.failed != null && s.stats.failed > 0 && <span className="text-[10px] text-red-500">Failed: {s.stats.failed}</span>}
                        {s.stats.nextRunAt && <span className="text-[10px] text-amber-600">Next: {fmtDate(s.stats.nextRunAt)}</span>}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {s.status === 'active' && (
                      <button onClick={() => void handleCancel(s.id)} disabled={busy === `cancel-${s.id}`}
                        className="px-3 py-2 rounded-xl border border-amber-200 text-amber-700 text-[10px] font-black uppercase tracking-widest hover:bg-amber-50 disabled:opacity-50 transition-all">
                        {busy === `cancel-${s.id}` ? '…' : 'Cancel'}
                      </button>
                    )}
                    <button onClick={() => void handleDelete(s.id)} disabled={busy === `del-${s.id}`}
                      className="px-3 py-2 rounded-xl border border-red-100 text-red-500 text-[10px] font-black uppercase tracking-widest hover:bg-red-50 disabled:opacity-50 transition-all">
                      {busy === `del-${s.id}` ? '…' : 'Delete'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      <AppModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="New Outreach Schedule"
        description="Schedule outbound calls to direct recipients or leads"
        size="xl"
        footer={(
          <div className="flex gap-3">
            <button onClick={handlePreview} disabled={previewLoading}
              className="flex-1 border-2 border-amber-300 text-amber-700 py-3 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-amber-50 disabled:opacity-50 transition-all">
              {previewLoading ? 'Previewing…' : 'Preview Schedule'}
            </button>
            <button onClick={handleCreate} disabled={creating || !form.name || !form.voiceAgentId || !form.fromNumber}
              className="flex-1 bg-slate-900 text-white py-3 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-amber-600 disabled:opacity-50 transition-all">
              {creating ? 'Creating…' : 'Create Schedule'}
            </button>
          </div>
        )}
      >
        <div className="space-y-5">
          {/* Name + agent */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Schedule Name *</label>
              <input value={form.name || ''} onChange={e => setField('name', e.target.value)}
                placeholder="e.g. Monthly follow-up"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Voice Agent *</label>
              <select value={form.voiceAgentId || ''} onChange={e => {
                setField('voiceAgentId', e.target.value);
                const ag = agents.find(a => a.id === e.target.value);
                if (ag?.twilioPhoneNumber) setField('fromNumber', ag.twilioPhoneNumber);
              }}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium outline-none focus:ring-2 focus:ring-amber-400">
                <option value="">Select agent…</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.name} ({a.direction})</option>)}
              </select>
            </div>
          </div>

          {/* From number */}
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">From Phone Number *</label>
            <input value={form.fromNumber || ''} onChange={e => setField('fromNumber', e.target.value)}
              placeholder="+1XXXXXXXXXX"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium outline-none focus:ring-2 focus:ring-amber-400" />
            {selectedAgent?.twilioPhoneNumber && (
              <p className="text-[10px] text-slate-400 mt-1">Agent number: {selectedAgent.twilioPhoneNumber}</p>
            )}
          </div>

          {/* Schedule type + timezone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Schedule Type</label>
              <select value={form.scheduleType} onChange={e => setField('scheduleType', e.target.value as OutreachScheduleType)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium outline-none focus:ring-2 focus:ring-amber-400">
                {(Object.entries(TYPE_LABEL) as [OutreachScheduleType, string][]).map(([k, v]) =>
                  <option key={k} value={k}>{v}</option>
                )}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Timezone</label>
              <select value={form.timezone} onChange={e => setField('timezone', e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium outline-none focus:ring-2 focus:ring-amber-400">
                {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </div>
          </div>

          {/* Date + time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Start Date</label>
              <input type="date" value={form.startLocalDate || ''} onChange={e => setField('startLocalDate', e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">
                {form.scheduleType === 'one_time_batch' ? 'Start Times (comma-separated)' : 'Start Time'}
              </label>
              <input
                value={form.startTime || ''}
                onChange={e => setField('startTime', e.target.value)}
                placeholder={form.scheduleType === 'one_time_batch' ? '10:00, 11:00, 12:00' : '10:00'}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
          </div>

          {/* Batch mode */}
          {form.scheduleType === 'one_time_batch' && (
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Batch Mode</label>
              <select value={(form as any).batchMode || 'spread_recipients_across_times'}
                onChange={e => setForm(prev => ({ ...prev, batchMode: e.target.value as OutreachBatchMode } as any))}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium outline-none focus:ring-2 focus:ring-amber-400">
                <option value="spread_recipients_across_times">Spread recipients across times</option>
                <option value="all_recipients_each_time">All recipients at each time</option>
              </select>
            </div>
          )}

          {/* Recurring count */}
          {form.scheduleType === 'recurring_monthly' && (
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Repeat Count (months)</label>
              <input type="number" min={1} max={24}
                value={(form as any).repeatCount || 3}
                onChange={e => setForm(prev => ({ ...prev, repeatCount: Number(e.target.value) } as any))}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
          )}

          {/* Recipients */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Direct Recipients</label>
              <button onClick={addRecipient} type="button"
                className="text-[10px] font-black text-amber-600 hover:text-amber-700 uppercase tracking-widest">
                + Add Recipient
              </button>
            </div>
            <div className="space-y-2">
              {(form.directRecipients || []).map((r, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input value={r.name} onChange={e => setRecipient(i, 'name', e.target.value)}
                    placeholder="Name" className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium outline-none focus:ring-2 focus:ring-amber-400" />
                  <input value={r.phone} onChange={e => setRecipient(i, 'phone', e.target.value)}
                    placeholder="+1XXXXXXXXXX" className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium outline-none focus:ring-2 focus:ring-amber-400" />
                  {(form.directRecipients || []).length > 1 && (
                    <button onClick={() => removeRecipient(i)} type="button"
                      className="w-8 h-8 rounded-xl bg-red-50 text-red-400 hover:bg-red-100 flex items-center justify-center text-xs transition-all">
                      <i className="fa-sharp fa-solid fa-trash" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Purpose + instructions */}
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Call Purpose</label>
            <input value={form.callPurpose || ''} onChange={e => setField('callPurpose', e.target.value)}
              placeholder="e.g. Explain the offer and answer questions."
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium outline-none focus:ring-2 focus:ring-amber-400" />
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Custom Instructions</label>
            <textarea value={form.customInstructions || ''} onChange={e => setField('customInstructions', e.target.value)}
              rows={2} placeholder="e.g. Keep the call brief and natural."
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium outline-none focus:ring-2 focus:ring-amber-400 resize-none" />
          </div>

          {/* Voicemail */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Max Attempts</label>
              <input type="number" min={1} max={5} value={form.maxAttemptsPerLead ?? 1}
                onChange={e => setField('maxAttemptsPerLead', Number(e.target.value))}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-medium outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Retry Delay (min)</label>
              <input type="number" min={5} value={form.retryDelayMinutes ?? 60}
                onChange={e => setField('retryDelayMinutes', Number(e.target.value))}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-medium outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Voicemail</label>
              <select value={form.voicemailBehavior || 'hangup'} onChange={e => setField('voicemailBehavior', e.target.value as any)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium outline-none focus:ring-2 focus:ring-amber-400">
                <option value="hangup">Hang up</option>
                <option value="leave_voicemail">Leave voicemail</option>
                <option value="skip">Skip</option>
              </select>
            </div>
          </div>

          {/* Preview errors */}
          {previewError && (
            <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">{previewError}</div>
          )}

          {/* Preview results */}
          {preview && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3">
              <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Schedule Preview</p>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-white rounded-xl p-3">
                  <p className="text-lg font-black text-slate-900">{preview.recipientCount}</p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest">Recipients</p>
                </div>
                <div className="bg-white rounded-xl p-3">
                  <p className="text-lg font-black text-slate-900">{preview.totalRuns}</p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest">Total Runs</p>
                </div>
                <div className="bg-white rounded-xl p-3">
                  <p className="text-sm font-black text-slate-900">{preview.timezone}</p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest">Timezone</p>
                </div>
              </div>
              {preview.warnings && preview.warnings.length > 0 && (
                <div className="space-y-1">
                  {preview.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-amber-700">⚠ {w}</p>
                  ))}
                </div>
              )}
              {preview.preview && preview.preview.length > 0 && (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Scheduled runs:</p>
                  {preview.preview.slice(0, 10).map((p, i) => (
                    <div key={i} className="flex items-center justify-between text-xs text-slate-600 bg-white px-3 py-1.5 rounded-lg">
                      <span>{new Date(p.scheduledFor).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                      {p.recipient && <span className="text-slate-400">{p.recipient.name} ({p.recipient.phone})</span>}
                    </div>
                  ))}
                  {preview.preview.length > 10 && (
                    <p className="text-[10px] text-slate-400 text-center">+{preview.preview.length - 10} more runs</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </AppModal>
    </div>
  );
};

export default OutreachScheduler;
