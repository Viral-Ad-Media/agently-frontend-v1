/**
 * agently/lib/productTour.tsx — FULL REWRITE
 *
 * WHAT WAS WRONG WITH THE PREVIOUS VERSION
 *
 * 1. It scrolled the window. This app is `h-screen overflow-hidden` with the
 *    real scrolling happening inside <main>. window.scrollIntoView therefore
 *    did nothing on most pages, so any card below the fold got a tooltip
 *    pointing at empty space. This is the single biggest reason it felt broken.
 *
 * 2. Completion lived in localStorage. Sign in on a phone and the whole tour
 *    replayed; clear site data and it replayed; and there was no way for an
 *    admin to bring one page's tour back after a redesign.
 *
 * 3. Anchors were a flat list of data-tour names that mostly did not exist on
 *    the pages, so most steps silently fell back to a centred card with no
 *    highlight — a slideshow, not a tour.
 *
 * 4. On mobile the sidebar steps pointed at a closed drawer.
 *
 * WHAT THIS DOES INSTEAD
 *
 * • RESOLVER, not a name list. Each step declares targets in priority order
 *   and may use any of: `tour:<data-tour value>`, a raw CSS selector, or
 *   `text:<string>` which matches a visible link/button/heading by its own
 *   text. Text matching means most steps need no page edits at all, which is
 *   why this ships without rewriting ten page files.
 *
 * • SCROLLS THE RIGHT ELEMENT. Walks up from the target to the nearest
 *   genuinely scrollable ancestor and scrolls that, falling back to the
 *   window. Verifies afterwards and retries once before giving up.
 *
 * • MOBILE GATE. On a narrow viewport, a sidebar step first checks whether the
 *   drawer is open. If not, it points a pulsing hand at the hamburger and
 *   waits for the user to open it, then continues on its own.
 *
 * • ACTS BEFORE MEASURING. A step can carry `before: { click: target }` so the
 *   tour switches tabs itself — Phone Numbers moves from "Numbers" to "Buy a
 *   number" without the user touching anything.
 *
 * • SERVER-BACKED PROGRESS with per-page versions, mirrored to localStorage so
 *   nothing flashes while the fetch is in flight.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { resolveApiBaseUrl } from "../utils/runtimeUrls";
import { getSessionToken } from "../services/session";

/* ══════════════════════════════════════════════════════════════════════════
 * Types
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * A target is resolved in order until one hits:
 *   "tour:dashboard-stats"  -> [data-tour="dashboard-stats"]
 *   "text:Buy a number"     -> visible button/link/heading with that text
 *   any other string        -> used as a raw CSS selector
 */
export type TourTarget = string | string[];

export interface TourStep {
  target?: TourTarget;
  title: string;
  body: string;
  /** Perform this before locating the target — used for tab switching. */
  before?: { click: TourTarget; waitMs?: number };
  /** Only run this step on one viewport class. */
  only?: "mobile" | "desktop";
  /** Requires the mobile drawer to be open first. */
  needsSidebar?: boolean;
  /** Preferred card placement; the engine overrides if it would clip. */
  placement?: "auto" | "center";
}

type Rect = { top: number; left: number; width: number; height: number };

interface TourPageMeta {
  pageKey: string;
  label: string;
  version: number;
}

/* ══════════════════════════════════════════════════════════════════════════
 * Viewport helpers
 * ══════════════════════════════════════════════════════════════════════════ */

const MOBILE_BREAKPOINT = 768; // matches the Shell's md: drawer breakpoint

export const isMobileViewport = () =>
  typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT;

/* ══════════════════════════════════════════════════════════════════════════
 * Target resolution
 * ══════════════════════════════════════════════════════════════════════════ */

const isVisible = (el: Element): boolean => {
  const node = el as HTMLElement;
  if (!node.isConnected) return false;
  const rect = node.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return false;
  const style = window.getComputedStyle(node);
  return (
    style.visibility !== "hidden" &&
    style.display !== "none" &&
    Number(style.opacity) > 0.05
  );
};

const normalise = (value: string) =>
  value.replace(/\s+/g, " ").trim().toLowerCase();

