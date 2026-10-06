import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

/*
 * Agently landing page v1.7 — pure-Tailwind React port of the approved
 * standalone preview (artifact "agently-landing-page", approved 2026-10-05
 * by Lawal after the Vapi design-system study). NO separate CSS file:
 * everything is Tailwind utilities in this file; only keyframes, CSS theme
 * variables, data-theme selectors and a few complex selectors live in the
 * <style> block below.
 *
 * Design DNA borrowed from vapi.ai (not copied): full-width sticky header
 * with announcement strip, 80px hero ladder, borderless editorial feature
 * rows, alternating copy/visual showcase rows, a full-bleed call band, an
 * integrations marquee, near-black footer with giant wordmark. Agently's own
 * brand, copy and proof throughout — no Vapi assets or claims.
 *
 * Product facts pinned by Lawal (2026-10-05): Agently is a customer-engagement
 * platform (voice agents, lead management, website chat assistant) — never an
 * "AI receptionist". Agents support all languages. US/Canada, USD, pay as you
 * go with a $10 minimum; custom/monthly plans come later. Calendly + Google
 * Calendar, MCPs, email, SMS and more CRMs are roadmap items, not current
 * features. No invented stats, logos, testimonials or certifications.
 *
 * The design ships its own header and footer, so this page renders WITHOUT
 * PublicLayout (see App.tsx).
 *
 * HashRouter owns the URL hash, so in-page section links (#platform, ...)
 * are plain anchors with a click handler that scrolls instead of routing.
 */

const DEMO_PHONE_DISPLAY = "+1 (123) 456-7890";
const DEMO_PHONE_HREF = "tel:+11234567890";
const SUPPORT_EMAIL = "agentlycallsupport@gmail.com";
const THEME_STORAGE_KEY = "agently-landing-theme";

/* ---------- FAQ data + disclosure icons ---------- */
const ChevronDownIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);
const CloseIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: "What is Agently?",
    a: "Agently is a customer engagement platform that combines voice agents, lead management, and a website chat assistant in one place. It is built for small, medium, and large businesses across the United States and Canada, and new channels are added as the platform grows.",
  },
  {
    q: "How does the $10 minimum pay as you go work?",
    a: "You pay only for the Agently services you use, with a minimum of $10 to get started. There is no monthly package required. Custom setups and monthly options are planned for later as the broader platform becomes ready.",
  },
  {
    q: "How is the demo conversation preview generated?",
    a: "The demo number on this page is an obviously-fake example (+1 (123) 456-7890) so nobody mistakes it for a working line. The workflow card previews the kind of conversation paths—voice, lead management, or website chat—rather than a live transcript.",
  },
  {
    q: "Which scheduling tools are planned?",
    a: "Calendly and Google Calendar integrations are on the near-term roadmap, along with email, SMS, MCP connections, and more CRMs. They will appear in the integrations section of this page as they become available.",
  },
  {
    q: "How does Agently support customers in different languages?",
    a: "Agently agents work across all languages, not a small fixed set. The same voice, lead, and website chat workflows stay available to your customers whichever language they use.",
  },
];

type ThemeChoice = "light" | "dark";

const HERO_IMAGES: { src: string; alt: string }[] = [
  { src: "/landing/hero-1.jpg", alt: "Small-business owner taking a customer call after hours" },
  { src: "/landing/hero-2.jpg", alt: "Business leader on a customer call" },
  { src: "/landing/hero-3.jpg", alt: "Restaurant manager handling a phone reservation" },
  { src: "/landing/hero-4.webp", alt: "Team member speaking with a customer by phone" },
  { src: "/landing/hero-5.jpg", alt: "Customer support team handling conversations" },
  { src: "/landing/hero-6.webp", alt: "Business owner continuing a customer conversation" },
];

const USE_CASES: { label: string; copy: string }[] = [
  {
    label: "Voice agents",
    copy: "A customer calls after hours. Agently answers their questions, captures what they need, and keeps the opportunity moving.",
  },
  {
    label: "Lead management",
    copy: "A new inquiry becomes a lead your team can review, organize, and follow up without losing the conversation.",
  },
  {
    label: "Website chat",
    copy: "A website visitor starts a chat. Agently answers questions and helps turn their interest into a qualified lead.",
  },
];

const FAQS: { q: string; a: string }[] = [
  {
    q: "Can I keep my current business number?",
    a: "Yes. Agently is designed to work with your current business number, so customers can keep calling the number they already know.",
  },
  {
    q: "Which scheduling tools are planned?",
    a: "Calendly and Google Calendar connections are on the product roadmap. They are planned features, not part of the current service set yet.",
  },
  {
    q: "Which languages can agents support?",
    a: "Agently\u2019s agents support all languages, so teams are not limited to English and Spanish conversations.",
  },
  {
    q: "Is Agently only for phone calls?",
    a: "No. Today\u2019s platform also includes lead management and a website chat assistant, with email, SMS, MCP connections, calendar tools, and more CRM integrations planned.",
  },
  {
    q: "What does pay as you go mean?",
    a: "Current Agently services use pay-as-you-go pricing with a $10 minimum. Custom options may fit larger or more specialized requirements, while monthly plans are planned for later.",
  },
];

/* Agently mark outline, traced for the core pulse animation. */
const LOGO_PULSE_PATH =
  "M 9 371 L 16 352 L 64 257 L 176 21 L 184 13 L 196 9 L 270 9 L 282 13 L 294 28 L 456 364 L 458 373 L 454 389 L 442 399 L 348 401 L 277 401 L 272 399 L 268 393 L 270 385 L 305 361 L 326 340 L 336 325 L 348 295 L 350 263 L 346 240 L 338 218 L 331 205 L 316 187 L 291 169 L 278 163 L 237 154 L 204 157 L 174 170 L 161 179 L 142 197 L 132 211 L 118 249 L 116 270 L 118 291 L 126 317 L 135 333 L 161 361 L 185 375 L 202 379 L 208 383 L 208 396 L 204 407 L 192 433 L 178 451 L 174 453 L 164 451 L 164 409 L 158 401 L 25 399 L 12 389 L 9 371 Z";

const WIRES: { d: string; delay?: string }[] = [
  { d: "M310 135H430L567.4 253.7" },
  { d: "M310 385H430L527.9 305.1", delay: "-1.4s" },
  { d: "M890 135H770L631.3 251.8", delay: "-0.7s" },
  { d: "M890 385H770L670.7 310.9", delay: "-2.1s" },
];

const PORTS: { cx: number; cy: number }[] = [
  { cx: 310, cy: 135 },
  { cx: 310, cy: 385 },
  { cx: 890, cy: 135 },
  { cx: 890, cy: 385 },
];

const CORE_PORTS: { cx: number; cy: number }[] = [
  { cx: 567.4, cy: 253.7 },
  { cx: 527.9, cy: 305.1 },
  { cx: 631.3, cy: 251.8 },
  { cx: 670.7, cy: 310.9 },
];

/* ---------- inline SVG icon set (Lucide-style 24px line icons) ---------- */

const SunIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" />
  </svg>
);

const MoonIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
  </svg>
);

const MenuOpenIcon: React.FC = () => (
  <svg className="lp-menu-open" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);

const MenuCloseIcon: React.FC = () => (
  <svg className="lp-menu-close" viewBox="0 0 24 24" aria-hidden="true">
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
);

const CheckIcon: React.FC = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true">
    <path d="m4 10 4 4 8-9" />
  </svg>
);

const FaqPlusIcon: React.FC = () => (
  <svg className="lp-ficon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const VoiceIcon: React.FC = () => (
  <svg className="lp-ficon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3M8 22h8" />
  </svg>
);

const LeadsIcon: React.FC = () => (
  <svg className="lp-ficon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="m16 11 2 2 4-4" />
  </svg>
);

const ChatIcon: React.FC = () => (
  <svg className="lp-ficon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" />
    <path d="M8 9h8M8 13h5" />
  </svg>
);

const SupportIcon: React.FC = () => (
  <svg className="lp-ficon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
    <path d="M18 19c0 1.7-1.3 3-3 3h-3M4 14H2v5h4v-5Zm16 0h2v5h-4v-5Z" />
  </svg>
);

const SetupIcon: React.FC = () => (
  <svg className="lp-ficon" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
    <path d="M10 6.5h2a5 5 0 0 1 5 5V14M6.5 10v2a5 5 0 0 0 5 5H14" />
  </svg>
);

const GlobeIcon: React.FC = () => (
  <svg className="lp-ficon" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
  </svg>
);

const ScaleIcon: React.FC = () => (
  <svg className="lp-ficon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 3v18h18" />
    <path d="m7 16 4-5 4 3 5-7" />
  </svg>
);

const WorkflowIcon: React.FC = () => (
  <svg className="lp-ficon" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="3" y="3" width="6" height="6" rx="1" />
    <rect x="15" y="15" width="6" height="6" rx="1" />
    <path d="M9 6h3a6 6 0 0 1 6 6v3M6 9v3a6 6 0 0 0 6 6h3" />
  </svg>
);

const ShieldIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

/* Real brand marks (Simple Icons, CC0) for the integrations marquee. */
const GmailMark: React.FC = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="#EA4335">
    <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" />
  </svg>
);

