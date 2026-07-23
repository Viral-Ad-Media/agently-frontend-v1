/**
 * agently/lib/productTour.tsx   — FULL REPLACEMENT
 *
 * You onboarded a test user and got nothing. You were right to call that out.
 * The previous version imported `driver.js`, which was never installed, so the
 * dynamic import rejected and the tour silently no-opped. Worse, nothing ever
 * *called* it — it was a module nobody imported.
 *
 * This version has NO external dependency. It is ~200 lines of React and CSS,
 * so it cannot fail to load, cannot be skipped by a missing npm install, and
 * cannot be broken by a package upgrade. Delete `driver.js` from package.json;
 * it is not needed.
 *
 * It renders:
 *   1. A welcome dialog  — "let me briefly walk you through the interface"
 *   2. A features-at-a-glance card
 *   3. A step per sidebar section, each spotlighting the real nav element via
 *      its data-tour attribute (added in Shell.tsx)
 *
 * Progress persists to the backend (user_tour_progress, migration 001) and to
 * localStorage as a fallback, so a refresh mid-tour resumes rather than
 * restarting, and a completed tour never nags again.
 */

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

export interface TourStep {
  /** Matches a data-tour="..." attribute in the DOM. Omit for a centred card. */
  anchor?: string;
  title: string;
  body: string;
  /** Preferred side. Falls back automatically if it would overflow. */
  placement?: "right" | "left" | "top" | "bottom" | "center";
  /** Mobile only: the sidebar must be open before this step can be shown. */
  requiresMenuOpen?: boolean;
  /** Skip this step entirely if the anchor is not in the DOM. */
  optional?: boolean;
}

const TOUR_KEY = "phase1_onboarding";

/**
 * ISSUE 2 — "what about the next phase that now happens when you open a
 * specific page"
 *
 * Phase 1 (above) is the one-time orientation. These are the per-page tours:
 * each fires the FIRST time that page is opened, walks the page's own
 * furniture, and never fires again. Keyed separately so completing the
 * overview does not silently mark every page tour as seen.
 */
export const PAGE_TOURS: Record<string, TourStep[]> = {
  "/dashboard": [
    {
      placement: "center",
      title: "Your Command Center",
      body: "This is where you check how your agents are doing. Let me point out the parts that matter.",
    },
    {
      anchor: "topbar-credit",
      placement: "bottom",
      title: "Your usage balance",
      body: "Calls, chats and website scans all draw from here. When it runs low your agents stop answering, so keep an eye on it.",
      optional: true,
    },
    {
      anchor: "topbar-notifications",
      placement: "bottom",
      title: "Notifications",
      body: "New leads, finished website scans, and low-balance warnings land here.",
      optional: true,
    },
    {
      anchor: "topbar-agent",
      placement: "bottom",
      title: "Active agent",
      body: "Shows which agent is currently live. Switch between them here if you run more than one.",
      optional: true,
    },
    {
      anchor: "dashboard-stats",
      placement: "top",
      title: "Your numbers at a glance",
      body: "Calls answered, calls completed, minutes used and leads captured — for whichever period you pick below.",
      optional: true,
    },
    {
      anchor: "dashboard-filters",
      placement: "top",
      title: "Narrow it down",
      body: "Filter by a single agent or a different date range. Everything above updates to match.",
      optional: true,
    },
    {
      anchor: "dashboard-chart",
      placement: "top",
      title: "Call activity over time",
      body: "Spot your busiest hours. Useful for deciding when a real person should be available for transfers.",
      optional: true,
    },
    {
      anchor: "dashboard-recent",
      placement: "top",
      title: "Recent calls",
      body: "Your latest conversations. Tap any one for the recording, transcript and a summary of what the caller wanted.",
      optional: true,
    },
  ],

  "/phone-numbers": [
    {
      placement: "center",
      title: "Phone Numbers",
      body: "Your agent needs a number before it can take calls. This is where you buy and manage them.",
    },
    {
      anchor: "numbers-search",
      placement: "bottom",
      title: "Find a number",
      body: "Pick a country and, if you like, an area code. Every number shown is ready to use the moment you buy it.",
      optional: true,
    },
    {
      anchor: "numbers-list",
      placement: "top",
      title: "Your numbers",
      body: "Numbers you already own, and which agent answers each one.",
      optional: true,
    },
  ],

  "/agent": [
    {
      placement: "center",
      title: "Voice Agent",
      body: "Everything about how your agent sounds and behaves on a call.",
    },
    {
      anchor: "agent-persona",
      placement: "bottom",
      title: "Voice and personality",
      body: "Pick the voice and tone. Preview it before you commit — it's what every caller will hear.",
      optional: true,
    },
    {
      anchor: "agent-knowledge",
      placement: "top",
      title: "What it knows",
      body: "Connect a knowledge base so the agent answers from your real business details instead of guessing.",
      optional: true,
    },
    {
      anchor: "agent-escalation",
      placement: "top",
      title: "Handing over to a human",
      body: "Set the hours a real person is around, and the number to transfer to when a caller needs one.",
      optional: true,
    },
  ],

  "/messenger": [
    {
      placement: "center",
      title: "Chatbot Agent",
      body: "The chat bubble for your website. Same knowledge as your voice agent, different channel.",
    },
    {
      anchor: "messenger-appearance",
      placement: "bottom",
      title: "Make it yours",
      body: "Colours, avatar, greeting and the prompts visitors see first.",
      optional: true,
    },
    {
      anchor: "messenger-deploy",
      placement: "top",
      title: "Put it on your site",
      body: "Copy this snippet into your website and the chat bubble goes live. No other setup needed.",
      optional: true,
    },
  ],

  "/leads": [
    {
      placement: "center",
      title: "Lead CRM",
      body: "Everyone who called or chatted, with their details and where the conversation got to.",
    },
    {
      anchor: "leads-table",
      placement: "top",
      title: "Your leads",
      body: "Sort, filter and export. Each row opens the full conversation that produced it.",
      optional: true,
    },
  ],

  "/calls": [
    {
      placement: "center",
      title: "Call Logs",
      body: "Every call your agent handled.",
    },
    {
      anchor: "calls-table",
      placement: "top",
      title: "Recordings and transcripts",
      body: "Open any call for the recording, a full transcript, and a summary of what the caller wanted.",
      optional: true,
    },
  ],
};
const TOUR_VERSION = 1;
const STORAGE_KEY = `agently.tour.${TOUR_KEY}.v${TOUR_VERSION}`;