/** Smallest visible element whose own text matches — avoids matching <body>. */
const findByText = (needle: string): HTMLElement | null => {
  const wanted = normalise(needle);
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      'button, a, h1, h2, h3, h4, [role="tab"], [role="button"], label, summary',
    ),
  ).filter((el) => isVisible(el) && normalise(el.textContent || "") === wanted);

  if (candidates.length) {
    return candidates.sort(
      (a, b) =>
        a.getBoundingClientRect().width * a.getBoundingClientRect().height -
        b.getBoundingClientRect().width * b.getBoundingClientRect().height,
    )[0];
  }

  // Fall back to a partial match, still preferring the smallest element.
  const partial = Array.from(
    document.querySelectorAll<HTMLElement>(
      'button, a, h1, h2, h3, [role="tab"]',
    ),
  ).filter(
    (el) => isVisible(el) && normalise(el.textContent || "").includes(wanted),
  );

  return partial.length
    ? partial.sort(
        (a, b) => (a.textContent || "").length - (b.textContent || "").length,
      )[0]
    : null;
};

const resolveOne = (spec: string): HTMLElement | null => {
  try {
    if (spec.startsWith("tour:")) {
      const nodes = Array.from(
        document.querySelectorAll<HTMLElement>(
          `[data-tour="${spec.slice(5)}"]`,
        ),
      ).filter(isVisible);
      return nodes[0] || null;
    }
    if (spec.startsWith("text:")) return findByText(spec.slice(5));

    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>(spec),
    ).filter(isVisible);
    return nodes[0] || null;
  } catch {
    // A malformed selector must not take the tour down.
    return null;
  }
};

const resolveTarget = (target?: TourTarget): HTMLElement | null => {
  if (!target) return null;
  const specs = Array.isArray(target) ? target : [target];
  for (const spec of specs) {
    const found = resolveOne(spec);
    if (found) return found;
  }
  return null;
};

/* ══════════════════════════════════════════════════════════════════════════
 * Scrolling
 * ══════════════════════════════════════════════════════════════════════════
 * The fix that matters most. Everything here scrolls the element that
 * actually scrolls, not the window.
 */

const scrollableAncestor = (el: HTMLElement): HTMLElement | null => {
  let node: HTMLElement | null = el.parentElement;
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node);
    const scrolls = /(auto|scroll|overlay)/.test(
      style.overflowY + style.overflow,
    );
    if (scrolls && node.scrollHeight > node.clientHeight + 4) return node;
    node = node.parentElement;
  }
  return null;
};

const isFullyVisible = (el: HTMLElement, margin = 12): boolean => {
  const rect = el.getBoundingClientRect();
  const container = scrollableAncestor(el);
  const bounds = container
    ? container.getBoundingClientRect()
    : { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth };

  return (
    rect.top >= bounds.top + margin &&
    rect.bottom <= bounds.bottom - margin &&
    rect.bottom > bounds.top &&
    rect.top < bounds.bottom
  );
};

/** Centre the element inside whichever thing scrolls. */
const scrollIntoCenter = (el: HTMLElement) => {
  const container = scrollableAncestor(el);

  if (container) {
    const containerRect = container.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    const delta =
      rect.top - containerRect.top - (container.clientHeight - rect.height) / 2;
    container.scrollTo({
      top: Math.max(0, container.scrollTop + delta),
      behavior: "smooth",
    });
    return;
  }

  const rect = el.getBoundingClientRect();
  window.scrollTo({
    top: Math.max(
      0,
      window.scrollY + rect.top - (window.innerHeight - rect.height) / 2,
    ),
    behavior: "smooth",
  });
};

const rectOf = (el: HTMLElement): Rect => {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
};

/* ══════════════════════════════════════════════════════════════════════════
 * Sidebar state (mobile drawer)
 * ══════════════════════════════════════════════════════════════════════════
 * The drawer is translate-x-full when closed. Reading its transform is more
 * reliable than guessing from a class name that may be composed at runtime.
 */
const isSidebarOpen = (): boolean => {
  const nav = resolveOne("tour:nav-dashboard");
  if (!nav) return false;
  const rect = nav.getBoundingClientRect();
  return rect.left > -20 && rect.width > 10 && isVisible(nav);
};

/* ══════════════════════════════════════════════════════════════════════════
 * PAGE TOURS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Targets lead with a data-tour hook where one exists and fall back to text,
 * so a step keeps working if markup shifts. Sidebar and topbar steps run only
 * on the dashboard tour — they are the app frame, and repeating them on every
 * page would be the thing everyone hates about product tours.
 */

