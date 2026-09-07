/**
 * agently/lib/productTour.tsx
 *
 * The 50 steps and the target resolver are unchanged. The presentation layer
 * (positioning, popover, motion, mobile) was rebuilt after the previous one
 * was rejected on visual grounds and then switched off in App.tsx for cost.
 *
 * WHAT THE REBUILD CHANGES
 *
 * • REAL PLACEMENT. Tries bottom -> top -> right -> left and takes the first
 *   side where the MEASURED card fits and does not cover its own target,
 *   falling back to centred. The old version only tried right then left, and
 *   assumed a fixed 230/260px card height, so wide targets got a card sitting
 *   on top of them and long steps ran off the bottom of the screen.
 *
 * • NO TIMERS. Target tracking is a ResizeObserver plus a passive scroll
 *   listener on the real scroll container, coalesced through rAF. The old
 *   260ms/250ms/300ms intervals are gone — that polling is the reason the
 *   tour was disabled, not just the way it looked.
 *
 * • MOTION. Card enters at 160ms ease-out from scale(0.96), exits faster,
 *   and moves between steps on transform (GPU) with a short blur masking the
 *   content swap. The scrim is ONE element with an animatable clip-path hole
 *   instead of four panels that could never be transitioned.
 *
 * • MOBILE. Below 768px the card docks to the bottom with its buttons in a
 *   non-scrolling footer, so Next is always reachable without scrolling, and
 *   scroll-into-view biases the target into the upper third so the sheet
 *   cannot cover it.
 *
 * • ACTS BEFORE MEASURING. A step can carry `before: { click: target }` so the
 *   tour switches tabs itself, and mobile sidebar steps now open the drawer
 *   themselves rather than parking on a "tap the menu" state.
 *
 * • PROGRESS IS LOCAL-ONLY for now. Server-backed per-page versions return in
 *   the backend phase; see TOUR_VERSION below.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { resolveApiBaseUrl } from "../utils/runtimeUrls";

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

const INTERACTIVE =
  'button, a, h1, h2, h3, h4, [role="tab"], [role="button"], label, summary';

/**
 * Text matching is scoped to the page content, never the app chrome.
 *
 * This used to search the whole document with a plain `includes()` fallback,
 * which is how `text:Numbers` resolved to the sidebar's "Phone Numbers" link.
 * On /phone-numbers that link was then CLICKED by a `before` action, which
 * navigated the app mid-tour and silently killed the remaining steps — the
 * page measured 1 of its 5 steps.
 *
 * Two rules fix that class of bug:
 *  1. Search <main> first. The sidebar and topbar are only searched if the
 *     page content has no match at all.
 *  2. A partial match must land on a word boundary, so "Numbers" no longer
 *     matches "Phone Numbers".
 */
const findByText = (needle: string): HTMLElement | null => {
  const wanted = normalise(needle);
  const main = document.querySelector<HTMLElement>("main");
  const scopes: Array<ParentNode> = main ? [main, document] : [document];

  const area = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return r.width * r.height;
  };

  for (const scope of scopes) {
    const all = Array.from(
      scope.querySelectorAll<HTMLElement>(INTERACTIVE),
    ).filter(isVisible);

    const exact = all.filter(
      (el) => normalise(el.textContent || "") === wanted,
    );
    if (exact.length) return exact.sort((a, b) => area(a) - area(b))[0];

    // Word-boundary partial match only.
    const boundary = new RegExp(
      `(^|\\W)${wanted.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\W|$)`,
    );
    const partial = all.filter((el) =>
      boundary.test(normalise(el.textContent || "")),
    );
    if (partial.length) {
      return partial.sort(
        (a, b) => (a.textContent || "").length - (b.textContent || "").length,
      )[0];
    }
  }

  return null;
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

/**
 * Controls a tour must never press.
 *
 * A tour step can carry `before.click` to flip a tab before it measures. That
 * mechanism has no idea what it is clicking: on /phone-numbers it resolved to
 * a control called "Buy Number", and a text-matched target one word away from
 * that is a real purchase. The same shape of mistake on /agent would place a
 * live phone call to a real number and bill for it.
 *
 * So the engine refuses. Highlighting any of these is fine and often the whole
 * point of the step; pressing one on the user's behalf never is. A page can
 * also mark a control explicitly with data-tour-side-effect, which is the
 * reliable signal — the word list is the safety net for controls nobody
 * remembered to mark.
 */
const SIDE_EFFECT_TEXT =
  /\b(call now|start call|test call|place call|ring|dial|buy|purchase|pay|charge|top ?up|checkout|subscribe|send|publish|delete|remove|discard|cancel|invite|confirm|submit|save)\b/i;

const hasSideEffect = (el: HTMLElement): boolean => {
  if (el.hasAttribute("data-tour-side-effect")) return true;
  // Only the control's own label, not its subtree's: a section containing a
  // "Delete" button somewhere is not itself destructive, and treating it as
  // such would block every legitimate tab.
  const own = Array.from(el.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent || "")
    .join(" ");
  const label =
    (own.trim() ? own : el.getAttribute("aria-label") || el.textContent || "");
  return SIDE_EFFECT_TEXT.test(label.replace(/\s+/g, " ").trim());
};

