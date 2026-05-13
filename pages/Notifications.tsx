import React, { useEffect, useMemo, useState, useTransition } from "react";
import { useNavigate } from "react-router-dom";
import AppModal from "../components/AppModal";
import { voiceCallsApi } from "../services/voiceCallsApi";

type NotificationRecord = {
  id: string;
  type: string;
  title: string;
  body: string;
  entityType: string;
  entityId: string;
  voiceAgentId?: string;
  callRecordId?: string;
  isRead: boolean;
  createdAt: string;
  metadata: Record<string, unknown>;
};

type ToastState = { message: string; tone: "success" | "error" } | null;
type BulkAction = "read" | "unread" | "delete";

const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  call_completed: "Call completed",
  call_failed: "Call failed",
  message_captured: "Message captured",
  lead_requested_follow_up: "Follow-up requested",
  unanswered_question_captured: "Unanswered question",
  transfer_requested: "Transfer requested",
  opt_out_requested: "Opt-out requested",
  recording_ready: "Recording ready",
  transcript_ready: "Transcript ready",
  schedule_completed: "Schedule completed",
  schedule_failed: "Schedule failed",
};

const PAGE_SIZE = 12;

const getString = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : value == null ? fallback : String(value);

const isNetworkError = (error: unknown) => {
  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error || "").toLowerCase();
  return (
    !navigator.onLine ||
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("network request failed")
  );
};

const getFriendlyError = (error: unknown, fallback: string) => {
  if (isNetworkError(error)) {
    return "You are currently not connected to the internet. Please connect to the internet and try again.";
  }
  return error instanceof Error ? error.message : fallback;
};

const normalizeNotification = (value: unknown): NotificationRecord | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const id = getString(raw.id).trim();
  if (!id) return null;

  const metadata =
    raw.metadata &&
    typeof raw.metadata === "object" &&
    !Array.isArray(raw.metadata)
      ? (raw.metadata as Record<string, unknown>)
      : {};

  return {
    id,
    type: getString(raw.type, "notification"),
    title: getString(raw.title, "Notification"),
    body: getString(raw.body),
    entityType: getString(raw.entity_type || raw.entityType),
    entityId: getString(raw.entity_id || raw.entityId),
    voiceAgentId:
      getString(raw.voice_agent_id || raw.voiceAgentId) || undefined,
    callRecordId:
      getString(raw.call_record_id || raw.callRecordId) || undefined,
    isRead: Boolean(raw.is_read ?? raw.isRead),
    createdAt: getString(raw.created_at || raw.createdAt),
    metadata,
  };
};

const getNotificationArray = (payload: unknown): NotificationRecord[] => {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  const candidate =
    record.notifications || record.data || record.items || record.results;
  const list = Array.isArray(candidate) ? candidate : [];
  return list
    .map(normalizeNotification)
    .filter((item): item is NotificationRecord => Boolean(item));
};

const getUnreadCount = (payload: unknown): number => {
  if (!payload || typeof payload !== "object") return 0;
  const record = payload as Record<string, unknown>;
  const value = Number(
    record.unreadCount ?? record.unread_count ?? record.count ?? 0,
  );
  return Number.isFinite(value) ? Math.max(0, value) : 0;
};

const getNotificationTarget = (notification: NotificationRecord) => {
  const entityType = notification.entityType.toLowerCase();
  const type = notification.type.toLowerCase();
  const callId =
    notification.callRecordId ||
    (entityType.includes("call") ? notification.entityId : "");
  if (
    callId ||
    entityType.includes("call") ||
    type.includes("call") ||
    type.includes("recording") ||
    type.includes("transcript")
  ) {
    return callId ? `/calls?callId=${encodeURIComponent(callId)}` : "/calls";
  }
  if (entityType.includes("lead") || type.includes("lead")) return "/leads";
  if (entityType.includes("schedule") || type.includes("schedule"))
    return "/outreach";
  return "";
};

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

const getTypeLabel = (type: string) =>
  NOTIFICATION_TYPE_LABELS[type] || type.replace(/_/g, " ");