/** Viewport check used to branch the tour on mobile. */
export const isMobileViewport = () =>
  typeof window !== "undefined" && window.innerWidth < 1024;

/**
 * ISSUE 1 — on mobile the sidebar lives behind the hamburger, so every
 * nav-anchored step had nothing to point at and the spotlight sat on a closed
 * menu. This step is injected only on small screens and asks the person to
 * open the menu before the nav walkthrough begins.
 */
const OPEN_MENU_STEP: TourStep = {
  anchor: "menu-toggle",
  placement: "bottom",
  title: "Open your menu",
  body: "Tap this button to open the menu, then press Next. Everything I'm about to show you lives in there.",
  requiresMenuOpen: true,
};

export const DASHBOARD_TOUR: TourStep[] = [
  {
    placement: "center",
    title: "Welcome to Agently",
    body: "Let me briefly walk you through your workspace — it takes about a minute. You can skip and come back to this anytime from Settings.",
  },
  {
    placement: "center",
    title: "What you can do here, at a glance",
    body: "Answer calls with an AI voice agent. Reply to website visitors with a chatbot. Capture every enquiry as a lead. Teach both from your own website, and see what each conversation cost you.",
  },
  {
    anchor: "nav-dashboard",
    placement: "right",
    title: "Dashboard",
    body: "Your daily view: calls answered, chats handled, leads captured, and what you've spent.",
  },
  {
    anchor: "nav-phone-numbers",
    placement: "right",
    title: "Phone Numbers — start here",
    body: "Buy a number so your agent can take calls. It's set up automatically the moment you buy it, and the cost comes out of your usage balance.",
  },
  {
    anchor: "nav-agent",
    placement: "right",
    title: "Voice Agent",
    body: "Set how your agent sounds, what it knows, and when it should hand a caller to a real person.",
  },
  {
    anchor: "nav-messenger",
    placement: "right",
    title: "Chatbot Agent",
    body: "Build the chat bubble for your website. Copy one line of code and it's live.",
  },
  {
    anchor: "nav-calls",
    placement: "right",
    title: "Call Logs",
    body: "Every call, with a recording, transcript and summary of what the caller wanted.",
  },
  {
    anchor: "nav-leads",
    placement: "right",
    title: "Lead CRM",
    body: "Everyone who called or chatted, with their details and where they got to.",
  },
  {
    anchor: "nav-settings",
    placement: "right",
    title: "Settings",
    body: "Your business details, knowledge base, billing and team. Replay this tour from here anytime.",
  },
  {
    placement: "center",
    title: "You're set",
    body: "The quickest way to see it working: buy a phone number, then call it. Everything else can wait.",
  },
];

// ─────────────────────────────────────────────────────────────────────────────

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 8;

