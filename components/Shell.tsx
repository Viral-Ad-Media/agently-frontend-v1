import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ICONS } from "../constants";
import { Organization, User } from "../types";

type SidebarIcon = React.ComponentType<Record<string, never>>;

const NAV_ITEMS: Array<{
  to: string;
  icon: SidebarIcon;
  label: string;
  description: string;
}> = [
  {
    to: "/dashboard",
    icon: ICONS.Dashboard,
    label: "Dashboard",
    description: "Live performance and workload",
  },
  {
    to: "/agent",
    icon: ICONS.Robot,
    label: "Voice Agent",
    description: "Configure lines, scripts, and knowledge",
  },
  {
    to: "/phone-numbers",
    icon: ICONS.PhoneNumber,
    label: "Phone Numbers",
    description: "Search, purchase, and assign Twilio numbers",
  },
  {
    to: "/messenger",
    icon: ICONS.MessageSquare,
    label: "Chatbot Agent",
    description: "Widget design and chatbot knowledge",
  },
  {
    to: "/calls",
    icon: ICONS.Phone,
    label: "Call Logs",
    description: "Transcripts, outcomes, and reports",
  },
  {
    to: "/leads",
    icon: ICONS.Users,
    label: "Lead CRM",
    description: "Pipeline health and contact capture",
  },
  {
    to: "/team",
    icon: ICONS.Shield,
    label: "Team",
    description: "Members, permissions, and invites",
  },
  {
    to: "/billing",
    icon: ICONS.CreditCard,
    label: "Billing",
    description: "Plan usage, invoices, and upgrades",
  },
  {
    to: "/settings",
    icon: ICONS.Settings,
    label: "Settings",
    description: "Workspace, phone, and Twilio setup",
  },
];