const toneForType = (type: string) => {
  const lower = type.toLowerCase();
  if (lower.includes("failed") || lower.includes("opt_out"))
    return "bg-red-50 text-red-600 border-red-100";
  if (lower.includes("completed") || lower.includes("ready"))
    return "bg-emerald-50 text-emerald-600 border-emerald-100";
  if (
    lower.includes("question") ||
    lower.includes("follow") ||
    lower.includes("message")
  )
    return "bg-amber-50 text-amber-700 border-amber-100";
  return "bg-indigo-50 text-indigo-600 border-indigo-100";
};

const Notifications: React.FC = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState<BulkAction | null>(null);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState<ToastState>(null);
  const [deleteTarget, setDeleteTarget] = useState<NotificationRecord | null>(
    null,
  );
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [, startTransition] = useTransition();

  const showToast = (
    message: string,
    tone: "success" | "error" = "success",
  ) => {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 3500);
  };

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const [listPayload, countPayload] = await Promise.all([
        voiceCallsApi.notifications.getNotifications({ limit: 100 }),
        voiceCallsApi.notifications.getUnreadNotificationCount(),
      ]);
      const next = getNotificationArray(listPayload);
      startTransition(() => {
        setNotifications(next);
        setUnreadCount(
          getUnreadCount(countPayload) ||
            next.filter((item) => !item.isRead).length,
        );
        setSelectedIds(new Set());
      });
    } catch (error) {
      showToast(
        getFriendlyError(error, "Could not load notifications."),
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadNotifications();
  }, []);

  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
  }, [filter]);

  const visibleNotifications = useMemo(() => {
    return filter === "unread"
      ? notifications.filter((item) => !item.isRead)
      : notifications;
  }, [filter, notifications]);

  const totalPages = Math.max(
    1,
    Math.ceil(visibleNotifications.length / PAGE_SIZE),
  );
  const pagedNotifications = visibleNotifications.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );
  const pageIds = useMemo(
    () => pagedNotifications.map((item) => item.id),
    [pagedNotifications],
  );
  const selectedCount = selectedIds.size;
  const selectedOnPage =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));

  const recomputeUnread = (items: NotificationRecord[]) =>
    items.filter((item) => !item.isRead).length;

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePageSelection = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (selectedOnPage) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const applyLocalBulk = (ids: string[], action: BulkAction) => {
    setNotifications((current) => {
      let next = current;
      if (action === "delete")
        next = current.filter((item) => !ids.includes(item.id));
      if (action === "read")
        next = current.map((item) =>
          ids.includes(item.id) ? { ...item, isRead: true } : item,
        );
      if (action === "unread")
        next = current.map((item) =>
          ids.includes(item.id) ? { ...item, isRead: false } : item,
        );
      setUnreadCount(recomputeUnread(next));
      return next;
    });
  };

  const runBulkAction = async (action: BulkAction) => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    setBulkBusy(action);
    applyLocalBulk(ids, action);
    setSelectedIds(new Set());
    try {
      await voiceCallsApi.notifications.bulkUpdateNotifications({
        notificationIds: ids,
        action,
      });
      showToast(
        action === "delete"
          ? "Selected notifications deleted."
          : action === "read"
            ? "Selected notifications marked as read."
            : "Selected notifications marked as unread.",
      );
    } catch (error) {
      showToast(
        getFriendlyError(error, "Could not update selected notifications."),
        "error",
      );
      await loadNotifications();
    } finally {
      setBulkBusy(null);
      setBulkDeleteOpen(false);
    }
  };

  const markRead = async (notification: NotificationRecord) => {
    if (notification.isRead) return;
    setBusyId(notification.id);
    setNotifications((current) => {
      const next = current.map((item) =>
        item.id === notification.id ? { ...item, isRead: true } : item,
      );
      setUnreadCount(recomputeUnread(next));
      return next;
    });
    try {
      await voiceCallsApi.notifications.markNotificationRead(notification.id);
    } catch (error) {
      showToast(
        getFriendlyError(error, "Could not mark notification read."),
        "error",
      );
      await loadNotifications();
    } finally {
      setBusyId(null);
    }
  };

  const markUnread = async (notification: NotificationRecord) => {
    if (!notification.isRead) return;
    setBusyId(notification.id);
    setNotifications((current) => {
      const next = current.map((item) =>
        item.id === notification.id ? { ...item, isRead: false } : item,
      );
      setUnreadCount(recomputeUnread(next));
      return next;
    });
    try {
      await voiceCallsApi.notifications.markNotificationUnread(notification.id);
    } catch (error) {
      showToast(
        getFriendlyError(error, "Could not mark notification unread."),
        "error",
      );
      await loadNotifications();
    } finally {
      setBusyId(null);
    }
  };

  const openRelated = async (notification: NotificationRecord) => {
    await markRead(notification);
    const target = getNotificationTarget(notification);
    if (target) navigate(target);
  };

  const markAllRead = async () => {
    setNotifications((current) =>
      current.map((item) => ({ ...item, isRead: true })),
    );
    setUnreadCount(0);
    try {
      await voiceCallsApi.notifications.markAllNotificationsRead();
      showToast("All notifications marked as read.");
    } catch (error) {
      showToast(
        getFriendlyError(error, "Could not mark all notifications read."),
        "error",
      );
      await loadNotifications();
    }
  };

  const deleteNotification = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setBusyId(target.id);
    setDeleteTarget(null);
    setNotifications((current) => {
      const next = current.filter((item) => item.id !== target.id);
      setUnreadCount(recomputeUnread(next));
      return next;
    });
    setSelectedIds((current) => {
      const next = new Set(current);
      next.delete(target.id);
      return next;
    });
    try {
      await voiceCallsApi.notifications.deleteNotification(target.id);
      showToast("Notification deleted.");
    } catch (error) {
      showToast(
        getFriendlyError(error, "Could not delete notification."),
        "error",
      );
      await loadNotifications();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="animate-fade-up space-y-6">
      {toast ? (
        <div
          className={`fixed right-5 top-5 z-[500] rounded-2xl px-5 py-3 text-sm font-black text-white shadow-xl ${toast.tone === "success" ? "bg-emerald-600" : "bg-red-600"}`}
        >
          {toast.message}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">
            Total alerts
          </p>
          <p className="mt-2 text-3xl font-black text-slate-900">
            {notifications.length}
          </p>
        </div>
        <div className="rounded-[1.75rem] border border-amber-100 bg-amber-50 p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-700">
            Unread
          </p>
          <p className="mt-2 text-3xl font-black text-amber-700">
            {unreadCount}
          </p>
        </div>
        <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">
            Latest
          </p>
          <p className="mt-2 text-sm font-bold text-slate-700">
            {notifications[0]
              ? formatDate(notifications[0].createdAt)
              : "No alerts yet"}
          </p>
        </div>
      </div>

      <div className="rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-900">Notifications</h2>
            <p className="mt-1 text-sm text-slate-500">
              Workspace alerts for calls, follow-ups, unanswered questions, and
              schedules.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest transition ${filter === "all" ? "bg-slate-900 text-white" : "border border-slate-200 text-slate-500 hover:bg-slate-50"}`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setFilter("unread")}
              className={`rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest transition ${filter === "unread" ? "bg-slate-900 text-white" : "border border-slate-200 text-slate-500 hover:bg-slate-50"}`}
            >
              Unread
            </button>
            <button
              type="button"
              onClick={() => void markAllRead()}
              disabled={!unreadCount}
              className="rounded-xl border border-slate-200 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 transition hover:border-amber-200 hover:text-indigo-600 disabled:opacity-40"
            >
              Mark all read
            </button>
            <button
              type="button"
              onClick={() => void loadNotifications()}
              disabled={loading}
              className="rounded-xl border border-slate-200 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 transition hover:border-amber-200 hover:text-indigo-600 disabled:opacity-40"
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/70 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-500">
              <input
                type="checkbox"
                checked={selectedOnPage}
                onChange={togglePageSelection}
                className="h-4 w-4 rounded border-slate-300"
              />
              Select page
            </label>
            <span className="text-xs font-bold text-slate-400">
              {selectedCount} selected
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void runBulkAction("read")}
              disabled={!selectedCount || bulkBusy !== null}
              className="rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-white disabled:opacity-40"
            >
              Mark read
            </button>
            <button
              type="button"
              onClick={() => void runBulkAction("unread")}
              disabled={!selectedCount || bulkBusy !== null}
              className="rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-white disabled:opacity-40"
            >
              Mark unread
            </button>
            <button
              type="button"
              onClick={() => setBulkDeleteOpen(true)}
              disabled={!selectedCount || bulkBusy !== null}
              className="rounded-xl border border-red-100 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-500 hover:bg-red-50 disabled:opacity-40"
            >
              Delete selected
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm font-bold text-slate-400">
            Loading notifications...
          </div>
        ) : pagedNotifications.length ? (
          <div className="divide-y divide-slate-100">
            {pagedNotifications.map((notification) => {
              const target = getNotificationTarget(notification);
              return (
                <div
                  key={notification.id}
                  className={`p-5 transition ${notification.isRead ? "bg-white" : "bg-amber-50/40"}`}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(notification.id)}
                        onChange={() => toggleSelected(notification.id)}
                        className="mt-3 h-4 w-4 rounded border-slate-300"
                      />
                      <button
                        type="button"
                        onClick={() => void openRelated(notification)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className={`mt-2 h-2.5 w-2.5 rounded-full ${notification.isRead ? "bg-slate-200" : "bg-amber-400"}`}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${toneForType(notification.type)}`}
                              >
                                {getTypeLabel(notification.type)}
                              </span>
                              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                {formatDate(notification.createdAt)}
                              </span>
                            </div>
                            <p className="mt-2 text-base font-black text-slate-900">
                              {notification.title}
                            </p>
                            {notification.body ? (
                              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
                                {notification.body}
                              </p>
                            ) : null}
                            {target ? (
                              <p className="mt-2 text-xs font-bold text-indigo-600">
                                Open related{" "}
                                {target.startsWith("/calls?")
                                  ? "call"
                                  : target.replace("/", "")}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </button>
                    </div>

                    <div className="flex shrink-0 gap-2">
                      {notification.isRead ? (
                        <button
                          type="button"
                          onClick={() => void markUnread(notification)}
                          disabled={busyId === notification.id}
                          className="rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 transition hover:border-amber-200 hover:text-indigo-600 disabled:opacity-40"
                        >
                          Mark unread
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void markRead(notification)}
                          disabled={busyId === notification.id}
                          className="rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 transition hover:border-amber-200 hover:text-indigo-600 disabled:opacity-40"
                        >
                          Mark read
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(notification)}
                        disabled={busyId === notification.id}
                        className="rounded-xl border border-red-100 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-500 transition hover:bg-red-50 disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-14 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              <i className="fa-regular fa-bell text-xl" />
            </div>
            <p className="text-lg font-black text-slate-900">
              No notifications found
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Workspace alerts will appear here when calls, leads, recordings,
              transcripts, or schedules need attention.
            </p>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-slate-100 p-5">
          <p className="text-xs font-bold text-slate-400">
            Showing{" "}
            {visibleNotifications.length ? (page - 1) * PAGE_SIZE + 1 : 0}–
            {Math.min(page * PAGE_SIZE, visibleNotifications.length)} of{" "}
            {visibleNotifications.length}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-black text-slate-500 transition hover:bg-slate-50 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() =>
                setPage((current) => Math.min(totalPages, current + 1))
              }
              disabled={page >= totalPages}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-black text-slate-500 transition hover:bg-slate-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      <AppModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete notification?"
        description="This alert will be removed from your notification center."
        size="sm"
        footer={
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-black text-slate-600 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void deleteNotification()}
              disabled={Boolean(deleteTarget && busyId === deleteTarget.id)}
              className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-black text-white transition hover:bg-red-700 disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        }
      >
        <p className="text-sm text-slate-600">
          {deleteTarget?.title || "This notification"} will be deleted. This
          will not delete the related call, lead, or schedule.
        </p>
      </AppModal>

      <AppModal
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        title="Delete selected notifications?"
        description="Selected alerts will be removed from your notification center."
        size="sm"
        footer={
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setBulkDeleteOpen(false)}
              className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-black text-slate-600 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void runBulkAction("delete")}
              disabled={bulkBusy === "delete"}
              className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-black text-white transition hover:bg-red-700 disabled:opacity-50"
            >
              Delete selected
            </button>
          </div>
        }
      >
        <p className="text-sm text-slate-600">
          {selectedCount} notification{selectedCount === 1 ? "" : "s"} will be
          deleted. Related calls, leads, and schedules will remain available.
        </p>
      </AppModal>
    </div>
  );
};

export default Notifications;