function useAnchorRect(anchor?: string, tick = 0): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);

  useLayoutEffect(() => {
    if (!anchor) {
      setRect(null);
      return;
    }
    const measure = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${anchor}"]`);
      if (!el) {
        setRect(null);
        return;
      }
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      const r = el.getBoundingClientRect();
      setRect({
        top: r.top - PAD,
        left: r.left - PAD,
        width: r.width + PAD * 2,
        height: r.height + PAD * 2,
      });
    };
    measure();
    const t = window.setTimeout(measure, 220);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [anchor, tick]);

  return rect;
}

export const ProductTour: React.FC<{
  steps?: TourStep[];
  open: boolean;
  onClose: (completed: boolean) => void;
  onStep?: (index: number) => void;
}> = ({ steps = DASHBOARD_TOUR, open, onClose, onStep }) => {
  // ISSUE 1 — prepend the "open your menu" step on small screens, where the
  // sidebar is behind a hamburger and every nav anchor is off-screen.
  const resolvedSteps = React.useMemo(() => {
    const needsMenu =
      isMobileViewport() && steps.some((s) => s.anchor?.startsWith("nav-"));
    const withMenu = needsMenu
      ? [steps[0], OPEN_MENU_STEP, ...steps.slice(1)]
      : steps;
    // Drop optional steps whose anchor is not on this page.
    return withMenu.filter(
      (s) =>
        !s.optional ||
        (typeof document !== "undefined" &&
          document.querySelector(`[data-tour="${s.anchor}"]`)),
    );
  }, [steps, open]);

  const [index, setIndex] = useState(0);
  const [tick, setTick] = useState(0);
  const step = resolvedSteps[index];
  const rect = useAnchorRect(step?.anchor, tick);
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) setTick((t) => t + 1);
  }, [open, index]);

  /*
   * When a step needs the sidebar and we are on mobile, click the hamburger
   * ourselves rather than leaving the person staring at a spotlight on a
   * closed menu. Only fires if the menu is not already open.
   */
  useEffect(() => {
    if (!open || !step) return;
    if (!isMobileViewport()) return;
    if (!step.anchor?.startsWith("nav-")) return;

    const nav = document.querySelector<HTMLElement>(
      `[data-tour="${step.anchor}"]`,
    );
    const visible = nav && nav.getBoundingClientRect().width > 0;
    if (visible) return;

    const toggleBtn = document.querySelector<HTMLElement>(
      '[data-tour="menu-toggle"]',
    );
    if (toggleBtn) {
      toggleBtn.click();
      window.setTimeout(() => setTick((t) => t + 1), 320);
    }
  }, [open, index, step]);
  useEffect(() => {
    if (open) onStep?.(index);
  }, [index, open, onStep]);

  const next = useCallback(() => {
    if (index >= resolvedSteps.length - 1) {
      onClose(true);
      return;
    }
    setIndex((i) => i + 1);
  }, [index, resolvedSteps.length, onClose]);

  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose(false);
      if (e.key === "ArrowRight" || e.key === "Enter") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, next, prev, onClose]);

  if (!open || !step) return null;

  const centred = !rect || step.placement === "center";
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const CARD_W = Math.min(360, vw - 32);

  let cardStyle: React.CSSProperties;
  if (centred) {
    cardStyle = {
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: CARD_W,
    };
  } else {
    const r = rect!;
    let left = r.left + r.width + 16;
    let top = r.top;
    // Flip to the left if it would run off-screen; clamp vertically.
    if (left + CARD_W > vw - 16) left = Math.max(16, r.left - CARD_W - 16);
    top = Math.min(Math.max(16, top), vh - 220);
    cardStyle = { top, left, width: CARD_W };
  }

  return (
    <div
      className="fixed inset-0 z-[9999]"
      role="dialog"
      aria-modal="true"
      aria-label="Product tour"
    >
      {/* Spotlight. A single div with a huge outward box-shadow dims everything
          except the highlighted element — no SVG mask, no layout thrash. */}
      {rect && !centred ? (
        <div
          className="pointer-events-none absolute rounded-2xl transition-all duration-300"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            boxShadow: "0 0 0 9999px rgba(15,23,42,0.72)",
            outline: "2px solid #F59E0B",
            outlineOffset: 2,
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-[#0F172A]/72" />
      )}

      <div
        ref={cardRef}
        className="absolute rounded-3xl bg-white p-6 shadow-2xl transition-all duration-300"
        style={cardStyle}
      >
        <div className="mb-3 flex items-center gap-1.5">
          {resolvedSteps.map((_, i) => (
            <span
              key={i}
              className={`h-1 rounded-full transition-all ${
                i === index
                  ? "w-5 bg-amber-500"
                  : i < index
                    ? "w-1.5 bg-amber-300"
                    : "w-1.5 bg-slate-200"
              }`}
            />
          ))}
        </div>

        <h3 className="text-base font-black text-slate-900">{step.title}</h3>
        <p className="mt-2 text-sm leading-5 text-slate-600">{step.body}</p>

        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            onClick={() => onClose(false)}
            className="text-[11px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600"
          >
            Skip tour
          </button>
          <div className="flex gap-2">
            {index > 0 && (
              <button
                onClick={prev}
                className="rounded-xl border border-slate-200 px-3.5 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600"
              >
                Back
              </button>
            )}
            <button
              onClick={next}
              className="rounded-xl bg-slate-900 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-amber-600"
            >
              {index === resolvedSteps.length - 1 ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Drives the tour. Auto-starts once for a user who has not seen it.
 *
 * `justOnboarded` should be true on the first dashboard render after onboarding
 * completes — that is the moment you described, and the reason the tour exists.
 */
export function useProductTour(
  opts: { justOnboarded?: boolean; enabled?: boolean } = {},
) {
  const { justOnboarded = false, enabled = true } = opts;
  const [open, setOpen] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (!enabled || started.current) return;
    let seen = false;
    try {
      seen = window.localStorage.getItem(STORAGE_KEY) === "completed";
    } catch {
      /* private mode */
    }
    if (seen) return;

    started.current = true;
    // Let the dashboard paint and the sidebar mount before measuring anchors.
    const t = window.setTimeout(() => setOpen(true), justOnboarded ? 700 : 400);
    return () => window.clearTimeout(t);
  }, [enabled, justOnboarded]);

  const close = useCallback((completed: boolean) => {
    setOpen(false);
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        completed ? "completed" : "skipped",
      );
    } catch {
      /* ignore */
    }

    // Best-effort server persistence. Never block the UI on it.
    try {
      const base =
        (import.meta as any).env?.VITE_API_BASE_URL?.replace(/\/$/, "") || "";
      const token =
        window.localStorage.getItem("agently.auth.token") ||
        window.sessionStorage.getItem("agently.auth.token") ||
        "";
      if (token) {
        void fetch(`${base}/api/settings/tour-progress`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            tourKey: TOUR_KEY,
            tourVersion: TOUR_VERSION,
            status: completed ? "completed" : "skipped",
          }),
        }).catch(() => undefined);
      }
    } catch {
      /* ignore */
    }
  }, []);

  /** Wire to a "Replay tour" button in Settings. */
  const restart = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setOpen(true);
  }, []);

  return { open, close, restart, setOpen };
}

