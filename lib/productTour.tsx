/**
 * agently/lib/productTour.tsx — FULL REWRITE
 *
 * I got this wrong twice. You asked for a PHASED walkthrough that drives itself
 * across the whole app; I built a one-shot sidebar tour plus disconnected
 * per-page tours that only fired if you happened to land on the page. That is
 * not what you described.
 *
 * WHAT THIS DOES NOW
 *   • One continuous journey, Phase 1 → Phase 6c, across every page.
 *   • It NAVIGATES ITSELF. Finishing the dashboard phase routes to
 *     /phone-numbers on its own and keeps going.
 *   • It SCROLLS ITSELF to whatever it is describing, on both desktop and
 *     mobile.
 *   • On mobile it OPENS THE HAMBURGER ITSELF before the sidebar phase, and
 *     closes it again afterwards so the content underneath is visible.
 *   • Progress survives a reload: the phase and step index are persisted, so
 *     navigation mid-tour resumes rather than restarting.
 *   • It can be stopped at any point, and resumed later from Settings.
 *
 * PHASES (exactly as specified)
 *   1   Sidebar overview
 *   2   Dashboard — navbar, then every card and container
 *   3   Phone Numbers — your numbers, and buying one
 *   4   Voice Agent — customising, and getting to Call Now
 *   4a  Call Campaign → Call Now
 *   4b  Call Campaign → Schedule Calls
 *   5   Call Logs
 *   6   Settings, then 6a Knowledge Base · 6b Team · 6c Billing
 */

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

export interface TourStep {
  /** data-tour="..." target. Omit for a centred card. */
  anchor?: string;
  title: string;
  body: string;
  placement?: "right" | "left" | "top" | "bottom" | "center";
  /** Route this step lives on. The tour navigates here automatically. */
  route?: string;
  /** Mobile: the sidebar must be open for this step. */
  needsSidebar?: boolean;
  /** Skip silently when the anchor is absent. Default true. */
  optional?: boolean;
  /** Click this selector before showing the step (e.g. open a sub-tab). */
  clickBefore?: string;
}

export interface TourPhase {
  id: string;
  label: string;
  route?: string;
  steps: TourStep[];
}

const TOUR_VERSION = 3;
const STORAGE_KEY = `agently.tour.v${TOUR_VERSION}`;
const PROGRESS_KEY = `agently.tour.progress.v${TOUR_VERSION}`;

export const isMobileViewport = () =>
  typeof window !== "undefined" && window.innerWidth < 1024;

// ─────────────────────────────────────────────────────────────────────────────
// THE PHASES
// ─────────────────────────────────────────────────────────────────────────────