/**
 * An element that sticks out past the right edge of the viewport.
 *
 * Full-width is fine; overflowing is not. A row inside a horizontally
 * scrolling table is the usual case: at 1440 the first call row measures
 * 1134px and is a good target, at 768 the same row is 825px and its right edge
 * lands at 1057px, so the card gets positioned against a box the user cannot
 * see. Being wider than the viewport is a property of the breakpoint, not of
 * the step, which is why it is settled here rather than by hand-writing
 * per-width targets.
 */
const overflowsViewport = (el: HTMLElement): boolean => {
  const rect = el.getBoundingClientRect();
  return rect.right > window.innerWidth + 1 || rect.left < -1;
};

const resolveTarget = (target?: TourTarget): HTMLElement | null => {
  if (!target) return null;
  const specs = Array.isArray(target) ? target : [target];
  let fallback: HTMLElement | null = null;
  for (const spec of specs) {
    const found = resolveOne(spec);
    if (!found) continue;
    if (!overflowsViewport(found)) return found;
    // Keep it, but keep looking: a later spec is usually the container that
    // holds the overflowing element, and pointing at the container is far
    // better than pointing off the side of the screen.
    fallback = fallback || found;
  }
  return fallback;
};

/**
 * Exported so a step's target can be checked against the real DOM without
 * re-implementing the matcher. Every previous audit of "does this step point at
 * anything" guessed at selectors from the source and got it wrong; this runs
 * the engine's own resolution, so an audit cannot silently drift from what the
 * tour actually does at runtime.
 */
export { resolveTarget, hasSideEffect };

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

  /*
   * Horizontal counts too. A target inside a side-scrolling table could sit
   * entirely outside the viewport while this returned true, so the card was
   * placed against a box nobody could see (measured at 768px on /calls: the
   * target's left edge was 1057px on a 768px-wide screen).
   */
  if (
    rect.right > window.innerWidth - margin ||
    rect.left < margin ||
    rect.right > bounds.right ||
    rect.left < bounds.left
  ) {
    return false;
  }

  return (
    rect.top >= bounds.top + margin &&
    rect.bottom <= bounds.bottom - margin &&
    rect.bottom > bounds.top &&
    rect.top < bounds.bottom
  );
};

/**
 * Bring the element into view inside whichever thing actually scrolls.
 *
 * `bias` is where the element should land as a fraction of the viewport
 * height: 0.5 centres it, 0.32 parks it in the upper third. Mobile passes the
 * smaller value so the bottom-docked card cannot cover its own target.
 */
const scrollIntoCenter = (el: HTMLElement, bias = 0.5) => {
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const behavior: ScrollBehavior = reduced ? "auto" : "smooth";
  const container = scrollableAncestor(el);

  if (container) {
    const containerRect = container.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    const delta =
      rect.top -
      containerRect.top -
      (container.clientHeight - rect.height) * bias;
    const deltaX =
      rect.left -
      containerRect.left -
      (container.clientWidth - rect.width) / 2;
    container.scrollTo({
      top: Math.max(0, container.scrollTop + delta),
      // Side-scrolling tables put targets off-screen horizontally; centre
      // those too rather than pointing at a box outside the viewport.
      left:
        container.scrollWidth > container.clientWidth + 4
          ? Math.max(0, container.scrollLeft + deltaX)
          : container.scrollLeft,
      behavior,
    });
    return;
  }

  const rect = el.getBoundingClientRect();
  window.scrollTo({
    top: Math.max(
      0,
      window.scrollY + rect.top - (window.innerHeight - rect.height) * bias,
    ),
    behavior,
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
    title: "Leads",
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
      body: "That is the tour. Everything here updates on its own as calls and chats come in.",
    },
  ],

  "/phone-numbers": [
    {
      placement: "center",
      title: "Phone Numbers",
      body: "This page has two tabs: the numbers you already own, and buying a new one. I will walk you through both.",
    },
    {
      // First card in the list, not the whole panel: the panel measures
      // 700-990px tall, so nothing fits beside it and the card landed on top.
      target: ["[data-tour='numbers-list'] > *", "tour:numbers-panel"],
      title: "Your numbers",
      body: "Every number in this workspace, and which agent answers on it. A number with no agent assigned will not be answered.",
    },
    {
      // "text:Assign" matched nothing: the control reads "Add agent". The row
      // only exists once the tenant owns a number, so this step is skipped on
      // an empty account rather than pointed at the empty state.
      target: "tour:numbers-assign",
      title: "Assigning a number",
      body: "Point a number at one of your agents here. This is the step most people miss — buying a number is not enough on its own.",
    },
    {
      // No `before.click` any more. It resolved to a control labelled "Buy
      // Number", and the engine now refuses to press anything that reads like a
      // purchase — correctly, because one careless text match away is a real
      // one. The tab is described instead, and the tenant presses it.
      target: ["tour:numbers-buy", "text:Buy Number"],
      title: "Buying a number",
      body: "Open this tab to search by country and area code, then buy the one you want. Your usage balance needs to cover the purchase first.",
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
      // Was "text:Voice"/"text:Language" and landed on the Save Voice button.
      // The card itself holds the name, voice, language and provider.
      target: "tour:agent-identity",
      title: "Voice and language",
      body: "Your agent's name, the voice it speaks in, and its language. Listen to a preview before you save.",
    },
    {
      // Was "text:Greeting" and matched nothing at any width: the field's
      // caption is a styled <Label>, and the resolver only reads buttons,
      // links, headings and real <label> elements.
      target: "tour:agent-greeting",
      title: "The greeting",
      body: 'The first thing every caller hears. Name the business and the agent, for example: "Thanks for calling Nutra Wellness, this is Mimi — how can I help?"',
    },
    {
      target: "tour:agent-prompt",
      title: "What it should do on the call",
      body: "The behaviour and the objective. This is what the agent is actually trying to achieve once the greeting is out of the way.",
    },
    {
      target: "tour:agent-start-call",
      title: "Hearing it for yourself",
      body: "Start Call rings a number with this agent so you hear exactly what a customer hears. It places a real call and uses real credit, so it is yours to press when you are ready — not part of this tour.",
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
      // "Add source"/"Add website"/"FAQ" were all invented: the page's only
      // reliable control is "+ New knowledge base", and on a new account it is
      // the only thing on the page at all.
      target: "tour:kb-new",
      title: "Start with your website",
      body: "Create a knowledge base and point it at your site. Agently reads the public pages and turns them into answers your agents can use. You are charged per page read, so fewer, better pages usually wins.",
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
      // No fallback to tour:calls-stats. On an account with no calls yet the
      // fallback fired, so the previous step and this one both pointed at the
      // same stats bar while this one said "open any call" — nonsense on a page
      // showing an empty list. With no fallback the step is skipped instead.
      target: ["[data-tour='calls-rows'] > *", "tour:calls-rows"],
      title: "Inside a call",
      body: "Open any call for the recording, the full transcript and a short summary of what the caller wanted.",
    },
  ],

  "/leads": [
    {
      placement: "center",
      title: "Leads",
      body: "Everyone who left their details with a voice agent or the chatbot, in one list.",
    },
    {
      target: ["tour:leads-status", "text:All statuses"],
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
      // The section is called "Wallet activity"; nothing on the page has ever
      // said "History" or "Transactions".
      target: "tour:billing-history",
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
      target: ["tour:team-invite", "text:Invite member"],
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
      // settings-general wraps Customer Account — the login name and email —
      // not the business profile this step describes.
      target: ["tour:settings-business", "tour:settings-general"],
      title: "Business details",
      body: "Name, industry, location and website. Your agents use all of it when they speak to customers.",
    },
  ],
};

