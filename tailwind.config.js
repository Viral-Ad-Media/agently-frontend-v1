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
        sans: [
          'Avantt',
          'Avenir Next',
          'Inter Tight',
          'Inter',
          'Manrope',
          'ui-sans-serif',
          'system-ui',
          'sans-serif',
        ],
        display: [
          'Avantt',
          'Avenir Next',
          'Inter Tight',
          'Inter',
          'Sora',
          'ui-sans-serif',
          'system-ui',
          'sans-serif',
        ],
      },
      colors: {
        indigo: {
          50: '#FFF5E6',
          100: '#FFE0B3',
          200: '#FFCC80',
          300: '#FFB84D',
          400: '#FFA31A',
          500: '#FF9900',
          600: '#FF9900',
          700: '#E68A00',
          800: '#CC7A00',
          900: '#232F3E', // Map 900 to the dark blue for better contrast in gradients
        },
        slate: {
          50: '#F3F4F6',
          100: '#E5E7EB',
          200: '#D1D5DB',
          300: '#9CA3AF',
          400: '#6B7280',
          500: '#4B5563',
          600: '#374151',
          700: '#1F2937',
          800: '#1A232E',
          900: '#232F3E',
        },
      },
    },
  },
  plugins: [],
};