const PUBLIC_NAV_ITEMS = [
  { to: "/features", label: "Features" },
  { to: "/pricing", label: "Pricing" },
  { to: "/about", label: "About" },
  { to: "/faqs", label: "FAQs" },
  { to: "/contact", label: "Contact" },
];

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
      eyebrow: "Operations Overview",
      title: "Command Center",
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
        "Search, purchase, and assign Twilio numbers to your voice agents — all from your master account.",
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
        "Control organization details, routing preferences, and Twilio connection settings.",
    },
  };

  return (
    pageMap[pathname] || {
      eyebrow: org.profile.name,
      title: "Workspace",
      description: "Manage your receptionist system from a single place.",
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

const AppLoading: React.FC = () => (
  <div className="min-h-screen bg-transparent px-6 py-10">
    <div className="mx-auto flex min-h-[70vh] max-w-md items-center justify-center">
      <div className="w-full rounded-[2rem] border border-white/70 bg-white/85 p-8 text-center shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur-xl">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-[0_18px_40px_rgba(255,153,0,0.28)]">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/90 border-t-transparent" />
        </div>
        <p className="text-[10px] font-black uppercase tracking-[0.35em] text-indigo-500">
          Launching Workspace
        </p>
        <h1 className="font-display mt-3 text-2xl text-slate-900">
          Loading Agently
        </h1>
        <p className="mt-2 text-sm font-medium text-slate-500">
          Preparing your agents, dashboards, and conversations.
        </p>
      </div>
    </div>
  </div>
);

const SidebarLink: React.FC<{
  to: string;
  icon: SidebarIcon;
  label: string;
  description: string;
  onNavigate?: () => void;
}> = ({ to, icon: Icon, label, description, onNavigate }) => {
  const location = useLocation();
  const isActive = location.pathname === to;

  return (
    <Link
      to={to}
      title={description}
      onClick={onNavigate}
      className={`group flex items-center gap-3 rounded-[1.25rem] border px-3.5 py-3 transition-all duration-200 ${
        isActive
          ? "border-amber-200 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-[0_18px_40px_rgba(255,153,0,0.26)]"
          : "border-transparent bg-transparent text-slate-500 hover:border-white/70 hover:bg-white/70 hover:text-slate-900"
      }`}
    >
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
          isActive
            ? "bg-white/18 text-white"
            : "bg-slate-100 text-slate-700 group-hover:bg-white"
        }`}
      >
        <Icon />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-black tracking-tight">{label}</p>
      </div>
      <div
        className={`h-2.5 w-2.5 rounded-full ${isActive ? "bg-white" : "bg-slate-200 group-hover:bg-indigo-300"}`}
      />
    </Link>
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
  setShowSimulator,
  onLogout,
}) => {
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,153,0,0.12),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(15,118,110,0.12),transparent_26%)]" />
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
          className={`fixed inset-y-0 left-0 z-40 w-[18.75rem] transform transition-transform duration-300 md:translate-x-0 ${
            mobileNavOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="m-4 flex h-[calc(100vh-2rem)] flex-col rounded-[2rem] border border-white/70 bg-white/88 p-5 shadow-[0_28px_80px_rgba(15,23,42,0.14)] backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <Link to="/dashboard" className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-[0_18px_40px_rgba(255,153,0,0.28)]">
                  <ICONS.Robot />
                </div>
                <div>
                  <p className="font-display text-xl text-slate-900">Agently</p>
                  <p className="text-[10px] font-black uppercase tracking-[0.32em] text-indigo-500">
                    Reception Ops
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

            <nav className="mt-5 flex-1 space-y-1.5 overflow-y-auto custom-scrollbar pr-1">
              {NAV_ITEMS.map((item) => (
                <SidebarLink
                  key={item.to}
                  {...item}
                  onNavigate={() => setMobileNavOpen(false)}
                />
              ))}
            </nav>

            <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
              <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50/85 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-400">
                    Plan Usage
                  </p>
                  <Link
                    to="/billing"
                    className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-600 transition hover:border-indigo-200 hover:text-indigo-600"
                  >
                    {org.subscription.plan}
                  </Link>
                </div>
                <p className="mt-2 text-xs font-semibold text-slate-600">
                  {org.subscription.usage.minutes} /{" "}
                  {org.subscription.usage.minuteLimit} minutes used
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-amber-400 to-emerald-400"
                    style={{ width: `${usagePercent}%` }}
                  />
                </div>
              </div>

              <button
                onClick={() => setShowSimulator(true)}
                className="w-full rounded-[1.35rem] bg-indigo-600 px-5 py-3.5 text-[11px] font-black uppercase tracking-[0.28em] text-white shadow-[0_18px_40px_rgba(255,153,0,0.24)] transition hover:bg-indigo-700"
              >
                Launch Simulator
              </button>

              <button
                onClick={onLogout}
                className="flex w-full items-center justify-center gap-2 rounded-[1.3rem] border border-slate-200 px-4 py-3 text-[11px] font-black uppercase tracking-[0.24em] text-slate-500 transition hover:border-red-200 hover:text-red-600"
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

        <div className="flex-1 md:ml-[18.75rem] md:min-w-0">
          <div className="px-4 pb-10 pt-4 sm:px-6 lg:px-8">
            <header className="sticky top-4 z-20">
              <div className="rounded-[1.6rem] border border-white/70 bg-white/84 px-4 py-4 shadow-[0_20px_60px_rgba(15,23,42,0.1)] backdrop-blur-xl sm:px-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setMobileNavOpen(true)}
                      className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm md:hidden"
                      aria-label="Open navigation"
                    >
                      <MenuButtonIcon />
                    </button>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.28em] text-indigo-600">
                          {pageMeta.eyebrow}
                        </span>
                        <span className="hidden text-xs font-semibold text-slate-400 sm:inline">
                          {org.profile.name}
                        </span>
                      </div>
                      <h1 className="font-display mt-2 text-2xl tracking-tight text-slate-900 sm:text-[2rem]">
                        {pageMeta.title}
                      </h1>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <div className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                      <span className="font-black text-slate-900">
                        {activeVoiceAgent.name}
                      </span>
                      <span className="ml-1.5 text-slate-400">active</span>
                    </div>
                    <div className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                      <span className="font-black text-slate-900">
                        {org.subscription.usage.calls}
                      </span>
                      <span className="ml-1.5 text-slate-400">
                        calls this cycle
                      </span>
                    </div>
                    <Link
                      to="/billing"
                      className="rounded-full border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.24em] text-slate-600 transition hover:border-indigo-200 hover:text-indigo-600"
                    >
                      {org.subscription.plan}
                    </Link>
                    <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-950 py-1.5 pl-1.5 pr-3 text-white shadow-[0_14px_32px_rgba(15,23,42,0.14)]">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/12 font-display text-sm">
                        {user.name.charAt(0) || "A"}
                      </div>
                      <div className="leading-tight">
                        <p className="text-xs font-black">{user.name}</p>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/55">
                          {user.role}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </header>

            <main className="mx-auto mt-6 max-w-7xl">{children}</main>
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
    <div className="relative min-h-screen overflow-x-hidden text-slate-900">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,153,0,0.1),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(20,184,166,0.1),transparent_24%)]" />

      <header className="sticky top-0 z-40 px-4 pt-4 sm:px-6">
        <div className="mx-auto max-w-7xl rounded-full border border-white/70 bg-white/82 px-5 py-4 shadow-[0_24px_80px_rgba(15,23,42,0.1)] backdrop-blur-xl">
          <div className="flex items-center justify-between gap-4">
            <Link to="/" className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-[0_18px_40px_rgba(255,153,0,0.28)]">
                <ICONS.Robot />
              </div>
              <div>
                <p className="font-display text-xl text-slate-900">Agently</p>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-500">
                  AI Receptionist SaaS
                </p>
              </div>
            </Link>

            <nav className="hidden items-center gap-8 lg:flex">
              {PUBLIC_NAV_ITEMS.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="text-sm font-black text-slate-600 transition-colors hover:text-indigo-600"
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="hidden items-center gap-3 lg:flex">
              <Link
                to="/login"
                className="rounded-full px-4 py-2 text-sm font-black text-slate-700 transition hover:text-indigo-600"
              >
                Sign In
              </Link>
              <Link
                to="/login"
                className="rounded-full bg-slate-950 px-5 py-3 text-[11px] font-black uppercase tracking-[0.28em] text-white shadow-[0_18px_40px_rgba(15,23,42,0.18)] transition hover:bg-slate-800"
              >
                Start Trial
              </Link>
            </div>

            <button
              type="button"
              onClick={() => setMobileNavOpen((current) => !current)}
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm lg:hidden"
              aria-label="Toggle navigation"
            >
              <MenuButtonIcon open={mobileNavOpen} />
            </button>
          </div>
        </div>

        {mobileNavOpen && (
          <div className="mx-auto mt-3 max-w-7xl rounded-[2rem] border border-white/70 bg-white/88 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur-xl lg:hidden">
            <nav className="space-y-2">
              {PUBLIC_NAV_ITEMS.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="block rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700 transition hover:border-indigo-200 hover:text-indigo-600"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Link
                to="/login"
                className="rounded-2xl border border-slate-200 px-4 py-3 text-center text-sm font-black text-slate-700"
              >
                Sign In
              </Link>
              <Link
                to="/login"
                className="rounded-2xl bg-slate-950 px-4 py-3 text-center text-[11px] font-black uppercase tracking-[0.24em] text-white"
              >
                Start Trial
              </Link>
            </div>
          </div>
        )}
      </header>

      <main className="relative">{children}</main>

      <footer className="relative mt-16 px-4 pb-8 sm:px-6">
        <div className="mx-auto max-w-7xl rounded-[2.75rem] bg-slate-950 px-6 py-12 text-white shadow-[0_28px_90px_rgba(15,23,42,0.28)] sm:px-10">
          <div className="grid gap-10 lg:grid-cols-[1.3fr_repeat(3,0.7fr)]">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-600 text-white">
                  <ICONS.Robot />
                </div>
                <div>
                  <p className="font-display text-xl text-white">Agently</p>
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/45">
                    Always Answered
                  </p>
                </div>
              </div>
              <p className="mt-5 max-w-md text-sm font-medium leading-relaxed text-white/65">
                Voice agents, chatbots, and call intelligence for teams that
                want every customer conversation answered with speed and
                consistency.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-black uppercase tracking-[0.22em] text-white/70">
                  Inbound Voice
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-black uppercase tracking-[0.22em] text-white/70">
                  Outbound Calls
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-black uppercase tracking-[0.22em] text-white/70">
                  Embedded Chatbots
                </span>
              </div>
            </div>

            <div>
              <h4 className="text-[10px] font-black uppercase tracking-[0.34em] text-white/45">
                Product
              </h4>
              <div className="mt-5 space-y-3">
                <Link
                  to="/features"
                  className="block text-sm font-semibold text-white/70 transition hover:text-white"
                >
                  Features
                </Link>
                <Link
                  to="/pricing"
                  className="block text-sm font-semibold text-white/70 transition hover:text-white"
                >
                  Pricing
                </Link>
                <Link
                  to="/login"
                  className="block text-sm font-semibold text-white/70 transition hover:text-white"
                >
                  Workspace
                </Link>
              </div>
            </div>

            <div>
              <h4 className="text-[10px] font-black uppercase tracking-[0.34em] text-white/45">
                Company
              </h4>
              <div className="mt-5 space-y-3">
                <Link
                  to="/about"
                  className="block text-sm font-semibold text-white/70 transition hover:text-white"
                >
                  About
                </Link>
                <Link
                  to="/contact"
                  className="block text-sm font-semibold text-white/70 transition hover:text-white"
                >
                  Contact
                </Link>
                <Link
                  to="/faqs"
                  className="block text-sm font-semibold text-white/70 transition hover:text-white"
                >
                  FAQs
                </Link>
              </div>
            </div>

            <div>
              <h4 className="text-[10px] font-black uppercase tracking-[0.34em] text-white/45">
                Legal
              </h4>
              <div className="mt-5 space-y-3">
                <Link
                  to="/privacy"
                  className="block text-sm font-semibold text-white/70 transition hover:text-white"
                >
                  Privacy Policy
                </Link>
                <Link
                  to="/terms"
                  className="block text-sm font-semibold text-white/70 transition hover:text-white"
                >
                  Terms of Service
                </Link>
              </div>
            </div>
          </div>

          <div className="mt-10 flex flex-col gap-4 border-t border-white/10 pt-6 text-xs font-medium text-white/45 md:flex-row md:items-center md:justify-between">
            <p>
              © {currentYear} Agently. Built for teams that never want to miss a
              customer.
            </p>
            <p>
              Voice, chat, CRM, and call intelligence in one operating system.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export { AppLoading, MainLayout, PublicLayout };