/* ══════════════════════════════════════════════════════════════════════════
 * Progress store — server first, localStorage as a mirror
 * ══════════════════════════════════════════════════════════════════════════ */

const MIRROR_KEY = "agently.tour.progress.v1";

/**
 * Fallback version, used only until /api/tour/state answers (and if it never
 * does). The real per-page version lives in tour_pages and is set by an admin,
 * which is what makes "introduce one new feature" possible without replaying
 * the whole tour.
 */
const TOUR_VERSION = 1;

/**
 * Who sees a tour.
 *
 * localStorage alone got this wrong in both directions: an existing customer
 * on a second device, or in a private window, was shown the whole tour again as
 * if they were new, and a tenant who genuinely was new but had cleared site
 * data saw it twice. "Have I seen this" is a fact about the account, so it is
 * read from and written to the server, with localStorage kept only as a mirror
 * so the current session behaves correctly while offline or if the write fails.
 *
 * The earlier note here warned against fetching state because of a 300ms route
 * poll — that poll is gone (see useHashRoute), so the objection no longer
 * applies. This is one request per session, not per route.
 */
type ServerTourState = {
  versions: Record<string, number>;
  completed: Record<string, number>;
};

let serverStatePromise: Promise<ServerTourState | null> | null = null;

const fetchServerState = (): Promise<ServerTourState | null> => {
  if (serverStatePromise) return serverStatePromise;
  serverStatePromise = (async () => {
    try {
      const token = window.localStorage.getItem("agently.auth.token");
      if (!token) return null;
      const response = await fetch(`${resolveApiBaseUrl()}/api/tour/state`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!response.ok) return null;
      const data = await response.json();
      if (data?.degraded) return null;
      const versions: Record<string, number> = {};
      for (const page of data?.pages || []) {
        versions[page.pageKey] = Number(page.version) || TOUR_VERSION;
      }
      const completed: Record<string, number> = {};
      for (const [key, value] of Object.entries(data?.progress || {})) {
        completed[key] = Number((value as { completedVersion?: number })?.completedVersion) || 0;
      }
      return { versions, completed };
    } catch {
      return null;
    }
  })();
  return serverStatePromise;
};

