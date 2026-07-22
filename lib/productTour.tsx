/**
 * agently/lib/productTour.tsx   <-- NEW FILE
 *
 * PATCH 13 — CURRENT_ISSUES → "LAST BUT NOT THE LEAST".
 *
 * LIBRARY CHOICE: Driver.js.
 *   You listed React Joyride, Driver.js and Shepherd.js. Driver.js is the right
 *   pick for this codebase specifically:
 *     - 5KB, zero dependencies. Joyride pulls react-floater + popper.
 *     - Renders outside React's tree, so it cannot fight Shell.tsx's sidebar
 *       state or your useTransition tab switching — Joyride's portal has known
 *       conflicts with transition-driven remounts, which Shell.tsx uses.
 *     - Fully styleable from CSS, so it matches your slate/amber system exactly.
 *     - Framework-agnostic: the same tour definitions will survive a future
 *       framework change.
 *
 *   INSTALL:  npm install driver.js
 *
 * DESIGN MATCHES YOUR SPEC
 *   Phase 1 — walk the SIDEBAR, one item at a time, summarising each section.
 *   Phase 2 — enter the DASHBOARD and walk it in steps, auto-scrolling to each
 *             region, with skip-to-next-phase available throughout.
 *   Both phases end with a "Watch the walkthrough" button (placeholder links).
 *   Shown to newly onboarded users, and re-shown when tourVersion is bumped.
 */

import { driver, type DriveStep, type Driver } from "driver.js";
import "driver.js/dist/driver.css";

/* ══════════════════════════════════════════════════════════════════════════
 * Theme — matches the existing slate/amber design system.
 * Inject once at app start.
 * ══════════════════════════════════════════════════════════════════════════ */
export const TOUR_STYLES = `
.driver-popover.agently-tour {
  background: #ffffff;
  border-radius: 1.35rem;
  border: 1px solid rgb(226 232 240);
  box-shadow: 0 20px 60px -12px rgba(15, 23, 42, 0.28);
  padding: 1.35rem 1.5rem;
  max-width: 22rem;
  font-family: inherit;
}
.driver-popover.agently-tour .driver-popover-title {
  font-size: 1rem;
  font-weight: 900;
  color: rgb(15 23 42);
  letter-spacing: -0.01em;
  margin-bottom: 0.4rem;
}
.driver-popover.agently-tour .driver-popover-description {
  font-size: 0.875rem;
  line-height: 1.6;
  color: rgb(100 116 139);
}
.driver-popover.agently-tour .driver-popover-progress-text {
  font-size: 0.625rem;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: rgb(148 163 184);
}
.driver-popover.agently-tour .driver-popover-next-btn {
  background: rgb(15 23 42);
  color: #fff;
  border: none;
  border-radius: 0.75rem;
  padding: 0.55rem 1.1rem;
  font-size: 0.625rem;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  text-shadow: none;
}
.driver-popover.agently-tour .driver-popover-next-btn:hover { background: rgb(217 119 6); }
.driver-popover.agently-tour .driver-popover-prev-btn {
  background: transparent;
  color: rgb(100 116 139);
  border: 1px solid rgb(226 232 240);
  border-radius: 0.75rem;
  padding: 0.55rem 1rem;
  font-size: 0.625rem;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  text-shadow: none;
}
.driver-popover.agently-tour .driver-popover-close-btn { color: rgb(148 163 184); }
.driver-popover.agently-tour .agently-tour-video {
  display: flex; align-items: center; gap: 0.5rem;
  margin-top: 1rem; padding-top: 0.9rem;
  border-top: 1px solid rgb(241 245 249);
  font-size: 0.75rem; font-weight: 800;
  color: rgb(217 119 6); text-decoration: none;
}
.driver-popover.agently-tour .agently-tour-video:hover { text-decoration: underline; }
.driver-active-element { border-radius: 0.9rem !important; }
`;

export function injectTourStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById("agently-tour-styles")) return;
  const el = document.createElement("style");
  el.id = "agently-tour-styles";
  el.textContent = TOUR_STYLES;
  document.head.appendChild(el);
}

/* ══════════════════════════════════════════════════════════════════════════
 * Video links. Placeholders for now, per your note.
 * Swap these for real URLs and nothing else needs to change.
 * ══════════════════════════════════════════════════════════════════════════ */
export const TOUR_VIDEOS: Record<string, string> = {
  phase1_sidebar: "https://example.com/agently/walkthrough/getting-started",
  phase2_dashboard: "https://example.com/agently/walkthrough/dashboard",
  phase3_phone_numbers: "https://example.com/agently/walkthrough/phone-numbers",
  phase4_knowledge: "https://example.com/agently/walkthrough/knowledge-base",
};