const SIDEBAR_STEPS: TourStep[] = [
  {
    only: "mobile",
    target: "tour:menu-toggle",
    title: "Your menu lives here",
    body: "Everything in Agently is behind this button. Tap it to open the menu — I will carry on as soon as it is open.",
  },
  {
    needsSidebar: true,
    target: "tour:nav-dashboard",
    title: "Dashboard",
    body: "Where you are now. Your calls, minutes, chats and leads at a glance.",
  },
  {
    needsSidebar: true,
    target: "tour:nav-phone-numbers",
    title: "Phone Numbers",
    body: "Buy numbers and choose which agent answers on each one. Your agent cannot take calls until a number is assigned to it.",
  },
  {
    needsSidebar: true,
    target: "tour:nav-agent",
    title: "Voice Agent",
    body: "How your agent sounds, what it knows, when it takes a message and when it passes the caller to a person.",
  },
  {
    needsSidebar: true,
    target: "tour:nav-messenger",
    title: "Chatbot Agent",
    body: "The chat bubble you can put on your own website. Same knowledge as your voice agent, typed instead of spoken.",
  },
  {
    needsSidebar: true,
    target: "tour:nav-calls",
    title: "Call Logs",
    body: "Every answered call, with the recording, the transcript and a short summary of what the caller wanted.",
  },
  {
    needsSidebar: true,
    target: "tour:nav-leads",
    title: "Lead CRM",
    body: "Everyone who left their details, whether they called or chatted. Track who you have followed up with.",
  },
  {
    needsSidebar: true,
    target: "tour:nav-settings",
    title: "Settings",
    body: "Your business details, knowledge bases, team and billing.",
  },
];

const TOPBAR_STEPS: TourStep[] = [
  {
    target: ["tour:topbar-workspace", "text:Knowledge"],
    title: "Your workspace",
    body: "The business your agents represent. Click it any time to open your knowledge bases and change what your agents know.",
  },
  {
    target: "tour:topbar-agent",
    title: "Active agent",
    body: "Which agent is live right now. If you run several, this is the one currently taking calls.",
  },
  {
    target: "tour:topbar-credit",
    title: "Usage balance",
    body: "Calls, chats and website scans all draw from here. When it runs out your agents stop answering, so keep an eye on it.",
  },
  {
    target: "tour:topbar-notifications",
    title: "Notifications",
    body: "New leads, finished website scans and low-balance warnings land here.",
  },
];