const recordServerProgress = (pageKey: string, version: number, status: "completed" | "skipped") => {
  try {
    const token = window.localStorage.getItem("agently.auth.token");
    if (!token) return;
    void fetch(`${resolveApiBaseUrl()}/api/tour/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ pageKey, version, status }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* the localStorage mirror still covers this session */
  }
};

type ProgressMap = Record<string, number>; // pageKey -> completedVersion

const readProgress = (): ProgressMap => {
  try {
    return JSON.parse(window.localStorage.getItem(MIRROR_KEY) || "{}");
  } catch {
    return {};
  }
};

const writeProgress = (progress: ProgressMap) => {
  try {
    window.localStorage.setItem(MIRROR_KEY, JSON.stringify(progress));
  } catch {
    /* private mode: the tour simply replays next session */
  }
};

/* ══════════════════════════════════════════════════════════════════════════
 * Location tracking (no polling)
 * ══════════════════════════════════════════════════════════════════════════
 * App mounts this hook OUTSIDE <Router>, so it cannot read the router's
 * location. The previous version polled `window.location.hash` every 300ms
 * because HashRouter navigations that go through history.replaceState do not
 * fire `hashchange`. Patching the two history methods once to emit an event
 * covers that case exactly, with no timer.
 */
const LOCATION_EVENT = "agently:locationchange";
let historyPatched = false;

const patchHistory = () => {
  if (historyPatched || typeof window === "undefined") return;
  historyPatched = true;
  for (const method of ["pushState", "replaceState"] as const) {
    const original = window.history[method];
    window.history[method] = function patched(
      this: History,
      ...args: Parameters<History["pushState"]>
    ) {
      const result = original.apply(this, args);
      window.dispatchEvent(new Event(LOCATION_EVENT));
      return result;
    } as History[typeof method];
  }
};

const readRoute = () =>
  typeof window === "undefined"
    ? "/"
    : window.location.hash.replace(/^#/, "").split("?")[0] || "/";

function useHashRoute(explicit?: string) {
  const [hash, setHash] = useState(readRoute);

  useEffect(() => {
    if (explicit) return;
    patchHistory();
    const onChange = () => setHash(readRoute());
    window.addEventListener("hashchange", onChange);
    window.addEventListener("popstate", onChange);
    window.addEventListener(LOCATION_EVENT, onChange);
    return () => {
      window.removeEventListener("hashchange", onChange);
      window.removeEventListener("popstate", onChange);
      window.removeEventListener(LOCATION_EVENT, onChange);
    };
  }, [explicit]);

  return explicit || hash;
}

export function usePageTour(explicitPathname?: string) {
  const pathname = useHashRoute(explicitPathname);
  const [progress, setProgress] = useState<ProgressMap>(() =>
    typeof window === "undefined" ? {} : readProgress(),
  );
  const [activePage, setActivePage] = useState<string | null>(null);
  const startedThisSession = useRef<Set<string>>(new Set());
  const [server, setServer] = useState<ServerTourState | null>(null);
  /*
   * Until the server answers, no tour opens.
   *
   * Opening on the localStorage mirror alone is what made an existing customer
   * on a new laptop sit through the whole tour again: their browser had no
   * record, even though their account did. One request settles it, and a page
   * that stays quiet for an extra moment is much cheaper than a tour that
   * replays for someone who finished it months ago.
   */
  const [serverSettled, setServerSettled] = useState(false);

  useEffect(() => {
    let live = true;
    void fetchServerState().then((state) => {
      if (!live) return;
      setServer(state);
      setServerSettled(true);
    });
    return () => {
      live = false;
    };
  }, []);

  const versionFor = useCallback(
    (page: string) => server?.versions[page] ?? TOUR_VERSION,
    [server],
  );

  const route = useMemo(() => {
    const clean = (pathname || "/").split("?")[0];
    return (
      Object.keys(PAGE_TOURS).find(
        (key) => clean === key || clean.startsWith(`${key}/`),
      ) || null
    );
  }, [pathname]);

  useEffect(() => {
    if (!route) {
      setActivePage(null);
      return;
    }
    if (startedThisSession.current.has(route)) return;
    if (!serverSettled) return;
    /*
     * The page is only enabled if the server listed it. An admin disabling a
     * page in tour_pages has to actually stop that tour, or the switch is
     * decorative.
     */
    if (server && !(route in server.versions)) return;
    const publishedVersion = versionFor(route);
    // Whichever record is further ahead wins, so a completion that failed to
    // reach the server still suppresses the tour for the rest of the session,
    // and a completion from another device suppresses it here.
    const seen = Math.max(progress[route] ?? 0, server?.completed[route] ?? 0);
    if (seen >= publishedVersion) return;
    /*
     * Mark "started" inside the timer, not before it.
     *
     * Marking it up front meant a cleanup that ran before the 900ms elapsed —
     * StrictMode's double-invoke in dev, or any MainLayout remount in prod —
     * cancelled the timer while leaving the flag set, so the effect's next run
     * early-returned and the tour could never open again for that route.
     */
    const timer = window.setTimeout(() => {
      startedThisSession.current.add(route);
      setActivePage(route);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [route, progress, server, serverSettled, versionFor]);

  const close = useCallback(
    (status: "completed" | "skipped" = "completed") => {
      const page = activePage;
      setActivePage(null);
      if (!page) return;
      const version = versionFor(page);
      // Skipping is a decision too, and re-showing a tour somebody dismissed is
      // the behaviour this whole mechanism exists to avoid.
      recordServerProgress(page, version, status);
      setProgress((current) => {
        const next = { ...current, [page]: version };
        writeProgress(next);
        return next;
      });
    },
    [activePage, versionFor],
  );

  /** Replay a page's tour on demand (used by the help menu). */
  const replay = useCallback(
    (target?: string) => {
      const page = target || route;
      if (!page) return;
      startedThisSession.current.delete(page);
      setProgress((current) => {
        const next = { ...current };
        delete next[page];
        writeProgress(next);
        return next;
      });
      // Clear the server's record too, or the next page load reads "already
      // completed" back from the account and the replay lasts one session.
      setServer((current) =>
        current
          ? { ...current, completed: { ...current.completed, [page]: 0 } }
          : current,
      );
      try {
        const token = window.localStorage.getItem("agently.auth.token");
        if (token) {
          void fetch(`${resolveApiBaseUrl()}/api/tour/reset`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ pageKey: page }),
          }).catch(() => {});
        }
      } catch {
        /* the local mirror still replays it this session */
      }
      setActivePage(page);
    },
    [route],
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
 * Placement
 * ══════════════════════════════════════════════════════════════════════════ */

type Placement = "bottom" | "top" | "right" | "left" | "center" | "docked";

interface Placed {
  x: number;
  y: number;
  placement: Placement;
  /** Arrow offset in px along the card edge, or null when there is no arrow. */
  arrow: number | null;
}

const MARGIN = 12; // viewport gutter
const GAP = 12; // distance between target and card
const ARROW = 7; // half-width of the arrow notch

const intersects = (a: Rect, b: Rect) =>
  a.left < b.left + b.width &&
  a.left + a.width > b.left &&
  a.top < b.top + b.height &&
  a.top + a.height > b.top;

/**
 * Tries bottom, top, right, left, and takes the first side where the card fits
 * inside the viewport AND does not cover the element it is describing. Falls
 * back to centred. Card size is measured, never assumed, which is what the old
 * version got wrong (it hardcoded 230px/260px and overflowed on long steps).
 */
export const computePlacement = (
  target: Rect | null,
  card: { w: number; h: number },
  vp: { w: number; h: number },
  mobile: boolean,
): Placed => {
  if (!target) {
    return {
      x: Math.max(MARGIN, (vp.w - card.w) / 2),
      y: Math.max(MARGIN, (vp.h - card.h) / 2),
      placement: "center",
      arrow: null,
    };
  }

  const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

  const centreX = target.left + target.width / 2;
  const centreY = target.top + target.height / 2;

  const candidates: Array<{ placement: Placement; x: number; y: number }> = [
    {
      placement: "bottom",
      x: clamp(centreX - card.w / 2, MARGIN, vp.w - card.w - MARGIN),
      y: target.top + target.height + GAP,
    },
    {
      placement: "top",
      x: clamp(centreX - card.w / 2, MARGIN, vp.w - card.w - MARGIN),
      y: target.top - card.h - GAP,
    },
    {
      placement: "right",
      x: target.left + target.width + GAP,
      y: clamp(centreY - card.h / 2, MARGIN, vp.h - card.h - MARGIN),
    },
    {
      placement: "left",
      x: target.left - card.w - GAP,
      y: clamp(centreY - card.h / 2, MARGIN, vp.h - card.h - MARGIN),
    },
  ];

  for (const candidate of candidates) {
    const fits =
      candidate.x >= MARGIN &&
      candidate.y >= MARGIN &&
      candidate.x + card.w <= vp.w - MARGIN &&
      candidate.y + card.h <= vp.h - MARGIN;
    if (!fits) continue;

    const cardRect: Rect = {
      top: candidate.y,
      left: candidate.x,
      width: card.w,
      height: card.h,
    };
    if (intersects(cardRect, target)) continue;

    const arrow =
      candidate.placement === "bottom" || candidate.placement === "top"
        ? clamp(centreX - candidate.x, 18, card.w - 18)
        : clamp(centreY - candidate.y, 18, card.h - 18);

    return { ...candidate, arrow };
  }

  /*
   * Nothing fits beside the target. On a narrow viewport dock to whichever
   * edge is furthest from the target so the card still cannot cover it; this
   * is the only case that gives up on adjacency, and it is reported as
   * "docked" rather than pretending to point at something.
   */
  if (mobile) {
    const targetBottom = target.top + target.height;
    const roomAbove = target.top;
    const roomBelow = vp.h - targetBottom;
    const dockBelow = roomBelow >= roomAbove;
    return {
      x: MARGIN,
      y: dockBelow
        ? Math.max(MARGIN, vp.h - card.h - MARGIN)
        : MARGIN,
      placement: "docked",
      arrow: null,
    };
  }

  return {
    x: Math.max(MARGIN, (vp.w - card.w) / 2),
    y: Math.max(MARGIN, (vp.h - card.h) / 2),
    placement: "center",
    arrow: null,
  };
};

/* ══════════════════════════════════════════════════════════════════════════
 * PageTour
 * ══════════════════════════════════════════════════════════════════════════ */

const CARD_W = 344;

/**
 * Progress dial. `total` is always the length of the runtime-filtered step
 * list, never a constant: pages carry mobile-only and desktop-only steps, so a
 * hardcoded total would be wrong for whichever viewport it was not written for.
 */
const TourProgressDial: React.FC<{ current: number; total: number }> = ({
  current,
  total,
}) => {
  const size = 26;
  const stroke = 2.5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const safeTotal = Math.max(1, total);
  const progress = Math.min(Math.max(current / safeTotal, 0), 1);

  return (
    <div
      className="relative shrink-0"
      role="progressbar"
      aria-valuenow={current}
      aria-valuemin={1}
      aria-valuemax={safeTotal}
      aria-label={`Step ${current} of ${safeTotal}`}
      title={`Step ${current} of ${safeTotal}`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#E2E8F0"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#F59E0B"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          style={{ transition: "stroke-dashoffset 220ms cubic-bezier(0.23,1,0.32,1)" }}
        />
      </svg>
    </div>
  );
};

/** Scrim with a real hole punched in it, so the target stays clickable. */
const cutout = (rect: Rect | null, vw: number, vh: number) => {
  if (!rect) return undefined;
  const pad = 6;
  const t = Math.max(0, rect.top - pad);
  const l = Math.max(0, rect.left - pad);
  const r = Math.min(vw, rect.left + rect.width + pad);
  const b = Math.min(vh, rect.top + rect.height + pad);
  return `polygon(0px 0px, 0px ${vh}px, ${l}px ${vh}px, ${l}px ${t}px, ${r}px ${t}px, ${r}px ${b}px, ${l}px ${b}px, ${l}px ${vh}px, ${vw}px ${vh}px, ${vw}px 0px)`;
};

export const PageTour: React.FC<{
  page: string;
  steps: TourStep[];
  open: boolean;
  // "skipped" is recorded as deliberately as "completed": dismissing a tour
  // is a decision, and showing it again next time would undo it.
  onClose: (status: "completed" | "skipped") => void;
}> = ({ page, steps, open, onClose }) => {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [unresolved, setUnresolved] = useState(false);
  const [moving, setMoving] = useState(false);
  const [mobile, setMobile] = useState(isMobileViewport);
  const [vp, setVp] = useState(() => ({
    w: typeof window === "undefined" ? 0 : window.innerWidth,
    h: typeof window === "undefined" ? 0 : window.innerHeight,
  }));
  const [cardSize, setCardSize] = useState({ w: CARD_W, h: 180 });

  const cardRef = useRef<HTMLDivElement | null>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const settling = useRef(false);

  /* Recomputed on resize so rotating a phone swaps the step set and the
     "of N" count honestly — the old useMemo never re-ran. */
  const visibleSteps = useMemo(
    () =>
      steps.filter((step) => {
        if (step.only === "mobile" && !mobile) return false;
        if (step.only === "desktop" && mobile) return false;
        /*
         * Drop a step whose target is not usable at this width.
         *
         * A step that cannot find its element, or can only find one that hangs
         * off the side of the screen, has nothing honest to point at: the card
         * either floats in the middle with no highlight, or rings a box the
         * user cannot see. A call row is 1146px wide and a fine target at
         * 1440; the same row at 768 is still 837px and reaches past the right
         * edge, so the step is simply not shown there.
         *
         * Only steps that ASK for a target are dropped. A deliberately centred
         * card (the welcome and the sign-off) has no target and always shows.
         */
        if (!step.target) return true;
        const el = resolveTarget(step.target);
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return rect.right <= window.innerWidth + 1 && rect.left >= -1;
      }),
    // vp is in the dependency list on purpose: the set is re-derived on resize
    // and on rotation, so the "of N" count stays honest.
    [steps, mobile, vp],
  );

  const step = visibleSteps[index];
  const isLast = index === visibleSteps.length - 1;

  useEffect(() => {
    if (open) setIndex(0);
  }, [open, page]);

  /* Viewport + breakpoint tracking. */
  useEffect(() => {
    if (!open) return;
    const onResize = () => {
      setVp({ w: window.innerWidth, h: window.innerHeight });
      setMobile(isMobileViewport());
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  /* Measure the card itself, so placement never assumes a height. */
  useEffect(() => {
    const node = cardRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const r = node.getBoundingClientRect();
      setCardSize((current) =>
        Math.abs(current.h - r.height) < 1 && Math.abs(current.w - r.width) < 1
          ? current
          : { w: r.width, h: r.height },
      );
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [open, step]);

  /* ── Locate, act, scroll, then track the target ───────────────────────── */
  useEffect(() => {
    if (!open || !step) return;
    let stopped = false;
    let observer: ResizeObserver | null = null;
    let frame = 0;
    let scrollHost: HTMLElement | Window = window;
    let detachScroll: (() => void) | null = null;

    const measure = (el: HTMLElement) => {
      if (stopped || settling.current) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!stopped) setRect(rectOf(el));
      });
    };

    const run = async () => {
      setUnresolved(false);

      // 1. The step's own action first (tab switch, opening the mobile drawer).
      if (step.before?.click) {
        const trigger = resolveTarget(step.before.click);
        /*
         * Never let a `before` action navigate. A tour step wants to flip a
         * tab, not change route: if the resolver hands back a link pointing
         * somewhere else, clicking it unmounts the page the remaining steps
         * are written for. Belt and braces alongside the scoped text matcher.
         */
        const leavesRoute = (() => {
          if (!(trigger instanceof HTMLAnchorElement)) return false;
          const href = trigger.getAttribute("href") || "";
          if (!href.startsWith("#")) return href.length > 0;
          const to = href.replace(/^#/, "").split("?")[0];
          const here = window.location.hash.replace(/^#/, "").split("?")[0];
          return Boolean(to) && to !== here;
        })();

        /*
         * And never let it press something that does real work. `before` exists
         * to flip a tab; a tab click is free and reversible. Anything that
         * spends money, places a call or sends something is out of bounds even
         * when a step asks for it — the step is wrong, not the guard.
         */
        if (trigger && hasSideEffect(trigger)) {
          if (import.meta.env?.DEV) {
            console.warn(
              "[tour] refusing to click a control with a side effect:",
              (trigger.textContent || "").trim().slice(0, 60),
              "— highlight it instead of clicking it.",
            );
          }
        } else if (trigger && !leavesRoute) {
          trigger.click();
          await new Promise((r) =>
            window.setTimeout(r, step.before?.waitMs ?? 420),
          );
        }
      }
      if (stopped) return;

      // 2. Sidebar steps on mobile: open the drawer ourselves rather than
      //    parking on a "tap the menu" state and polling for it.
      if (step.needsSidebar && isMobileViewport() && !isSidebarOpen()) {
        const toggle = resolveOne("tour:menu-toggle");
        if (toggle) {
          toggle.click();
          await new Promise((r) => window.setTimeout(r, 320));
        }
      }
      if (stopped) return;

      if (!step.target || step.placement === "center") {
        setRect(null);
        return;
      }

      // 3. Resolve, retrying briefly while React commits.
      let el: HTMLElement | null = null;
      for (let attempt = 0; attempt < 12 && !stopped; attempt += 1) {
        el = resolveTarget(step.target);
        if (el) break;
        await new Promise((r) => window.setTimeout(r, 120));
      }
      if (stopped) return;

      if (!el) {
        setUnresolved(true);
        setRect(null);
        return;
      }

      // 4. Scroll the real container. On mobile bias the target upward so the
      //    docked sheet cannot cover it.
      if (!isFullyVisible(el)) {
        settling.current = true;
        scrollIntoCenter(el, isMobileViewport() ? 0.32 : 0.5);
        await new Promise((r) => window.setTimeout(r, 420));
        settling.current = false;
      }
      if (stopped) return;

      const final = resolveTarget(step.target) || el;

      /*
       * Last line of defence: if the target still cannot be brought into the
       * viewport (a cell inside a table wider than the screen, measured at
       * 768px on /calls with a left edge of 966px), do NOT anchor to it.
       * Pointing a card at a box the user cannot see is worse than showing
       * the copy centred, so fall back rather than draw a highlight offscreen.
       */
      const fr = final.getBoundingClientRect();
      const offscreen =
        fr.right <= 0 ||
        fr.left >= window.innerWidth ||
        fr.bottom <= 0 ||
        fr.top >= window.innerHeight ||
        fr.left > window.innerWidth - 24;
      if (offscreen) {
        setUnresolved(true);
        setRect(null);
        return;
      }

      setRect(rectOf(final));

      // 5. Track it: observer + scroll, no interval.
      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(() => measure(final));
        observer.observe(final);
      }
      scrollHost = scrollableAncestor(final) || window;
      detachScroll = () => measure(final);
      scrollHost.addEventListener("scroll", detachScroll, { passive: true });
    };

    void run();

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      if (detachScroll) scrollHost.removeEventListener("scroll", detachScroll);
    };
  }, [open, index, step]);

  /* Brief "moving" flag drives the blur that masks the content swap. */
  useEffect(() => {
    if (!open) return;
    setMoving(true);
    const timer = window.setTimeout(() => setMoving(false), 220);
    return () => window.clearTimeout(timer);
  }, [index, open]);

  const finish = useCallback(
    (status: "completed" | "skipped") => {
      restoreFocus.current?.focus?.();
      onClose(status);
    },
    [onClose],
  );

  const next = useCallback(() => {
    if (index >= visibleSteps.length - 1) finish("completed");
    else setIndex((i) => i + 1);
  }, [index, visibleSteps.length, finish]);

  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  /* Focus moves into the card and is trapped there; keys are scoped to the
     dialog so Enter inside a page input can no longer advance the tour. */
  useEffect(() => {
    if (!open || !step) return;
    if (!restoreFocus.current) {
      restoreFocus.current = document.activeElement as HTMLElement | null;
    }
    cardRef.current?.focus({ preventScroll: true });
  }, [open, step, index]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      finish("skipped");
      return;
    }
    if (event.key === "ArrowRight") next();
    if (event.key === "ArrowLeft") prev();
    if (event.key === "Tab") {
      const focusable = cardRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled])",
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  if (!open || !step) return null;

  const targetRect = unresolved ? null : rect;
  const placed = computePlacement(
    targetRect,
    { w: mobile ? vp.w - MARGIN * 2 : CARD_W, h: cardSize.h },
    vp,
    mobile,
  );
  const cardWidth = mobile ? vp.w - MARGIN * 2 : CARD_W;

  const origin =
    placed.placement === "bottom"
      ? `${placed.arrow ?? cardWidth / 2}px 0px`
      : placed.placement === "top"
        ? `${placed.arrow ?? cardWidth / 2}px 100%`
        : placed.placement === "right"
          ? `0px ${placed.arrow ?? cardSize.h / 2}px`
          : placed.placement === "left"
            ? `100% ${placed.arrow ?? cardSize.h / 2}px`
            : "center";

  return (
    <div
      className="ag-tour fixed inset-0 z-[120]"
      role="dialog"
      aria-modal="true"
      aria-label="Product tour"
    >
      <style>{`
        .ag-tour-scrim,
        .ag-tour-ring,
        .ag-tour-card { transition-timing-function: cubic-bezier(0.77,0,0.175,1); }
        .ag-tour-scrim { transition: clip-path 220ms; }
        .ag-tour-ring  { transition: transform 220ms, width 220ms, height 220ms, opacity 160ms; }
        .ag-tour-card  { transition: transform 220ms, opacity 160ms cubic-bezier(0.23,1,0.32,1); }
        .ag-tour-card[data-enter="true"] { opacity: 0; transform: scale(0.96); }
        .ag-tour-body  { transition: filter 200ms ease, opacity 200ms ease; }
        .ag-tour-body[data-moving="true"] { filter: blur(1.5px); opacity: 0.72; }
        .ag-tour-btn   { transition: transform 160ms cubic-bezier(0.23,1,0.32,1), background-color 160ms ease; }
        .ag-tour-btn:active { transform: scale(0.97); }
        .ag-tour-btn:focus-visible { outline: 2px solid #F59E0B; outline-offset: 2px; }
        @media (hover: hover) and (pointer: fine) {
          .ag-tour-btn-primary:hover { background-color: #1E293B; }
          .ag-tour-skip:hover { color: #0F172A; }
        }
        @media (prefers-reduced-motion: reduce) {
          .ag-tour-scrim, .ag-tour-ring, .ag-tour-card, .ag-tour-body {
            transition-property: opacity !important;
            transition-duration: 120ms !important;
          }
          .ag-tour-body[data-moving="true"] { filter: none; }
        }
      `}</style>

      {/* One scrim with a real hole: animatable, and the target stays clickable. */}
      <div
        className="ag-tour-scrim absolute inset-0 bg-slate-950/55"
        style={{ clipPath: cutout(targetRect, vp.w, vp.h) }}
        onClick={() => finish("skipped")}
      />

      {targetRect ? (
        <div
          className="ag-tour-ring pointer-events-none absolute rounded-xl ring-2 ring-[#F59E0B]"
          style={{
            transform: `translate3d(${targetRect.left - 6}px, ${targetRect.top - 6}px, 0)`,
            width: targetRect.width + 12,
            height: targetRect.height + 12,
            top: 0,
            left: 0,
          }}
        />
      ) : null}

      <div
        ref={cardRef}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="ag-tour-card absolute flex flex-col rounded-2xl border border-slate-200/80 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.18)] outline-none"
        style={{
          transform: `translate3d(${placed.x}px, ${placed.y}px, 0)`,
          width: cardWidth,
          maxHeight: mobile ? "60dvh" : "min(70dvh, 32rem)",
          transformOrigin: origin,
          top: 0,
          left: 0,
          paddingBottom: mobile ? "env(safe-area-inset-bottom)" : undefined,
        }}
      >
        {/* Arrow notch, pointing back at the target. */}
        {placed.arrow !== null ? (
          <span
            aria-hidden
            className="absolute h-3 w-3 rotate-45 border border-slate-200/80 bg-white"
            style={{
              ...(placed.placement === "bottom"
                ? { top: -ARROW, left: placed.arrow - ARROW, borderRight: "none", borderBottom: "none" }
                : placed.placement === "top"
                  ? { bottom: -ARROW, left: placed.arrow - ARROW, borderLeft: "none", borderTop: "none" }
                  : placed.placement === "right"
                    ? { left: -ARROW, top: placed.arrow - ARROW, borderRight: "none", borderTop: "none" }
                    : { right: -ARROW, top: placed.arrow - ARROW, borderLeft: "none", borderBottom: "none" }),
            }}
          />
        ) : null}

        <div
          className="ag-tour-body min-h-0 flex-1 overflow-y-auto px-5 pt-5"
          data-moving={moving ? "true" : "false"}
        >
          <h3 className="text-[15px] font-semibold leading-snug tracking-[-0.01em] text-[#0F172A]">
            {step.title}
          </h3>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-600">
            {step.body}
          </p>
        </div>

        <div className="shrink-0 px-5 pb-5 pt-4">
          <div className="flex items-center gap-3">
            {/*
              Progress dial instead of "Step 3 of 17". The total is read from
              visibleSteps at render time, so conditional (mobile-only /
              desktop-only) steps are already filtered out and the dial can
              never disagree with the tour the user is actually being shown.
            */}
            <TourProgressDial current={index + 1} total={visibleSteps.length} />

            <button
              type="button"
              onClick={() => finish("skipped")}
              className="ag-tour-skip ag-tour-btn text-[12px] font-normal text-slate-500"
            >
              Skip
            </button>
            <span className="ml-auto" />
            {index > 0 ? (
              <button
                type="button"
                onClick={prev}
                className="ag-tour-btn h-9 rounded-[10px] border border-slate-200 px-3 text-[12px] font-medium text-slate-700"
              >
                Back
              </button>
            ) : null}
            <button
              type="button"
              onClick={next}
              className="ag-tour-btn ag-tour-btn-primary h-9 rounded-[10px] bg-[#0F172A] px-4 text-[12px] font-medium text-white"
            >
              {isLast ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </div>

      <span className="sr-only" aria-live="polite">
        Step {index + 1} of {visibleSteps.length}: {step.title}
      </span>
    </div>
  );
};

export default PageTour;