/**
 * ISSUE 2 — drives the per-page tours. Mount once inside the app shell; it
 * watches the route and fires that page's tour the first time it is opened.
 *
 * Each page is tracked separately, so finishing the Dashboard tour does not
 * suppress the Phone Numbers one.
 */
export function usePageTour(pathname: string) {
  const [open, setOpen] = useState(false);
  const [steps, setSteps] = useState<TourStep[]>([]);
  const firedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const route = Object.keys(PAGE_TOURS).find(
      (key) => pathname === key || pathname.startsWith(`${key}/`),
    );
    if (!route) return;
    if (firedRef.current.has(route)) return;

    const storageKey = `agently.tour.page.${route}.v${TOUR_VERSION}`;
    let seen = false;
    try {
      seen = !!window.localStorage.getItem(storageKey);
    } catch {
      /* private mode */
    }
    if (seen) return;

    // Don't stack on top of the first-run overview.
    let overviewPending = false;
    try {
      overviewPending = window.localStorage.getItem(STORAGE_KEY) === null;
    } catch {
      /* ignore */
    }
    if (overviewPending) return;

    firedRef.current.add(route);
    // Let the page render its content before we try to measure anchors.
    const timer = window.setTimeout(() => {
      setSteps(PAGE_TOURS[route]);
      setOpen(true);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  const close = useCallback(() => {
    setOpen(false);
    const route = Object.keys(PAGE_TOURS).find(
      (key) => pathname === key || pathname.startsWith(`${key}/`),
    );
    if (!route) return;
    try {
      window.localStorage.setItem(
        `agently.tour.page.${route}.v${TOUR_VERSION}`,
        "done",
      );
    } catch {
      /* ignore */
    }
  }, [pathname]);

  /** Wire to a "Show me around this page" button. */
  const replay = useCallback(() => {
    const route = Object.keys(PAGE_TOURS).find(
      (key) => pathname === key || pathname.startsWith(`${key}/`),
    );
    if (!route) return;
    setSteps(PAGE_TOURS[route]);
    setOpen(true);
  }, [pathname]);

  return { open, steps, close, replay };
}

export default ProductTour;