export const PAGE_TOURS: Record<string, TourStep[]> = {
  "/dashboard": [
    {
      placement: "center",
      title: "Welcome to Agently",
      body: "Let me show you around — about a minute. Each page introduces itself the first time you open it, then leaves you alone for good.",
    },
    ...SIDEBAR_STEPS,
    ...TOPBAR_STEPS,
    {
      target: ["tour:dashboard-filters", "text:Last 7 days"],
      title: "Choose your period",
      body: "Everything below updates to match. Start with the last 7 days and widen it once you have some history.",
    },
    {
      target: "tour:dashboard-stats",
      title: "Your headline numbers",
      body: "Calls answered, minutes used, chatbot conversations and leads captured for the period you picked.",
    },
    {
      target: "tour:dashboard-chart",
      title: "Activity over time",
      body: "Where your calls and chats actually fall across the week. Useful for spotting the hours you were missing before.",
    },
    {
      target: "tour:dashboard-recent",
      title: "What just happened",
      body: "Your most recent calls and leads. Click any row to open the full record.",
    },
    {
      placement: "center",
      title: "That is the dashboard",
      body: "Open any other page when you are ready and it will introduce itself the same way. You will not see this one again.",
    },
  ],

  "/phone-numbers": [
    {
      placement: "center",
      title: "Phone Numbers",
      body: "This page has two tabs: the numbers you already own, and buying a new one. I will walk you through both.",
    },
    {
      before: { click: "text:Numbers" },
      target: ["tour:numbers-list", "text:Numbers"],
      title: "Your numbers",
      body: "Every number in this workspace, and which agent answers on it. A number with no agent assigned will not be answered.",
    },
    {
      target: ["text:Assign", "text:Assign to agent"],
      title: "Assigning a number",
      body: "Point a number at one of your agents here. This is the step most people miss — buying a number is not enough on its own.",
    },
    {
      before: {
        click: ["text:Buy Number", "text:Buy a number", "tour:numbers-buy"],
        waitMs: 520,
      },
      target: ["tour:numbers-search", "tour:numbers-buy", "text:Buy Number"],
      title: "Buying a number",
      body: "Search by country and area code, then buy the one you want. Your usage balance needs to cover the purchase first.",
    },
    {
      placement: "center",
      title: "One more thing",
      body: "Numbers renew monthly from your usage balance. If the balance empties, you get five days of warnings before a number is released.",
    },
  ],

  "/agent": [
    {
      placement: "center",
      title: "Your voice agent",
      body: "This is where you shape how your agent sounds and what it says. Changes take effect on the next call.",
    },
    {
      target: ["text:Greeting", "text:Greeting message"],
      title: "The greeting",
      body: 'The first thing every caller hears. Name the business and the agent, for example: "Thanks for calling Nutra Wellness, this is Mimi — how can I help?"',
    },
    {
      target: ["text:Voice", "text:Language"],
      title: "Voice and language",
      body: "Pick how your agent sounds and which language it speaks. Try a preview before you save.",
    },
    {
      target: [
        "tour:agent-escalation",
        "text:Escalation",
        "text:Escalation phone",
      ],
      title: "Handing over to a person",
      body: "When a caller needs a human, this is the number your agent transfers them to.",
    },
    {
      target: ["text:Knowledge", "text:Knowledge base"],
      title: "What it knows",
      body: "Attach a knowledge base and your agent can answer real questions about your business instead of just taking messages.",
    },
    {
      target: ["tour:agent-call-now", "text:Test call", "text:Call now"],
      title: "Try it yourself",
      body: "Ring your own agent and hear exactly what a customer hears. Do this after every change you care about.",
    },
  ],

  "/messenger": [
    {
      placement: "center",
      title: "Your website chatbot",
      body: "The same knowledge as your voice agent, in a chat bubble you can drop onto your own site.",
    },
    {
      target: ["text:Appearance", "text:Accent color", "text:Header title"],
      title: "Make it yours",
      body: "Colour, greeting, avatar and launcher text. The preview updates as you type.",
    },
    {
      target: ["text:Knowledge base", "text:Knowledge"],
      title: "What it can answer",
      body: "Choose the knowledge base it draws from. Its suggested questions come from that knowledge base too.",
    },
    {
      target: ["text:Deploy", "text:Embed", "text:Get embed code"],
      title: "Putting it on your site",
      body: "Copy the snippet and paste it just before the closing body tag of your website. The bubble appears straight away.",
    },
  ],

  "/knowledge-bases": [
    {
      placement: "center",
      title: "Knowledge bases",
      body: "This is what your agents actually know. Everything they say about your business comes from here.",
    },
    {
      target: ["text:Add source", "text:Add website", "text:Website"],
      title: "Add your website",
      body: "Point it at your site and Agently reads the public pages, turning them into answers your agents can use.",
    },
    {
      target: ["text:FAQ", "text:FAQs"],
      title: "Fill the gaps by hand",
      body: "Anything not on your website — pricing rules, opening hours, policies — add it here. Hand-written answers outrank scraped ones.",
    },
  ],

  "/calls": [
    {
      placement: "center",
      title: "Call logs",
      body: "Every call your agent answered, kept with its recording and transcript.",
    },
    {
      target: "tour:calls-stats",
      title: "The shape of your calls",
      body: "Volume, average length and how many turned into leads.",
    },
    {
      target: ["text:Transcript", "text:Summary"],
      title: "Inside a call",
      body: "Open any call for the recording, the full transcript and a short summary of what the caller wanted.",
    },
  ],

  "/leads": [
    {
      placement: "center",
      title: "Lead CRM",
      body: "Everyone who left their details with a voice agent or the chatbot, in one list.",
    },
    {
      target: ["text:Status", "text:New"],
      title: "Track your follow-up",
      body: "Move a lead from new to contacted to closed so you know who is still waiting to hear from you.",
    },
  ],

  "/billing": [
    {
      placement: "center",
      title: "Billing",
      body: "Your usage balance and everything it has paid for.",
    },
    {
      target: ["text:Add credit", "text:Top up"],
      title: "Adding credit",
      body: "Calls, chats, numbers and website scans all draw from this balance. Agents pause when it runs out.",
    },
    {
      target: ["text:History", "text:Transactions"],
      title: "Where it went",
      body: "Every charge, itemised, so you can see exactly what each call and each number cost.",
    },
  ],

  "/team": [
    {
      placement: "center",
      title: "Your team",
      body: "Invite colleagues into this workspace and choose what each of them can do.",
    },
    {
      target: ["text:Invite", "text:Invite member"],
      title: "Inviting someone",
      body: "They get an email invitation. Owners can change billing; admins manage agents; viewers can only look.",
    },
  ],

  "/outreach": [
    {
      placement: "center",
      title: "Outreach",
      body: "Schedule your agent to call people rather than waiting for them to call you.",
    },
    {
      target: ["text:Schedule", "text:New campaign", "text:Create"],
      title: "Setting up a campaign",
      body: "Pick who to call, when to call them, and what the agent should say when they pick up.",
    },
  ],

  "/settings": [
    {
      placement: "center",
      title: "Settings",
      body: "Your business details and the things every agent inherits.",
    },
    {
      target: ["tour:settings-general", "text:Business", "text:General"],
      title: "Business details",
      body: "Name, industry, timezone and hours. Your agents use all of it when they speak to customers.",
    },
  ],
};