const videoFooter = (key: string) =>
  TOUR_VIDEOS[key]
    ? `<a class="agently-tour-video" href="${TOUR_VIDEOS[key]}" target="_blank" rel="noopener noreferrer">▶ Watch the walkthrough video</a>`
    : "";

/* ══════════════════════════════════════════════════════════════════════════
 * PHASE 1 — the sidebar, step by step
 *
 * REQUIRED MARKUP: add data-tour attributes to Shell.tsx nav items.
 *   <a data-tour="nav-dashboard">   <a data-tour="nav-phone-numbers"> etc.
 * Steps whose element is missing are skipped automatically, so a tenant
 * without a given feature never hits a dead step.
 * ══════════════════════════════════════════════════════════════════════════ */
export const PHASE_1_SIDEBAR: DriveStep[] = [
  {
    element: '[data-tour="nav-dashboard"]',
    popover: {
      title: "Dashboard",
      description:
        "Your daily view — calls handled, leads captured, and how much credit you've used.",
    },
  },
  {
    // Note: sits ABOVE Voice Agent after the Shell.tsx reorder in PATCH 08.
    element: '[data-tour="nav-phone-numbers"]',
    popover: {
      title: "Phone Numbers",
      description:
        "Buy a business number and connect it to an agent. Numbers activate automatically the moment you buy them.",
    },
  },
  {
    element: '[data-tour="nav-voice-agent"]',
    popover: {
      title: "Voice Agent",
      description:
        "Your agent's greeting, tone, transfer rules and what it should do when nobody is available.",
    },
  },
  {
    element: '[data-tour="nav-knowledge"]',
    popover: {
      title: "Knowledge Base",
      description:
        "Choose which pages of your website your agent learns from. More pages means smarter answers — and faster credit use.",
    },
  },
  {
    element: '[data-tour="nav-chatbot"]',
    popover: {
      title: "Chatbot",
      description:
        "Design the chat widget for your website — its voice, its languages, and whether it collects leads.",
    },
  },
  {
    element: '[data-tour="nav-leads"]',
    popover: {
      title: "Leads",
      description:
        "Everyone your agent spoke to, with their details and where they are in your pipeline.",
    },
  },
  {
    element: '[data-tour="nav-call-logs"]',
    popover: {
      title: "Call Logs",
      description:
        "Every call, with recordings and transcripts so you can hear exactly what was said.",
    },
  },
  {
    element: '[data-tour="nav-billing"]',
    popover: {
      title: "Billing",
      description: `Top up your wallet and see precisely what each service costs.${videoFooter(
        "phase1_sidebar",
      )}`,
    },
  },
];

/* ══════════════════════════════════════════════════════════════════════════
 * PHASE 2 — inside the dashboard, with auto-scroll
 * Add matching data-tour attributes in Dashboard.tsx.
 * ══════════════════════════════════════════════════════════════════════════ */
export const PHASE_2_DASHBOARD: DriveStep[] = [
  {
    element: '[data-tour="workspace-name"]',
    popover: {
      title: "Your workspace",
      description:
        "Everything here belongs to this business. Invite your team from Settings and they'll share it.",
    },
  },
  {
    element: '[data-tour="credit-balance"]',
    popover: {
      title: "Usage wallet",
      description:
        "Credit is deducted as your agents work — per call, per message and per page scanned. Top up before it runs out to avoid interruptions.",
    },
  },
  {
    element: '[data-tour="stat-cards"]',
    popover: {
      title: "Today at a glance",
      description:
        "Calls answered, leads captured and minutes used. These update live as calls come in.",
    },
  },
  {
    element: '[data-tour="calls-chart"]',
    popover: {
      title: "Call volume",
      description:
        "Spot your busy hours so you know when a human should be on standby for transfers.",
    },
  },
  {
    element: '[data-tour="recent-activity"]',
    popover: {
      title: "Recent activity",
      description: `Your latest calls and leads. Click any row to open the full transcript.${videoFooter(
        "phase2_dashboard",
      )}`,
    },
  },
];

/* ══════════════════════════════════════════════════════════════════════════
 * Runner
 * ══════════════════════════════════════════════════════════════════════════ */
export interface TourPhase {
  key: string;
  steps: DriveStep[];
  /** Route the tour must be on before the phase runs. */
  requiresRoute?: string;
}

