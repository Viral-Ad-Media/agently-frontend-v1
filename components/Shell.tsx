import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Organization, User } from "../types";
import { ICONS } from "@/constants";
import { voiceCallsApi } from "../services/voiceCallsApi";
import { api } from "../services/api";

const NAV_ITEMS: Array<{
  to: string;
  icon: string;
  label: string;
  description: string;
}> = [
  {
    to: "/dashboard",
    icon: "fa-solid fa-chart-line",
    label: "Dashboard",
    description: "Live performance and workload",
  },
  {
    to: "/agent",
    icon: "fa-solid fa-microphone",
    label: "Voice Agent",
    description: "Configure lines, scripts, and knowledge",
  },
  {
    to: "/phone-numbers",
    icon: "fa-solid fa-mobile-screen",
    label: "Phone Numbers",
    description: "Search, purchase, and assign numbers",
  },
  {
    to: "/messenger",
    icon: "fa-solid fa-robot",
    label: "Chatbot Agent",
    description: "Widget design and chatbot knowledge",
  },
  {
    to: "/leads",
    icon: "fa-solid fa-users",
    label: "Lead CRM",
    description: "Pipeline health and contact capture",
  },
  {
    to: "/settings",
    icon: "fa-solid fa-gear",
    label: "Settings",
    description: "Workspace, team, billing, and phone setup",
  },
];

const PUBLIC_NAV_ITEMS = [
  { to: "/features", label: "Features" },
  { to: "/pricing", label: "Pricing" },
  { to: "/about", label: "About" },
  { to: "/faqs", label: "FAQs" },
  { to: "/contact", label: "Contact" },
];

type WalletMini = {
  balanceUsd: number;
  minimumRechargeUsd?: number;
  status?: string;
  creditEnforcementMode?: string;
  autoChargeWalletEnabled?: boolean;
  minimums?: {
    callUsd?: number;
    chatUsd?: number;
    hardStopBalanceUsd?: number;
    maxNegativeBalanceUsd?: number;
  };
};

const formatWalletMoney = (value: number) => {
  const amount = Number.isFinite(value) ? value : 0;
  return `${amount < 0 ? "-" : ""}$${Math.abs(amount).toFixed(2)}`;
};