/* ══════════════════════════════════════════════════════════════════════════
 * Progress store — server first, localStorage as a mirror
 * ══════════════════════════════════════════════════════════════════════════ */

const MIRROR_KEY = "agently.tour.progress.v1";
const API_BASE = resolveApiBaseUrl();

type ProgressMap = Record<string, number>; // pageKey -> completedVersion

const readMirror = (): ProgressMap => {
  try {
    return JSON.parse(window.localStorage.getItem(MIRROR_KEY) || "{}");
  } catch {
    return {};
  }
};

const writeMirror = (progress: ProgressMap) => {
  try {
    window.localStorage.setItem(MIRROR_KEY, JSON.stringify(progress));
  } catch {
    /* private mode — server remains the source of truth */
  }
};

async function tourFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const token = getSessionToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Tour request failed (${response.status})`);
  return (await response.json()) as T;
}

/* ══════════════════════════════════════════════════════════════════════════
 * usePageTour
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * Tracks the HashRouter location itself.
 *
 * The previous version received `window.location.hash` read during App's
 * render. App sits OUTSIDE <Router>, so it does not re-render on navigation —
 * the hook could keep the stale route of whatever page happened to be open
 * when App last rendered, which is why tours fired on the wrong page or not at
 * all. Subscribing to hashchange makes the hook correct wherever it is mounted.
 */
function useHashRoute(explicit?: string) {
  const read = () =>
    typeof window === "undefined"
      ? "/"
      : window.location.hash.replace(/^#/, "").split("?")[0] || "/";

  const [hash, setHash] = useState(read);

  useEffect(() => {
    if (explicit) return;
    const onChange = () => setHash(read());
    window.addEventListener("hashchange", onChange);
    window.addEventListener("popstate", onChange);
    // HashRouter navigations that replace state do not always fire hashchange.
    const poll = window.setInterval(() => {
      const current = read();
      setHash((previous) => (previous === current ? previous : current));
    }, 300);
    return () => {
      window.removeEventListener("hashchange", onChange);
      window.removeEventListener("popstate", onChange);
      window.clearInterval(poll);
    };
  }, [explicit]);

  return explicit || hash;
}

export function usePageTour(explicitPathname?: string) {
  const pathname = useHashRoute(explicitPathname);
  const [pages, setPages] = useState<TourPageMeta[]>([]);
  const [progress, setProgress] = useState<ProgressMap>(() =>
    typeof window === "undefined" ? {} : readMirror(),
  );
  const [loaded, setLoaded] = useState(false);
  const [activePage, setActivePage] = useState<string | null>(null);
  const startedThisSession = useRef<Set<string>>(new Set());

  /* Load published versions and this user's progress, once. */
  useEffect(() => {
    let cancelled = false;
    tourFetch<{
      pages: TourPageMeta[];
      progress: Record<string, { completedVersion: number }>;
    }>("/api/tour/state")
      .then((state) => {
        if (cancelled) return;
        const map: ProgressMap = {};
        for (const [key, value] of Object.entries(state.progress || {})) {
          map[key] = value.completedVersion;
        }
        setPages(state.pages || []);
        setProgress(map);
        writeMirror(map);
        setLoaded(true);
      })
      .catch(() => {
        // Offline or pre-migration: fall back to the mirror. Worst case the
        // tour does not run, which is far better than it running twice.
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const route = useMemo(() => {
    const clean = (pathname || "/").split("?")[0];
    return (
      Object.keys(PAGE_TOURS).find(
        (key) => clean === key || clean.startsWith(`${key}/`),
      ) || null
    );
  }, [pathname]);

  const versionFor = useCallback(
    (key: string) => pages.find((page) => page.pageKey === key)?.version ?? 1,
    [pages],
  );

  /* Decide whether this route owes the user a tour. */
  useEffect(() => {
    if (!loaded || !route) {
      setActivePage(null);
      return;
    }
    if (startedThisSession.current.has(route)) return;

    // A page missing from tour_pages is disabled — do not run it.
    if (pages.length && !pages.some((page) => page.pageKey === route)) return;

    const completed = progress[route] ?? 0;
    if (completed >= versionFor(route)) return;

    startedThisSession.current.add(route);

    // Let the route's data land and the layout settle before measuring.
    const timer = window.setTimeout(() => setActivePage(route), 900);
    return () => window.clearTimeout(timer);
  }, [loaded, route, pages, progress, versionFor]);

  const close = useCallback(
    (completed: boolean) => {
      const page = activePage;
      setActivePage(null);
      if (!page) return;

      const version = versionFor(page);
      const next = { ...progress, [page]: version };
      setProgress(next);
      writeMirror(next);

      void tourFetch("/api/tour/complete", {
        method: "POST",
        body: JSON.stringify({
          pageKey: page,
          version,
          status: completed ? "completed" : "skipped",
        }),
      }).catch(() => {
        /* mirror already written; next load reconciles */
      });
    },
    [activePage, progress, versionFor],
  );

  /** Replay the current page's tour on demand. */
  const replay = useCallback(
    (target?: string) => {
      const page = target || route;
      if (!page) return;
      startedThisSession.current.delete(page);
      const next = { ...progress };
      delete next[page];
      setProgress(next);
      writeMirror(next);
      void tourFetch("/api/tour/reset", {
        method: "POST",
        body: JSON.stringify({ pageKey: page }),
      }).catch(() => {});
      setActivePage(page);
    },
    [route, progress],
  );

  return {
    open: Boolean(activePage),
    page: activePage,
    steps: activePage ? PAGE_TOURS[activePage] || [] : [],
    close,
    replay,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
 * PageTour — the renderer
 * ══════════════════════════════════════════════════════════════════════════ */

const CARD_MAX_W = 380;
const GAP = 14;

export const PageTour: React.FC<{
  page: string;
  steps: TourStep[];
  open: boolean;
  onClose: (completed: boolean) => void;
}> = ({ page, steps, open, onClose }) => {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [waitingForSidebar, setWaitingForSidebar] = useState(false);
  const [unresolved, setUnresolved] = useState(false);
  const settling = useRef(false);

  /* Steps that do not apply to this viewport are removed up front, so the
     progress counter reads honestly ("3 of 9", not "3 of 14 with 5 skipped"). */
  const visibleSteps = useMemo(() => {
    const mobile = isMobileViewport();
    return steps.filter((step) => {
      if (step.only === "mobile" && !mobile) return false;
      if (step.only === "desktop" && mobile) return false;
      return true;
    });
  }, [steps, open]);

  const step = visibleSteps[index];

  useEffect(() => {
    if (open) setIndex(0);
  }, [open, page]);

  /* Lock background scrolling so the highlight cannot drift under the user. */
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  /* ── Locate, act, scroll, measure ─────────────────────────────────────── */
  useEffect(() => {
    if (!open || !step) return;
    let stopped = false;
    let poll = 0;

    const measure = (el: HTMLElement) => {
      if (!stopped) setRect(rectOf(el));
    };

    const run = async () => {
      setUnresolved(false);

      // 1. Perform the step's action first (tab switch, panel open).
      if (step.before?.click) {
        const trigger = resolveTarget(step.before.click);
        if (trigger) {
          trigger.click();
          await new Promise((r) =>
            window.setTimeout(r, step.before?.waitMs ?? 420),
          );
        }
      }
      if (stopped) return;

      // 2. On mobile, sidebar steps need the drawer open. Point at the
      //    hamburger and wait rather than highlighting a hidden element.
      if (step.needsSidebar && isMobileViewport() && !isSidebarOpen()) {
        setWaitingForSidebar(true);
        const toggle = resolveOne("tour:menu-toggle");
        setRect(toggle ? rectOf(toggle) : null);

        poll = window.setInterval(() => {
          if (stopped) return;
          if (isSidebarOpen()) {
            window.clearInterval(poll);
            setWaitingForSidebar(false);
            void run();
          }
        }, 250);
        return;
      }
      setWaitingForSidebar(false);

      // 3. Centred steps need no target.
      if (!step.target || step.placement === "center") {
        setRect(null);
        return;
      }

      // 4. Resolve. React may still be committing, so retry briefly.
      let el: HTMLElement | null = null;
      for (let attempt = 0; attempt < 12 && !stopped; attempt += 1) {
        el = resolveTarget(step.target);
        if (el) break;
        await new Promise((r) => window.setTimeout(r, 120));
      }
      if (stopped) return;

      if (!el) {
        // Show the copy centred rather than skipping — silently dropping a
        // step is how the previous tour ended up feeling like a slideshow.
        setUnresolved(true);
        setRect(null);
        return;
      }

      // 5. Scroll the right container, verify, retry once.
      if (!isFullyVisible(el)) {
        settling.current = true;
        scrollIntoCenter(el);
        await new Promise((r) => window.setTimeout(r, 480));
        if (stopped) return;

        const again = resolveTarget(step.target);
        if (again && !isFullyVisible(again)) {
          scrollIntoCenter(again);
          await new Promise((r) => window.setTimeout(r, 380));
        }
        settling.current = false;
      }
      if (stopped) return;

      const final = resolveTarget(step.target) || el;
      measure(final);

      // Keep the highlight glued to the element while the step is on screen.
      poll = window.setInterval(() => {
        if (stopped || settling.current) return;
        const live = resolveTarget(step.target);
        if (live) measure(live);
      }, 260);
    };

    void run();

    const onResize = () => {
      const live = resolveTarget(step.target);
      if (live) measure(live);
    };
    window.addEventListener("resize", onResize);

    return () => {
      stopped = true;
      if (poll) window.clearInterval(poll);
      window.removeEventListener("resize", onResize);
    };
  }, [open, index, step]);

  const finish = useCallback(
    (completed: boolean) => onClose(completed),
    [onClose],
  );

  const next = useCallback(() => {
    if (index >= visibleSteps.length - 1) finish(true);
    else setIndex((i) => i + 1);
  }, [index, visibleSteps.length, finish]);

  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish(false);
      else if (event.key === "ArrowRight" || event.key === "Enter") next();
      else if (event.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, next, prev, finish]);

  if (!open || !step) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const mobile = isMobileViewport();
  const cardW = mobile ? Math.min(vw - 24, CARD_MAX_W) : CARD_MAX_W;
  const centred = !rect || unresolved;

  /* Card placement: prefer the side with room, never clip. */
  let cardStyle: React.CSSProperties;
  if (centred) {
    cardStyle = {
      top: "50%",
      left: "50%",
      transform: "translate(-50%,-50%)",
      width: cardW,
    };
  } else if (mobile) {
    const below = rect.top + rect.height + GAP;
    cardStyle =
      below + 230 < vh
        ? { top: below, left: 12, width: cardW }
        : { bottom: 16, left: 12, width: cardW };
  } else {
    let left = rect.left + rect.width + GAP;
    if (left + cardW > vw - 16) {
      left = rect.left - cardW - GAP;
      if (left < 16) left = Math.min(Math.max(16, rect.left), vw - cardW - 16);
    }
    cardStyle = {
      top: Math.min(Math.max(16, rect.top - 8), Math.max(16, vh - 260)),
      left,
      width: cardW,
    };
  }

  const stepNumber = index + 1;
  const isLast = index === visibleSteps.length - 1;

  return (
    <div className="fixed inset-0 z-[9998]" role="dialog" aria-modal="true">
      <style>{`
        @keyframes ag-tour-hand {
          0%, 100% { transform: translate(0, 0); }
          50%      { transform: translate(0, -9px); }
        }
        @keyframes ag-tour-ring {
          0%   { box-shadow: 0 0 0 0 rgba(245,158,11,0.55); }
          70%  { box-shadow: 0 0 0 14px rgba(245,158,11,0); }
          100% { box-shadow: 0 0 0 0 rgba(245,158,11,0); }
        }
        .ag-tour-hand { animation: ag-tour-hand 1.1s ease-in-out infinite; }
        .ag-tour-ring { animation: ag-tour-ring 1.6s ease-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .ag-tour-hand, .ag-tour-ring { animation: none !important; }
        }
      `}</style>

      {/*
        Four panels rather than one overlay with a hole. A box-shadow spotlight
        cannot be clicked through, which matters here: while the tour waits for
        the mobile menu, the hamburger underneath must stay tappable.
      */}
      {centred ? (
        <div className="absolute inset-0 bg-slate-950/62" />
      ) : (
        <>
          <div
            className="absolute left-0 right-0 top-0 bg-slate-950/62"
            style={{ height: Math.max(0, rect.top - 6) }}
          />
          <div
            className="absolute left-0 right-0 bg-slate-950/62"
            style={{ top: rect.top + rect.height + 6, bottom: 0 }}
          />
          <div
            className="absolute left-0 bg-slate-950/62"
            style={{
              top: rect.top - 6,
              height: rect.height + 12,
              width: Math.max(0, rect.left - 6),
            }}
          />
          <div
            className="absolute right-0 bg-slate-950/62"
            style={{
              top: rect.top - 6,
              height: rect.height + 12,
              left: rect.left + rect.width + 6,
            }}
          />
          <div
            className={`pointer-events-none absolute rounded-xl border-2 border-[#F59E0B] ${
              waitingForSidebar ? "ag-tour-ring" : ""
            }`}
            style={{
              top: rect.top - 6,
              left: rect.left - 6,
              width: rect.width + 12,
              height: rect.height + 12,
            }}
          />
        </>
      )}

      {/* Pointing hand while we wait for the menu to be opened. */}
      {waitingForSidebar && rect ? (
        <div
          className="ag-tour-hand pointer-events-none absolute z-[2] text-3xl"
          style={{
            top: rect.top + rect.height + 10,
            left: rect.left + rect.width / 2 - 14,
          }}
          aria-hidden
        >
          👆
        </div>
      ) : null}

      <div
        className="absolute rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.35)]"
        style={cardStyle}
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#F59E0B]">
            Step {stepNumber} of {visibleSteps.length}
          </span>
          <button
            type="button"
            onClick={() => finish(false)}
            className="text-[11px] font-bold text-slate-400 transition hover:text-slate-700"
          >
            Skip
          </button>
        </div>

        <h3 className="mt-2.5 text-[17px] font-semibold leading-snug tracking-[-0.02em] text-[#0F172A]">
          {step.title}
        </h3>
        <p className="mt-2 text-[13px] leading-relaxed text-slate-600">
          {step.body}
        </p>

        {waitingForSidebar ? (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-800">
            Tap the menu button to carry on.
          </p>
        ) : null}

        <div className="mt-4 flex items-center gap-2">
          <div className="flex flex-1 gap-1">
            {visibleSteps.map((_, dot) => (
              <span
                key={dot}
                className={`h-1 flex-1 rounded-full ${
                  dot <= index ? "bg-[#F59E0B]" : "bg-slate-200"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          {index > 0 ? (
            <button
              type="button"
              onClick={prev}
              className="h-10 rounded-xl border border-slate-200 px-4 text-[12px] font-bold text-slate-600 transition hover:border-slate-300"
            >
              Back
            </button>
          ) : null}
          <button
            type="button"
            onClick={next}
            disabled={waitingForSidebar}
            className="h-10 flex-1 rounded-xl bg-[#0F172A] text-[12px] font-bold text-white transition disabled:opacity-40"
          >
            {isLast ? "Finish" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PageTour;