const EmailMark: React.FC = () => (
  <svg viewBox="0 0 48 48" aria-hidden="true">
    <rect x="6" y="10" width="36" height="28" rx="3" fill="none" stroke="#F15A24" strokeWidth="2" />
    <path d="m8 13 16 12 16-12" fill="none" stroke="#F15A24" strokeWidth="2" strokeLinejoin="round" />
  </svg>
);

const CalendlyMark: React.FC = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="#006BFF">
    <path d="M19.655 14.262c.281 0 .557.023.828.064 0 .005-.005.01-.005.014-.105.267-.234.534-.381.786l-1.219 2.106c-1.112 1.936-3.177 3.127-5.411 3.127h-2.432c-2.23 0-4.294-1.191-5.412-3.127l-1.218-2.106a6.251 6.251 0 0 1 0-6.252l1.218-2.106C6.736 4.832 8.8 3.641 11.035 3.641h2.432c2.23 0 4.294 1.191 5.411 3.127l1.219 2.106c.147.252.271.519.381.786 0 .004.005.009.005.014-.267.041-.543.064-.828.064-1.816 0-2.501-.607-3.291-1.306-.764-.676-1.711-1.517-3.44-1.517h-1.029c-1.251 0-2.387.455-3.2 1.278-.796.805-1.233 1.904-1.233 3.099v1.411c0 1.196.437 2.295 1.233 3.099.813.823 1.949 1.278 3.2 1.278h1.034c1.729 0 2.676-.841 3.439-1.517.791-.699 1.475-1.306 3.291-1.306l-.002.014z" />
  </svg>
);

const GoogleCalendarMark: React.FC = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="#4285F4">
    <path d="M18.316 5.684H24v12.632h-5.684V5.684zM5.684 24h12.632v-5.684H5.684V24zM18.316 5.684V0H1.895A1.894 1.894 0 0 0 0 1.895v16.421h5.684V5.684h12.632zm-7.207 6.25v-.065c.272-.144.5-.349.687-.617s.279-.595.279-.982c0-.379-.099-.72-.3-1.025a2.05 2.05 0 0 0-.832-.714 2.703 2.703 0 0 0-1.197-.257c-.6 0-1.094.156-1.481.467-.386.311-.65.671-.793 1.078l1.085.452c.086-.249.224-.461.413-.633.189-.172.445-.257.767-.257.33 0 .602.088.816.264a.86.86 0 0 1 .322.703c0 .33-.12.589-.36.778-.24.19-.535.284-.886.284h-.567v1.085h.633c.407 0 .748.109 1.02.327.272.218.407.499.407.843 0 .336-.129.614-.387.832s-.565.327-.924.327c-.351 0-.651-.103-.897-.311-.248-.208-.422-.502-.521-.881l-1.096.452c.178.616.505 1.082.977 1.401.472.319.984.478 1.538.477a2.84 2.84 0 0 0 1.293-.291c.382-.193.684-.458.902-.794.218-.336.327-.72.327-1.149 0-.429-.115-.797-.344-1.105a2.067 2.067 0 0 0-.881-.689zm2.093-1.931.602.913L15 10.045v5.744h1.187V8.446h-.827l-2.158 1.557zM22.105 0h-3.2" />
  </svg>
);

const GoogleDocsMark: React.FC = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="#4285F4">
    <path d="M14.727 6.727H14V0H4.91c-.905 0-1.637.732-1.637 1.636v20.728c0 .904.732 1.636 1.636 1.636h14.182c.904 0 1.636-.732 1.636-1.636V6.727h-6zm-.545 10.455H7.09v-1.364h7.09v1.364zm2.727-3.273H7.091v-1.364h9.818v1.364zm0-3.273H7.091V9.273h9.818v1.363zM14.727 6h6l-6-6v6z" />
  </svg>
);

const AgentorMark: React.FC = () => (
  <svg viewBox="0 0 48 48" aria-hidden="true">
    <path d="M24 6 41 39H7z" fill="none" stroke="#F15A24" strokeWidth="2" strokeLinejoin="round" />
    <circle cx="24" cy="25" r="6" fill="none" stroke="#F15A24" strokeWidth="2" />
    <path d="M24 9v10M14 34l6-5M34 34l-6-5" fill="none" stroke="#F15A24" strokeWidth="2" />
  </svg>
);

const INTEGRATIONS: { name: string; Mark: React.FC }[] = [
  { name: "Gmail", Mark: GmailMark },
  { name: "Email", Mark: EmailMark },
  { name: "Calendly", Mark: CalendlyMark },
  { name: "Google Calendar", Mark: GoogleCalendarMark },
  { name: "Google Docs", Mark: GoogleDocsMark },
  { name: "Agentor", Mark: AgentorMark },
];

/*
 * The only <style> on this page. Tailwind v3 cannot express: theme CSS
 * variables + data-theme selectors, keyframes, the marquee mask/track, the
 * hero crossfade, the logo pulse + schematic wires, the hamburger open/close
 * icon swap, the FAQ accordion animation, or pseudo-element details. All
 * layout, typography, spacing and responsive behavior is Tailwind utilities.
 */