export const TOUR_PHASES: TourPhase[] = [
  { key: "phase1_sidebar", steps: PHASE_1_SIDEBAR },
  { key: "phase2_dashboard", steps: PHASE_2_DASHBOARD, requiresRoute: "#/dashboard" },
];

export interface RunTourOptions {
  phases?: TourPhase[];
  /** Persist progress — see POST /api/tour/progress below. */
  onPhaseComplete?: (phaseKey: string) => void;
  onSkip?: (phaseKey: string, stepIndex: number) => void;
  onAllComplete?: () => void;
  navigate?: (route: string) => void;
}

export function runProductTour(options: RunTourOptions = {}): () => void {
  injectTourStyles();

  const phases = options.phases || TOUR_PHASES;
  let index = 0;
  let active: Driver | null = null;

  const startPhase = () => {
    const phase = phases[index];
    if (!phase) {
      options.onAllComplete?.();
      return;
    }

    if (phase.requiresRoute && options.navigate) {
      options.navigate(phase.requiresRoute);
    }

    // Drop steps whose target is not in the DOM — a hidden feature must never
    // produce an empty highlight box.
    const steps = phase.steps.filter((step) =>
      typeof step.element === "string"
        ? document.querySelector(step.element)
        : true,
    );

    if (!steps.length) {
      index += 1;
      startPhase();
      return;
    }

    // Route changes need a paint before elements exist.
    window.setTimeout(() => {
      active = driver({
        showProgress: true,
        progressText: "{{current}} of {{total}}",
        nextBtnText: "Next",
        prevBtnText: "Back",
        doneBtnText: index === phases.length - 1 ? "Finish" : "Next section",
        popoverClass: "agently-tour",
        // Auto-scroll each target into view, as you asked.
        smoothScroll: true,
        allowClose: true,
        overlayOpacity: 0.55,
        stagePadding: 6,
        stageRadius: 14,
        steps,
        onDestroyed: () => {
          const completedNaturally =
            active?.getActiveIndex() === steps.length - 1;
          if (completedNaturally) {
            options.onPhaseComplete?.(phase.key);
            index += 1;
            startPhase();
          } else {
            options.onSkip?.(phase.key, active?.getActiveIndex() ?? 0);
          }
        },
      });
      active.drive();
    }, phase.requiresRoute ? 350 : 0);
  };

  startPhase();
  return () => active?.destroy();
}

/* ══════════════════════════════════════════════════════════════════════════
 * React hook — auto-start for newly onboarded users
 * ══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useRef } from "react";

export const CURRENT_TOUR_VERSION = 1; // bump to re-show after shipping a feature

export function useProductTour({
  enabled,
  completedTours,
  onComplete,
  navigate,
}: {
  enabled: boolean;
  completedTours: Record<string, number>;
  onComplete: (phaseKey: string, version: number) => void;
  navigate?: (route: string) => void;
}) {
  const started = useRef(false);

  useEffect(() => {
    if (!enabled || started.current) return;

    const pending = TOUR_PHASES.filter(
      (phase) => (completedTours[phase.key] || 0) < CURRENT_TOUR_VERSION,
    );
    if (!pending.length) return;

    started.current = true;
    const stop = runProductTour({
      phases: pending,
      navigate,
      onPhaseComplete: (key) => onComplete(key, CURRENT_TOUR_VERSION),
      onSkip: (key) => onComplete(key, CURRENT_TOUR_VERSION),
    });
    return stop;
  }, [enabled, completedTours, onComplete, navigate]);
}

/* ══════════════════════════════════════════════════════════════════════════
 * REQUIRED COMPANION WORK
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 1. npm install driver.js
 *
 * 2. Add data-tour attributes to Shell.tsx nav items and Dashboard.tsx regions
 *    (the exact selector names are listed in each step above).
 *
 * 3. Backend — two small routes, backed by user_tour_progress
 *    (migration 001 Section 5):
 *
 *      GET  /api/tour/progress
 *        -> { completed: { phase1_sidebar: 1, ... } }
 *
 *      POST /api/tour/progress   { tourKey, tourVersion, status }
 *        -> upsert on (user_id, tour_key, tour_version)
 *
 * 4. In App.tsx, start the tour once the dashboard mounts after onboarding:
 *
 *      useProductTour({
 *        enabled: user.justOnboarded || hasNewFeatures,
 *        completedTours,
 *        onComplete: (key, version) =>
 *          api.saveTourProgress({ tourKey: key, tourVersion: version,
 *                                 status: "completed" }),
 *        navigate: (route) => { window.location.hash = route; },
 *      });
 */
