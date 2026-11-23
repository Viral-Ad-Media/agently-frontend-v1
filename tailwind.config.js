/**
 * Tailwind configuration.
 *
 * This file replaces the `tailwind.config = {...}` inline <script> that used
 * to configure the cdn.tailwindcss.com build in index.html. Every value below
 * is copied from it unchanged — this is a build-pipeline change, not a
 * redesign, so `font-sans`, `font-display` and every `indigo-*` / `slate-*`
 * utility across the app resolve to exactly the same values they did on the
 * CDN.
 *
 * Deliberately Tailwind v3, the same major version cdn.tailwindcss.com serves.
 * v4 renames utilities (shadow-sm -> shadow-xs, rounded -> rounded-sm,
 * outline-none -> outline-hidden), drops the default border colour to
 * currentColor and changes the default ring width — all of which silently
 * restyle a v3-authored UI. Pin v3 unless a full v4 migration is done.
 *
 * `content` must list every file that can contain a class name: Tailwind
 * generates utilities only for the strings it finds here, so a path missing
 * from this list means those classes are simply absent from the built CSS.
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './*.{ts,tsx}',
    './{components,contexts,lib,pages,services,types,utils}/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['DM Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        indigo: {
          50: '#fff3ed',
          100: '#ffe1d2',
          200: '#ffc1a3',
          300: '#ff9c70',
          400: '#f97a47',
          500: '#f15a24',
          600: '#f15a24',
          700: '#b63a0e',
          800: '#94300f',
          900: '#101216', // Map 900 to the dark blue for better contrast in gradients
        },
        slate: {
          50: '#f6f5f1',
          100: '#ece9e1',
          200: '#d9d7d0',
          300: '#aaa69b',
          400: '#76736b',
          500: '#5a5b61',
          600: '#44454a',
          700: '#2d2e33',
          800: '#1b1d22',
          900: '#101216',
        },
      },
    },
  },
  plugins: [],
};