const STYLE = `
:root{color-scheme:light dark;--bg:#f6f5f1;--surface:#ffffff;--ink:#101216;--muted:#5a5b61;--line:#d9d7d0;--deep:#07101c;--deep2:#0d1724;--on-deep:#f7f5ef;--on-deep-muted:#aeb6c1;--orange:#f15a24;--orange-deep:#b63a0e;--warm:#ece9e1;--pad:72px;--max:1296px}
@media(prefers-color-scheme:dark){:root{--bg:#111419;--surface:#171b21;--ink:#f3f1eb;--muted:#afb3ba;--line:#33373d;--warm:#24272b;--orange:#ff6a32;--orange-deep:#ff7a45}}
:root[data-theme="light"]{color-scheme:light;--bg:#f6f5f1;--surface:#ffffff;--ink:#101216;--muted:#5a5b61;--line:#d9d7d0;--warm:#ece9e1;--orange:#f15a24;--orange-deep:#b63a0e}
:root[data-theme="dark"]{color-scheme:dark;--bg:#111419;--surface:#171b21;--ink:#f3f1eb;--muted:#afb3ba;--line:#33373d;--warm:#24272b;--orange:#ff6a32;--orange-deep:#ff7a45}
@media(max-width:900px){:root{--pad:clamp(22px,6.4vw,72px)}}
@media(max-width:767px){:root{--pad:22px}}
@media(max-width:479px){:root{--pad:18px}}
@keyframes lp-logo-pulse{0%{transform:scale(1);opacity:.7}72%,100%{transform:scale(1.42);opacity:0}}
@keyframes lp-wire-flow{to{stroke-dashoffset:-40}}
@keyframes lp-integration-scroll{to{transform:translateX(-50%)}}
.lp-container{width:min(calc(100% - (var(--pad) * 2)),var(--max));min-width:0;margin-inline:auto}
.lp-header{background:color-mix(in srgb,var(--bg) 78%,transparent);backdrop-filter:blur(40px);-webkit-backdrop-filter:blur(40px);border-bottom:1px solid color-mix(in srgb,var(--line) 70%,transparent)}
.lp-hero-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;opacity:0;transition:opacity 1.4s ease;z-index:-3}
.lp-hero-bg.lp-active{opacity:1}
.lp-hero-shade{position:absolute;inset:0;z-index:-2;background:linear-gradient(90deg,rgba(4,10,18,.95) 0%,rgba(4,10,18,.76) 47%,rgba(4,10,18,.15) 82%),linear-gradient(0deg,rgba(4,10,18,.72),transparent 52%)}
@media(max-width:767px){.lp-hero-shade{background:linear-gradient(90deg,rgba(4,10,18,.93),rgba(4,10,18,.46)),linear-gradient(0deg,rgba(4,10,18,.96),transparent 62%)}.lp-hero-bg{object-position:63% center}.lp-hero-bg.lp-active{opacity:.78}}
.lp-icon-btn svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.lp-menu-btn svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.lp-menu-btn .lp-menu-close{display:none}
.lp-menu-btn[aria-expanded="true"] .lp-menu-open{display:none}
.lp-menu-btn[aria-expanded="true"] .lp-menu-close{display:block}
.lp-theme-opt[aria-pressed="true"]{border-color:var(--line);background:var(--surface);color:var(--ink)}
.lp-ficon{width:24px;height:24px;stroke:var(--orange-deep);fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.lp-faq-answer{display:grid;grid-template-rows:0fr;transition:grid-template-rows .25s ease}
.lp-faq-answer>div{overflow:hidden}
.lp-faq-item[data-open="true"] .lp-faq-answer{grid-template-rows:1fr}
.lp-faq-item[data-open="true"] .lp-faq-icon{transform:rotate(45deg)}
.lp-faq-icon{transition:transform .2s ease;flex:0 0 auto}
.lp-marquee{position:relative;width:100vw;max-width:none;margin-left:calc(50% - 50vw);overflow:hidden;border-top:1px solid #2b3746;border-bottom:1px solid #2b3746;mask-image:linear-gradient(to right,transparent,#000 7%,#000 93%,transparent);-webkit-mask-image:linear-gradient(to right,transparent,#000 7%,#000 93%,transparent)}
.lp-track{position:absolute;inset:0 auto auto 0;display:flex;width:max-content;animation:lp-integration-scroll 28s linear infinite;will-change:transform}
.lp-iset{display:flex;flex-shrink:0}
.lp-item{width:236px;min-height:156px;padding:30px 30px 26px;display:flex;align-items:center;gap:20px;border-right:1px solid #2b3746}
.lp-item svg{width:46px;height:46px;flex:0 0 auto;overflow:visible}
.lp-marquee:hover .lp-track,.lp-marquee:focus-within .lp-track{animation-play-state:paused}
@media(max-width:767px){.lp-marquee{width:100%;margin-left:0;mask-image:none;-webkit-mask-image:none}.lp-track{position:static;width:100%;display:block;animation:none;transform:none}.lp-iset:first-child{width:100%;display:grid;grid-template-columns:1fr 1fr}.lp-iset[aria-hidden="true"]{display:none}.lp-item{width:auto;min-width:0;min-height:138px;padding:24px}.lp-item svg{width:40px;height:40px}.lp-item:nth-child(2n){border-right:0}.lp-item:nth-child(n+3){border-top:1px solid #2b3746}}
@media(max-width:699px){.lp-marquee{position:relative;width:100vw;margin-left:calc(50% - 50vw);overflow:hidden;mask-image:linear-gradient(to right,transparent,#000 8%,#000 92%,transparent);-webkit-mask-image:linear-gradient(to right,transparent,#000 8%,#000 92%,transparent)}.lp-track{position:absolute;display:flex;animation:lp-integration-scroll 28s linear infinite}.lp-iset:first-child,.lp-iset[aria-hidden="true"]{display:flex;width:auto}.lp-item{width:190px;min-height:128px;padding:22px;border-top:0}.lp-item:nth-child(2n){border-right:1px solid #2b3746}}
.lp-motion{position:relative;display:grid;grid-template-columns:minmax(180px,1fr) minmax(240px,1.1fr) minmax(180px,1fr);grid-template-rows:1fr 1fr;align-items:center;gap:28px 72px;min-height:520px;padding:58px;isolation:isolate}
.lp-node{position:relative;z-index:2;border-top:1px solid #394556;padding:22px 0 0;max-width:260px}
.lp-node::before{content:"";position:absolute;top:-4px;width:7px;height:7px;border-radius:50%;background:var(--deep);border:1px solid var(--orange)}
.lp-node-l::before{right:0}.lp-node-r::before{left:0}
.lp-core{grid-column:2;grid-row:1/3;justify-self:center;width:220px;height:220px;display:grid;place-items:center;position:relative;z-index:3}
.lp-core img,.lp-core svg{grid-area:1/1;width:150px;height:auto}
.lp-core img{filter:drop-shadow(0 8px 20px rgba(241,90,36,.28))}
.lp-wires{position:absolute;inset:0;width:100%;height:100%;z-index:1;pointer-events:none}
.lp-wire{fill:none;stroke:#394556;stroke-width:1.2;vector-effect:non-scaling-stroke}
.lp-wire-flow{fill:none;stroke:var(--orange);stroke-width:1.5;stroke-dasharray:2 18;stroke-linecap:round;vector-effect:non-scaling-stroke;animation:lp-wire-flow 2.8s linear infinite}
.lp-port{fill:var(--deep);stroke:var(--orange);stroke-width:1.5;vector-effect:non-scaling-stroke}
.lp-core-port{fill:var(--orange)}
.lp-logo-pulse{fill:none;stroke:var(--orange);stroke-width:2;stroke-linejoin:round;vector-effect:non-scaling-stroke;transform-box:fill-box;transform-origin:center;opacity:0;animation:lp-logo-pulse 3.2s cubic-bezier(.16,.7,.3,1) infinite}
.lp-logo-pulse.lp-echo-two{animation-delay:1.6s}
@media(max-width:900px){.lp-motion{padding:46px 38px;gap:34px 42px;grid-template-columns:1fr 180px 1fr}.lp-core{width:170px;height:170px}}
@media(max-width:699px){.lp-motion{min-height:0;padding:34px 24px;display:flex;flex-direction:column;align-items:stretch;gap:28px}.lp-motion::before{content:"";position:absolute;left:50%;top:118px;bottom:34px;width:1px;background:#394556;z-index:0}.lp-wires{display:none}.lp-core{order:-1;width:170px;height:170px;align-self:center;margin-bottom:8px}.lp-core img,.lp-core svg{width:96px}.lp-node{max-width:none}.lp-node::before{left:50%;right:auto}}
.lp-shot{position:relative;overflow:hidden;border-radius:10px;background:var(--deep)}
.lp-shot::after{content:"";position:absolute;inset:68% 0 0;background:linear-gradient(transparent,rgba(3,8,14,.58));pointer-events:none}
.lp-check svg{width:16px;height:16px;flex:0 0 auto;stroke:currentColor;fill:none;stroke-width:2}
@media(max-width:699px){.lp-check svg{width:10px;height:10px}}
@media(prefers-reduced-motion:reduce){.lp-track,.lp-logo-pulse,.lp-wire-flow{animation:none!important}.lp-hero-bg{transition:none}}
`;

const BTN =
  "h-10 rounded-xl px-4 inline-flex items-center justify-center gap-2 text-sm font-medium border border-transparent transition-colors";