export const TOUR_PHASES: TourPhase[] = [
  // ── PHASE 1 — sidebar
  {
    id: "1",
    label: "Getting around",
    route: "/dashboard",
    steps: [
      {
        placement: "center",
        title: "Welcome to Agently",
        body: "Let me walk you through the whole platform. I'll move between pages myself — just press Next. You can stop any time and pick it up again from Settings.",
      },
      {
        placement: "center",
        title: "What you can do here",
        body: "Answer calls with an AI voice agent. Reply to website visitors with a chatbot. Capture every enquiry as a lead. Teach both from your own website, and see exactly what each conversation cost.",
      },
      {
        anchor: "nav-dashboard",
        placement: "right",
        needsSidebar: true,
        title: "Dashboard",
        body: "Your daily view — calls, chats, leads and spend.",
      },
      {
        anchor: "nav-phone-numbers",
        placement: "right",
        needsSidebar: true,
        title: "Phone Numbers",
        body: "Buy and manage the numbers your agent answers on.",
      },
      {
        anchor: "nav-agent",
        placement: "right",
        needsSidebar: true,
        title: "Voice Agent",
        body: "How your agent sounds, what it knows, when it hands over to a person.",
      },
      {
        anchor: "nav-messenger",
        placement: "right",
        needsSidebar: true,
        title: "Chatbot Agent",
        body: "The chat bubble for your website.",
      },
      {
        anchor: "nav-calls",
        placement: "right",
        needsSidebar: true,
        title: "Call Logs",
        body: "Recordings, transcripts and summaries of every call.",
      },
      {
        anchor: "nav-leads",
        placement: "right",
        needsSidebar: true,
        title: "Lead CRM",
        body: "Everyone who called or chatted, and where they got to.",
      },
      {
        anchor: "nav-settings",
        placement: "right",
        needsSidebar: true,
        title: "Settings",
        body: "Business details, knowledge, team and billing.",
      },
    ],
  },

  // ── PHASE 2 — dashboard
  {
    id: "2",
    label: "Your Dashboard",
    route: "/dashboard",
    steps: [
      {
        placement: "center",
        title: "Phase 2 — your Command Center",
        body: "This is the page you'll open most. Let me take you through it piece by piece.",
      },
      {
        anchor: "topbar-credit",
        placement: "bottom",
        title: "Usage balance",
        body: "Calls, chats and website scans all draw from here. When it empties your agents stop answering, so it's worth watching.",
      },
      {
        anchor: "topbar-notifications",
        placement: "bottom",
        title: "Notifications",
        body: "New leads, finished website scans, and low-balance warnings arrive here.",
      },
      {
        anchor: "topbar-agent",
        placement: "bottom",
        title: "Active agent",
        body: "Which agent is currently live. Switch between them here if you run more than one.",
      },
      {
        anchor: "dashboard-stats",
        placement: "top",
        title: "Your numbers",
        body: "Calls answered, calls completed, minutes used and leads captured — for whichever period you choose.",
      },
      {
        anchor: "dashboard-filters",
        placement: "top",
        title: "Narrow it down",
        body: "Filter to one agent or a different date range. Everything above updates to match.",
      },
      {
        anchor: "dashboard-chart",
        placement: "top",
        title: "Activity over time",
        body: "Spot your busiest hours — useful for deciding when a real person should be available for transfers.",
      },
      {
        anchor: "dashboard-recent",
        placement: "top",
        title: "Recent calls",
        body: "Your latest conversations. Open any one for the recording, transcript and summary.",
      },
    ],
  },

  // ── PHASE 3 — phone numbers
  {
    id: "3",
    label: "Phone Numbers",
    route: "/phone-numbers",
    steps: [
      {
        placement: "center",
        title: "Phase 3 — Phone Numbers",
        body: "Your agent can't take calls without a number. Here's how to get one.",
      },
      {
        anchor: "numbers-list",
        placement: "top",
        title: "Your numbers",
        body: "Numbers you already own, and which agent answers each one.",
      },
      {
        anchor: "numbers-search",
        placement: "top",
        title: "Finding a number",
        body: "Choose a country and, if you like, an area code. Everything shown is ready to use the moment you buy it.",
      },
      {
        anchor: "numbers-buy",
        placement: "top",
        title: "Buying it",
        body: "The cost comes out of your usage balance. If setup fails for any reason the number is returned and you aren't charged.",
      },
    ],
  },

  // ── PHASE 4 — voice agent
  {
    id: "4",
    label: "Voice Agent",
    route: "/agent",
    steps: [
      {
        placement: "center",
        title: "Phase 4 — your Voice Agent",
        body: "Everything about how your agent behaves on a call.",
      },
      {
        anchor: "agent-persona",
        placement: "bottom",
        title: "Voice and personality",
        body: "Pick the voice and tone, and preview it. This is what every caller hears.",
      },
      {
        anchor: "agent-knowledge",
        placement: "top",
        title: "What it knows",
        body: "Connect a knowledge base so it answers from your real business details instead of guessing.",
      },
      {
        anchor: "agent-escalation",
        placement: "top",
        title: "Handing over to a person",
        body: "The hours someone is around, and the number to transfer to.",
      },
      {
        anchor: "agent-call-now",
        placement: "top",
        title: "Making calls",
        body: "When you're ready to call out rather than just receive, this takes you to Call Campaigns. That's where we're going next.",
      },
    ],
  },

  // ── PHASE 4a — call now
  {
    id: "4a",
    label: "Call Now",
    route: "/outreach",
    steps: [
      {
        placement: "center",
        title: "Phase 4a — Call Now",
        body: "For calling someone straight away.",
      },
      {
        anchor: "campaign-tab-now",
        placement: "bottom",
        clickBefore: '[data-tour="campaign-tab-now"]',
        title: "Call Now",
        body: "One-off calls that start immediately.",
      },
      {
        anchor: "campaign-agent",
        placement: "top",
        title: "Who's calling",
        body: "Choose the agent and the number it calls from. The agent uses the purpose you saved in Agent Workspace.",
      },
      {
        anchor: "campaign-recipients",
        placement: "top",
        title: "Who you're calling",
        body: "Add one number or paste a list. Each becomes its own call.",
      },
      {
        anchor: "campaign-launch",
        placement: "top",
        title: "Go",
        body: "Calls start straight away and appear in Call Logs as they finish.",
      },
    ],
  },

  // ── PHASE 4b — schedule
  {
    id: "4b",
    label: "Schedule Calls",
    route: "/outreach",
    steps: [
      {
        placement: "center",
        title: "Phase 4b — Scheduled Calls",
        body: "For calling at a better time than right now.",
      },
      {
        anchor: "campaign-tab-schedule",
        placement: "bottom",
        clickBefore: '[data-tour="campaign-tab-schedule"]',
        title: "Schedule Calls",
        body: "Same setup, but you choose when.",
      },
      {
        anchor: "campaign-window",
        placement: "top",
        title: "Calling window",
        body: "The days and hours calls may go out. Calls never happen outside this window — useful for respecting business hours in your customers' timezone.",
      },
      {
        anchor: "campaign-schedule-save",
        placement: "top",
        title: "Save it",
        body: "The campaign runs on its own from here. You'll be notified as calls complete.",
      },
    ],
  },

  // ── PHASE 5 — call logs
  {
    id: "5",
    label: "Call Logs",
    route: "/calls",
    steps: [
      {
        placement: "center",
        title: "Phase 5 — Call Logs",
        body: "Every call your agent handled.",
      },
      {
        anchor: "calls-stats",
        placement: "top",
        title: "At a glance",
        body: "Totals, completion rate and average length across the period.",
      },
      {
        anchor: "calls-filters",
        placement: "top",
        title: "Finding a call",
        body: "Filter by agent, outcome or date to get to the one you want.",
      },
      {
        anchor: "calls-table",
        placement: "top",
        title: "The calls themselves",
        body: "Open any row for the recording, full transcript, and a summary of what the caller wanted.",
      },
    ],
  },

  // ── PHASE 6 — settings
  {
    id: "6",
    label: "Settings",
    route: "/settings",
    steps: [
      {
        placement: "center",
        title: "Phase 6 — Settings",
        body: "Your business details and everything that supports the agents.",
      },
      {
        anchor: "settings-general",
        placement: "top",
        title: "Workspace basics",
        body: "Business name, timezone and contact number. The timezone drives your calling windows and reports, so it's worth getting right.",
      },
      {
        anchor: "settings-knowledge",
        placement: "top",
        title: "6a — Knowledge Bases",
        body: "Where your agents learn from. Open this to scan your website and choose which pages they should read.",
      },
      {
        anchor: "settings-team",
        placement: "top",
        title: "6b — Team",
        body: "Invite colleagues and set what each of them can do.",
      },
      {
        anchor: "settings-billing",
        placement: "top",
        title: "6c — Billing",
        body: "Top up your balance and see exactly what you've spent, broken down by service.",
      },
      {
        placement: "center",
        title: "That's the tour",
        body: "The quickest way to see it all working: buy a number, then call it. Everything else can wait. You can replay this any time from Settings.",
      },
    ],
  },
];

