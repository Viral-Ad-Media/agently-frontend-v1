import React, { useState, useEffect, useCallback } from 'react';
import { TenantNotification, NotificationType } from '../types';
import { voiceCallsApi } from '../services/voiceCallsApi';

const TYPE_ICON: Record<string, string> = {
  call_completed: 'fa-phone-check',
  call_failed: 'fa-phone-xmark',
  message_captured: 'fa-message-lines',
  lead_requested_follow_up: 'fa-user-clock',
  unanswered_question_captured: 'fa-circle-question',
  transfer_requested: 'fa-phone-arrow-right',
  opt_out_requested: 'fa-ban',
  recording_ready: 'fa-circle-play',
  transcript_ready: 'fa-file-lines',
  schedule_completed: 'fa-calendar-check',
  schedule_failed: 'fa-calendar-xmark',
};

const TYPE_COLOR: Record<string, string> = {
  call_completed: 'bg-emerald-50 text-emerald-600',
  call_failed: 'bg-red-50 text-red-600',
  message_captured: 'bg-blue-50 text-blue-600',
  lead_requested_follow_up: 'bg-amber-50 text-amber-600',
  unanswered_question_captured: 'bg-orange-50 text-orange-600',
  transfer_requested: 'bg-purple-50 text-purple-600',
  opt_out_requested: 'bg-slate-100 text-slate-500',
  recording_ready: 'bg-indigo-50 text-indigo-600',
  transcript_ready: 'bg-cyan-50 text-cyan-600',
  schedule_completed: 'bg-emerald-50 text-emerald-600',
  schedule_failed: 'bg-red-50 text-red-600',
};

const fmtTime = (ts: string) => {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return d.toLocaleDateString();
};

const getTypeLabel = (type: string) =>
  type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

interface NotificationsProps {
  onUnreadChange?: (count: number) => void;
}

