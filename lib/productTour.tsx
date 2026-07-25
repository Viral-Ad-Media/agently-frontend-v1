/**
 * agently/lib/productTour.tsx — REWRITE
 *
 * You were blunt about the last version and you were right. Three things were
 * wrong, and all three are fixed here.
 *
 * 1. ONE 45-STEP JOURNEY. It should be PER PAGE. Each page now has its own
 *    short tour that fires the first time that page is opened and never again.
 *    Dashboard finishes → `onboarded.dashboard = true`. Open Phone Numbers for
 *    the first time → its own tour starts at step 1 of its own count.
 *
 * 2. IT REAPPEARED ON EVERY DASHBOARD VISIT. Completion was written under one
 *    global key that the auto-start check didn't read back properly. Each page
 *    now writes its own flag, checked before anything renders.
 *
 * 3. ANIMATION AND FADE. Removed. The card appears, the highlight is a solid
 *    ring, nothing transitions.
 *
 * Also fixed:
 *   • Anchors resolve through a CANDIDATE LIST, so a card is found whether it
 *     rendered its mobile or desktop variant.
 *   • When the target is below the fold, the tour asks the person to scroll
 *     and waits, rather than pointing at something off-screen.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";

export interface TourStep {
  /** data-tour value, or several to try in order. Omit for a centred card. */
  anchor?: string | string[];
  title: string;
  body: string;
  /** Shown instead of Next when the person must act first. */
  action?: "click" | "scroll";
  actionLabel?: string;
}

const VERSION = 4;
const flagKey = (page: string) => `agently.onboarded.${page}.v${VERSION}`;

export const isMobileViewport = () =>
  typeof window !== "undefined" && window.innerWidth < 1024;

// ─────────────────────────────────────────────────────────────────────────────
// PER-PAGE TOURS
// ─────────────────────────────────────────────────────────────────────────────