const LandingPage: React.FC = () => {
  const [themeChoice, setThemeChoice] = useState<ThemeChoice | null>(null);
  const [systemDark, setSystemDark] = useState<boolean>(false);
  const [heroIndex, setHeroIndex] = useState(0);
  const [activeCase, setActiveCase] = useState(0);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const lastTriggerRef = useRef<HTMLElement | null>(null);
  const firstFieldRef = useRef<HTMLInputElement | null>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const [reduceMotion] = useState<boolean>(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  /* Theme: explicit choice wins, otherwise follow the OS. */
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemDark(mq.matches);
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") {
      setThemeChoice(stored);
      document.documentElement.setAttribute("data-theme", stored);
    }
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const effectiveTheme: ThemeChoice =
    themeChoice ?? (systemDark ? "dark" : "light");

  const chooseTheme = (t: ThemeChoice) => {
    setThemeChoice(t);
    document.documentElement.setAttribute("data-theme", t);
    window.localStorage.setItem(THEME_STORAGE_KEY, t);
  };

  /* Hero crossfade. */
  useEffect(() => {
    if (reduceMotion || HERO_IMAGES.length < 2) return;
    const id = window.setInterval(
      () => setHeroIndex((i) => (i + 1) % HERO_IMAGES.length),
      4800,
    );
    return () => window.clearInterval(id);
  }, [reduceMotion]);

  /* Pause videos when reduced motion is requested. */
  useEffect(() => {
    if (reduceMotion) videoRefs.current.forEach((v) => v?.pause());
  }, [reduceMotion]);

  /* Escape closes modal + menu; resize closes the mobile menu. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setModalOpen(false);
        document.body.style.overflow = "";
        setMenuOpen(false);
      }
    };
    const onResize = () => {
      if (window.innerWidth > 1100) setMenuOpen(false);
    };
    const onPageShow = () => {
      setModalOpen(false);
      document.body.style.overflow = "";
    };
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  const handleAnchorClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const href = e.currentTarget.getAttribute("href");
    if (href && href.startsWith("#") && href.length > 1) {
      const el = document.querySelector(href);
      if (el) {
        e.preventDefault();
        setMenuOpen(false);
        el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
      }
    }
  };

  const openContact = (trigger: HTMLElement | null) => {
    lastTriggerRef.current = trigger;
    setModalOpen(true);
    document.body.style.overflow = "hidden";
    window.setTimeout(() => firstFieldRef.current?.focus(), 0);
  };

  const closeContact = () => {
    setModalOpen(false);
    document.body.style.overflow = "";
    lastTriggerRef.current?.focus();
  };

  const submitContact = (e: React.FormEvent) => {
    e.preventDefault();
    const subject = `Agently enquiry from ${form.name}`;
    const bodyText = `Name: ${form.name}\nEmail: ${form.email}\n\n${form.message}`;
    closeContact();
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(bodyText)}`;
  };

  const contactTrigger = (e: React.MouseEvent<HTMLElement>) =>
    openContact(e.currentTarget);

  return (
    <div className="font-['Manrope',sans-serif] bg-[var(--bg)] text-[var(--ink)] min-h-screen text-base leading-normal">
      <style>{STYLE}</style>

      {/* Announcement strip */}
      <div className="min-h-[40px] max-[699px]:h-auto max-[699px]:py-2 max-[699px]:flex-wrap max-[699px]:gap-x-[7px] bg-[var(--orange)] text-[#170a03] flex items-center justify-center px-5 text-[13px] max-[767px]:text-[11px] max-[359px]:text-[10px] tracking-[-0.01em] text-center leading-[1.25]">
        <span>
          Now available: recovered-revenue reporting for no-show follow-up.
        </span>
        <a
          href="#recovery"
          onClick={handleAnchorClick}
          className="ml-2 max-[699px]:ml-0 font-semibold border-b border-current max-[767px]:hidden min-[700px]:inline"
        >
          See how it works
        </a>
      </div>

      {/* Header */}
      <header className="lp-header h-[65px] max-[699px]:h-[60px] sticky top-0 z-50">
        <nav
          className="lp-container h-full flex items-center gap-10 max-[1100px]:gap-6 max-[479px]:gap-3 relative"
          aria-label="Primary"
        >
          <a
            href="#top"
            onClick={handleAnchorClick}
            className="inline-flex items-center gap-2.5 text-[22px] font-semibold tracking-[-1.1px] shrink-0 font-['DM_Sans',sans-serif]"
            aria-label="Agently home"
          >
            <img
              src="/landing/logo.png"
              alt=""
              className="w-[30px] h-[30px] max-[479px]:w-8 max-[479px]:h-8 object-contain"
            />
            <span className="max-[479px]:hidden">agently</span>
          </a>

          <div
            id="primary-nav"
            className={`items-center justify-center gap-10 mx-auto max-[1100px]:mx-0 ${
              menuOpen ? "flex" : "hidden"
            } min-[1101px]:flex max-[1100px]:absolute max-[1100px]:top-[calc(100%+8px)] max-[1100px]:left-0 max-[1100px]:right-0 max-[1100px]:p-[18px_22px] max-[1100px]:flex-col max-[1100px]:items-stretch max-[1100px]:gap-0 max-[1100px]:rounded-xl max-[1100px]:border max-[1100px]:border-[var(--line)] max-[1100px]:bg-[var(--surface)] max-[1100px]:shadow-[0_18px_48px_rgba(0,0,0,0.16)]`}
          >
            {[
              ["Platform", "#platform"],
              ["Solutions", "#solutions"],
              ["Integrations", "#integrations"],
              ["Pricing", "#pricing"],
              ["Resources", "#faq"],
            ].map(([label, href]) => (
              <a
                key={label}
                href={href}
                onClick={handleAnchorClick}
                className="text-sm font-medium whitespace-nowrap transition-colors hover:text-[var(--orange-deep)] max-[1100px]:py-[13px] max-[1100px]:border-b max-[1100px]:border-[var(--line)] max-[1100px]:last:border-b-0"
              >
                {label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-3 max-[479px]:gap-1 shrink-0 ml-auto">
            <div
              className="flex items-center gap-1 p-0.5 rounded-lg"
              role="group"
              aria-label="Theme"
            >
              {(["light", "dark"] as ThemeChoice[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  data-theme={t}
                  aria-label={t === "light" ? "Light" : "Dark"}
                  aria-pressed={effectiveTheme === t}
                  onClick={() => chooseTheme(t)}
                  className="lp-icon-btn lp-theme-opt w-[34px] h-[34px] max-[699px]:w-8 max-[699px]:h-8 grid place-items-center rounded-lg text-[var(--muted)] border border-transparent"
                >
                  {t === "light" ? <SunIcon /> : <MoonIcon />}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="lp-menu-btn hidden max-[1100px]:grid w-9 h-9 max-[479px]:w-[38px] max-[479px]:h-[38px] place-items-center text-[var(--ink)]"
              aria-expanded={menuOpen}
              aria-label={menuOpen ? "Close navigation" : "Open navigation"}
              aria-controls="primary-nav"
              onClick={() => setMenuOpen((o) => !o)}
            >
              <MenuOpenIcon />
              <MenuCloseIcon />
            </button>
            <Link
              to="/login"
              className={`${BTN} bg-[var(--warm)] text-[var(--ink)] max-[1100px]:hidden`}
            >
              Log in
            </Link>
            <a
              href="#pricing"
              onClick={handleAnchorClick}
              className={`${BTN} bg-[var(--ink)] text-[var(--bg)] max-[479px]:px-[11px] max-[479px]:text-xs`}
            >
              Get started
            </a>
          </div>
        </nav>
      </header>

      <main id="top">
        {/* Hero */}
        <section className="relative min-h-[600px] max-[900px]:min-h-[560px] max-[767px]:min-h-0 max-[767px]:items-start bg-[var(--deep)] text-[var(--on-deep)] flex items-center overflow-hidden isolate">
          {HERO_IMAGES.map((img, i) => (
            <img
              key={img.src}
              src={img.src}
              alt={img.alt}
              className={`lp-hero-bg${i === heroIndex ? " lp-active" : ""}`}
              aria-hidden={i === heroIndex ? undefined : true}
            />
          ))}
          <div className="lp-hero-shade" aria-hidden="true" />
          <div className="lp-container relative pt-[46px] pb-10 max-[767px]:pt-[54px] max-[767px]:pb-[50px] max-[479px]:pt-[52px] max-[479px]:pb-[46px] w-full">
            <p className="font-['IBM_Plex_Mono',monospace] text-[13px] font-medium tracking-[1.15px] uppercase mb-5 text-inherit">
              Customer engagement, always on
            </p>
            <h1 className="font-semibold text-[80px] leading-[1.02] tracking-[-4px] max-w-[780px] mb-5 text-balance max-[1100px]:text-[68px] max-[1100px]:tracking-[-3.4px] max-[767px]:text-[48px] max-[767px]:tracking-[-2.5px] max-[699px]:text-[40px] max-[699px]:tracking-[-2.2px] max-[479px]:text-[34px] max-[479px]:tracking-[-1.7px] max-[359px]:text-[30px]">
              Every conversation handled. Every opportunity within reach.
            </h1>
            <p className="text-[18px] max-[699px]:text-base leading-[1.4] max-w-[560px] text-[#d7dce4] mb-6">
              Agently brings voice agents, lead management, and website chat
              into one growing platform for businesses of every size—across
              every language your customers use.
            </p>
            <div className="flex gap-3 flex-wrap max-[479px]:grid max-[479px]:grid-cols-2 max-[359px]:grid-cols-1">
              <a
                href="#pricing"
                onClick={handleAnchorClick}
                className={`${BTN} bg-[var(--orange)] text-[#160802] max-[479px]:w-full max-[479px]:px-[10px]`}
              >
                Get started
              </a>
              <button
                type="button"
                onClick={contactTrigger}
                className={`${BTN} border-[rgba(255,255,255,0.42)] text-white bg-[rgba(0,0,0,0.12)] hover:bg-[rgba(255,255,255,0.1)] max-[479px]:w-full max-[479px]:px-[10px]`}
              >
                Talk to sales
              </button>
            </div>

            <div className="mt-[30px] max-[479px]:mt-[38px] w-full max-w-[570px] bg-[rgba(8,16,28,0.82)] border border-[rgba(255,255,255,0.18)] rounded-xl p-[15px_16px] max-[479px]:p-[15px] backdrop-blur-[18px]">
              <div className="flex items-center justify-between gap-4 max-[479px]:flex-col max-[479px]:items-start mb-[14px]">
                <p className="font-['IBM_Plex_Mono',monospace] text-xs tracking-[1px] uppercase text-[#bec7d2]">
                  Choose a workflow
                </p>
                <p className="flex items-center gap-2 text-xs text-[#d7dce4]">
                  <span className="w-[7px] h-[7px] rounded-full bg-[var(--orange)]" />
                  Agent ready
                </p>
              </div>
              <div
                className="flex gap-2 flex-wrap max-[699px]:grid max-[699px]:grid-cols-1"
                role="tablist"
                aria-label="Workflows"
              >
                {USE_CASES.map((u, i) => (
                  <button
                    key={u.label}
                    type="button"
                    role="tab"
                    aria-selected={i === activeCase}
                    onClick={() => setActiveCase(i)}
                    className={`min-h-[38px] border rounded-[10px] px-3 py-2 text-[13px] max-[699px]:text-left transition-colors ${
                      i === activeCase
                        ? "border-[var(--orange)] bg-[rgba(241,90,36,0.16)] text-white"
                        : "border-[rgba(255,255,255,0.18)] bg-transparent text-[#d6dbe3]"
                    }`}
                  >
                    {u.label}
                  </button>
                ))}
              </div>
              <p
                className="my-4 min-h-[48px] text-sm leading-[1.45] text-[#f2f3f5] max-w-[470px]"
                aria-live="polite"
              >
                {USE_CASES[activeCase].copy}
              </p>
              <div className="flex items-center justify-between gap-5 max-[767px]:flex-col max-[767px]:items-start border-t border-[rgba(255,255,255,0.13)] pt-4">
                <div>
                  <a
                    href={DEMO_PHONE_HREF}
                    className="text-[19px] tracking-[-0.4px] font-medium text-white"
                  >
                    {DEMO_PHONE_DISPLAY}
                  </a>
                </div>
                <span
                  className={`${BTN} bg-[var(--orange)] text-[#160802]`}
                  aria-hidden="true"
                >
                  Conversation preview
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Platform */}
        <section id="platform" className="py-[112px] max-[900px]:py-24 max-[479px]:py-[78px]">
          <div className="lp-container">
            <div className="block max-w-[780px] mx-auto mb-[68px] max-[900px]:mb-[52px] max-[479px]:mb-12 text-center">
              <p className="font-['IBM_Plex_Mono',monospace] text-[13px] font-medium tracking-[1.15px] uppercase mb-5 text-inherit">
                One platform, more ways to connect
              </p>
              <h2 className="font-['DM_Sans',sans-serif] text-[40px] leading-[1.04] tracking-[-2.3px] font-medium m-0 max-w-[620px] text-balance mx-auto max-[699px]:text-[30px] max-[699px]:tracking-[-1.2px]">
                Built around conversations that move business forward.
              </h2>
              <p className="text-[17px] leading-[1.55] text-[var(--muted)] max-w-[590px] m-0 mt-[22px] mx-auto">
                Agently helps teams answer, organize, and continue customer
                conversations across the channels they use today—with more
                connections on the way.
              </p>
            </div>

            <div className="grid grid-cols-3 max-[900px]:gap-[30px] max-[767px]:grid-cols-1 border-t border-[var(--line)] pt-[34px]">
              {[
                {
                  Icon: VoiceIcon,
                  h: "Voice agents",
                  p: "Handle inbound and outbound conversations with agents that work across languages, including evenings and weekends.",
                },
                {
                  Icon: LeadsIcon,
                  h: "Lead management",
                  p: "Capture and organize customer interest in one place, then keep the next action clear for your team.",
                },
                {
                  Icon: ChatIcon,
                  h: "Website chat assistant",
                  p: "Answer visitor questions, gather useful details, and turn more website conversations into leads.",
                },
              ].map(({ Icon, h, p }) => (
                <article
                  key={h}
                  className="pr-6 max-[900px]:pr-0 max-[767px]:py-[30px] max-[767px]:border-b max-[767px]:border-[var(--line)] max-[767px]:first:pt-0 text-center px-[22px]"
                >
                  <span className="inline-block mb-[26px] max-[900px]:mb-7">
                    <Icon />
                  </span>
                  <h3 className="font-['DM_Sans',sans-serif] text-[25px] leading-[1.08] tracking-[-1px] font-medium mt-0 mb-[14px]">
                    {h}
                  </h3>
                  <p className="text-sm leading-[1.52] text-[var(--muted)] m-0 max-w-[330px] mx-auto">
                    {p}
                  </p>
                </article>
              ))}
            </div>

            {/* Platform visual: Agently as the connected core */}
            <div className="mt-[76px] max-[479px]:mt-14 rounded-xl overflow-hidden bg-[var(--deep)] text-[var(--on-deep)] relative isolate">
              <div className="lp-motion">
                <svg
                  className="lp-wires"
                  viewBox="0 0 1200 520"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  {WIRES.map((w) => (
                    <React.Fragment key={w.d}>
                      <path className="lp-wire" d={w.d} />
                      <path
                        className="lp-wire-flow"
                        d={w.d}
                        style={w.delay ? { animationDelay: w.delay } : undefined}
                      />
                    </React.Fragment>
                  ))}
                  {PORTS.map((p) => (
                    <circle key={`${p.cx}-${p.cy}`} className="lp-port" cx={p.cx} cy={p.cy} r="4" />
                  ))}
                  {CORE_PORTS.map((p) => (
                    <circle key={`${p.cx}-${p.cy}`} className="lp-core-port" cx={p.cx} cy={p.cy} r="3" />
                  ))}
                  <g transform="translate(525 186) scale(.3212)">
                    <path className="lp-logo-pulse" d={LOGO_PULSE_PATH} />
                    <path className="lp-logo-pulse lp-echo-two" d={LOGO_PULSE_PATH} />
                  </g>
                </svg>
                <div className="lp-core">
                  <img src="/landing/agently-mark.png" alt="Agently" />
                  <svg className="core-pulse" viewBox="0 0 467 462" aria-hidden="true">
                    <path className="lp-logo-pulse" d={LOGO_PULSE_PATH} />
                    <path className="lp-logo-pulse lp-echo-two" d={LOGO_PULSE_PATH} />
                  </svg>
                </div>
                {[
                  { cls: "lp-node lp-node-l", pos: "col-start-1 row-start-1", tag: "Available now", h: "Voice", p: "Customer conversations handled across languages." },
                  { cls: "lp-node lp-node-l", pos: "col-start-1 row-start-2", tag: "Available now", h: "Leads", p: "Capture, organize, and follow up from one workspace." },
                  { cls: "lp-node lp-node-r", pos: "col-start-3 row-start-1", tag: "Available now", h: "Website chat", p: "Helpful answers and lead capture on your website." },
                  { cls: "lp-node lp-node-r", pos: "col-start-3 row-start-2", tag: "Coming next", h: "Connected tools", p: "Calendly, Google Calendar, MCPs, email, SMS, and more CRMs." },
                ].map((n) => (
                  <div key={n.h} className={`${n.cls} ${n.pos}`}>
                    <span className="block font-['IBM_Plex_Mono',monospace] text-[11px] uppercase tracking-[1px] text-[var(--orange)] mb-7 max-[699px]:mb-4">
                      {n.tag}
                    </span>
                    <h3 className="text-[22px] tracking-[-0.8px] font-medium mt-0 mb-2 font-['DM_Sans',sans-serif]">
                      {n.h}
                    </h3>
                    <p className="text-[13px] leading-[1.5] text-[var(--on-deep-muted)] m-0">
                      {n.p}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Media showcase: three videos, alternating rows */}
        <section className="pt-4 pb-[124px] max-[900px]:pb-24 max-[479px]:pb-[78px]" aria-label="Agently in action">
          <div className="lp-container grid gap-32 max-[900px]:gap-[88px]">
            {[
              {
                label: "Agently in action",
                h: "Keep conversations moving while your team keeps working.",
                p: "Agently responds, captures useful context, and keeps the next step clear without turning every call or message into another interruption.",
                src: "/landing/film-1.mp4",
                poster: "/landing/film-1-poster.jpg",
              },
              {
                label: "One workspace, clearer follow-up",
                h: "See the customer story, not disconnected messages.",
                p: "Voice, lead details, and website chat stay easier to review, so teams can understand what happened and respond with the right context.",
                src: "/landing/film-2-dashboard.mp4",
                poster: "/landing/film-2-poster.jpg",
              },
              {
                label: "Responsive through the busiest moments",
                h: "Stay responsive wherever work happens.",
                p: "From a busy service counter to a distributed operations team, Agently helps businesses keep customer engagement consistent across the day.",
                src: "/landing/film-3-agently.mp4",
                poster: "/landing/film-3-poster.jpg",
              },
            ].map((row, i) => (
              <div
                key={row.h}
                className="grid grid-cols-2 max-[767px]:grid-cols-1 gap-[clamp(64px,7vw,104px)] max-[900px]:gap-[46px] max-[767px]:gap-[30px] items-center"
              >
                <div
                  className={`max-w-[475px] max-[767px]:max-w-none text-center ${
                    i % 2 === 1 ? "order-2 max-[767px]:order-none" : ""
                  }`}
                >
                  <p className="font-['IBM_Plex_Mono',monospace] text-[13px] font-medium tracking-[1.15px] uppercase mb-6 text-[var(--muted)]">
                    {row.label}
                  </p>
                  <h2 className="font-['DM_Sans',sans-serif] text-[40px] max-[767px]:text-[34px] max-[699px]:text-[30px] leading-[1.04] tracking-[-2.3px] font-medium mt-0 mb-[18px] text-balance">
                    {row.h}
                  </h2>
                  <p className="text-base leading-[1.55] text-[var(--muted)] m-0 max-w-[440px] mx-auto">
                    {row.p}
                  </p>
                </div>
                <figure
                  className={`lp-shot w-full max-w-[620px] max-[767px]:max-w-none aspect-video justify-self-end max-[767px]:justify-self-stretch m-0 ${
                    i % 2 === 1 ? "order-1 max-[767px]:order-none justify-self-start" : ""
                  }`}
                >
                  <video
                    ref={(el) => {
                      videoRefs.current[i] = el;
                    }}
                    className="block w-full h-full object-cover"
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    poster={row.poster}
                  >
                    <source src={row.src} type="video/mp4" />
                  </video>
                  <figcaption className="absolute left-[18px] bottom-4 z-[2] text-white font-['IBM_Plex_Mono',monospace] text-[10px] tracking-[0.5px] uppercase [text-shadow:0_1px_10px_rgba(0,0,0,0.8)]">
                    {row.label}
                  </figcaption>
                </figure>
              </div>
            ))}
          </div>
        </section>

        {/* Phone band */}
        <section className="bg-[var(--orange)] text-[#160802] py-[54px] max-[699px]:py-[42px]" aria-label="Agently voice experience">
          <div className="lp-container grid grid-cols-[1fr_auto] max-[767px]:grid-cols-1 items-center gap-12">
            <p className="text-[24px] max-[699px]:text-[20px] tracking-[-0.8px] font-medium m-0">
              Experience a capable voice on every conversation.
              <span className="block font-['IBM_Plex_Mono',monospace] text-xs tracking-[1.1px] uppercase mt-[7px] opacity-70">
                Built for businesses across the United States and Canada
              </span>
            </p>
            <a
              href={DEMO_PHONE_HREF}
              className="text-[48px] max-[767px]:text-[40px] max-[699px]:text-[clamp(28px,9.5vw,40px)] max-[479px]:text-[clamp(27px,9vw,32px)] leading-none font-medium tracking-[-2.4px] max-[479px]:tracking-[-1.2px] whitespace-nowrap max-[767px]:whitespace-normal"
            >
              {DEMO_PHONE_DISPLAY}
            </a>
          </div>
        </section>

        {/* Integrations */}
        <section id="integrations" className="bg-[var(--deep)] text-[var(--on-deep)] overflow-hidden py-[112px] max-[900px]:py-24 max-[479px]:py-[78px]">
          <div className="lp-container">
            <div className="block max-w-[780px] mx-auto mb-11 text-center">
              <p className="font-['IBM_Plex_Mono',monospace] text-[13px] font-medium tracking-[1.15px] uppercase mb-4 text-[var(--orange)]">
                Integrations
              </p>
              <h2 className="font-['DM_Sans',sans-serif] text-[40px] leading-[1.04] tracking-[-2.3px] font-medium mt-0 mb-4 text-balance max-[699px]:text-[30px] max-[699px]:tracking-[-1.2px]">
                Connect Agently to the tools your team already uses.
              </h2>
              <p className="text-base leading-[1.55] text-[var(--on-deep-muted)] m-0 max-w-[560px] mx-auto">
                Calendars, email, and documents—planned to keep every customer
                workflow connected.
              </p>
            </div>
          </div>
          <div className="lp-marquee h-[158px]" aria-label="Planned Agently integrations">
            <div className="lp-track">
              {[false, true].map((hidden) => (
                <div
                  key={hidden ? "b" : "a"}
                  className="lp-iset"
                  aria-hidden={hidden || undefined}
                >
                  {INTEGRATIONS.map(({ name, Mark }) => (
                    <article key={name} className="lp-item">
                      <Mark />
                      <div>
                        <h3 className="font-['DM_Sans',sans-serif] text-[17px] font-medium mt-0 mb-[6px] text-[var(--on-deep)]">
                          {name}
                        </h3>
                        <span className="font-['IBM_Plex_Mono',monospace] text-[10px] tracking-[0.85px] uppercase text-[var(--on-deep-muted)]">
                          Planned
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Proof / capabilities */}
        <section id="proof" className="bg-[var(--surface)] py-[112px] max-[900px]:py-24 max-[479px]:py-[78px]">
          <div className="lp-container">
            <div className="block max-w-[780px] mx-auto mb-[62px] max-[900px]:mb-[52px] text-center">
              <p className="font-['IBM_Plex_Mono',monospace] text-[13px] font-medium tracking-[1.15px] uppercase mb-5 text-inherit">
                Built for growing operations
              </p>
              <h2 className="font-['DM_Sans',sans-serif] text-[40px] leading-[1.04] tracking-[-2.3px] font-medium mt-0 mb-[18px] text-balance max-[699px]:text-[30px] max-[699px]:tracking-[-1.2px]">
                Operational capabilities for teams that need dependable coverage.
              </h2>
              <p className="m-0 text-[var(--muted)] max-w-[560px] text-base leading-[1.55] mx-auto">
                Agently is designed to support small, medium, and large
                businesses without narrowing the platform to one industry or
                one customer channel.
              </p>
            </div>
            <div className="grid grid-cols-3 max-[900px]:grid-cols-2 max-[767px]:grid-cols-1 border-t border-[var(--line)]">
              {[
                { Icon: SupportIcon, h: "Responsive support", p: "Get help shaping how Agently fits your customer workflows and operating hours." },
                { Icon: SetupIcon, h: "Guided setup", p: "Configure agents and conversation paths around the way your team already works." },
                { Icon: GlobeIcon, h: "Language coverage", p: "Support customer conversations across all languages instead of limiting service to a small set." },
                { Icon: ScaleIcon, h: "Flexible scale", p: "Start pay as you go, then discuss a custom setup as teams, locations, and usage expand." },
                { Icon: WorkflowIcon, h: "Connected workflows", p: "Bring voice, lead management, and website chat into a clearer operating rhythm." },
                { Icon: ShieldIcon, h: "Intentional roadmap", p: "Calendar, email, SMS, MCP, and broader CRM connections are planned as the platform expands." },
              ].map(({ Icon, h, p }) => (
                <article
                  key={h}
                  className="px-[22px] max-[900px]:px-5 py-[34px] max-[767px]:py-7 border-b border-[var(--line)] min-h-[230px] max-[767px]:min-h-0 text-center"
                >
                  <span className="inline-block mb-[22px]">
                    <Icon />
                  </span>
                  <h3 className="font-['DM_Sans',sans-serif] text-[20px] tracking-[-0.65px] font-medium mt-0 mb-[10px]">
                    {h}
                  </h3>
                  <p className="text-[13px] leading-[1.58] text-[var(--muted)] m-0 mx-auto max-w-[340px]">
                    {p}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Recovery (dark) */}
        <section id="recovery" className="bg-[var(--deep)] text-[var(--on-deep)] py-[112px] max-[900px]:py-24 max-[479px]:py-[78px]">
          <div className="lp-container grid grid-cols-2 max-[900px]:grid-cols-1 gap-[88px] max-[900px]:gap-[50px] items-center">
            <div>
              <h2 className="text-[52px] max-[767px]:text-[42px] leading-[0.98] tracking-[-3px] font-medium mt-0 mb-[26px] font-['DM_Sans',sans-serif]">
                Close the follow-up gap
              </h2>
              <p className="text-[17px] max-w-[480px] mt-0 mb-7 text-[var(--on-deep-muted)]">
                <span className="block text-[var(--on-deep)] font-medium mb-2">
                  Missed does not have to mean lost.
                </span>
                Agently keeps working after the ring. See which no-shows were
                recovered and how much revenue those bookings represent in
                your reporting.
              </p>
              <a
                href="#pricing"
                onClick={handleAnchorClick}
                className={`${BTN} bg-[var(--orange)] text-[#160802]`}
              >
                Explore plans
              </a>
            </div>
            <div className="border-t border-[#283545]">
              {[
                ["01", "Immediate text-back", "Start a helpful conversation while the caller's need is still fresh."],
                ["02", "Appointment recovery", "Follow up with no-shows and guide them toward another available time."],
                ["03", "Revenue visibility", "Review recovered bookings and their reported value in one place."],
              ].map(([n, h, p]) => (
                <div
                  key={n}
                  className="py-6 border-b border-[#283545] grid grid-cols-[42px_1fr] gap-4"
                >
                  <span className="font-['IBM_Plex_Mono',monospace] text-xs text-[var(--orange)]">
                    {n}
                  </span>
                  <div>
                    <h3 className="mt-0 mb-[7px] text-[18px] font-medium font-['DM_Sans',sans-serif]">
                      {h}
                    </h3>
                    <p className="m-0 text-[var(--on-deep-muted)] text-sm">{p}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Solutions */}
        <section id="solutions" className="py-[112px] max-[900px]:py-24 max-[479px]:py-[78px]">
          <div className="lp-container">
            <div className="block max-w-[780px] mx-auto mb-[68px] max-[900px]:mb-[52px] max-[479px]:mb-12 text-center">
              <p className="font-['IBM_Plex_Mono',monospace] text-[13px] font-medium tracking-[1.15px] uppercase mb-5 text-inherit">
                Ready now. Expanding next.
              </p>
              <h2 className="font-['DM_Sans',sans-serif] text-[40px] leading-[1.04] tracking-[-2.3px] font-medium m-0 max-w-[620px] text-balance mx-auto max-[699px]:text-[30px] max-[699px]:tracking-[-1.2px]">
                A customer platform that grows with your business.
              </h2>
              <p className="text-[17px] leading-[1.55] text-[var(--muted)] max-w-[590px] m-0 mt-[22px] mx-auto">
                Agently supports small, medium, and large organizations—not one
                narrow industry. Start with today&apos;s voice, lead, and
                website chat tools, then add new channels as the platform
                expands.
              </p>
            </div>
            <div className="grid grid-cols-3 max-[900px]:gap-[30px] max-[767px]:grid-cols-1 border-t border-[var(--line)] pt-[34px]">
              {[
                { h: "For every team size", p: "Give a growing local company or a multi-location operation one consistent way to handle customer conversations." },
                { h: "Calendar connections", p: "Calendly and Google Calendar integrations are planned to make scheduling part of the same connected workflow." },
                { h: "Broader integrations", p: "MCP connections, email, SMS, and additional CRM integrations are on the product roadmap." },
              ].map(({ h, p }) => (
                <article
                  key={h}
                  className="pr-6 max-[900px]:pr-0 max-[767px]:py-[30px] max-[767px]:border-b max-[767px]:border-[var(--line)] max-[767px]:first:pt-0 text-center px-[22px]"
                >
                  <h3 className="font-['DM_Sans',sans-serif] text-[25px] leading-[1.08] tracking-[-1px] font-medium mt-0 mb-[14px]">
                    {h}
                  </h3>
                  <p className="text-sm leading-[1.52] text-[var(--muted)] m-0 max-w-[330px] mx-auto">
                    {p}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="py-[112px] max-[900px]:py-24 max-[479px]:py-[78px]">
          <div className="lp-container">
            <div className="text-center mb-[62px]">
              <p className="font-['IBM_Plex_Mono',monospace] text-[13px] font-medium tracking-[1.15px] uppercase mb-[18px] text-[var(--orange-deep)]">
                Pricing
              </p>
              <h2 className="font-['DM_Sans',sans-serif] text-[40px] tracking-[-2.3px] font-medium mt-0 mb-4 max-[699px]:text-[30px] max-[699px]:tracking-[-1.2px]">
                Start pay as you go.
              </h2>
              <p className="text-[var(--muted)] m-0">
                Use today&apos;s Agently services with a minimum of $10. All
                pricing is in USD.
              </p>
            </div>
            <div className="grid grid-cols-[repeat(3,minmax(0,1fr))] gap-[clamp(6px,1.4vw,20px)] max-[900px]:gap-2 max-[699px]:gap-[5px] max-[479px]:gap-1 items-stretch">
              <article className="bg-[var(--surface)] border border-[var(--line)] rounded-[14px] max-[699px]:rounded-lg p-[clamp(14px,2.25vw,34px)] max-[900px]:p-[18px_14px] max-[699px]:p-[12px_8px] max-[479px]:p-[10px_6px] flex flex-col min-h-[470px] max-[900px]:min-h-[430px] max-[699px]:min-h-[390px] max-[479px]:min-h-[370px] min-w-0">
                <p className="font-['IBM_Plex_Mono',monospace] text-xs max-[900px]:text-[10px] max-[699px]:text-[7.5px] max-[699px]:leading-[1.25] tracking-[1.1px] max-[900px]:tracking-[0.65px] max-[699px]:tracking-[0.35px] uppercase mb-[45px] max-[900px]:mb-7 max-[699px]:mb-[18px] text-[var(--muted)]">
                  Available now
                </p>
                <h3 className="font-['DM_Sans',sans-serif] text-[30px] max-[900px]:text-[clamp(18px,2.6vw,25px)] max-[699px]:text-[clamp(13px,4vw,17px)] tracking-[-1.4px] max-[900px]:tracking-[-0.7px] max-[699px]:tracking-[-0.35px] font-medium mt-0 mb-3 max-[699px]:mb-2 break-words">
                  Pay as you go
                </h3>
                <p className="text-[24px] max-[900px]:text-[clamp(16px,2.4vw,21px)] max-[699px]:text-[clamp(11px,3.5vw,15px)] font-medium mt-0 mb-[18px] max-[699px]:mb-3">
                  $10{" "}
                  <small className="text-[13px] max-[699px]:text-[8px] max-[699px]:block font-normal text-[var(--muted)]">
                    minimum
                  </small>
                </p>
                <p className="text-sm max-[699px]:text-[9px] leading-[1.5] max-[699px]:leading-[1.4] text-[var(--muted)] mt-0 mb-7 max-[699px]:mb-[14px] min-h-[63px] max-[900px]:min-h-0 break-words">
                  Start with the tools you need today and pay for your
                  usage—without committing to a monthly package.
                </p>
                <ul className="lp-check list-none m-0 mb-[30px] max-[699px]:mb-4 p-0 pt-6 max-[900px]:pt-[18px] max-[699px]:pt-3 border-t border-[var(--line)] grid gap-3 max-[900px]:gap-[9px] max-[699px]:gap-[7px] text-[13px] max-[900px]:text-[11px] max-[699px]:text-[8.5px] max-[699px]:leading-[1.35]">
                  {["Voice agents across languages", "Lead management", "Website chat assistant", "Current follow-up tools"].map((li) => (
                    <li key={li} className="flex gap-[9px] max-[699px]:gap-1 break-words">
                      <CheckIcon />
                      <span>{li}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href="#footer"
                  onClick={handleAnchorClick}
                  className={`${BTN} mt-auto w-full max-[900px]:text-[11px] max-[900px]:px-2 max-[699px]:min-h-[32px] max-[699px]:h-auto max-[699px]:text-[8.5px] max-[699px]:leading-[1.2] max-[699px]:py-[7px] max-[699px]:px-1 max-[699px]:rounded-[7px] bg-[var(--ink)] text-[var(--bg)] break-words`}
                >
                  Get started
                </a>
              </article>

              <article className="bg-[var(--orange)] text-[#170a03] border border-[var(--orange)] rounded-[14px] max-[699px]:rounded-lg p-[clamp(14px,2.25vw,34px)] max-[900px]:p-[18px_14px] max-[699px]:p-[12px_8px] max-[479px]:p-[10px_6px] flex flex-col min-h-[470px] max-[900px]:min-h-[430px] max-[699px]:min-h-[390px] max-[479px]:min-h-[370px] min-w-0">
                <p className="font-['IBM_Plex_Mono',monospace] text-xs max-[900px]:text-[10px] max-[699px]:text-[7.5px] max-[699px]:leading-[1.25] tracking-[1.1px] max-[900px]:tracking-[0.65px] max-[699px]:tracking-[0.35px] uppercase mb-[45px] max-[900px]:mb-7 max-[699px]:mb-[18px] opacity-80">
                  Flexible option
                </p>
                <h3 className="font-['DM_Sans',sans-serif] text-[30px] max-[900px]:text-[clamp(18px,2.6vw,25px)] max-[699px]:text-[clamp(13px,4vw,17px)] tracking-[-1.4px] max-[900px]:tracking-[-0.7px] max-[699px]:tracking-[-0.35px] font-medium mt-0 mb-3 max-[699px]:mb-2 break-words">
                  Custom setup
                </h3>
                <p className="text-[24px] max-[900px]:text-[clamp(16px,2.4vw,21px)] max-[699px]:text-[clamp(11px,3.5vw,15px)] font-medium mt-0 mb-[18px] max-[699px]:mb-3 break-words">
                  Talk to us
                </p>
                <p className="text-sm max-[699px]:text-[9px] leading-[1.5] max-[699px]:leading-[1.4] text-[#3d180b] mt-0 mb-7 max-[699px]:mb-[14px] min-h-[63px] max-[900px]:min-h-0 break-words">
                  For larger teams, specialized workflows, or requirements that
                  need a tailored setup.
                </p>
                <ul className="lp-check list-none m-0 mb-[30px] max-[699px]:mb-4 p-0 pt-6 max-[900px]:pt-[18px] max-[699px]:pt-3 border-t border-[rgba(23,10,3,0.25)] grid gap-3 max-[900px]:gap-[9px] max-[699px]:gap-[7px] text-[13px] max-[900px]:text-[11px] max-[699px]:text-[8.5px] max-[699px]:leading-[1.35]">
                  {["Multi-team workflows", "Configuration support", "Usage aligned to your operation"].map((li) => (
                    <li key={li} className="flex gap-[9px] max-[699px]:gap-1 break-words">
                      <CheckIcon />
                      <span>{li}</span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={contactTrigger}
                  className={`${BTN} mt-auto w-full max-[900px]:text-[11px] max-[900px]:px-2 max-[699px]:min-h-[32px] max-[699px]:h-auto max-[699px]:text-[8.5px] max-[699px]:leading-[1.2] max-[699px]:py-[7px] max-[699px]:px-1 max-[699px]:rounded-[7px] bg-[#170a03] text-white break-words`}
                >
                  Talk to sales
                </button>
              </article>

              <article className="bg-[var(--surface)] border border-[var(--line)] rounded-[14px] max-[699px]:rounded-lg p-[clamp(14px,2.25vw,34px)] max-[900px]:p-[18px_14px] max-[699px]:p-[12px_8px] max-[479px]:p-[10px_6px] flex flex-col min-h-[470px] max-[900px]:min-h-[430px] max-[699px]:min-h-[390px] max-[479px]:min-h-[370px] min-w-0">
                <p className="font-['IBM_Plex_Mono',monospace] text-xs max-[900px]:text-[10px] max-[699px]:text-[7.5px] max-[699px]:leading-[1.25] tracking-[1.1px] max-[900px]:tracking-[0.65px] max-[699px]:tracking-[0.35px] uppercase mb-[45px] max-[900px]:mb-7 max-[699px]:mb-[18px] text-[var(--muted)]">
                  Coming later
                </p>
                <h3 className="font-['DM_Sans',sans-serif] text-[30px] max-[900px]:text-[clamp(18px,2.6vw,25px)] max-[699px]:text-[clamp(13px,4vw,17px)] tracking-[-1.4px] max-[900px]:tracking-[-0.7px] max-[699px]:tracking-[-0.35px] font-medium mt-0 mb-3 max-[699px]:mb-2 break-words">
                  Monthly plans
                </h3>
                <p className="text-[24px] max-[900px]:text-[clamp(16px,2.4vw,21px)] max-[699px]:text-[clamp(11px,3.5vw,15px)] font-medium mt-0 mb-[18px] max-[699px]:mb-3 text-[var(--muted)] break-words">
                  Coming soon
                </p>
                <p className="text-sm max-[699px]:text-[9px] leading-[1.5] max-[699px]:leading-[1.4] text-[var(--muted)] mt-0 mb-7 max-[699px]:mb-[14px] min-h-[63px] max-[900px]:min-h-0 break-words">
                  Monthly options are planned as the broader platform and
                  integration set become ready.
                </p>
                <ul className="lp-check list-none m-0 mb-[30px] max-[699px]:mb-4 p-0 pt-6 max-[900px]:pt-[18px] max-[699px]:pt-3 border-t border-[var(--line)] grid gap-3 max-[900px]:gap-[9px] max-[699px]:gap-[7px] text-[13px] max-[900px]:text-[11px] max-[699px]:text-[8.5px] max-[699px]:leading-[1.35]">
                  {["Broader channel bundles", "Calendar connections", "More integrations"].map((li) => (
                    <li key={li} className="flex gap-[9px] max-[699px]:gap-1 break-words">
                      <CheckIcon />
                      <span>{li}</span>
                    </li>
                  ))}
                </ul>
                <span
                  className={`${BTN} mt-auto w-full max-[900px]:text-[11px] max-[900px]:px-2 max-[699px]:min-h-[32px] max-[699px]:h-auto max-[699px]:text-[8.5px] max-[699px]:leading-[1.2] max-[699px]:py-[7px] max-[699px]:px-1 max-[699px]:rounded-[7px] bg-[var(--warm)] text-[var(--ink)] break-words`}
                  aria-hidden="true"
                >
                  In development
                </span>
              </article>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="bg-[var(--surface)] py-[112px] max-[900px]:py-24 max-[479px]:py-[78px]">
          <div className="lp-container max-w-[780px]">
            <div className="text-center mb-[52px] max-[479px]:mb-10">
              <p className="font-['IBM_Plex_Mono',monospace] text-[13px] font-medium tracking-[1.15px] uppercase mb-5 text-inherit">
                Questions
              </p>
              <h2 className="font-['DM_Sans',sans-serif] text-[40px] leading-[1.04] tracking-[-2.3px] font-medium m-0 text-balance max-[699px]:text-[30px] max-[699px]:tracking-[-1.2px]">
                Frequently asked questions
              </h2>
            </div>
            <div className="border-t border-[var(--line)]">
              {FAQ_ITEMS.map((item, i) => {
                const open = openFaq === i;
                return (
                  <div key={item.q} className="border-b border-[var(--line)]">
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-controls={`faq-panel-${i}`}
                      onClick={() => setOpenFaq(open ? null : i)}
                      className="w-full bg-none border-0 text-left flex items-center justify-between gap-5 py-[22px] cursor-pointer text-[19px] font-medium tracking-[-0.45px] text-[var(--ink)] max-[699px]:text-[17px] font-['DM_Sans',sans-serif]"
                    >
                      {item.q}
                      <ChevronDownIcon
                        className={`w-4 h-4 shrink-0 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
                      />
                    </button>
                    {open && (
                      <div id={`faq-panel-${i}`} className="pb-[26px]">
                        <p className="m-0 text-[var(--muted)] text-[15px] leading-[1.62] max-w-[640px]">
                          {item.a}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="bg-[var(--deep)] text-[var(--on-deep)] py-[128px] max-[900px]:py-24 max-[479px]:py-20 overflow-hidden">
          <div className="lp-container text-center">
            <h2 className="text-[64px] max-[900px]:text-[52px] max-[767px]:text-[42px] max-[479px]:text-[34px] max-[359px]:text-[30px] leading-[0.99] tracking-[-3px] max-[699px]:tracking-[-2px] font-medium mt-0 mb-[22px] text-balance font-['DM_Sans',sans-serif]">
              Every conversation handled.
            </h2>
            <p className="text-[17px] leading-[1.5] text-[var(--on-deep-muted)] max-w-[520px] mt-0 mb-[42px] mx-auto">
              Start pay as you go with a $10 minimum and give every customer
              conversation the attention it deserves.
            </p>
            <div className="flex gap-3 justify-center flex-wrap max-[479px]:grid max-[479px]:grid-cols-2 max-[359px]:grid-cols-1">
              <a
                href="#pricing"
                onClick={handleAnchorClick}
                className={`${BTN} bg-[var(--orange)] text-[#160802] max-[479px]:w-full max-[479px]:px-[10px]`}
              >
                Get started
              </a>
              <a
                href={DEMO_PHONE_HREF}
                className={`${BTN} border-[rgba(255,255,255,0.42)] text-white bg-transparent max-[479px]:w-full max-[479px]:px-[10px]`}
              >
                Try the demo: {DEMO_PHONE_DISPLAY}
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer id="footer" className="bg-[var(--footer)] text-[var(--on-deep)] pt-[88px] pb-[54px] max-[900px]:pt-[72px]">
        <div className="lp-container">
          <div className="grid grid-cols-[1.5fr_repeat(3,1fr)] max-[900px]:grid-cols-2 max-[767px]:grid-cols-1 gap-[clamp(40px,5vw,72px)] max-[900px]:gap-12 mb-[76px] max-[900px]:mb-14">
            <div>
              <a
                href="#top"
                onClick={handleAnchorClick}
                className="inline-flex items-center gap-2.5 text-[22px] font-semibold tracking-[-1.1px] font-['DM_Sans',sans-serif] mb-6"
                aria-label="Agently home"
              >
                <img
                  src="/landing/logo.png"
                  alt=""
                  className="w-[30px] h-[30px] object-contain"
                />
                <span>agently</span>
              </a>
              <p className="text-[13px] leading-[1.55] text-[#8e97a1] m-0 max-w-[300px]">
                A customer engagement platform: voice agents, lead management,
                and website chat for businesses of every size.
              </p>
            </div>
            {[
              ["Platform", [
                ["Voice agents", "#platform"],
                ["Lead management", "#platform"],
                ["Website chat assistant", "#platform"],
                ["Pricing", "#pricing"],
              ]],
              ["Company", [
                ["Solutions", "#solutions"],
                ["Integrations", "#integrations"],
                ["FAQ", "#faq"],
                ["Talk to sales", null],
              ]],
              ["Support", [
                ["Email support", "mailto:agentlycallsupport@gmail.com"],
                ["Log in", "/login"],
              ]],
            ].map(([h, links]) => (
              <div key={h as string}>
                <p className="font-['IBM_Plex_Mono',monospace] text-[11px] uppercase tracking-[1.2px] text-[#8e97a1] mt-0 mb-[22px]">
                  {h}
                </p>
                <ul className="list-none m-0 p-0 grid gap-[14px]">
                  {(links as [string, string | null][]).map(([label, href]) =>
                    label === "Talk to sales" ? (
                      <li key={label}>
                        <button
                          type="button"
                          onClick={contactTrigger}
                          className="text-[14px] text-[var(--on-deep)] bg-none border-0 p-0 cursor-pointer hover:underline font-[inherit]"
                        >
                          {label}
                        </button>
                      </li>
                    ) : href === "/login" ? (
                      <li key={label}>
                        <Link
                          to="/login"
                          className="text-[14px] text-[var(--on-deep)] hover:underline"
                        >
                          {label}
                        </Link>
                      </li>
                    ) : (
                      <li key={label}>
                        <a
                          href={href as string}
                          onClick={
                            (href as string).startsWith("#")
                              ? handleAnchorClick
                              : undefined
                          }
                          className="text-[14px] text-[var(--on-deep)] hover:underline"
                        >
                          {label}
                        </a>
                      </li>
                    ),
                  )}
                </ul>
              </div>
            ))}
          </div>
          <div className="font-['DM_Sans',sans-serif] font-semibold text-[clamp(64px,13vw,168px)] leading-[0.85] tracking-[-6px] select-none text-[var(--on-deep)] opacity-90 mb-14 max-[479px]:mb-10 max-[479px]:tracking-[-3px]" aria-hidden="true">
            Agently
          </div>
          <div className="flex items-center justify-between gap-4 flex-wrap text-[12px] text-[#8e97a1] border-t border-[rgba(255,255,255,0.12)] pt-7 max-[479px]:justify-center max-[479px]:text-center">
            <p className="m-0">© 2026 Agently. All rights reserved.</p>
            <p className="m-0">
              <a href={DEMO_PHONE_HREF} className="text-[var(--on-deep)]">
                {DEMO_PHONE_DISPLAY}
              </a>{" "}
              ·{" "}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="text-[var(--on-deep)]"
              >
                {SUPPORT_EMAIL}
              </a>
            </p>
          </div>
        </div>
      </footer>

      {/* Contact modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-[100] grid place-items-center bg-[rgba(10,10,12,0.62)] p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Contact sales"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeContact();
          }}
        >
          <div className="lp-modal-card bg-[var(--surface)] text-[var(--ink)] rounded-2xl border border-[var(--line)] w-full max-w-[440px] p-[30px] max-[699px]:p-6">
            <div className="flex items-start justify-between gap-4 mb-[22px]">
              <div>
                <h2 className="font-['DM_Sans',sans-serif] text-[28px] tracking-[-1.2px] font-medium mt-0 mb-2">
                  Talk to sales
                </h2>
                <p className="text-sm text-[var(--muted)] m-0">
                  Send us a note and we&apos;ll get back to you.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close dialog"
                onClick={closeContact}
                className="lp-icon-btn w-9 h-9 grid place-items-center rounded-lg border border-[var(--line)] text-[var(--ink)] shrink-0"
              >
                <CloseIcon />
              </button>
            </div>
            <form onSubmit={submitContact} className="grid gap-[18px]">
              <label className="grid gap-2 text-[13px] font-medium">
                Name
                <input
                  ref={firstFieldRef}
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="lp-input min-h-11 rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 text-[15px] font-normal text-[var(--ink)]"
                />
              </label>
              <label className="grid gap-2 text-[13px] font-medium">
                Email
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="lp-input min-h-11 rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 text-[15px] font-normal text-[var(--ink)]"
                />
              </label>
              <label className="grid gap-2 text-[13px] font-medium">
                Message
                <textarea
                  required
                  rows={4}
                  value={form.message}
                  onChange={(e) =>
                    setForm({ ...form, message: e.target.value })
                  }
                  className="lp-input min-h-[104px] rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-[10px] text-[15px] font-normal text-[var(--ink)] resize-y"
                />
              </label>
              <button
                type="submit"
                className="w-full min-h-11 rounded-xl bg-[var(--orange)] text-[#160802] text-sm font-medium border-0 cursor-pointer"
              >
                Send
              </button>
              <p className="m-0 text-xs text-[var(--muted)] text-center">
                Prefer email?{" "}
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="text-[var(--orange-deep)]"
                >
                  {SUPPORT_EMAIL}
                </a>
              </p>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default LandingPage;
