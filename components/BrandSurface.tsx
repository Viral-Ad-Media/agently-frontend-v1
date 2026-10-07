import React from "react";

/*
 * The landing-page design language, made reusable inside the app.
 *
 * pages/LandingPage.tsx declares the same palette on :root. Doing that from an
 * in-app page would repaint every other screen mid-redesign, so the variables
 * are declared on a WRAPPER instead and the page's Tailwind reads them as
 * arbitrary values (bg-[var(--bg)], text-[var(--ink)], ...). Tailwind v3 can
 * consume a custom property but cannot declare one, and it cannot express the
 * prefers-color-scheme + [data-theme] pair at all, so this one <style> block
 * carries them -- exactly the split LandingPage already uses.
 *
 * Dark mode resolves in three layers, in this order:
 *   1. the light palette, unconditionally;
 *   2. the dark palette under prefers-color-scheme, guarded so an explicit
 *      light choice still wins;
 *   3. the dark palette under :root[data-theme="dark"], for the toggle the
 *      landing header writes to documentElement.
 * Layer 2's guard is what stops "I picked light" from being overridden by the
 * operating system a moment later.
 *
 * A note on the tints. Tailwind v3 silently emits NOTHING for an opacity
 * modifier on a custom property -- `bg-[var(--orange)]/10` produces no rule at
 * all, so the element renders with no background and the defect is invisible in
 * review. The tints are therefore real variables with the alpha baked in, one
 * value per theme, and the dark values are stronger because the same alpha over
 * a dark surface reads as almost nothing.
 */

const SURFACE_STYLE = `
.ag-surface{
  color-scheme:light dark;
  --bg:#f6f5f1;--surface:#ffffff;--ink:#101216;--muted:#5a5b61;--line:#d9d7d0;--warm:#ece9e1;
  --orange:#f15a24;--orange-deep:#b63a0e;
  --orange-tint:rgba(241,90,36,0.10);--orange-tint-strong:rgba(241,90,36,0.17);
  --deep:#07101c;--on-deep:#f7f5ef;--on-deep-muted:#aeb6c1;
}
@media(prefers-color-scheme:dark){
  :root:not([data-theme="light"]) .ag-surface{
    color-scheme:dark;
    --bg:#111419;--surface:#171b21;--ink:#f3f1eb;--muted:#afb3ba;--line:#33373d;--warm:#24272b;
    --orange:#ff6a32;--orange-deep:#ff7a45;
    --orange-tint:rgba(255,106,50,0.16);--orange-tint-strong:rgba(255,106,50,0.24);
  }
}
:root[data-theme="light"] .ag-surface{
  color-scheme:light;
  --bg:#f6f5f1;--surface:#ffffff;--ink:#101216;--muted:#5a5b61;--line:#d9d7d0;--warm:#ece9e1;
  --orange:#f15a24;--orange-deep:#b63a0e;
  --orange-tint:rgba(241,90,36,0.10);--orange-tint-strong:rgba(241,90,36,0.17);
}
:root[data-theme="dark"] .ag-surface{
  color-scheme:dark;
  --bg:#111419;--surface:#171b21;--ink:#f3f1eb;--muted:#afb3ba;--line:#33373d;--warm:#24272b;
  --orange:#ff6a32;--orange-deep:#ff7a45;
  --orange-tint:rgba(255,106,50,0.16);--orange-tint-strong:rgba(255,106,50,0.24);
}
/* Native controls (time/date/select pickers) follow color-scheme only when the
 * element itself declares it, so inputs inside the surface inherit it here. */
.ag-surface input,.ag-surface select,.ag-surface textarea{color-scheme:inherit}
`;

/** Shared so a row and the empty state cannot drift apart. */
export const CARD =
  "rounded-[14px] border border-[var(--line)] bg-[var(--surface)]";

/** Eyebrow / label face. IBM Plex Mono, uppercase, letter-spaced. */
export const EYEBROW =
  "font-['IBM_Plex_Mono',monospace] text-[11px] font-medium uppercase tracking-[1px] text-[var(--muted)]";

/** Primary action: the ink-on-bg pill the landing header uses. */
export const BTN_PRIMARY =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[var(--ink)] px-4 text-[13px] font-medium text-[var(--bg)] transition-colors hover:bg-[var(--orange-deep)] hover:text-white disabled:cursor-not-allowed disabled:opacity-40";

/** Secondary action: the warm pill. */
export const BTN_SECONDARY =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--warm)] px-4 text-[13px] font-medium text-[var(--ink)] transition-colors hover:border-[var(--orange)] hover:text-[var(--orange-deep)] disabled:cursor-not-allowed disabled:opacity-40";

/** Quiet action: text only, for row-level rename/remove. */
export const BTN_QUIET =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-transparent px-2.5 text-xs font-medium text-[var(--muted)] transition-colors hover:border-[var(--line)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-40";

/**
 * An accent panel: the orange-tinted box used for a warning, a confirmation or
 * an invite code. Uses --orange-tint, never an opacity modifier (see above).
 */
export const PANEL_ACCENT =
  "rounded-lg border border-[var(--orange)] bg-[var(--orange-tint)]";

/** A small uppercase pill: status, booking target, provider. */
export const PILL =
  "inline-flex items-center rounded-full border px-2 py-0.5 font-['IBM_Plex_Mono',monospace] text-[10px] uppercase tracking-[0.8px]";

/**
 * Filter chips. Two complete class strings rather than a base plus an
 * override: a base with `border-transparent` and an override with
 * `border-[var(--line)]` are both one-class selectors, so which wins depends on
 * stylesheet order, not on the order they appear in the attribute.
 */
export const CHIP =
  "inline-flex h-8 items-center rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-xs font-medium text-[var(--muted)] transition-colors hover:text-[var(--ink)]";
export const CHIP_ACTIVE =
  "inline-flex h-8 items-center rounded-lg border border-[var(--orange)] bg-[var(--orange-tint)] px-3 text-xs font-medium text-[var(--orange-deep)]";

export const FIELD =
  "w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--muted)] focus:border-[var(--orange)]";

/**
 * Wraps a page in the palette. `min-h-full` rather than `min-h-screen`: these
 * pages render inside the app Shell's scroll container, and a viewport-height
 * floor there produces a second scrollbar.
 */
const BrandSurface: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = "",
}) => (
  <div
    className={`ag-surface font-['DM_Sans',sans-serif] min-h-full bg-[var(--bg)] text-[var(--ink)] ${className}`}
  >
    <style>{SURFACE_STYLE}</style>
    {children}
  </div>
);

export default BrandSurface;