// Flat list with phase metadata attached, so navigation is a single index walk.
interface FlatStep extends TourStep {
  phaseId: string;
  phaseLabel: string;
  phaseIndex: number;
}

const FLAT_STEPS: FlatStep[] = TOUR_PHASES.flatMap((phase, phaseIndex) =>
  phase.steps.map((step) => ({
    ...step,
    route: step.route || phase.route,
    phaseId: phase.id,
    phaseLabel: phase.label,
    phaseIndex,
  })),
);

// ─────────────────────────────────────────────────────────────────────────────

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}
const PAD = 8;

function scrollIntoView(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight;
  // Aim for the upper third — leaves room for the card below on mobile.
  if (r.top < 80 || r.bottom > vh - 220) {
    const target = window.scrollY + r.top - vh * 0.28;
    window.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
    return true;
  }
  return false;
}

function useAnchorRect(anchor: string | undefined, tick: number): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);

  useLayoutEffect(() => {
    if (!anchor) {
      setRect(null);
      return;
    }
    let raf = 0;
    const measure = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${anchor}"]`);
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) {
        setRect(null);
        return;
      }
      setRect({
        top: r.top - PAD,
        left: r.left - PAD,
        width: r.width + PAD * 2,
        height: r.height + PAD * 2,
      });
    };

    const el = document.querySelector<HTMLElement>(`[data-tour="${anchor}"]`);
    if (el) {
      const scrolled = scrollIntoView(el);
      // Wait out the smooth scroll before measuring, or the spotlight lands
      // where the element used to be.
      window.setTimeout(measure, scrolled ? 420 : 40);
    }
    measure();

    const onMove = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [anchor, tick]);

  return rect;
}

