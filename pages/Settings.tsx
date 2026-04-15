import React, { useEffect, useState } from 'react';
import { Organization } from '../types';

interface SettingsProps {
  org: Organization;
  onSave: (settings: {
    timezone: string;
    phoneNumber: string;
  }) => Promise<void>;
}

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Dubai',
  'Asia/Lagos',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Africa/Lagos',
  'Africa/Nairobi',
  'Africa/Johannesburg',
];

const Settings: React.FC<SettingsProps> = ({ org, onSave }) => {
  const [timezone, setTimezone]     = useState(org.settings.timezone);
  const [phoneNumber, setPhoneNumber] = useState(org.settings.phoneNumber);
  const [saving, setSaving]         = useState(false);
  const [message, setMessage]       = useState('');
  const [error, setError]           = useState('');

  useEffect(() => {
    setTimezone(org.settings.timezone);
    setPhoneNumber(org.settings.phoneNumber);
  }, [org.settings.timezone, org.settings.phoneNumber]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');
    try {
      await onSave({ timezone, phoneNumber });
      setMessage('Settings saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-up">

      <div>
        <h2 className="text-xl font-black text-slate-900">Organization Settings</h2>
        <p className="text-xs text-slate-400 mt-0.5">Manage global settings for {org.profile.name}.</p>
      </div>

      {message && (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          ✓ {message}
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Org info */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-card p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
              Organization Name
            </label>
            <input
              type="text"
              value={org.profile.name}
              disabled
              className="w-full px-4 py-2.5 rounded-xl border border-slate-100 font-medium bg-slate-50 text-slate-500 text-sm"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
              Timezone
            </label>
            <select
              value={timezone}
              onChange={e => setTimezone(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white font-medium text-sm outline-none focus:ring-2 focus:ring-amber-400 transition-all"
            >
              {[timezone, ...TIMEZONES.filter(v => v !== timezone)].map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
              Primary Contact Number
            </label>
            <input
              value={phoneNumber}
              onChange={e => setPhoneNumber(e.target.value)}
              placeholder="+1 555 000 0000"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white font-medium text-sm outline-none focus:ring-2 focus:ring-amber-400 transition-all"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
              Industry
            </label>
            <input
              value={org.profile.industry}
              disabled
              className="w-full px-4 py-2.5 rounded-xl border border-slate-100 font-medium bg-slate-50 text-slate-500 text-sm"
            />
          </div>
        </div>

        {/* Voice infrastructure info card */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-card p-6">
          <h3 className="text-base font-black text-slate-900 mb-1">Voice Infrastructure</h3>
          <p className="text-xs text-slate-400 mb-5">
            Phone numbers and voice calls are managed centrally. Use the <strong>Phone Numbers</strong> section to provision and assign numbers to your agents.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { icon: '📞', label: 'Twilio', desc: 'Master account managed by Agently — no credentials needed' },
              { icon: '🎙️', label: 'ConversationRelay', desc: 'Real-time STT + TTS with ElevenLabs, Google, Amazon voices' },
              { icon: '🧠', label: 'OpenAI GPT-4o', desc: 'LLM powering all voice agent conversations' },
            ].map(item => (
              <div key={item.label} className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
                <div className="text-2xl mb-2">{item.icon}</div>
                <p className="text-xs font-black text-slate-800 mb-0.5">{item.label}</p>
                <p className="text-[11px] text-slate-400 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2.5">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            Webhook base URL: <code className="font-mono text-[11px] ml-1">{org.settings.twilio.webhookBaseUrl || 'Configured on server'}</code>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-2xl bg-slate-900 text-white px-8 py-3 text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 disabled:opacity-50 transition-all active:scale-95"
          >
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default Settings;