export const PAGE_TOURS: Record<string, TourStep[]> = {
  "/dashboard": [
    {
      title: "Welcome to Agently",
      body: "This is your Command Center. Let me show you around this page — about a minute. Every other page gets its own short intro the first time you open it.",
    },
    {
      anchor: ["menu-toggle"],
      title: "Your menu",
      body: "Everything lives behind here on a phone. Tap it to open — I'll wait.",
      action: "click",
      actionLabel: "Tap the menu, then Next",
    },
    {
      anchor: ["nav-dashboard"],
      title: "Dashboard",
      body: "Where you are now — your daily numbers.",
    },
    {
      anchor: ["nav-phone-numbers"],
      title: "Phone Numbers",
      body: "Buy and manage the numbers your agent answers on.",
    },
    {
      anchor: ["nav-agent"],
      title: "Voice Agent",
      body: "How your agent sounds, what it knows, when it hands over.",
    },
    {
      anchor: ["nav-messenger"],
      title: "Chatbot Agent",
      body: "The chat bubble for your website.",
    },
    {
      anchor: ["nav-calls"],
      title: "Call Logs",
      body: "Recordings, transcripts and summaries.",
    },
    {
      anchor: ["nav-leads"],
      title: "Lead CRM",
      body: "Everyone who called or chatted.",
    },
    {
      anchor: ["nav-settings"],
      title: "Settings",
      body: "Business details, knowledge, team and billing.",
    },
    {
      anchor: ["topbar-workspace", "workspace-name", "org-switcher"],
      title: "Your workspace",
      body: "The business you're working in. If you manage more than one, switch here.",
    },
    {
      anchor: ["topbar-credit"],
      title: "Usage balance",
      body: "Calls, chats and website scans all draw from here. When it empties your agents stop answering.",
    },
    {
      anchor: ["topbar-notifications"],
      title: "Notifications",
      body: "New leads, finished scans and low-balance warnings.",
    },
    {
      anchor: ["topbar-agent", "active-agent-badge"],
      title: "Active agent",
      body: "Which agent is currently live. Switch between them here.",
    },
    {
      anchor: ["dashboard-stats"],
      title: "Your numbers",
      body: "Calls, minutes, chatbot answers and leads for the selected period.",
    },
    {
      anchor: ["dashboard-filters"],
      title: "Narrow it down",
      body: "Filter by agent or date range — everything above updates.",
    },
    {
      anchor: ["dashboard-chart"],
      title: "Activity over time",
      body: "Spot your busiest hours, so you know when a person should be free for transfers.",
    },
    {
      anchor: ["dashboard-recent"],
      title: "Recent calls",
      body: "Open any one for the recording, transcript and summary.",
    },
    {
      title: "That's the dashboard",
      body: "Next stop is Phone Numbers — your agent needs one before it can take calls. That page will introduce itself when you open it.",
    },
  ],

  "/phone-numbers": [
    {
      title: "Phone Numbers",
      body: "Your agent can't take calls without a number. Here's how this page works.",
    },
    {
      anchor: ["numbers-list"],
      title: "Your numbers",
      body: "Numbers you already own, and which agent answers each.",
    },
    {
      anchor: ["numbers-search"],
      title: "Finding one",
      body: "Pick a country and optionally an area code. Everything listed is ready the moment you buy it.",
    },
    {
      anchor: ["numbers-buy"],
      title: "Buying it",
      body: "The cost comes from your usage balance. If setup fails the number is returned and you aren't charged.",
    },
  ],

  "/agent": [
    {
      title: "Voice Agent",
      body: "Everything about how your agent behaves on a call.",
    },
    {
      anchor: ["agent-persona"],
      title: "Voice and personality",
      body: "Pick the voice and tone, and preview it. This is what callers hear.",
    },
    {
      anchor: ["agent-knowledge"],
      title: "What it knows",
      body: "Connect a knowledge base so it answers from your real details instead of guessing.",
    },
    {
      anchor: ["agent-escalation"],
      title: "Handing over",
      body: "The hours a person is around, and the number to transfer to.",
    },
    {
      anchor: ["agent-call-now"],
      title: "Making calls",
      body: "When you want to call out rather than just receive, this takes you to Call Campaigns.",
    },
  ],

  "/outreach": [
    {
      title: "Call Campaigns",
      body: "For calling people rather than waiting for them to call you.",
    },
    {
      anchor: ["campaign-tab-now"],
      title: "Call Now",
      body: "One-off calls that start immediately.",
    },
    {
      anchor: ["campaign-tab-schedule"],
      title: "Schedule Calls",
      body: "Same setup, but you choose when — and set a window so calls never go out at a bad hour.",
    },
    {
      anchor: ["campaign-recipients"],
      title: "Who you're calling",
      body: "Add one number, paste a list, or pull from your leads.",
    },
  ],

  "/calls": [
    { title: "Call Logs", body: "Every call your agent handled." },
    {
      anchor: ["calls-stats"],
      title: "At a glance",
      body: "Totals, completion rate and average length.",
    },
    {
      anchor: ["calls-filters"],
      title: "Finding a call",
      body: "Filter by agent, outcome or date.",
    },
    {
      anchor: ["calls-table"],
      title: "The calls",
      body: "Open any row for the recording, transcript and summary.",
    },
  ],

  "/messenger": [
    {
      title: "Chatbot Agent",
      body: "The chat bubble for your website — same knowledge as your voice agent.",
    },
    {
      anchor: ["messenger-appearance"],
      title: "Make it yours",
      body: "Colours, avatar, greeting and the prompts visitors see first.",
    },
    {
      anchor: ["messenger-deploy"],
      title: "Put it live",
      body: "Copy this snippet into your site and the bubble appears. Nothing else to set up.",
    },
  ],

  "/leads": [
    {
      title: "Lead CRM",
      body: "Everyone who called or chatted, and where they got to.",
    },
    {
      anchor: ["leads-table"],
      title: "Your leads",
      body: "Sort, filter and export. Each row opens the conversation that produced it.",
    },
  ],

  "/settings": [
    {
      title: "Settings",
      body: "Your business details and everything supporting the agents.",
    },
    {
      anchor: ["settings-general"],
      title: "Workspace basics",
      body: "Name, timezone and contact number. Timezone drives calling windows and reports.",
    },
    {
      anchor: ["settings-knowledge"],
      title: "Knowledge Bases",
      body: "Where your agents learn from. Scan your website and choose which pages they read.",
    },
    {
      anchor: ["settings-team"],
      title: "Team",
      body: "Invite colleagues and set what each can do.",
    },
    {
      anchor: ["settings-billing"],
      title: "Billing",
      body: "Top up, and see exactly what you've spent by service.",
    },
  ],

  "/knowledge-bases": [
    {
      title: "Knowledge Bases",
      body: "What your agents know. Point one at your website and choose what it reads.",
    },
    {
      anchor: ["kb-list"],
      title: "Your knowledge bases",
      body: "Each can be assigned to different agents or chatbots.",
    },
    {
      anchor: ["kb-discover"],
      title: "Finding pages",
      body: "We list every page on your site first. Nothing is read until you choose — you're charged per page.",
    },
    {
      anchor: ["kb-monitoring"],
      title: "Staying current",
      body: "Check your site every 24 hours and tell you when something changes.",
    },
  ],

  "/billing": [
    { title: "Billing", body: "Your balance and where it goes." },
    {
      anchor: ["billing-balance"],
      title: "Balance",
      body: "Top up here. Any unpaid usage is settled first, oldest charges before newer ones.",
    },
    {
      anchor: ["billing-history"],
      title: "History",
      body: "Every charge, by service, so you can see what's costing what.",
    },
  ],

  "/team": [
    { title: "Team", body: "Who else can get in, and what they can do." },
    {
      anchor: ["team-list"],
      title: "Members",
      body: "Invite people and set their role. Owners can change billing; members cannot.",
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}
const PAD = 8;

/** Try each candidate so a card is found in whichever variant rendered. */
function findAnchor(anchor?: string | string[]): HTMLElement | null {
  if (!anchor) return null;
  const list = Array.isArray(anchor) ? anchor : [anchor];
  for (const name of list) {
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`),
    );
    // Prefer one that is actually rendered — mobile and desktop variants of the
    // same card both exist in the DOM, only one has a box.
    const visible = nodes.find((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    if (visible) return visible;
  }
  return null;
}

function rectOf(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect();
  return {
    top: r.top - PAD,
    left: r.left - PAD,
    width: r.width + PAD * 2,
    height: r.height + PAD * 2,
  };
}

/** Is the element outside the comfortable viewing band? */
function isOffScreen(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  return r.top < 64 || r.bottom > window.innerHeight - 200;
}

export const PageTour: React.FC<{
  page: string;
  steps: TourStep[];
  open: boolean;
  onClose: (completed: boolean) => void;
}> = ({ page, steps, open, onClose }) => {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [needsScroll, setNeedsScroll] = useState(false);
  const [missing, setMissing] = useState(false);
  const step = steps[index];

  useEffect(() => {
    if (open) setIndex(0);
  }, [open, page]);

  /* Locate the target, scroll toward it, and decide what to show. */
  useEffect(() => {
    if (!open || !step) return;
    let stop = false;

    const locate = () => {
      if (stop) return;
      const el = findAnchor(step.anchor);

      if (!el) {
        // No spotlight, but the step still shows — centred. Never skipped.
        setRect(null);
        setMissing(true);
        setNeedsScroll(false);
        return;
      }
      setMissing(false);

      if (isOffScreen(el)) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        // Ask rather than assume: if it is still out of view after the scroll
        // settles (a locked container, a collapsed panel), the person is told
        // to scroll and the tour waits for them.
        window.setTimeout(() => {
          if (stop) return;
          const again = findAnchor(step.anchor);
          if (again && isOffScreen(again)) {
            setNeedsScroll(true);
            setRect(rectOf(again));
          } else if (again) {
            setNeedsScroll(false);
            setRect(rectOf(again));
          }
        }, 500);
        return;
      }

      setNeedsScroll(false);
      setRect(rectOf(el));
    };

    locate();
    const poll = window.setInterval(locate, 400);
    window.addEventListener("resize", locate);
    window.addEventListener("scroll", locate, true);
    return () => {
      stop = true;
      window.clearInterval(poll);
      window.removeEventListener("resize", locate);
      window.removeEventListener("scroll", locate, true);
    };
  }, [open, index, step]);

  const finish = useCallback(
    (completed: boolean) => {
      try {
        window.localStorage.setItem(
          flagKey(page),
          completed ? "completed" : "skipped",
        );
      } catch {
        /* private mode */
      }
      onClose(completed);
    },
    [page, onClose],
  );

  const next = useCallback(() => {
    if (index >= steps.length - 1) {
      finish(true);
      return;
    }
    setIndex((i) => i + 1);
  }, [index, steps.length, finish]);

  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish(false);
      if (e.key === "ArrowRight" || e.key === "Enter") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, next, prev, finish]);

  if (!open || !step) return null;

  const centred = !rect || missing;
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
    const below = rect!.top + rect!.height + 14;
    cardStyle =
      below + 200 < vh
        ? { top: below, left: 12, width: CARD_W }
        : { bottom: 14, left: 12, width: CARD_W };
  } else {
    let left = rect!.left + rect!.width + 16;
    if (left + CARD_W > vw - 16) left = Math.max(16, rect!.left - CARD_W - 16);
    cardStyle = {
      top: Math.min(Math.max(16, rect!.top), vh - 250),
      left,
      width: CARD_W,
    };
  }

  return (
    <div
      className="fixed inset-0 z-[9999]"
      role="dialog"
      aria-modal="true"
      aria-label="Page tour"
    >
      {/* Solid dim + solid ring. No transitions, no fade — you asked for the
          highlight and nothing else. */}
      {rect && !centred ? (
        <div
          className="pointer-events-none absolute rounded-2xl"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            boxShadow: "0 0 0 9999px rgba(15,23,42,0.72)",
            outline: "3px solid #F59E0B",
            outlineOffset: 2,
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-[#0F172A]/72" />
      )}

      <div
        className="absolute rounded-2xl bg-white p-5 shadow-xl"
        style={cardStyle}
      >
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <span className="text-[10px] font-black uppercase tracking-widest text-[#D97706]">
            {index + 1} of {steps.length}
          </span>
          <button
            onClick={() => finish(false)}
            className="text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600"
          >
            Skip
          </button>
        </div>

        <h3 className="text-[15px] font-black text-slate-900">{step.title}</h3>
        <p className="mt-1.5 text-[13px] leading-[1.5] text-slate-600">
          {step.body}
        </p>

        {needsScroll ? (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[12px] font-bold text-amber-800">
            Scroll down to bring this into view, then press Next.
          </p>
        ) : null}

        {step.action === "click" && step.actionLabel ? (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[12px] font-bold text-amber-800">
            {step.actionLabel}
          </p>
        ) : null}

        <div className="mt-4 flex items-center justify-end gap-2">
          {index > 0 ? (
            <button
              onClick={prev}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-600"
            >
              Back
            </button>
          ) : null}
          <button
            onClick={next}
            className="rounded-lg bg-slate-900 px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-white hover:bg-amber-600"
          >
            {index === steps.length - 1 ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fires a page's tour the FIRST time that page is opened, once, ever.
 *
 * Mount once in the app shell. It reads the current route and looks up that
 * page's flag; if the flag exists the tour never renders.
 */
export function usePageTour(pathname: string) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<string | null>(null);
  const checked = useRef<Set<string>>(new Set());

  useEffect(() => {
    const route = Object.keys(PAGE_TOURS).find(
      (key) => pathname === key || pathname.startsWith(`${key}/`),
    );
    if (!route) {
      setOpen(false);
      return;
    }
    if (checked.current.has(route)) return;
    checked.current.add(route);

    let seen = false;
    try {
      seen = !!window.localStorage.getItem(flagKey(route));
    } catch {
      /* private mode */
    }
    if (seen) return;

    // Let the page paint before measuring anything.
    const t = window.setTimeout(() => {
      setPage(route);
      setOpen(true);
    }, 800);
    return () => window.clearTimeout(t);
  }, [pathname]);

  const close = useCallback(() => {
    setOpen(false);
    setPage(null);
  }, []);

  /** "Replay this page's tour" for Settings. */
  const replay = useCallback(
    (route?: string) => {
      const target =
        route ||
        Object.keys(PAGE_TOURS).find(
          (key) => pathname === key || pathname.startsWith(`${key}/`),
        );
      if (!target) return;
      try {
        window.localStorage.removeItem(flagKey(target));
      } catch {
        /* ignore */
      }
      checked.current.delete(target);
      setPage(target);
      setOpen(true);
    },
    [pathname],
  );

  /** Clear every page flag — the tours start again from scratch. */
  const resetAll = useCallback(() => {
    try {
      Object.keys(PAGE_TOURS).forEach((r) =>
        window.localStorage.removeItem(flagKey(r)),
      );
    } catch {
      /* ignore */
    }
    checked.current.clear();
  }, []);

  return {
    open,
    page,
    steps: page ? PAGE_TOURS[page] || [] : [],
    close,
    replay,
    resetAll,
  };
}

export default PageTour;