// ─────────────────────────────────────────────────────────────────────────────

export const ProductTour: React.FC<{
  open: boolean;
  startIndex?: number;
  onClose: (completed: boolean, atIndex: number) => void;
  navigate: (path: string) => void;
  currentPath: string;
}> = ({ open, startIndex = 0, onClose, navigate, currentPath }) => {
  const [index, setIndex] = useState(startIndex);
  const [tick, setTick] = useState(0);
  const [waiting, setWaiting] = useState(false);
  const step = FLAT_STEPS[index];
  const rect = useAnchorRect(step?.anchor, tick);

  useEffect(() => {
    if (open) setIndex(startIndex);
  }, [open, startIndex]);

  /* Persist position so a reload mid-tour resumes instead of restarting. */
  useEffect(() => {
    if (!open) return;
    try {
      window.localStorage.setItem(PROGRESS_KEY, String(index));
    } catch {
      /* private mode */
    }
  }, [index, open]);

  /*
   * THE DRIVER. Everything that has to happen before a step can be shown:
   * route change, sidebar open/close, sub-tab click. Each is given time to
   * land before we measure the anchor.
   */
  useEffect(() => {
    if (!open || !step) return;
    let cancelled = false;
    setWaiting(true);

    const run = async () => {
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

      // 1. Navigate if this step lives on another page.
      if (step.route && currentPath !== step.route) {
        navigate(step.route);
        await wait(700);
      }
      if (cancelled) return;

      // 2. Sidebar. On mobile it must be open for nav steps and closed for
      //    everything else, or it covers the content we're describing.
      if (isMobileViewport()) {
        const sidebarOpen = !!document
          .querySelector<HTMLElement>('[data-tour="nav-dashboard"]')
          ?.getBoundingClientRect().width;

        if (step.needsSidebar && !sidebarOpen) {
          document
            .querySelector<HTMLElement>('[data-tour="menu-toggle"]')
            ?.click();
          await wait(450);
        } else if (!step.needsSidebar && sidebarOpen) {
          const closeBtn = document.querySelector<HTMLElement>(
            '[data-tour="menu-close"]',
          );
          if (closeBtn) {
            closeBtn.click();
            await wait(400);
          }
        }
      }
      if (cancelled) return;

      // 3. Open a sub-tab if the step needs one.
      if (step.clickBefore) {
        document.querySelector<HTMLElement>(step.clickBefore)?.click();
        await wait(400);
      }
      if (cancelled) return;

      setTick((t) => t + 1);
      await wait(260);
      if (!cancelled) setWaiting(false);
    };

    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index]);

  /*
   * NO SKIPPING.
   *
   * The previous version silently jumped over any step whose anchor was
   * missing, which meant whole phases flashed past. Every step is now shown.
   * If the element isn't on the page the card simply renders centred with no
   * spotlight — the person still reads the explanation, which is the point of
   * the tour. Anchors improve the presentation; they are no longer required
   * for the content to appear.
   */
  const advance = useCallback((delta: number) => {
    setIndex((i) => Math.max(0, Math.min(FLAT_STEPS.length - 1, i + delta)));
  }, []);

  /*
   * PACE. The tour never advances on its own — only on Next, Back, or the
   * arrow keys. `waiting` covers the navigate/scroll/click work between steps,
   * and the buttons are disabled while it runs, so a fast double-tap cannot
   * skip a step the person hasn't read yet.
   */
  const next = useCallback(() => {
    if (waiting) return;
    if (index >= FLAT_STEPS.length - 1) {
      onClose(true, index);
      return;
    }
    advance(1);
  }, [index, advance, onClose, waiting]);

  const prev = useCallback(() => {
    if (!waiting) advance(-1);
  }, [advance, waiting]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose(false, index);
      if (e.key === "ArrowRight" || e.key === "Enter") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, next, prev, onClose, index]);

  if (!open || !step) return null;

  const centred = !rect || step.placement === "center";
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const mobile = isMobileViewport();
  const CARD_W = mobile ? Math.min(vw - 24, 400) : 380;

  let cardStyle: React.CSSProperties;
  if (centred) {
    cardStyle = {
      top: "50%",
      left: "50%",
      transform: "translate(-50%,-50%)",
      width: CARD_W,
    };
  } else if (mobile) {
    // Always dock to the bottom on phones. Floating beside a highlighted
    // element on a narrow screen is how the card ends up half off-frame.
    const below = rect!.top + rect!.height + 16;
    const fitsBelow = below + 210 < vh;
    cardStyle = fitsBelow
      ? { top: below, left: 12, width: CARD_W }
      : { bottom: 16, left: 12, width: CARD_W };
  } else {
    const r = rect!;
    let left = r.left + r.width + 16;
    if (left + CARD_W > vw - 16) left = Math.max(16, r.left - CARD_W - 16);
    cardStyle = {
      top: Math.min(Math.max(16, r.top), vh - 240),
      left,
      width: CARD_W,
    };
  }

  return (
    <div
      className="fixed inset-0 z-[9999]"
      role="dialog"
      aria-modal="true"
      aria-label="Product tour"
    >
      {rect && !centred ? (
        <div
          className="pointer-events-none absolute rounded-2xl transition-all duration-300"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            boxShadow: "0 0 0 9999px rgba(15,23,42,0.74)",
            outline: "2px solid #F59E0B",
            outlineOffset: 2,
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-[#0F172A]/74" />
      )}

      <div
        className="absolute rounded-3xl bg-white p-5 shadow-2xl transition-all duration-300 sm:p-6"
        style={{ ...cardStyle, opacity: waiting ? 0.35 : 1 }}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-amber-700">
            Phase {step.phaseId} · {step.phaseLabel}
          </span>
          <span className="text-[10px] font-bold text-slate-400">
            Step {index + 1} of {FLAT_STEPS.length}
          </span>
        </div>

        <div className="mb-3 flex items-center gap-1">
          {TOUR_PHASES.map((p, i) => (
            <span
              key={p.id}
              className={`h-1 flex-1 rounded-full transition-all ${
                i === step.phaseIndex
                  ? "bg-amber-500"
                  : i < step.phaseIndex
                    ? "bg-amber-300"
                    : "bg-slate-200"
              }`}
            />
          ))}
        </div>

        <h3 className="text-base font-black text-slate-900">{step.title}</h3>
        <p className="mt-2 text-sm leading-[1.5] text-slate-600">{step.body}</p>

        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            onClick={() => onClose(false, index)}
            className="text-[11px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600"
          >
            Stop tour
          </button>
          <div className="flex gap-2">
            {index > 0 && (
              <button
                onClick={prev}
                disabled={waiting}
                className="rounded-xl border border-slate-200 px-3.5 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 disabled:opacity-50"
              >
                Back
              </button>
            )}
            <button
              onClick={next}
              disabled={waiting}
              className="rounded-xl bg-slate-900 px-5 py-2 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-amber-600 disabled:cursor-wait disabled:opacity-60"
            >
              {waiting
                ? "\u2026"
                : index === FLAT_STEPS.length - 1
                  ? "Finish"
                  : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

export function useProductTour(
  opts: { justOnboarded?: boolean; enabled?: boolean } = {},
) {
  const { justOnboarded = false, enabled = true } = opts;
  const [open, setOpen] = useState(false);
  const [startIndex, setStartIndex] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (!enabled || started.current) return;
    let done = false;
    let saved = 0;
    try {
      done = window.localStorage.getItem(STORAGE_KEY) === "completed";
      saved = Number(window.localStorage.getItem(PROGRESS_KEY) || 0);
    } catch {
      /* private mode */
    }
    if (done) return;

    started.current = true;
    setStartIndex(Number.isFinite(saved) ? saved : 0);
    const t = window.setTimeout(() => setOpen(true), justOnboarded ? 900 : 600);
    return () => window.clearTimeout(t);
  }, [enabled, justOnboarded]);

  const close = useCallback((completed: boolean, atIndex: number) => {
    setOpen(false);
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        completed ? "completed" : "stopped",
      );
      window.localStorage.setItem(
        PROGRESS_KEY,
        String(completed ? 0 : atIndex),
      );
    } catch {
      /* ignore */
    }
  }, []);

  /** Wire to "Replay tour" in Settings. */
  const restart = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(PROGRESS_KEY);
    } catch {
      /* ignore */
    }
    setStartIndex(0);
    setOpen(true);
  }, []);

  /** Resume from wherever it was stopped. */
  const resume = useCallback(() => {
    let saved = 0;
    try {
      saved = Number(window.localStorage.getItem(PROGRESS_KEY) || 0);
    } catch {
      /* ignore */
    }
    setStartIndex(Number.isFinite(saved) ? saved : 0);
    setOpen(true);
  }, []);

  return { open, startIndex, close, restart, resume, setOpen };
}

export default ProductTour;