const Notifications: React.FC<NotificationsProps> = ({ onUnreadChange }) => {
  const [notifications, setNotifications] = useState<TenantNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'unread'>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    window.setTimeout(() => setToast(null), 3500);
  };

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await voiceCallsApi.notifications.getNotifications() as any;
      const list: TenantNotification[] = res?.notifications || [];
      setNotifications(list);
      const unread = list.filter(n => !n.is_read).length;
      onUnreadChange?.(unread);
    } catch (err: any) {
      setError(err?.message || 'Failed to load notifications.');
    } finally {
      setLoading(false);
    }
  }, [onUnreadChange]);

  useEffect(() => { void loadNotifications(); }, [loadNotifications]);

  const markRead = async (id: string) => {
    setBusy(id);
    try {
      await voiceCallsApi.notifications.markNotificationRead(id);
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, is_read: true } : n)
      );
      const updated = notifications.map(n => n.id === id ? { ...n, is_read: true } : n);
      onUnreadChange?.(updated.filter(n => !n.is_read).length);
    } catch (err: any) {
      showToast(err?.message || 'Failed to mark read.', false);
    } finally {
      setBusy(null);
    }
  };

  const markAllRead = async () => {
    setBusy('all');
    try {
      await voiceCallsApi.notifications.markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      onUnreadChange?.(0);
      showToast('All notifications marked as read.');
    } catch (err: any) {
      showToast(err?.message || 'Failed.', false);
    } finally {
      setBusy(null);
    }
  };

  const deleteNotification = async (id: string) => {
    setBusy(`del-${id}`);
    try {
      await voiceCallsApi.notifications.deleteNotification(id);
      const updated = notifications.filter(n => n.id !== id);
      setNotifications(updated);
      onUnreadChange?.(updated.filter(n => !n.is_read).length);
    } catch (err: any) {
      showToast(err?.message || 'Failed to delete.', false);
    } finally {
      setBusy(null);
    }
  };

  const displayed = filterType === 'unread'
    ? notifications.filter(n => !n.is_read)
    : notifications;

  const unreadCount = notifications.filter(n => !n.is_read).length;

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
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            Notifications
            {unreadCount > 0 && (
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-black">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">Tenant-scoped activity alerts</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="flex gap-1 rounded-xl border border-slate-200 p-1 bg-white">
            {(['all', 'unread'] as const).map(t => (
              <button key={t} onClick={() => setFilterType(t)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${filterType === t ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
                {t === 'unread' ? `Unread (${unreadCount})` : 'All'}
              </button>
            ))}
          </div>
          {unreadCount > 0 && (
            <button onClick={markAllRead} disabled={busy === 'all'}
              className="px-4 py-2 rounded-xl bg-amber-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-amber-600 disabled:opacity-50 transition-all">
              {busy === 'all' ? '…' : 'Mark All Read'}
            </button>
          )}
          <button onClick={() => void loadNotifications()} disabled={loading}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 disabled:opacity-50 transition-all">
            {loading ? <i className="fa-sharp fa-solid fa-spinner fa-spin" /> : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
          {error}
        </div>
      )}

      {loading && notifications.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-card p-16 text-center">
          <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400">Loading notifications…</p>
        </div>
      ) : displayed.length === 0 ? (
        <div className="bg-white rounded-3xl border-2 border-dashed border-slate-200 py-20 text-center">
          <i className="fa-sharp fa-solid fa-bell-slash text-4xl text-slate-200 mb-4 block" />
          <p className="text-slate-400 font-bold">
            {filterType === 'unread' ? 'No unread notifications' : 'No notifications yet'}
          </p>
          <p className="text-xs text-slate-300 mt-1">Activity from calls, schedules, and leads will appear here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayed.map(n => {
            const iconKey = n.type in TYPE_ICON ? n.type : 'call_completed';
            const colorKey = n.type in TYPE_COLOR ? n.type : 'call_completed';
            return (
              <div key={n.id}
                className={`bg-white rounded-2xl border px-5 py-4 flex items-start gap-4 transition-all ${n.is_read ? 'border-slate-100 opacity-70' : 'border-slate-200 shadow-sm'}`}>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${TYPE_COLOR[colorKey] || 'bg-slate-100 text-slate-500'}`}>
                  <i className={`fa-sharp fa-solid ${TYPE_ICON[iconKey] || 'fa-bell'} text-sm`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-black text-slate-500 uppercase tracking-widest">
                        {getTypeLabel(n.type)}
                      </p>
                      {(n.title || n.message || n.body) && (
                        <p className="text-sm font-medium text-slate-800 mt-0.5">
                          {n.title || n.message || n.body}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-slate-400 whitespace-nowrap">{fmtTime(n.created_at)}</span>
                      {!n.is_read && (
                        <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                      )}
                    </div>
                  </div>
                  {(n.related_call_id || n.related_lead_id || n.related_schedule_id) && (
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {n.related_call_id && (
                        <span className="text-[10px] font-mono bg-slate-100 text-slate-500 px-2 py-0.5 rounded-lg">
                          call: {n.related_call_id.slice(0, 8)}…
                        </span>
                      )}
                      {n.related_schedule_id && (
                        <span className="text-[10px] font-mono bg-slate-100 text-slate-500 px-2 py-0.5 rounded-lg">
                          sched: {n.related_schedule_id.slice(0, 8)}…
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  {!n.is_read && (
                    <button onClick={() => void markRead(n.id)} disabled={busy === n.id}
                      title="Mark as read"
                      className="w-8 h-8 rounded-xl flex items-center justify-center bg-slate-100 text-slate-500 hover:bg-emerald-100 hover:text-emerald-600 transition-all text-xs disabled:opacity-50">
                      <i className="fa-sharp fa-solid fa-check" />
                    </button>
                  )}
                  <button onClick={() => void deleteNotification(n.id)} disabled={busy === `del-${n.id}`}
                    title="Delete"
                    className="w-8 h-8 rounded-xl flex items-center justify-center bg-slate-100 text-slate-400 hover:bg-red-100 hover:text-red-500 transition-all text-xs disabled:opacity-50">
                    <i className="fa-sharp fa-solid fa-trash" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Notifications;