const WalletCreditBadge: React.FC<{
  wallet: WalletMini | null;
  compact?: boolean;
}> = ({ wallet, compact = false }) => {
  const balance = Number(wallet?.balanceUsd || 0);
  const isNegative = balance < 0;
  const isLow = !isNegative && balance < Number(wallet?.minimums?.callUsd || 1);
  const tone = isNegative
    ? "border-red-200 bg-red-50 text-red-700"
    : isLow
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : "border-emerald-200 bg-emerald-50 text-emerald-700";
  return (
    <Link
      to="/billing"
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-black transition hover:shadow-sm ${tone} ${compact ? "w-full justify-between" : ""}`}
      title="Usage credit balance"
    >
      <span className="inline-flex items-center gap-2">
        <i className="fa-solid fa-wallet text-[12px]" />
        <span className="hidden sm:inline">Credit</span>
      </span>
      <span>{formatWalletMoney(balance)}</span>
    </Link>
  );
};

const getUsagePercent = (minutes: number, minuteLimit: number) => {
  if (minuteLimit <= 0) {
    return 0;
  }

  return Math.min(100, (minutes / minuteLimit) * 100);
};

const getPageMeta = (pathname: string, org: Organization) => {
  const pageMap: Record<
    string,
    { eyebrow: string; title: string; description: string }
  > = {
    "/dashboard": {
      eyebrow: "Dashboard",
      title: "Workspace analytics",
      description: `Track calls, leads, and efficiency for ${org.profile.name} in one place.`,
    },
    "/agent": {
      eyebrow: "Voice Operations",
      title: "Voice Agent Studio",
      description:
        "Manage every inbound and outbound voice agent, their numbers, and their knowledge base.",
    },
    "/phone-numbers": {
      eyebrow: "Number Management",
      title: "Phone Numbers",
      description:
        "Search, connect, and manage business numbers for your voice agents.",
    },
    "/test-agent": {
      eyebrow: "Agent Preview",
      title: "Test Your Agent",
      description:
        "Run limited trial calls before connecting a dedicated business number.",
    },
    "/features": {
      eyebrow: "Product Surface",
      title: "Platform Features",
      description:
        "Review the full Agently feature set without leaving the workspace shell.",
    },
    "/messenger": {
      eyebrow: "Digital Concierge",
      title: "Chatbot Agent Studio",
      description:
        "Customize every chatbot, sync knowledge, and control how your website assistant behaves.",
    },
    "/calls": {
      eyebrow: "Conversation Records",
      title: "Call Intelligence",
      description:
        "Review transcripts, outcomes, and downloadable reports across every conversation.",
    },
    "/outreach": {
      eyebrow: "Outbound Calls",
      title: "Call Campaigns",
      description:
        "Create call-now, scheduled, and lead-backed campaigns for your agents.",
    },
    "/leads": {
      eyebrow: "Pipeline Health",
      title: "Lead Workspace",
      description:
        "Sort, update, and export the leads your agents capture around the clock.",
    },
    "/team": {
      eyebrow: "Workspace Access",
      title: "Team Control",
      description:
        "Invite teammates, manage roles, and keep the right people looped into every workflow.",
    },
    "/billing": {
      eyebrow: "Revenue Ops",
      title: "Billing & Usage",
      description:
        "Stay ahead of plan usage, invoices, and upgrade timing without leaving the dashboard.",
    },
    "/settings": {
      eyebrow: "Workspace Setup",
      title: "Settings",
      description:
        "Control organization details, routing preferences, team access, billing, and business-number settings.",
    },
  };

  return (
    pageMap[pathname] || {
      eyebrow: org.profile.name,
      title: "Workspace",
      description: "Manage your AI agent workspace from a single place.",
    }
  );
};

const MenuButtonIcon: React.FC<{ open?: boolean }> = ({ open = false }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {open ? (
      <>
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
      </>
    ) : (
      <>
        <path d="M4 12h16" />
        <path d="M4 6h16" />
        <path d="M4 18h16" />
      </>
    )}
  </svg>
);

const PublicBrand: React.FC<{ inverted?: boolean; compact?: boolean }> = ({
  inverted = false,
  compact = false,
}) => {
  const src = inverted
    ? "/agently-wordmark-light.png"
    : "/agently-wordmark-dark.png";
  return (
    <div className="flex items-center">
      <img
        src={src}
        alt="Agently"
        className={`${compact ? "h-8 sm:h-9" : "h-10 sm:h-11"} w-auto object-contain`}
        loading="eager"
      />
    </div>
  );
};

const AppLoading: React.FC = () => (
  <div className="agently-loader-screen">
    <div className="agently-loader-frame" role="status" aria-live="polite">
      <div className="agently-loader-orbit" aria-hidden="true">
        <img src="/agently-mark.png" alt="" className="agently-loader-mark" />
        <span className="agently-loader-wave wave-one" />
        <span className="agently-loader-wave wave-two" />
        <span className="agently-loader-wave wave-three" />
      </div>
      <img
        src="/agently-wordmark-dark.png"
        alt="Agently"
        className="agently-loader-wordmark"
      />
      <div className="agently-loader-line" aria-hidden="true">
        <span />
      </div>
      <p className="agently-loader-copy">Preparing your workspace</p>
    </div>
  </div>
);

const SidebarLink: React.FC<{
  to: string;
  icon: string;
  label: string;
  description: string;
  onNavigate?: () => void;
}> = memo(({ to, icon, label, description, onNavigate }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const isActive = location.pathname === to;

  const handleNavigate = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    )
      return;
    event.preventDefault();
    onNavigate?.();
    if (isActive) return;
    window.setTimeout(() => {
      navigate(to);
    }, 0);
  };

  return (
    <a
      href={`#${to}`}
      title={description}
      onClick={handleNavigate}
      className={`group flex items-center gap-2.5 rounded-2xl border px-3 py-2.5 transition-all duration-200 ${
        isActive
          ? "border-[#ff5527]/20 bg-[#ff5527] text-white shadow-[0_16px_34px_rgba(255,85,39,0.2)]"
          : "border-transparent bg-transparent text-[#232f3e]/62 hover:border-[#232f3e]/10 hover:bg-white/70 hover:text-[#232f3e]"
      }`}
    >
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl transition-colors duration-200 ${
          isActive
            ? "bg-white/18 text-white"
            : "bg-[#232f3e]/[0.055] text-[#232f3e]/72 group-hover:bg-[#ff5527]/10 group-hover:text-[#ff5527]"
        }`}
      >
        <i className={`${icon} text-sm`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium tracking-[-0.02em]">
          {label}
        </p>
      </div>
      <div
        className={`h-2 w-2 rounded-full transition-colors duration-150 ${isActive ? "bg-white" : "bg-[#232f3e]/14 group-hover:bg-[#ff5527]"}`}
      />
    </a>
  );
});
SidebarLink.displayName = "SidebarLink";

type TenantNotification = {
  id: string;
  type: string;
  title: string;
  body?: string;
  entity_type?: string;
  entity_id?: string;
  voice_agent_id?: string;
  call_record_id?: string;
  is_read?: boolean;
  created_at?: string;
  metadata?: Record<string, unknown>;
};

const getNotificationArray = (payload: unknown): TenantNotification[] => {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  const candidate =
    record.notifications || record.data || record.items || record.results;
  if (!Array.isArray(candidate)) return [];
  return candidate
    .filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object" && !Array.isArray(item),
    )
    .map((item) => ({
      id: String(item.id || ""),
      type: String(item.type || "notification"),
      title: String(item.title || "Notification"),
      body: typeof item.body === "string" ? item.body : "",
      entity_type:
        typeof item.entity_type === "string"
          ? item.entity_type
          : typeof item.entityType === "string"
            ? item.entityType
            : "",
      entity_id:
        typeof item.entity_id === "string"
          ? item.entity_id
          : typeof item.entityId === "string"
            ? item.entityId
            : "",
      voice_agent_id:
        typeof item.voice_agent_id === "string"
          ? item.voice_agent_id
          : typeof item.voiceAgentId === "string"
            ? item.voiceAgentId
            : "",
      call_record_id:
        typeof item.call_record_id === "string"
          ? item.call_record_id
          : typeof item.callRecordId === "string"
            ? item.callRecordId
            : "",
      is_read: Boolean(item.is_read ?? item.isRead),
      created_at:
        typeof item.created_at === "string"
          ? item.created_at
          : typeof item.createdAt === "string"
            ? item.createdAt
            : "",
      metadata:
        item.metadata &&
        typeof item.metadata === "object" &&
        !Array.isArray(item.metadata)
          ? (item.metadata as Record<string, unknown>)
          : {},
    }))
    .filter((item) => item.id);
};

const getUnreadCountValue = (payload: unknown): number => {
  if (!payload || typeof payload !== "object") return 0;
  const record = payload as Record<string, unknown>;
  const value =
    record.unreadCount ?? record.unread_count ?? record.count ?? record.total;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
};

const formatNotificationTime = (value?: string) => {
  if (!value) return "Just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

const getNotificationTarget = (notification: TenantNotification): string => {
  const entityType = String(notification.entity_type || "").toLowerCase();
  const type = String(notification.type || "").toLowerCase();
  const callId =
    notification.call_record_id ||
    (entityType.includes("call") ? notification.entity_id : "");
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
  return "/notifications";
};

const NotificationBell: React.FC = () => {
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<TenantNotification[]>([]);

  const refreshUnread = async () => {
    try {
      const payload =
        await voiceCallsApi.notifications.getUnreadNotificationCount();
      setUnreadCount(getUnreadCountValue(payload));
    } catch {
      setUnreadCount(0);
    }
  };

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const payload = await voiceCallsApi.notifications.getNotifications({
        limit: 8,
      });
      const next = getNotificationArray(payload).slice(0, 8);
      setNotifications(next);
      setUnreadCount(
        next.filter((item) => !item.is_read).length || unreadCount,
      );
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshUnread();
    const interval = window.setInterval(() => void refreshUnread(), 60000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (open) void loadNotifications();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const handleOpenNotification = async (notification: TenantNotification) => {
    if (!notification.is_read) {
      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id ? { ...item, is_read: true } : item,
        ),
      );
      setUnreadCount((current) => Math.max(0, current - 1));
      void voiceCallsApi.notifications
        .markNotificationRead(notification.id)
        .catch(() => undefined);
    }
    setOpen(false);
    navigate(getNotificationTarget(notification));
  };

  const markAllRead = async () => {
    setNotifications((current) =>
      current.map((item) => ({ ...item, is_read: true })),
    );
    setUnreadCount(0);
    await voiceCallsApi.notifications
      .markAllNotificationsRead()
      .catch(() => undefined);
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-[#232f3e]/10 bg-white/72 text-[#232f3e]/68 transition hover:border-[#ff5527]/25 hover:text-[#ff5527]"
        aria-label="Open notifications"
      >
        <i className="fa-solid fa-bell text-sm" />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-black leading-none text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-12 z-[120] w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <p className="text-sm font-black text-slate-900">Notifications</p>
              <p className="text-[11px] font-semibold text-[#232f3e]/44">
                Latest workspace alerts
              </p>
            </div>
            <button
              type="button"
              onClick={() => void markAllRead()}
              disabled={!unreadCount}
              className="rounded-full border border-slate-200 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 transition hover:border-amber-200 hover:text-indigo-600 disabled:opacity-40"
            >
              Read all
            </button>
          </div>

          <div className="max-h-[22rem] overflow-y-auto p-2">
            {loading ? (
              <div className="p-6 text-center text-xs font-bold text-slate-400">
                Loading alerts...
              </div>
            ) : notifications.length ? (
              notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => void handleOpenNotification(notification)}
                  className={`w-full rounded-2xl px-3 py-3 text-left transition hover:bg-slate-50 ${notification.is_read ? "opacity-75" : "bg-amber-50/60"}`}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-1 h-2.5 w-2.5 rounded-full ${notification.is_read ? "bg-slate-200" : "bg-amber-400"}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black text-slate-900">
                        {notification.title}
                      </p>
                      {notification.body ? (
                        <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                          {notification.body}
                        </p>
                      ) : null}
                      <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                        {formatNotificationTime(notification.created_at)}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            ) : (
              <div className="p-6 text-center">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                  <i className="fa-regular fa-bell" />
                </div>
                <p className="text-sm font-black text-slate-800">
                  No notifications yet
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  New call, lead, recording, and schedule alerts will appear
                  here.
                </p>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate("/notifications");
            }}
            className="w-full border-t border-slate-100 px-4 py-3 text-center text-[10px] font-black uppercase tracking-widest text-indigo-600 transition hover:bg-slate-50"
          >
            View all notifications
          </button>
        </div>
      ) : null}
    </div>
  );
};

interface MainLayoutProps {
  children: React.ReactNode;
  org: Organization;
  user: User;
  setShowSimulator: (show: boolean) => void;
  onLogout: () => void;
}

const MainLayout: React.FC<MainLayoutProps> = ({
  children,
  org,
  user,
  setShowSimulator: _setShowSimulator,
  onLogout,
}) => {
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [walletMini, setWalletMini] = useState<WalletMini | null>(null);

  const refreshWalletMini = async () => {
    try {
      const summary = (await api.getBillingSummary()) as {
        wallet?: WalletMini;
      };
      if (summary?.wallet) {
        setWalletMini({
          ...summary.wallet,
          balanceUsd: Number(summary.wallet.balanceUsd || 0),
        });
      }
    } catch {
      // Billing should not break the app shell.
    }
  };

  useEffect(() => {
    void refreshWalletMini();
    const interval = window.setInterval(() => void refreshWalletMini(), 15000);
    const handler = () => void refreshWalletMini();
    window.addEventListener("agently:wallet-refresh", handler);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("agently:wallet-refresh", handler);
    };
  }, [org.id]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  const usagePercent = getUsagePercent(
    org.subscription.usage.minutes,
    org.subscription.usage.minuteLimit,
  );
  const activeVoiceAgent =
    org.voiceAgents.find((agent) => agent.id === org.activeVoiceAgentId) ||
    org.agent;
  const pageMeta = getPageMeta(location.pathname, org);
  const isTestAgentPage = location.pathname === "/test-agent";
  const settingsSubpageBack = ["/team", "/billing"].includes(location.pathname);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#f7f4eb] text-[#232f3e]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,85,39,0.14),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(35,47,62,0.08),transparent_28%)]" />
      <div className="relative flex min-h-screen">
        <div
          className={`fixed inset-0 z-30 bg-slate-950/45 backdrop-blur-sm transition-opacity duration-200 md:hidden ${
            mobileNavOpen
              ? "pointer-events-auto opacity-100"
              : "pointer-events-none opacity-0"
          }`}
          onClick={() => setMobileNavOpen(false)}
        />

        <aside
          className={`fixed inset-y-0 left-0 z-40 w-[min(18.75rem,calc(100vw-1rem))] transform transition-transform duration-300 md:w-[17rem] md:translate-x-0 ${
            mobileNavOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex h-full flex-col border-r border-[#232f3e]/10 bg-[#f7f4eb] p-4 shadow-none">
            <div className="flex items-center justify-between">
              <Link
                to="/dashboard"
                className="flex min-w-0 items-center rounded-2xl bg-white/72 px-3 py-2 shadow-[0_12px_28px_rgba(35,47,62,0.06)]"
              >
                <div className="min-w-0">
                  <img
                    src="/agently-wordmark-dark.png"
                    alt="Agently"
                    className="h-7 w-auto object-contain"
                    loading="eager"
                  />
                  <p className="mt-0.5 text-[9px] font-medium uppercase tracking-[0.2em] text-[#ff5527]">
                    Agent control room
                  </p>
                </div>
              </Link>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 md:hidden"
                aria-label="Close navigation"
              >
                <MenuButtonIcon open />
              </button>
            </div>

            <nav className="mt-6 flex-1 space-y-1.5 overflow-y-auto custom-scrollbar pr-1">
              {NAV_ITEMS.map((item) => (
                <SidebarLink
                  key={item.to}
                  {...item}
                  onNavigate={() => setMobileNavOpen(false)}
                />
              ))}
            </nav>

            <div className="mt-5 space-y-2 border-t border-[#232f3e]/10 pt-4">
              <WalletCreditBadge wallet={walletMini} compact />
              <div className="rounded-2xl border border-[#232f3e]/10 bg-white/72 p-3 shadow-[0_10px_26px_rgba(35,47,62,0.055)]">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[9px] font-black uppercase tracking-[0.22em] text-slate-400">
                    Plan Usage
                  </p>
                  <Link
                    to="/settings"
                    className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-600 transition hover:border-indigo-200 hover:text-indigo-600"
                  >
                    {org.subscription.plan}
                  </Link>
                </div>
                <p className="mt-1.5 text-[11px] font-semibold text-slate-600">
                  {org.subscription.usage.minutes} /{" "}
                  {org.subscription.usage.minuteLimit} minutes used
                </p>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#ff5527] via-[#ff9b5f] to-[#232f3e]"
                    style={{ width: `${usagePercent}%` }}
                  />
                </div>
              </div>

              <Link
                to="/test-agent"
                className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] shadow-sm transition ${
                  isTestAgentPage
                    ? "bg-[#232f3e] text-white ring-2 ring-[#ff5527]/25"
                    : "bg-[#232f3e] text-white hover:bg-[#1b2531]"
                }`}
                onClick={() => setMobileNavOpen(false)}
              >
                <i className="fa-solid fa-phone-volume text-sm" />
                Test Your Agent
              </Link>

              <button
                onClick={onLogout}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 transition hover:border-red-200 hover:text-red-600"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" x2="9" y1="12" y2="12" />
                </svg>
                Sign Out
              </button>
            </div>
          </div>
        </aside>

        <div className="flex-1 md:ml-[17rem] md:min-w-0">
          <div className="flex h-screen min-h-0 flex-col px-3 pb-0 pt-3 sm:px-5 sm:pt-4 lg:px-6 xl:px-8">
            <header className="relative z-20 shrink-0">
              <div className="app-shell-titlebar-flat">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setMobileNavOpen(true)}
                      className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#232f3e]/10 bg-white/80 text-[#232f3e] shadow-sm md:hidden"
                      aria-label="Open navigation"
                    >
                      <MenuButtonIcon />
                    </button>
                    <div className="min-w-0 flex-1">
                      {settingsSubpageBack ? (
                        <Link
                          to="/settings"
                          className="mb-1.5 inline-flex items-center gap-2 rounded-full border border-[#232f3e]/10 bg-white/70 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-[#232f3e]/62 transition hover:border-[#ff5527]/30 hover:text-[#ff5527]"
                        >
                          <i className="fa-sharp fa-solid fa-chevron-left text-[9px]" />
                          Settings
                        </Link>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-[#ff5527]/10 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.22em] text-[#ff5527]">
                          {pageMeta.eyebrow}
                        </span>
                        <span className="hidden text-xs font-semibold text-slate-400 sm:inline">
                          {org.profile.name}
                        </span>
                      </div>
                      <h1 className="font-display mt-1.5 truncate text-xl font-medium tracking-[-0.045em] text-[#232f3e] sm:text-[1.85rem]">
                        {pageMeta.title}
                      </h1>
                    </div>
                  </div>

                  <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                    <WalletCreditBadge wallet={walletMini} />
                    <NotificationBell />
                    <div className="max-w-full rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 sm:max-w-[16rem]">
                      <span className="inline-block max-w-[9rem] truncate align-bottom font-black text-slate-900 sm:max-w-[12rem]">
                        {activeVoiceAgent.name}
                      </span>
                      <span className="ml-1.5 text-slate-400">active</span>
                    </div>
                    <Link
                      to="/settings"
                      className="rounded-full border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.24em] text-slate-600 transition hover:border-indigo-200 hover:text-indigo-600"
                    >
                      {org.subscription.plan}
                    </Link>
                    <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-950 py-1.5 pl-1.5 pr-4 text-white shadow-[0_14px_32px_rgba(15,23,42,0.14)]">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/12 font-display text-sm">
                        {user.name.charAt(0) || "A"}
                      </div>
                      <div className="leading-tight min-w-0">
                        <p className="text-xs font-black truncate max-w-[100px]">
                          {user.name}
                        </p>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/55">
                          {user.role}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </header>

            <main className="custom-scrollbar mx-auto mt-4 w-full min-w-0 max-w-full flex-1 overflow-y-auto pb-8 pr-1 md:mt-5 md:pb-10">
              {user.role === "Viewer" &&
              [
                "/agent",
                "/phone-numbers",
                "/outreach",
                "/settings",
                "/team",
                "/billing",
              ].includes(location.pathname) ? (
                <div className="relative">
                  <div className="absolute inset-0 z-10 rounded-3xl bg-white/70 backdrop-blur-[2px] flex items-start justify-center pt-24 pointer-events-auto">
                    <div className="mx-4 max-w-sm rounded-2xl border border-slate-200 bg-white px-5 py-5 text-center shadow-xl sm:px-8 sm:py-6">
                      <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="text-slate-500"
                        >
                          <rect width="11" height="11" x="3" y="11" rx="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                      </div>
                      <p className="font-black text-slate-900 mb-1">
                        Read-Only Access
                      </p>
                      <p className="text-xs text-slate-400">
                        Your Viewer role doesn't allow editing. Contact an Admin
                        or Owner to make changes.
                      </p>
                    </div>
                  </div>
                  <div className="pointer-events-none select-none opacity-40">
                    {children}
                  </div>
                </div>
              ) : (
                children
              )}
            </main>
          </div>
        </div>
      </div>
    </div>
  );
};

const PublicLayout: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#f7f4eb] text-[#232f3e]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(35,47,62,0.04),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(255,85,39,0.12),transparent_25%)]" />

      <header className="sticky top-0 z-40 px-3 py-3 sm:px-5">
        <div className="mx-auto max-w-7xl rounded-full border border-[#232f3e]/10 bg-[#fbfaf4]/88 px-3 py-2 shadow-[0_14px_46px_rgba(35,47,62,0.08)] backdrop-blur-xl sm:px-4">
          <div className="flex items-center justify-between gap-4">
            <Link to="/" aria-label="Agently home" className="shrink-0">
              <PublicBrand compact />
            </Link>

            <nav className="hidden items-center gap-1 lg:flex">
              {PUBLIC_NAV_ITEMS.map((item) => {
                const isActive = location.pathname === item.to;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`rounded-full px-3.5 py-2 text-[13px] font-normal leading-none transition ${
                      isActive
                        ? "bg-[#232f3e] text-[#fbfaf4]"
                        : "text-[#232f3e]/66 hover:bg-[#232f3e]/[0.055] hover:text-[#232f3e]"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="hidden items-center gap-2 lg:flex">
              <Link
                to="/login"
                className="rounded-full px-4 py-2 text-[13px] font-normal leading-none text-[#232f3e]/66 transition hover:bg-[#232f3e]/[0.055] hover:text-[#232f3e]"
              >
                Login
              </Link>
              <Link
                to="/login"
                className="rounded-full bg-[#ff5527] px-4 py-2.5 text-[13px] font-medium leading-none text-white shadow-[0_12px_26px_rgba(255,85,39,0.22)] transition hover:bg-[#e94b21]"
              >
                Get Started
              </Link>
            </div>

            <button
              type="button"
              onClick={() => setMobileNavOpen((current) => !current)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[#232f3e]/10 bg-white/70 text-[#232f3e]/72 shadow-sm lg:hidden"
              aria-label="Toggle navigation"
            >
              <MenuButtonIcon open={mobileNavOpen} />
            </button>
          </div>
        </div>

        {mobileNavOpen && (
          <div className="mx-auto mt-3 max-w-7xl rounded-[1.75rem] border border-[#232f3e]/10 bg-[#fbfaf4]/96 p-4 shadow-[0_24px_80px_rgba(35,47,62,0.12)] backdrop-blur-xl lg:hidden">
            <nav className="grid gap-2">
              {PUBLIC_NAV_ITEMS.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="rounded-2xl px-4 py-3 text-sm font-normal text-[#232f3e]/72 transition hover:bg-[#232f3e]/[0.055] hover:text-[#232f3e]"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Link
                to="/login"
                className="rounded-2xl border border-[#232f3e]/10 px-4 py-3 text-center text-sm font-normal text-[#232f3e]/72"
              >
                Login
              </Link>
              <Link
                to="/login"
                className="rounded-2xl bg-[#ff5527] px-4 py-3 text-center text-sm font-medium text-white"
              >
                Get Started
              </Link>
            </div>
          </div>
        )}
      </header>

      <main className="relative">{children}</main>

      <footer className="relative px-3 pb-5 pt-4 sm:px-5 sm:pb-6">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-[#232f3e] text-[#fbfaf4] shadow-[0_28px_90px_rgba(35,47,62,0.25)]">
          <div className="grid gap-8 px-5 py-8 sm:px-8 lg:grid-cols-[1.1fr_1.35fr] lg:px-10 lg:py-10">
            <div className="max-w-md">
              <PublicBrand inverted />
              <h2 className="font-display mt-8 max-w-sm text-[clamp(2.25rem,4vw,3.6rem)] font-medium leading-[0.96] tracking-[-0.06em] text-[#fbfaf4]">
                Everyday conversations. Extraordinary outcomes.
              </h2>
              <p className="mt-4 max-w-sm text-base font-normal leading-[1.35] text-[#fbfaf4]/68">
                AI voice agents, chatbots, follow-up workflows, and call
                intelligence in one warm, reliable control room.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {["Inbound", "Outbound", "Chat", "CRM handoff"].map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-[#fbfaf4]/12 bg-[#fbfaf4]/[0.07] px-3 py-1.5 text-xs font-normal text-[#fbfaf4]/72"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid gap-7 sm:grid-cols-3">
              <div>
                <h4 className="text-xs font-medium uppercase tracking-[0.18em] text-[#fbfaf4]/44">
                  Product
                </h4>
                <div className="mt-4 space-y-3">
                  <Link
                    to="/features"
                    className="block text-sm font-normal text-[#fbfaf4]/72 transition hover:text-white"
                  >
                    Features
                  </Link>
                  <Link
                    to="/pricing"
                    className="block text-sm font-normal text-[#fbfaf4]/72 transition hover:text-white"
                  >
                    Pricing
                  </Link>
                  <Link
                    to="/login"
                    className="block text-sm font-normal text-[#fbfaf4]/72 transition hover:text-white"
                  >
                    Workspace
                  </Link>
                  <Link
                    to="/login"
                    className="block text-sm font-normal text-[#fbfaf4]/72 transition hover:text-white"
                  >
                    Start Trial
                  </Link>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-medium uppercase tracking-[0.18em] text-[#fbfaf4]/44">
                  Company
                </h4>
                <div className="mt-4 space-y-3">
                  <Link
                    to="/about"
                    className="block text-sm font-normal text-[#fbfaf4]/72 transition hover:text-white"
                  >
                    About
                  </Link>
                  <Link
                    to="/contact"
                    className="block text-sm font-normal text-[#fbfaf4]/72 transition hover:text-white"
                  >
                    Contact
                  </Link>
                  <Link
                    to="/faqs"
                    className="block text-sm font-normal text-[#fbfaf4]/72 transition hover:text-white"
                  >
                    FAQs
                  </Link>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-medium uppercase tracking-[0.18em] text-[#fbfaf4]/44">
                  Legal
                </h4>
                <div className="mt-4 space-y-3">
                  <Link
                    to="/privacy"
                    className="block text-sm font-normal text-[#fbfaf4]/72 transition hover:text-white"
                  >
                    Privacy Policy
                  </Link>
                  <Link
                    to="/terms"
                    className="block text-sm font-normal text-[#fbfaf4]/72 transition hover:text-white"
                  >
                    Terms of Service
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-[#fbfaf4]/12 px-5 py-4 text-xs font-normal text-[#fbfaf4]/48 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-10">
            <p>© {currentYear} Agently. All rights reserved.</p>
            <p>Voice, chat, CRM, and call intelligence for modern teams.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export { AppLoading, MainLayout, PublicLayout };
